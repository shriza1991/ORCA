import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActionableAlertDto, SavedTripRequest, SavedTripResponse } from '../types/alerts';
import { useSpokenGuidance } from './useSpokenGuidance';
import { translateText, type SupportedLanguage } from '../i18n/translations';

// Centralized API base — must match client.ts to hit the deployed backend.
// On Vercel production, VITE_API_BASE_URL = https://samudra-1.onrender.com/api/v1
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');

export function useAlerts(language: SupportedLanguage) {
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ActionableAlertDto[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const { speak } = useSpokenGuidance({ language });

  // Track announced alerts to avoid repeating TTS
  const announcedAlertsRef = useRef<Set<string>>(new Set());

  const registerTrip = useCallback(async (req: SavedTripRequest) => {
    try {
      const res = await fetch(`${API_BASE}/alerts/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SavedTripResponse = await res.json();
      setSubscriptionId(data.subscription_id);
      setIsPolling(true);
      return data;
    } catch (e) {
      // Non-critical — trip monitoring is best-effort. Silently degrade.
      console.warn('Trip monitoring unavailable:', e);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
        method: 'POST',
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, is_acknowledged: true } : a)),
        );
      }
    } catch (e) {
      console.warn('Failed to acknowledge alert:', e);
    }
  }, []);

  useEffect(() => {
    if (!subscriptionId || !isPolling) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/alerts/${subscriptionId}`);
        if (!res.ok) return;
        const data = await res.json();

        // Announce new, unacknowledged alerts exactly once
        data.alerts.forEach((alert: ActionableAlertDto) => {
          if (!alert.is_acknowledged && !announcedAlertsRef.current.has(alert.id)) {
            const prefix = translateText('Alert', language);
            speak(`${prefix}: ${alert.title}. ${alert.recommended_action}`);
            announcedAlertsRef.current.add(alert.id);
          }
        });

        setAlerts(data.alerts);
      } catch (e) {
        console.warn('Alert polling failed', e);
      }
    };

    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [subscriptionId, isPolling, speak, language]);

  return {
    subscriptionId,
    alerts,
    registerTrip,
    acknowledgeAlert,
  };
}
