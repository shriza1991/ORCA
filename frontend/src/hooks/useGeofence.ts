import { useState, useEffect, useRef } from 'react';
import type { LocationData, GeolocationStatus } from './useGeolocation';
import type {
  MapLayer,
  LocationEvaluationResponse,
  LocationEvaluationState,
} from '../types/contracts';

export interface GeofenceAlert {
  layer_id: string;
  name: string;
  distanceKm: number;
  isInside: boolean;
  type: string;
  isHardRestriction?: boolean;
  restrictionLevel?: string;
  projectedCrossing?: boolean;
  timeToCrossHours?: number | null;
  coverageLimitation?: string | null;
}

export interface UseGeofenceReturn {
  alerts: GeofenceAlert[];
  evaluationState: LocationEvaluationState;
  evaluationResult: LocationEvaluationResponse | null;
  isLoading: boolean;
  error: string | null;
}

/** Maximum GPS accuracy circle (in meters) acceptable for live maritime safety evaluation */
const MAX_ACCEPTABLE_ACCURACY_M = 200.0;
/** Minimum throttle interval between consecutive backend evaluations (in ms) */
const MIN_EVALUATION_INTERVAL_MS = 2500;
/** Minimum movement threshold (in approximate degrees, ~20m) to bypass interval throttle */
const MIN_MOVEMENT_THRESHOLD_DEG = 0.0002;

export function useGeofence(
  location: LocationData | null,
  status: GeolocationStatus,
  _layers?: MapLayer[],
  _hysteresisBufferKm = 1.0,
): UseGeofenceReturn {
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);
  const [evaluationState, setEvaluationState] = useState<LocationEvaluationState>('UNKNOWN');
  const [evaluationResult, setEvaluationResult] = useState<LocationEvaluationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestTimestampRef = useRef<number>(0);
  const lastEvaluatedLocationRef = useRef<{ lat: number; lon: number; time: number } | null>(null);

  useEffect(() => {
    // 1. Immediately demote/clear evaluation if location is unusable or status is not accurate
    if (!location || status !== 'accurate') {
      abortControllerRef.current?.abort();
      setAlerts([]);
      setEvaluationState('UNKNOWN');
      setEvaluationResult(null);
      setIsLoading(false);
      lastEvaluatedLocationRef.current = null;
      return;
    }

    // 2. Reject fixes with poor accuracy (> 200 meters)
    if (location.accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
      abortControllerRef.current?.abort();
      setAlerts([]);
      setEvaluationState('UNKNOWN');
      setEvaluationResult({
        evaluation_state: 'UNKNOWN',
        evaluated_at: new Date().toISOString(),
        location_timestamp: location.timestamp,
        coordinates: [location.longitude, location.latitude],
        approach_threshold_km: 10.0,
        warnings: [],
        primary_warning: null,
        coverage_scope: 'Evaluated against reference maritime restrictions. Accuracy insufficient.',
        unknown_reason: `INSUFFICIENT_ACCURACY: GPS accuracy (+/-${Math.round(location.accuracy)}m) exceeds 200m limit.`,
        data_mode: 'DEMO',
      });
      setIsLoading(false);
      return;
    }

    // 3. Throttling check: do not suppress initial evaluation, but throttle rapid stationary ticks
    const now = Date.now();
    const last = lastEvaluatedLocationRef.current;
    if (last !== null) {
      const timeSinceLast = now - last.time;
      const dLat = Math.abs(location.latitude - last.lat);
      const dLon = Math.abs(location.longitude - last.lon);
      const movedSignificantly = dLat > MIN_MOVEMENT_THRESHOLD_DEG || dLon > MIN_MOVEMENT_THRESHOLD_DEG;

      if (timeSinceLast < MIN_EVALUATION_INTERVAL_MS && !movedSignificantly) {
        return;
      }
    }

    // Update last evaluated location reference
    lastEvaluatedLocationRef.current = {
      lat: location.latitude,
      lon: location.longitude,
      time: now,
    };

    // 4. Abort any previous in-flight request before launching new one
    abortControllerRef.current?.abort();
    const abort = new AbortController();
    abortControllerRef.current = abort;

    const requestTimestamp = location.timestamp || now;
    lastRequestTimestampRef.current = requestTimestamp;

    setIsLoading(true);
    setError(null);

    const API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

    fetch(`${API}/geospatial/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        speed: location.speed,
        heading: location.heading,
        timestamp: requestTimestamp,
      }),
      signal: abort.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Boundary evaluation service failed with HTTP ${res.status}`);
        }
        return res.json() as Promise<LocationEvaluationResponse>;
      })
      .then((data) => {
        if (abort.signal.aborted) return;
        // Ignore stale responses if a newer request was dispatched
        if (requestTimestamp < lastRequestTimestampRef.current) return;

        // Map backend authoritative warnings to frontend GeofenceAlert
        const nextAlerts: GeofenceAlert[] = (data.warnings || []).map((w) => ({
          layer_id: w.boundary_id,
          name: w.boundary_name,
          distanceKm: w.distance_km,
          isInside: w.is_inside, // Preserves strict geometric truth (never inside just because within exit buffer)
          type: w.boundary_type,
          isHardRestriction: w.is_hard_restriction,
          restrictionLevel: w.restriction_level,
          projectedCrossing: w.projected_crossing,
          timeToCrossHours: w.time_to_cross_hours,
          coverageLimitation: w.coverage_limitation,
        }));

        setEvaluationState(data.evaluation_state);
        setEvaluationResult(data);
        setAlerts(nextAlerts);
        setIsLoading(false);
      })
      .catch((err) => {
        if (abort.signal.aborted) return;
        // On network or server failure, fail-closed to UNKNOWN; do NOT calculate replacement frontend verdict!
        setEvaluationState('UNKNOWN');
        setAlerts([]);
        setEvaluationResult(null);
        setError(err.message || 'Boundary evaluation service unavailable');
        setIsLoading(false);
      });

    return () => {
      abort.abort();
    };
  }, [
    location?.latitude,
    location?.longitude,
    location?.accuracy,
    location?.speed,
    location?.heading,
    location?.timestamp,
    status,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    alerts,
    evaluationState,
    evaluationResult,
    isLoading,
    error,
  };
}
