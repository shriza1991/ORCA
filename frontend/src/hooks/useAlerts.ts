import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActionableAlertDto, SavedTripRequest, SavedTripResponse } from '../types/alerts';
import { useSpokenGuidance } from './useSpokenGuidance';
import { type SupportedLanguage } from '../i18n/translations';

export function useAlerts(language: SupportedLanguage) {
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ActionableAlertDto[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const { speak } = useSpokenGuidance({ language });
  
  // Track announced alerts to avoid repeating
  const announcedAlertsRef = useRef<Set<string>>(new Set());

  const registerTrip = useCallback(async (req: SavedTripRequest) => {
    try {
      const res = await fetch('/api/v1/alerts/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      if (!res.ok) throw new Error('Failed to register trip');
      const data: SavedTripResponse = await res.json();
      setSubscriptionId(data.subscription_id);
      setIsPolling(true);
      return data;
    } catch (e) {
      console.error("Failed to register trip:", e);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      const res = await fetch(`/api/v1/alerts/${alertId}/acknowledge`, { method: 'POST' });
      if (res.ok) {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_acknowledged: true } : a));
      }
    } catch (e) {
      console.error("Failed to acknowledge alert:", e);
    }
  }, []);

  useEffect(() => {
    if (!subscriptionId || !isPolling) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/alerts/${subscriptionId}`);
        if (!res.ok) return;
        const data = await res.json();
        
        // Check for new, unacknowledged alerts to announce
        data.alerts.forEach((alert: ActionableAlertDto) => {
          if (!alert.is_acknowledged && !announcedAlertsRef.current.has(alert.id)) {
            // New alert! 
            speak(`Alert: ${alert.title}. ${alert.recommended_action}`);
            announcedAlertsRef.current.add(alert.id);
          }
        });

        setAlerts(data.alerts);
      } catch (e) {
        console.error("Polling failed", e);
      }
    };

    poll(); // Initial poll
    const interval = setInterval(poll, 15000); // 15s for demo responsiveness
    return () => clearInterval(interval);
  }, [subscriptionId, isPolling, speak]);

  return {
    subscriptionId,
    alerts,
    registerTrip,
    acknowledgeAlert
  };
}
