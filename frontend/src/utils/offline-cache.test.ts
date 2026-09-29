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
});
