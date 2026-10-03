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

export function isAlertCurrentlyValid(alert: ActionableAlertDto, now = Date.now()): boolean {
  if (alert.status !== 'ACTIVE') return false;
  const from = alert.valid_from ? Date.parse(alert.valid_from) : null;
  const to = alert.valid_to ? Date.parse(alert.valid_to) : null;
  return (from === null || (Number.isFinite(from) && from <= now)) &&
    (to === null || (Number.isFinite(to) && to > now)) &&
    (from === null || to === null || from < to);
}

export function useAlerts(language: SupportedLanguage, options: UseAlertsOptions = {}) {
  const { applicableAssessment, isApplicable, isExpired, isLoading, dataMode = 'DEMO' } = options;
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ActionableAlertDto[]>([]);
  const [isMonitoringEnabled, setIsMonitoringEnabled] = useState(true);
  const [operationalMode, setOperationalMode] = useState<MonitoringMode>('off');
  const [sessionDegraded, setSessionDegraded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  const registrationGen = useRef(0);
  const registrationAbort = useRef<AbortController | null>(null);
  const scope = `${dataMode}:${applicableAssessment?.assessment_id || ''}:${isApplicable}:${isExpired}:${isLoading}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const alertsScopeRef = useRef(scope);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const enabledRef = useRef(isMonitoringEnabled); enabledRef.current = isMonitoringEnabled;
  const subscriptionRef = useRef(subscriptionId); subscriptionRef.current = subscriptionId;
  const seen = useRef(new Set<string>());
  const currentOptions = useRef(options); currentOptions.current = options;
  const hasUsableBaseline = Boolean(applicableAssessment && isApplicable && !isExpired && !isLoading);
  const needsSession = dataMode.toUpperCase() === 'DEMO' || !subscriptionId || operationalMode === 'unavailable' || operationalMode === 'degraded';
  const monitoringMode: MonitoringMode = !isMonitoringEnabled ? 'off'
    : needsSession && hasUsableBaseline ? (sessionDegraded ? 'degraded' : 'session-only')
    : options.isApplicable === false || isExpired || isLoading ? 'degraded' : operationalMode;

  useEffect(() => {
    registrationGen.current++;
    registrationAbort.current?.abort();
    setSubscriptionId(null);
    setOperationalMode('off');
    setAlerts([]); alertsScopeRef.current = scope; setActionError(null); setSessionDegraded(false); seen.current.clear();
    return () => {
      registrationGen.current++;
      registrationAbort.current?.abort();
      speechCoordinator.cancelScope('demo:');
      speechCoordinator.cancelScope('operational:');
    };
  }, [scope]);

  const registerTrip = useCallback(async (req: SavedTripRequest) => {
    if (!enabledRef.current) return;
    const generation = ++registrationGen.current, capturedScope = scopeRef.current;
    registrationAbort.current?.abort();
    const abort = new AbortController(); registrationAbort.current = abort;
    setSubscriptionId(null); setOperationalMode('off'); setAlerts([]);
    try {
      const res = await fetch(`${API_BASE}/alerts/monitor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req), signal: abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SavedTripResponse = await res.json();
      if (abort.signal.aborted || generation !== registrationGen.current || capturedScope !== scopeRef.current || !enabledRef.current) return;
      if (!data.is_active || data.monitoring_mode === 'unavailable') { setOperationalMode('unavailable'); return data; }
      setSubscriptionId(data.subscription_id); setOperationalMode('durable'); return data;
    } catch (error) {
      if (!abort.signal.aborted && generation === registrationGen.current && capturedScope === scopeRef.current) {
        console.warn('Trip monitoring unavailable:', error); setOperationalMode('unavailable');
      }
    }
  }, []);

  const acknowledgeAlert = useCallback(async (id: string): Promise<boolean> => {
    const target = alerts.find(a => a.id === id);
    if (!target) return false;
    const capturedScope = scopeRef.current;
    setActionError(null);
    let success = Boolean(target.is_session_only);
    if (!success) {
      try {
        const res = await fetch(`${API_BASE}/alerts/${id}/acknowledge`, { method: 'POST' });
        const body = res.ok ? await res.json() : null;
        success = body?.success === true && body?.is_acknowledged === true;
      } catch { success = false; }
    }
    if (!mounted.current || capturedScope !== scopeRef.current) return false;
    if (!success) { setActionError(translateText('Acknowledgement failed. Please retry; the warning remains active.', language)); return false; }
    setAlerts(previous => previous.map(a => a.id === id ? { ...a, is_acknowledged: true } : a));
    return true;
  }, [alerts, language]);

  const applyRefreshedAlert = useCallback((id: string) => {
    const target = alerts.find(a => a.id === id);
    const active = currentOptions.current;
    if (!target?.refreshed_assessment || !active.applicableAssessment || !active.isApplicable || active.isExpired || active.isLoading ||
        !isAlertCurrentlyValid(target) || !validateRefreshedAssessment(active.applicableAssessment, target.refreshed_assessment).valid) {
      setActionError(translateText('This update no longer applies to the current mission.', language)); return;
    }
    if (active.onApplyRefreshed) active.onApplyRefreshed(target.refreshed_assessment);
  }, [alerts, language]);

  useEffect(() => {
    if (!subscriptionId || !isMonitoringEnabled || isApplicable === false || isExpired || isLoading || dataMode.toUpperCase() === 'DEMO') return;
    const capturedScope = scope;
    const abort = new AbortController(); let inFlight = false;
    const owns = () => !abort.signal.aborted && capturedScope === scopeRef.current && subscriptionRef.current === subscriptionId;
    const poll = async () => {
      if (inFlight || !owns()) return;
      inFlight = true;
      try {
        const res = await fetch(`${API_BASE}/alerts/${subscriptionId}`, { signal: abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json(); if (!owns()) return;
        setOperationalMode(data.monitoring_mode === 'unavailable' || data.monitoring_mode === 'degraded' ? data.monitoring_mode : 'durable');
        const incoming: ActionableAlertDto[] = (data.alerts || []).filter((a: ActionableAlertDto) => isAlertCurrentlyValid(a));
        for (const alert of incoming) if (!alert.is_acknowledged) {
          speechCoordinator.speak(`${translateText('Alert', language)}: ${alert.title}. ${alert.recommended_action}`, {
            priority: ['high','critical'].includes(alert.severity.toLowerCase()) ? 'high' : 'normal',
            dedupeKey: `operational:${subscriptionId}:${alert.id}:${alert.valid_from || ""}:${alert.severity}:${alert.recommended_action}`, language,
          });
        }
        setAlerts(previous => [...incoming, ...previous.filter(a => a.is_session_only && isAlertCurrentlyValid(a))]);
      } catch {
        if (owns()) setOperationalMode('degraded');
      } finally { inFlight = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 15000);
    return () => {
      abort.abort(); clearInterval(timer); speechCoordinator.cancelScope(`operational:${subscriptionId}:`);
      // Stop the server worker too when this subscription is paused, replaced, or its view closes.
      void fetch(`${API_BASE}/alerts/${subscriptionId}/stop`, { method: 'POST', keepalive: true }).then(async response => {
        if (!response.ok || (await response.json()).success !== true) throw new Error('Stop unconfirmed');
      }).catch(() => {
        if (mounted.current && capturedScope === scopeRef.current && !enabledRef.current) setActionError('Foreground monitoring is paused. Server stop could not be confirmed; reconnect to retry.');
      });
    };
  }, [subscriptionId, scope, isMonitoringEnabled, language, dataMode, isApplicable, isExpired, isLoading]);

  useEffect(() => {
    if (!needsSession || !isMonitoringEnabled || !hasUsableBaseline || !applicableAssessment) return;
    const baseline = applicableAssessment, capturedScope = scope;
    const abort = new AbortController(); let inFlight = false;
    const owns = () => !abort.signal.aborted && capturedScope === scopeRef.current;
    const check = async () => {
      if (inFlight || !owns()) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { setSessionDegraded(true); return; }
      inFlight = true;
      try {
        const res = await fetch(`${API_BASE}/trip-assessments/${baseline.assessment_id}/refresh`, { method: 'POST', signal: abort.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json(); if (!owns()) return;
        if (data.baseline?.assessment_id !== baseline.assessment_id || !validateRefreshedAssessment(baseline, data.simulated).valid) throw new Error('Unrelated refreshed assessment');
        const d: DecisionDeltaContract = data.delta;
        if (!d || !Array.isArray(d.changed_factors) || !Array.isArray(d.added_factors) || !Array.isArray(d.removed_factors)) throw new Error('Missing comparison');
        setSessionDegraded(false);
        const material = d.decision_changed || Boolean(d.confidence_change) || d.changed_factors.length || d.added_factors.length || d.removed_factors.length;
        const signature = JSON.stringify([d.original_decision, d.new_decision, d.confidence_change, d.changed_factors, d.added_factors, d.removed_factors]);
        // A refreshed record is current only for this baseline; retire superseded updates.
        if (!material) { seen.current.clear(); speechCoordinator.cancelScope(`demo:${baseline.assessment_id}:`); speechCoordinator.resetDeduplication(`demo:${baseline.assessment_id}:`); setAlerts(previous => previous.filter(a => !a.is_session_only)); return; }
        if (seen.current.has(signature)) return;
        seen.current.add(signature);
        const isHigh = ['NO_GO','CAUTION','UNKNOWN','DO_NOT_GO'].includes(d.new_decision);
        const event: ActionableAlertDto = {
          id: `refresh_${baseline.assessment_id}_${Date.now()}`, alert_type: 'MATERIAL_EVIDENCE_UPDATE', severity: isHigh ? 'high' : 'medium',
          title: d.decision_changed ? `${translateText("Decision changed", language)}: ${d.original_decision} → ${d.new_decision}` : `${translateText("Material condition update", language)}: ${baseline.trip_context.origin_harbor}`,
          description: translateText(d.summary || 'Conditions changed. Review the refreshed assessment.', language),
          recommended_action: translateText(data.simulated.brief?.recommended_action || 'Review the refreshed assessment before departure.', language),
          status: 'ACTIVE', is_acknowledged: false, valid_from: new Date().toISOString(), valid_to: null, created_at: new Date().toISOString(),
          is_session_only: true, refreshed_assessment: data.simulated,
        };
        setAlerts(previous => [event, ...previous.filter(a => !a.is_session_only)]);
        speechCoordinator.speak(`${translateText('Alert', language)}: ${event.title}. ${event.recommended_action}`, { priority: isHigh ? 'high' : 'normal', dedupeKey: `demo:${baseline.assessment_id}:${signature}`, language });
      } catch {
        if (owns()) { setSessionDegraded(true); setAlerts(previous => previous.filter(a => !a.is_session_only)); }
      } finally { inFlight = false; }
    };
    void check(); const timer = setInterval(() => void check(), 60000);
    return () => { abort.abort(); clearInterval(timer); speechCoordinator.cancelScope(`demo:${baseline.assessment_id}:`); };
  }, [scope, needsSession, isMonitoringEnabled, hasUsableBaseline, applicableAssessment, language]);

  useEffect(() => {
    if (!isMonitoringEnabled) { registrationGen.current++; registrationAbort.current?.abort(); setActionError(null); }
  }, [isMonitoringEnabled]);

  // Expire visible records even between poll ticks.
  useEffect(() => {
    const deadlines = alerts.flatMap(a => a.valid_to && Number.isFinite(Date.parse(a.valid_to)) ? [Date.parse(a.valid_to)] : []);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setAlerts(previous => previous.filter(a => isAlertCurrentlyValid(a))), Math.max(0, Math.min(...deadlines) - Date.now()));
    return () => clearTimeout(timer);
  }, [alerts, language]);
  const visibleAlerts = alertsScopeRef.current === scope ? alerts.filter(a => isAlertCurrentlyValid(a)) : [];
  return { subscriptionId, alerts: visibleAlerts, monitoringMode, isMonitoringEnabled, setIsMonitoringEnabled, registerTrip, acknowledgeAlert, applyRefreshedAlert, actionError };
}
