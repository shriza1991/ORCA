import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOfflineCacheKey,
  saveOfflineAssessment,
  loadOfflineAssessment,
  clearOfflineAssessment,
} from './offline-cache';
import type { TripAssessmentResponse } from '../types/assessment';

describe('offline-cache M1.1 collision resistance', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  });

  it('generates distinct cache keys for different departure times', () => {
    const key1 = getOfflineCacheKey('Ratnagiri', 'Small Vessel', '2026-09-27T04:00:00Z');
    const key2 = getOfflineCacheKey('Ratnagiri', 'Small Vessel', '2026-09-27T08:00:00Z');

    expect(key1).toBe('orca_trip_assessment_Ratnagiri_Small Vessel_2026-09-27T04:00:00Z');
    expect(key2).toBe('orca_trip_assessment_Ratnagiri_Small Vessel_2026-09-27T08:00:00Z');
    expect(key1).not.toBe(key2);
  });

  it('stores and retrieves separate cache entries for Ratnagiri 04:00 vs 08:00', async () => {
    const mockAssessment1 = {
      assessment_id: 'assmnt-0400',
      decision: 'GO',
      explanation: 'Conditions good at 04:00',
      timestamp: '2026-09-27T04:00:00Z',
      overall_risk_level: 'LOW',
      trip_context: {
        origin_harbor: 'Ratnagiri',
        craft_profile: 'Small Vessel',
        departure_time: '2026-09-27T04:00:00Z',
      },
    } as unknown as TripAssessmentResponse;

    const mockAssessment2 = {
      assessment_id: 'assmnt-0800',
      decision: 'CAUTION',
      explanation: 'Stronger winds at 08:00',
      timestamp: '2026-09-27T08:00:00Z',
      overall_risk_level: 'MEDIUM',
      trip_context: {
        origin_harbor: 'Ratnagiri',
        craft_profile: 'Small Vessel',
        departure_time: '2026-09-27T08:00:00Z',
      },
    } as unknown as TripAssessmentResponse;

    await saveOfflineAssessment('Ratnagiri', mockAssessment1, 'Small Vessel', '2026-09-27T04:00:00Z');
    await saveOfflineAssessment('Ratnagiri', mockAssessment2, 'Small Vessel', '2026-09-27T08:00:00Z');

    const loaded1 = await loadOfflineAssessment('Ratnagiri', 'Small Vessel', '2026-09-27T04:00:00Z');
    const loaded2 = await loadOfflineAssessment('Ratnagiri', 'Small Vessel', '2026-09-27T08:00:00Z');

    expect(loaded1).not.toBeNull();
    expect(loaded2).not.toBeNull();
    expect(loaded1?.data.assessment_id).toBe('assmnt-0400');
    expect(loaded2?.data.assessment_id).toBe('assmnt-0800');
    expect(loaded1?.data.decision).toBe('GO');
    expect(loaded2?.data.decision).toBe('CAUTION');

    // Verify clear only deletes the targeted departure time
    await clearOfflineAssessment('Ratnagiri', 'Small Vessel', '2026-09-27T04:00:00Z');
    const afterClear1 = await loadOfflineAssessment('Ratnagiri', 'Small Vessel', '2026-09-27T04:00:00Z');
    const afterClear2 = await loadOfflineAssessment('Ratnagiri', 'Small Vessel', '2026-09-27T08:00:00Z');
    expect(afterClear1).toBeNull();
    expect(afterClear2).not.toBeNull();
  });

  it('generates distinct cache keys distinguishing return time, size, destination, coordinates, and data mode', () => {
    const baseKey = getOfflineCacheKey(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T18:00:00Z',
      'medium',
      'pfz_1',
      [73.1234, 17.5678],
      'LIVE'
    );

    // Different return time
    const diffRet = getOfflineCacheKey(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T22:00:00Z',
      'medium',
      'pfz_1',
      [73.1234, 17.5678],
      'LIVE'
    );
    expect(diffRet).not.toBe(baseKey);

    // Different vessel size
    const diffSize = getOfflineCacheKey(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T18:00:00Z',
      'large',
      'pfz_1',
      [73.1234, 17.5678],
      'LIVE'
    );
    expect(diffSize).not.toBe(baseKey);

    // Different destination
    const diffDest = getOfflineCacheKey(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T18:00:00Z',
      'medium',
      'pfz_2',
      [73.1234, 17.5678],
      'LIVE'
    );
    expect(diffDest).not.toBe(baseKey);

    // Different coordinates
    const diffCoords = getOfflineCacheKey(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T18:00:00Z',
      'medium',
      'pfz_1',
      [74.0000, 18.0000],
      'LIVE'
    );
    expect(diffCoords).not.toBe(baseKey);

    // Different data mode
    const diffMode = getOfflineCacheKey(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T18:00:00Z',
      'medium',
      'pfz_1',
      [73.1234, 17.5678],
      'DEMO'
    );
    expect(diffMode).not.toBe(baseKey);
  });

  it('rejects mismatched legacy cache entries when craft, size, return time, or data mode differ', async () => {
    // Store a legacy entry under harbor + craft + departure only
    const legacyKey = 'orca_trip_assessment_Ratnagiri_motorized_boat_2026-10-04T06:00:00Z';
    const legacyAssessment = {
      assessment_id: 'legacy-assmnt',
      decision: 'GO',
      overall_risk_level: 'LOW',
      trip_context: {
        origin_harbor: 'Ratnagiri',
        craft_profile: 'motorized_boat',
        vessel_size: 'small',
        departure_time: '2026-10-04T06:00:00Z',
        return_time: '2026-10-04T12:00:00Z',
        target_pfz: 'pfz-small-zone',
      },
      conditions: {
        data_mode: 'DEMO',
      },
    } as unknown as TripAssessmentResponse;

    store[legacyKey] = JSON.stringify({
      timestamp: Date.now(),
      data: legacyAssessment,
    });

    // Request with matching parameters should match
    const match = await loadOfflineAssessment(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T12:00:00Z',
      'small',
      'pfz-small-zone',
      undefined,
      'DEMO'
    );
    expect(match).not.toBeNull();
    expect(match?.data.assessment_id).toBe('legacy-assmnt');

    // Request with different vessel size must be rejected (not served from legacy entry)
    const rejectSize = await loadOfflineAssessment(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T12:00:00Z',
      'large', // mismatch!
      'pfz-small-zone',
      undefined,
      'DEMO'
    );
    expect(rejectSize).toBeNull();

    // Request with different return time must be rejected
    const rejectReturn = await loadOfflineAssessment(
      'Ratnagiri',
      'motorized_boat',
      '2026-10-04T06:00:00Z',
      '2026-10-04T18:00:00Z', // mismatch!
      'small',
      'pfz-small-zone',
      undefined,
      'DEMO'
    );
    expect(rejectReturn).toBeNull();

    // Request with different craft profile must be rejected
    const rejectCraft = await loadOfflineAssessment(
      'Ratnagiri',
      'mechanized_trawler', // mismatch!
      '2026-10-04T06:00:00Z',
      '2026-10-04T12:00:00Z',
      'small',
      'pfz-small-zone',
      undefined,
      'DEMO'
    );
    expect(rejectCraft).toBeNull();
  });
});
