import { assessmentMatchesInputs, getMissionIdentityKey } from './mission-proposal';
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
  return `${CACHE_KEY_PREFIX}v2_${getMissionIdentityKey({
    origin_harbor: originHarbor, craft_profile: craftProfile,
    departure_time: departureTime === 'default' ? undefined : departureTime,
    return_time: returnTime, vessel_size: vesselSize, destination_id: destinationId,
    coordinates, data_mode: dataMode,
  })}`;
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
  return assessmentMatchesInputs(stored, {
    origin_harbor: expected.originHarbor, craft_profile: expected.craftProfile,
    departure_time: expected.departureTime === 'default' ? undefined : expected.departureTime,
    return_time: expected.returnTime, vessel_size: expected.vesselSize,
    destination_id: expected.destinationId, coordinates: expected.coordinates,
    data_mode: expected.dataMode,
  });
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
  const previousSpecificKey = `${CACHE_KEY_PREFIX}${originHarbor}_${craftProfile}_${departureTime || 'default'}_${returnTime || 'default'}_${vesselSize || 'medium'}_${destinationId || 'none'}_${coordinates ? `${coordinates[0].toFixed(4)},${coordinates[1].toFixed(4)}` : 'none'}_${(dataMode || 'DEMO').toUpperCase()}`;
  const candidateKeys = [...new Set([specificKey, previousSpecificKey, midKey, legacyKey])];

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
    if (!record?.data || !Number.isFinite(record.timestamp) || record.timestamp > Date.now()) return null;
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

      const tryKey = (index: number) => {
        if (index >= candidateKeys.length) { resolve(null); return; }
        const req = store.get(candidateKeys[index]);
        req.onsuccess = () => {
          const verified = checkRecord(req.result);
          if (verified) resolve(verified);
          else tryKey(index + 1);
        };
        req.onerror = () => reject(req.error);
      };
      tryKey(0);
    });
    if (record) return record;
  } catch {
    // Fallback to localStorage
  }

  try {
    if (typeof localStorage !== 'undefined') {
      for (const k of candidateKeys) {
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
