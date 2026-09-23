import { get, set, del } from 'idb-keyval';
import type { TripAssessmentResponse } from '../types/assessment';

const CACHE_KEY_PREFIX = 'samudra_trip_assessment_';

export interface CachedAssessment {
  timestamp: number;
  data: TripAssessmentResponse;
}

/**
 * Saves a trip assessment to IndexedDB for offline use.
 */
export async function saveOfflineAssessment(originHarbor: string, data: TripAssessmentResponse): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${originHarbor}`;
  const record: CachedAssessment = {
    timestamp: Date.now(),
    data,
  };
  try {
    await set(key, record);
  } catch (err) {
    console.error('Failed to save assessment to offline cache:', err);
  }
}

/**
 * Loads a cached trip assessment from IndexedDB.
 * Ensures the data is returned even if old, but allows the caller to check expiry.
 */
export async function loadOfflineAssessment(originHarbor: string): Promise<CachedAssessment | null> {
  const key = `${CACHE_KEY_PREFIX}${originHarbor}`;
  try {
    const record = await get<CachedAssessment>(key);
    return record || null;
  } catch (err) {
    console.error('Failed to load assessment from offline cache:', err);
    return null;
  }
}

/**
 * Clears a specific cached assessment.
 */
export async function clearOfflineAssessment(originHarbor: string): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${originHarbor}`;
  try {
    await del(key);
  } catch (err) {
    console.error('Failed to clear offline assessment:', err);
  }
}
