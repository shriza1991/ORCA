import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useTripAssessment, CACHE_EXPIRY_MS } from './useTripAssessment';
import type { TripAssessmentRequest, TripAssessmentResponse } from '../types/assessment';

let tree: ReactTestRenderer | undefined;
let hookResult: ReturnType<typeof useTripAssessment>;

function Probe() {
  hookResult = useTripAssessment();
  return null;
}

const baseRequest: TripAssessmentRequest = {
  origin_harbor: 'Ratnagiri',
  craft_profile: 'motorized_boat',
  vessel_size: 'medium',
  departure_time: '2026-10-04T06:00:00Z',
  return_time: '2026-10-04T18:00:00Z',
  destination_id: 'pfz_1',
  coordinates: [73.1234, 17.5678],
  data_mode: 'DEMO',
  language_preference: 'en',
};

const makeAssessment = (id: string, decision: 'GO' | 'CAUTION' | 'NO_GO' = 'GO'): TripAssessmentResponse => ({
  assessment_id: id,
  decision,
  overall_risk_level: 'LOW',
  conditions: {
    data_mode: 'DEMO',
    wind_speed_knots: 10,
    wave_height_meters: 1.2,
    visibility_km: 10,
    risk_level: 'LOW',
    advisory: 'Calm seas',
    timestamp: '2026-10-04T06:00:00Z',
  },
  route_candidates: [
    {
      route_id: 'route_direct',
      name: 'Direct Route',
      summary: 'Direct corridor',
      departure_supported: true,
      is_recommended: true,
      risk_level: 'LOW',
      rejection_reasons: [],
    },
  ],
  trip_context: {
    origin_harbor: 'Ratnagiri',
    craft_profile: 'motorized_boat',
    vessel_size: 'medium',
    departure_time: '2026-10-04T06:00:00Z',
    return_time: '2026-10-04T18:00:00Z',
    target_pfz: 'pfz_1',
    coordinates: [73.1234, 17.5678],
  },
  brief: {
    summary: 'Clear voyage conditions',
    recommended_action: 'Proceed as planned',
    positive_factors: ['Good weather'],
    negative_factors: [],
    confidence: 'HIGH',
    confidence_reasons: ['Consistent observations'],
  },
  mission_state: {
    mission_id: `mission_${id}`,
    origin: { name: 'Ratnagiri' },
    vessel: { type: 'motorized_boat', size_category: 'medium' },
  },
} as unknown as TripAssessmentResponse);

beforeEach(() => {
  vi.useFakeTimers();
  // Clear localStorage
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useTripAssessment race condition and generation protection', () => {
  it('prevents an older in-flight API response from overwriting a newer assessment', async () => {
    let resolveFirst!: (value: any) => void;
    let resolveSecond!: (value: any) => void;

    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
      .mockImplementationOnce(() => new Promise((res) => { resolveSecond = res; }));

    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      tree = create(createElement(Probe));
    });

    // Start request 1 (older)
    act(() => {
      hookResult.assessTrip({ ...baseRequest, origin_harbor: 'Harbor1' });
    });
    expect(hookResult.isLoading).toBe(true);

    // Start request 2 (newer)
    act(() => {
      hookResult.assessTrip({ ...baseRequest, origin_harbor: 'Harbor2' });
    });

    // Second request resolves first
    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => makeAssessment('asm_second'),
      });
    });

    expect(hookResult.data?.assessment_id).toBe('asm_second');
    expect(hookResult.isLoading).toBe(false);

    // First request resolves later - MUST be discarded
    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => makeAssessment('asm_first'),
      });
    });

    // Still asm_second, not overwritten by asm_first
    expect(hookResult.data?.assessment_id).toBe('asm_second');
  });

  it('prevents a slow cache lookup from overwriting a newer explicit adoption', async () => {
    let resolveFetchFail!: (val: any) => void;
    const fetchMock = vi.fn().mockImplementationOnce(
      () => new Promise((_, rej) => { resolveFetchFail = rej; })
    );
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      tree = create(createElement(Probe));
    });

    // Trigger assessTrip which will fail over to cache
    act(() => {
      hookResult.assessTrip(baseRequest);
    });

    // In the meantime, user explicitly adopts an alternative reviewed plan
    const adopted = makeAssessment('adopted_exact');
    act(() => {
      hookResult.adoptAssessment(adopted);
    });

    expect(hookResult.data?.assessment_id).toBe('adopted_exact');

    // Now the older request fails network and attempts cache fallback
    await act(async () => {
      resolveFetchFail(new Error('Network disconnected'));
    });

    // The adopted assessment must NOT be replaced by error or cache fallback
    expect(hookResult.data?.assessment_id).toBe('adopted_exact');
    expect(hookResult.error).toBeNull();
  });

  it('preserves successful API assessment even if offline cache save fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeAssessment('api_ok'),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Cause localStorage.setItem to throw (e.g. quota exceeded)
    (globalThis as any).localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    await act(async () => {
      tree = create(createElement(Probe));
    });

    await act(async () => {
      await hookResult.assessTrip(baseRequest);
    });

    expect(hookResult.data?.assessment_id).toBe('api_ok');
    expect(hookResult.isOffline).toBe(false);
    expect(hookResult.error).toBeNull();
  });

  it('clears obsolete mission state when assessment has no mission_state', async () => {
    const asmNoState = makeAssessment('no_state');
    delete (asmNoState as any).mission_state;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => asmNoState,
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      tree = create(createElement(Probe));
    });

    // Pre-populate mission state
    act(() => {
      hookResult.setMissionState({ mission_id: 'old_mission' } as any);
    });
    expect(hookResult.missionState?.mission_id).toBe('old_mission');

    await act(async () => {
      await hookResult.assessTrip(baseRequest);
    });

    // Must be cleared to null, not kept as obsolete state
    expect(hookResult.missionState).toBeNull();
    expect(hookResult.data?.assessment_id).toBe('no_state');
  });

  it('marks offline cached assessment expired while mounted when 6-hour limit is reached', async () => {
    // Mock network failure so it loads from cache
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const now = Date.now();
    // Cache created 5 hours and 59 minutes ago (1 minute before 6-hour expiry)
    const cachedRecord = {
      timestamp: now - (CACHE_EXPIRY_MS - 60000),
      data: makeAssessment('cached_expiring_soon', 'GO'),
    };
    (globalThis as any).localStorage.setItem(
      'orca_trip_assessment_Ratnagiri_motorized_boat_2026-10-04T06:00:00Z_2026-10-04T18:00:00Z_medium_pfz_1_73.1234,17.5678_DEMO',
      JSON.stringify(cachedRecord)
    );

    await act(async () => {
      tree = create(createElement(Probe));
    });

    await act(async () => {
      await hookResult.assessTrip(baseRequest);
    });

    expect(hookResult.data?.assessment_id).toBe('cached_expiring_soon');
    expect(hookResult.data?.decision).toBe('GO');
    expect(hookResult.isExpired).toBe(false);

    // Advance time by 30 seconds: still valid
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(hookResult.isExpired).toBe(false);
    expect(hookResult.data?.decision).toBe('GO');

    // Advance time past the 60-second remaining mark
    act(() => {
      vi.advanceTimersByTime(30001);
    });

    // Should now automatically become expired without another network call
    expect(hookResult.isExpired).toBe(true);
    expect(hookResult.data?.decision).toBe('UNKNOWN');
    expect(hookResult.data?.route_candidates[0].departure_supported).toBe(false);
  });
});
