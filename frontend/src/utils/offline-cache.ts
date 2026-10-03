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

/**
 * Builds offline cache key.
 * Backwards compatible with 3-arg calls while supporting full decision-relevant mission inputs.
 */
export function getOfflineCacheKey(
  originHarbor: string,
  craftProfile: string = 'motorized_boat',
  departureTime: string = 'default',
  returnTime?: string,
  vesselSize?: string,
  destinationId?: string,
  coordinates?: [number, number],
  dataMode?: string,
): string {
  if (!returnTime && !vesselSize && !destinationId && !coordinates && !dataMode) {
    return `${CACHE_KEY_PREFIX}${originHarbor}_${craftProfile}_${departureTime || 'default'}`;
  }
  const ret = returnTime || 'default';
  const size = vesselSize || 'medium';
  const target = destinationId || 'none';
  const coords = coordinates ? `${coordinates[0].toFixed(4)},${coordinates[1].toFixed(4)}` : 'none';
  const mode = (dataMode || 'DEMO').toUpperCase();
  return `${CACHE_KEY_PREFIX}${originHarbor}_${craftProfile}_${departureTime || 'default'}_${ret}_${size}_${target}_${coords}_${mode}`;
}

export function storedAssessmentMatchesRequest(
  stored: TripAssessmentResponse,
  expected: {
    originHarbor: string;
    craftProfile?: string;
    departureTime?: string;
    returnTime?: string;
    vesselSize?: string;
    destinationId?: string;
    coordinates?: [number, number];
    dataMode?: string;
  },
): boolean {
  if (!stored || !stored.trip_context) return false;
  const ctx = stored.trip_context;
  if (expected.originHarbor && ctx.origin_harbor && ctx.origin_harbor !== expected.originHarbor) return false;
  if (expected.craftProfile && ctx.craft_profile && ctx.craft_profile !== expected.craftProfile) return false;
  const storedSize = stored.mission_state?.vessel?.size_category || ctx.vessel_size;
  if (expected.vesselSize && storedSize && storedSize !== expected.vesselSize) return false;
  if (expected.departureTime && expected.departureTime !== 'default' && ctx.departure_time) {
    if (Date.parse(ctx.departure_time) !== Date.parse(expected.departureTime)) return false;
  }
  if (expected.returnTime && ctx.return_time) {
    if (Date.parse(ctx.return_time) !== Date.parse(expected.returnTime)) return false;
  }
  if (expected.destinationId && ctx.target_pfz && ctx.target_pfz !== expected.destinationId) return false;
  if (expected.dataMode && stored.conditions?.data_mode && stored.conditions.data_mode.toUpperCase() !== expected.dataMode.toUpperCase()) return false;
  return true;
}

/**
 * Saves a trip assessment to IndexedDB (or fallback localStorage) for offline use.
 */
export async function saveOfflineAssessment(
  originHarbor: string,
  data: TripAssessmentResponse,
  craftProfile: string = 'motorized_boat',
  departureTime: string = 'default',
  returnTime?: string,
  vesselSize?: string,
  destinationId?: string,
  coordinates?: [number, number],
  dataMode?: string,
): Promise<void> {
  const effCraft = craftProfile || data.trip_context?.craft_profile || 'motorized_boat';
  const effDep = departureTime !== 'default' ? departureTime : (data.trip_context?.departure_time || 'default');
  const effRet = returnTime || data.trip_context?.return_time;
  const effSize = vesselSize || data.mission_state?.vessel?.size_category || data.trip_context?.vessel_size;
  const effDest = destinationId || data.trip_context?.target_pfz;
  const effCoords = coordinates || data.trip_context?.coordinates;
  const effMode = dataMode || data.conditions?.data_mode;

  const specificKey = getOfflineCacheKey(originHarbor, effCraft, effDep, effRet, effSize, effDest, effCoords, effMode);
  const midKey = `${CACHE_KEY_PREFIX}${originHarbor}_${effCraft}_${effDep}`;

  const record: CachedAssessment = {
    timestamp: Date.now(),
    data,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record, specificKey);
      if (specificKey !== midKey) {
        store.put(record, midKey);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = JSON.stringify(record);
        localStorage.setItem(specificKey, val);
        if (specificKey !== midKey) {
          localStorage.setItem(midKey, val);
        }
      }
    } catch (err) {
      console.error('Failed to save assessment to offline cache:', err);
    }
  }
}

/**
 * Loads a cached trip assessment from IndexedDB (or fallback localStorage).
 * Legacy cache entries are reused ONLY after verifying their stored mission matches the request.
 */
export async function loadOfflineAssessment(
  originHarbor: string,
  craftProfile: string = 'motorized_boat',
  departureTime: string = 'default',
  returnTime?: string,
  vesselSize?: string,
  destinationId?: string,
  coordinates?: [number, number],
  dataMode?: string,
): Promise<CachedAssessment | null> {
  const specificKey = getOfflineCacheKey(
    originHarbor,
    craftProfile,
    departureTime,
    returnTime,
    vesselSize,
    destinationId,
    coordinates,
    dataMode,
  );
  const midKey = `${CACHE_KEY_PREFIX}${originHarbor}_${craftProfile}_${departureTime || 'default'}`;
  const legacyKey = `${CACHE_KEY_PREFIX}${originHarbor}`;

  const expectedCriteria = {
    originHarbor,
    craftProfile,
    departureTime,
    returnTime,
    vesselSize,
    destinationId,
    coordinates,
    dataMode,
  };

  const checkRecord = (record: CachedAssessment | null): CachedAssessment | null => {
    if (!record || !record.data) return null;
    if (storedAssessmentMatchesRequest(record.data, expectedCriteria)) {
      return record;
    }
    return null;
  };

  try {
    const db = await openDB();
    const record = await new Promise<CachedAssessment | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const tryKey = (key: string, nextKey?: string, fallbackLegacy?: boolean) => {
        const req = store.get(key);
        req.onsuccess = () => {
          const res = checkRecord(req.result);
          if (res) {
            resolve(res);
          } else if (nextKey && nextKey !== key) {
            tryKey(nextKey, fallbackLegacy ? legacyKey : undefined, false);
          } else if (fallbackLegacy && key !== legacyKey) {
            tryKey(legacyKey, undefined, false);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      };

      tryKey(specificKey, midKey, true);
    });
    if (record) return record;
  } catch {
    // Fallback to localStorage
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const candidates = [specificKey, midKey, legacyKey];
      for (const k of candidates) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedAssessment;
          const verified = checkRecord(parsed);
          if (verified) return verified;
        }
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
  departureTime: string = 'default',
  returnTime?: string,
  vesselSize?: string,
  destinationId?: string,
  coordinates?: [number, number],
  dataMode?: string,
): Promise<void> {
  const specificKey = getOfflineCacheKey(
    originHarbor,
    craftProfile,
    departureTime,
    returnTime,
    vesselSize,
    destinationId,
    coordinates,
    dataMode,
  );
  const midKey = `${CACHE_KEY_PREFIX}${originHarbor}_${craftProfile}_${departureTime || 'default'}`;
  const legacyKey = `${CACHE_KEY_PREFIX}${originHarbor}`;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(specificKey);
      store.delete(midKey);
      store.delete(legacyKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(specificKey);
      localStorage.removeItem(midKey);
      localStorage.removeItem(legacyKey);
    }
  } catch (err) {
    console.error('Failed to clear offline assessment:', err);
  }
}
