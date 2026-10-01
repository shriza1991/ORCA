import type { TripAssessmentResponse } from '../types/assessment';

const CACHE_KEY_PREFIX = 'orca_trip_assessment_';
const DB_NAME = 'orca_offline_db';
const STORE_NAME = 'assessments';

export interface CachedAssessment {
  timestamp: number;
  data: TripAssessmentResponse;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getOfflineCacheKey(
  originHarbor: string,
  craftProfile: string = 'motorized_boat',
  departureTime: string = 'default'
): string {
  return `${CACHE_KEY_PREFIX}${originHarbor}_${craftProfile}_${departureTime || 'default'}`;
}

/**
 * Saves a trip assessment to IndexedDB (or fallback localStorage) for offline use.
 */
export async function saveOfflineAssessment(
  originHarbor: string,
  data: TripAssessmentResponse,
  craftProfile: string = 'motorized_boat',
  departureTime: string = 'default'
): Promise<void> {
  const effCraft = craftProfile || data.trip_context?.craft_profile || 'motorized_boat';
  const effDep = departureTime !== 'default' ? departureTime : (data.trip_context?.departure_time || 'default');
  const key = getOfflineCacheKey(originHarbor, effCraft, effDep);
  const record: CachedAssessment = {
    timestamp: Date.now(),
    data,
  };
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(record));
      }
    } catch (err) {
      console.error('Failed to save assessment to offline cache:', err);
    }
  }
}

/**
 * Loads a cached trip assessment from IndexedDB (or fallback localStorage).
 * Ensures the data is returned even if old, but allows the caller to check expiry.
 */
export async function loadOfflineAssessment(
  originHarbor: string,
  craftProfile: string = 'motorized_boat',
  departureTime: string = 'default'
): Promise<CachedAssessment | null> {
  const key = getOfflineCacheKey(originHarbor, craftProfile, departureTime);
  const legacyKey = `${CACHE_KEY_PREFIX}${originHarbor}`;

  try {
    const db = await openDB();
    const record = await new Promise<CachedAssessment | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
        } else {
          // Fallback to legacy key for backwards compatibility
          const legacyReq = tx.objectStore(STORE_NAME).get(legacyKey);
          legacyReq.onsuccess = () => resolve(legacyReq.result || null);
          legacyReq.onerror = () => resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
    if (record) return record;
  } catch {
    // Fallback to localStorage
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key) || localStorage.getItem(legacyKey);
      if (raw) {
        return JSON.parse(raw) as CachedAssessment;
      }
    }
  } catch (err) {
    console.error('Failed to load assessment from offline cache:', err);
  }
  return null;
}

/**
 * Clears a specific cached assessment.
 */
export async function clearOfflineAssessment(
  originHarbor: string,
  craftProfile: string = 'motorized_boat',
  departureTime: string = 'default'
): Promise<void> {
  const key = getOfflineCacheKey(originHarbor, craftProfile, departureTime);
  const legacyKey = `${CACHE_KEY_PREFIX}${originHarbor}`;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.objectStore(STORE_NAME).delete(legacyKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      localStorage.removeItem(legacyKey);
    }
  } catch (err) {
    console.error('Failed to clear offline assessment:', err);
  }
}

