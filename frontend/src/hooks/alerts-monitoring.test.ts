import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement } from 'react';
import { useAlerts } from './useAlerts';
import type { TripAssessmentResponse } from '../types/assessment';

const baseAssessment: TripAssessmentResponse = {
  assessment_id: 'asm-demo-100',
  evidence_bundle_id: 'bundle-demo-100',
  decision: 'GO',
  conditions: {
    data_mode: 'DEMO',
    risk_level: 'LOW',
    advisory: 'Fair marine weather',
    timestamp: '2026-10-04T06:00:00Z',
  } as any,
  route_candidates: [],
  pfz_candidates: [],
  assessed_at: '2026-10-04T05:00:00Z',
  trip_context: {
    origin_harbor: 'Ratnagiri',
    craft_profile: 'motorized_boat',
    departure_time: '2026-10-04T06:00:00Z',
    return_time: '2026-10-04T18:00:00Z',
    target_pfz: 'zone-1',
  },
  alerts: [],
} as any as TripAssessmentResponse;

describe('Alerts & Foreground DEMO Monitoring Regression Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('DEMO mode: activates session-only monitoring and fetches /trip-assessments/{id}/refresh', async () => {
    let alertsHook: ReturnType<typeof useAlerts>;
    let tree: ReactTestRenderer;

    const mockSimulated: TripAssessmentResponse = {
      ...baseAssessment,
      assessment_id: 'asm-refreshed-200',
      decision: 'CAUTION',
      trip_context: {
        ...baseAssessment.trip_context,
        parent_assessment_id: 'asm-demo-100',
      },
    };

    const mockRefreshResponse = {
      baseline: { assessment_id: 'asm-demo-100' },
      simulated: mockSimulated,
      delta: {
        original_decision: 'SAFE_TO_GO',
        new_decision: 'CAUTION',
        decision_changed: true,
        summary: 'Risk escalated to CAUTION due to wave height',
        changed_factors: ['wave_height'],
        added_factors: [],
        removed_factors: [],
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockRefreshResponse,
    });

    const onApplyRefreshed = vi.fn();

    function AlertsProbe(props: any) {
      alertsHook = useAlerts('en', props);
      return null;
    }

    await act(async () => {
      tree = create(
        createElement(AlertsProbe, {
          applicableAssessment: baseAssessment,
          isApplicable: true,
          isExpired: false,
          isLoading: false,
          dataMode: 'DEMO',
          onApplyRefreshed,
        }),
      );
      // Allow async foreground check to resolve
      await new Promise((r) => setTimeout(r, 20));
    });

    // Monitoring mode should be session-only in DEMO
    expect(alertsHook!.monitoringMode).toBe('session-only');
    expect(alertsHook!.isMonitoringEnabled).toBe(true);

    // Initial session alert should be populated with is_session_only: true
    const sessionAlerts = alertsHook!.alerts.filter((a) => a.is_session_only);
    expect(sessionAlerts.length).toBeGreaterThan(0);
    const topAlert = sessionAlerts[0];
    expect(topAlert.refreshed_assessment).toBeDefined();

    // User explicitly applies the refreshed plan
    act(() => {
      alertsHook.applyRefreshedAlert(topAlert.id);
    });

    expect(onApplyRefreshed).toHaveBeenCalledWith(mockSimulated);

    tree!.unmount();
  });

  it('DEMO mode: unchanged evidence produces no fabricated alert', async () => {
    let alertsHook: ReturnType<typeof useAlerts>;
    let tree: ReactTestRenderer;

    // Delta indicates NO changes
    const mockRefreshNoChange = {
      baseline: { assessment_id: 'asm-demo-100' },
      simulated: baseAssessment,
      delta: {
        original_decision: 'SAFE_TO_GO',
        new_decision: 'SAFE_TO_GO',
        decision_changed: false,
        summary: 'Conditions unchanged',
        changed_factors: [],
        added_factors: [],
        removed_factors: [],
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockRefreshNoChange,
    });

    function AlertsProbe(props: any) {
      alertsHook = useAlerts('en', props);
      return null;
    }

    await act(async () => {
      tree = create(
        createElement(AlertsProbe, {
          applicableAssessment: baseAssessment,
          isApplicable: true,
          isExpired: false,
          isLoading: false,
          dataMode: 'DEMO',
        }),
      );
      await new Promise((r) => setTimeout(r, 20));
    });

    // No session alert should be generated because conditions are unchanged
    const sessionAlerts = alertsHook!.alerts.filter((a) => a.is_session_only);
    expect(sessionAlerts.length).toBe(0);

    tree!.unmount();
  });

  it('acknowledgement: failed response body (success: false) does not appear acknowledged', async () => {
    let alertsHook: ReturnType<typeof useAlerts>;
    let tree: ReactTestRenderer;

    (globalThis.fetch as any)
      // 1. SavedTrip registration
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription_id: 'sub-1',
          origin_harbor: 'Ratnagiri',
          craft_profile: 'motorized_boat',
          is_active: true,
          created_at: new Date().toISOString(),
        }),
      })
      // 2. Active alerts fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subscription_id: 'sub-1',
          alerts: [
            {
              id: 'alert-op-1',
              title: 'Gale Warning',
              description: 'High wind advisory',
              severity: 'CRITICAL',
              recommended_action: 'Remain in port',
              status: 'ACTIVE',
              is_acknowledged: false,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      })
      // 3. Acknowledge endpoint returns success: false
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          detail: 'Database transaction failed during alert acknowledgement',
        }),
      });

    function AlertsProbe(props: any) {
      alertsHook = useAlerts('en', props);
      return null;
    }

    await act(async () => {
      tree = create(
        createElement(AlertsProbe, {
          dataMode: 'SNAPSHOT',
        }),
      );
    });

    // Register trip to begin operational polling
    await act(async () => {
      await alertsHook.registerTrip({
        origin_harbor: 'Ratnagiri',
        craft_profile: 'motorized_boat',
        language: 'en',
      });
      // Allow polling effect to execute and flush active alerts
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(alertsHook!.alerts.length).toBe(1);
    expect(alertsHook!.alerts[0].is_acknowledged).toBe(false);

    // Try to acknowledge
    await act(async () => {
      await alertsHook.acknowledgeAlert('alert-op-1');
      await new Promise((r) => setTimeout(r, 20));
    });

    // Alert must REMAIN unacknowledged because server reported success: false
    expect(alertsHook!.alerts[0].is_acknowledged).toBe(false);

    tree!.unmount();
  });
});
