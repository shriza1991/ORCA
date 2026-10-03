import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActionableAlertDto, SavedTripRequest, SavedTripResponse } from '../types/alerts';
import type { TripAssessmentResponse } from '../types/assessment';
import type { DecisionDeltaContract } from '../types/mission';
import { validateRefreshedAssessment } from '../utils/mission-proposal';
import { translateText, type SupportedLanguage } from '../i18n/translations';
import { speechCoordinator } from '../utils/speech-coordinator';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');

export type MonitoringMode = 'durable' | 'session-only' | 'degraded' | 'unavailable' | 'off';

export interface UseAlertsOptions {
  applicableAssessment?: TripAssessmentResponse | null;
  isApplicable?: boolean;
  isExpired?: boolean;
  isLoading?: boolean;
  dataMode?: string;
  onApplyRefreshed?: (refreshed: TripAssessmentResponse) => void;
}

export function useAlerts(language: SupportedLanguage, options: UseAlertsOptions = {}) {
  const {
    applicableAssessment,
    isApplicable,
    isExpired,
    isLoading,
    dataMode = 'DEMO',
    onApplyRefreshed,
  } = options;

  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ActionableAlertDto[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [isMonitoringEnabled, setIsMonitoringEnabled] = useState(true);
  const [monitoringMode, setMonitoringMode] = useState<MonitoringMode>('off');

  // Race-condition prevention refs
  const registrationGenRef = useRef<number>(0);
  const pollGenRef = useRef<number>(0);
  const isPollingInFlightRef = useRef<boolean>(false);
  const demoRefreshAbortRef = useRef<AbortController | null>(null);
  const seenMaterialSignaturesRef = useRef<Set<string>>(new Set());
  const lastMonitoredAssessmentIdRef = useRef<string | null>(null);

  // Register operational trip monitoring
  const registerTrip = useCallback(async (req: SavedTripRequest) => {
    const currentGen = ++registrationGenRef.current;
    try {
      const res = await fetch(`${API_BASE}/alerts/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        if (currentGen === registrationGenRef.current) {
          setMonitoringMode('unavailable');
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const data: SavedTripResponse = await res.json();
      if (currentGen !== registrationGenRef.current) {
        return data;
      }

      setSubscriptionId(data.subscription_id);
      setIsPolling(true);
      if (data.monitoring_mode === 'unavailable' || !data.is_active) {
        setMonitoringMode('unavailable');
      } else {
        setMonitoringMode((data.monitoring_mode as MonitoringMode) || 'durable');
      }
      return data;
    } catch (e) {
      if (currentGen === registrationGenRef.current) {
        console.warn('Trip monitoring registration degraded:', e);
        setMonitoringMode('unavailable');
      }
    }
  }, []);

  // Acknowledge alert (verifies response body success and distinct session acknowledgement)
  const acknowledgeAlert = useCallback(async (alertId: string): Promise<boolean> => {
    const target = alerts.find((a) => a.id === alertId);
    if (!target) return false;

    // Session-only local acknowledgement (e.g. DEMO mode refresh)
    if (target.is_session_only) {
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_acknowledged: true } : a)),
      );
      return true;
    }

    try {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
        method: 'POST',
      });
      if (!res.ok) return false;
      const data = await res.json();

      // Check response body success explicitly
      if (data && data.success === true) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, is_acknowledged: true } : a)),
        );
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Failed to acknowledge alert:', e);
      return false;
    }
  }, [alerts]);

  // Explicit adoption of a refreshed assessment surfaced through monitoring
  const applyRefreshedAlert = useCallback((alertId: string) => {
    const target = alerts.find((a) => a.id === alertId);
    if (target && target.refreshed_assessment && onApplyRefreshed) {
      onApplyRefreshed(target.refreshed_assessment);
      // Mark alert acknowledged once applied
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_acknowledged: true } : a)),
      );
    }
  }, [alerts, onApplyRefreshed]);

  // Operational polling loop (non-overlapping, excludes expired alerts)
  useEffect(() => {
    if (!subscriptionId || !isPolling || !isMonitoringEnabled) return;

    const currentPollGen = ++pollGenRef.current;

    const poll = async () => {
      if (isPollingInFlightRef.current || currentPollGen !== pollGenRef.current) return;
      isPollingInFlightRef.current = true;

      try {
        const res = await fetch(`${API_BASE}/alerts/${subscriptionId}`);
        if (!res.ok) {
          if (currentPollGen === pollGenRef.current) {
            setMonitoringMode('degraded');
          }
          return;
        }
        const data = await res.json();
        if (currentPollGen !== pollGenRef.current) return;

        if (data.monitoring_mode) {
          setMonitoringMode(data.monitoring_mode as MonitoringMode);
        }

        const incomingAlerts: ActionableAlertDto[] = data.alerts || [];

        // Announce new, unacknowledged alerts sequentially through shared coordinator
        incomingAlerts.forEach((alert: ActionableAlertDto) => {
          if (!alert.is_acknowledged && alert.status === 'ACTIVE') {
            const prefix = translateText('Alert', language);
            const dedupeKey = `operational:${subscriptionId}:${alert.id}:${alert.severity}:${alert.recommended_action}`;
            speechCoordinator.speak(`${prefix}: ${alert.title}. ${alert.recommended_action}`, {
              priority: alert.severity.toLowerCase() === 'high' ? 'high' : 'normal',
              dedupeKey,
              language,
            });
          }
        });

        // Filter alerts: only active and unexpired
        const nowMs = Date.now();
        const validAlerts = incomingAlerts.filter((a) => {
          if (a.status !== 'ACTIVE') return false;
          if (a.valid_to) {
            const exp = Date.parse(a.valid_to);
            if (!isNaN(exp) && exp <= nowMs) return false;
          }
          return true;
        });

        setAlerts(validAlerts);
      } catch (e) {
        console.warn('Alert polling network error:', e);
        if (currentPollGen === pollGenRef.current) {
          setMonitoringMode('degraded');
        }
      } finally {
        isPollingInFlightRef.current = false;
      }
    };

    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      clearInterval(interval);
      pollGenRef.current++;
      isPollingInFlightRef.current = false;
    };
  }, [subscriptionId, isPolling, isMonitoringEnabled, language]);

  // Foreground DEMO / Session-only monitoring loop (works without PostgreSQL)
  useEffect(() => {
    const isDemo = dataMode.toUpperCase() === 'DEMO';
    const isSessionOnlyNeeded = isDemo || monitoringMode === 'unavailable' || !subscriptionId;

    if (!isSessionOnlyNeeded || !isMonitoringEnabled) {
      return;
    }

    if (!applicableAssessment || !isApplicable || isExpired || isLoading) {
      if (monitoringMode !== 'off' && isDemo) {
        setMonitoringMode('degraded');
      }
      demoRefreshAbortRef.current?.abort();
      demoRefreshAbortRef.current = null;
      return;
    }

    setMonitoringMode('session-only');
    const assessmentId = applicableAssessment.assessment_id;

    // Reset deduplication if baseline changed
    if (lastMonitoredAssessmentIdRef.current !== assessmentId) {
      lastMonitoredAssessmentIdRef.current = assessmentId;
      seenMaterialSignaturesRef.current.clear();
      demoRefreshAbortRef.current?.abort();
      demoRefreshAbortRef.current = null;
    }

    const checkDemoEvidence = async () => {
      if (navigator.onLine === false || demoRefreshAbortRef.current) return;
      const abort = new AbortController();
      demoRefreshAbortRef.current = abort;

      try {
        const res = await fetch(`${API_BASE}/trip-assessments/${assessmentId}/refresh`, {
          method: 'POST',
          signal: abort.signal,
        });
        if (!res.ok) throw new Error(`Refresh failed with HTTP ${res.status}`);
        const data = await res.json();
        if (abort.signal.aborted || lastMonitoredAssessmentIdRef.current !== assessmentId) return;

        const val = validateRefreshedAssessment(applicableAssessment, data.simulated);
        if (!val.valid) return;

        const d: DecisionDeltaContract = data.delta;
        const material =
          d.decision_changed ||
          Boolean(d.confidence_change) ||
          d.changed_factors.length > 0 ||
          d.added_factors.length > 0 ||
          d.removed_factors.length > 0;

        const signature = JSON.stringify([d.original_decision, d.new_decision, d.changed_factors, d.added_factors, d.removed_factors]);

        if (material && !seenMaterialSignaturesRef.current.has(signature)) {
          seenMaterialSignaturesRef.current.add(signature);

          const decisionChanged = d.original_decision !== d.new_decision;
          const sessionAlertId = `demo_refresh_${assessmentId}_${Date.now()}`;
          const isHigh = d.new_decision === 'NO_GO' || (d.new_decision === 'CAUTION' && d.original_decision === 'SAFE_TO_GO');

          const newAlert: ActionableAlertDto = {
            id: sessionAlertId,
            alert_type: 'MATERIAL_EVIDENCE_UPDATE',
            severity: isHigh ? 'high' : 'medium',
            title: decisionChanged
              ? `Decision changed: ${d.original_decision} → ${d.new_decision}`
              : `Material condition update for ${applicableAssessment.trip_context.origin_harbor}`,
            description: d.summary || 'Monitored conditions changed. Review refreshed assessment.',
            recommended_action: data.simulated.brief?.recommended_action || 'Review and apply refreshed assessment before departure.',
            status: 'ACTIVE',
            is_acknowledged: false,
            valid_from: new Date().toISOString(),
            valid_to: null,
            created_at: new Date().toISOString(),
            is_session_only: true,
            refreshed_assessment: data.simulated,
          };

          setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== sessionAlertId)]);

          const prefix = translateText('Alert', language);
          speechCoordinator.speak(`${prefix}: ${newAlert.title}. ${newAlert.recommended_action}`, {
            priority: isHigh ? 'high' : 'normal',
            dedupeKey: `demo:${assessmentId}:${signature}`,
            language,
          });
        }
      } catch (err: unknown) {
        if (!abort.signal.aborted) {
          console.debug('Demo refresh check suppressed:', err);
        }
      } finally {
        if (demoRefreshAbortRef.current === abort) {
          demoRefreshAbortRef.current = null;
        }
      }
    };

    // Foreground refresh: check immediately and then every ~60 seconds
    void checkDemoEvidence();
    const interval = setInterval(() => {
      void checkDemoEvidence();
    }, 60000);

    return () => {
      clearInterval(interval);
      demoRefreshAbortRef.current?.abort();
      demoRefreshAbortRef.current = null;
    };
  }, [
    applicableAssessment,
    isApplicable,
    isExpired,
    isLoading,
    dataMode,
    monitoringMode,
    subscriptionId,
    isMonitoringEnabled,
    language,
  ]);

  return {
    subscriptionId,
    alerts,
    monitoringMode,
    isMonitoringEnabled,
    setIsMonitoringEnabled,
    registerTrip,
    acknowledgeAlert,
    applyRefreshedAlert,
  };
}
