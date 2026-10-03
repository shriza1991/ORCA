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
  const lastEvaluatedLocationRef = useRef<{ lat: number; lon: number; time: number } | null>(null);
  const generationRef = useRef(0);
  const latestRef = useRef({ location, status });
  latestRef.current = { location, status };

  useEffect(() => {
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const usable = (fix: LocationData | null, state: GeolocationStatus) => Boolean(
      fix && state === 'accurate' && Number.isFinite(fix.timestamp) &&
      Date.now() - fix.timestamp < 30000 && Date.now() - fix.timestamp >= -5000 &&
      Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= MAX_ACCEPTABLE_ACCURACY_M
    );
    const demote = (reason: string) => {
      generationRef.current++;
      abortControllerRef.current?.abort();
      if (scheduled !== undefined) clearTimeout(scheduled);
      setAlerts([]); setEvaluationState('UNKNOWN'); setEvaluationResult(null);
      setIsLoading(false); setError(reason);
      lastEvaluatedLocationRef.current = null;
    };
    if (!usable(location, status)) {
      demote('Location is stale, unavailable, or insufficiently accurate.');
      return;
    }
    const fix = location!;
    // Expire even if the browser never emits another GPS event.
    expiry = setTimeout(() => demote('Location fix expired.'), Math.max(0, fix.timestamp + 30000 - Date.now()));
    const last = lastEvaluatedLocationRef.current;
    const moved = last && (Math.abs(fix.latitude - last.lat) > MIN_MOVEMENT_THRESHOLD_DEG || Math.abs(fix.longitude - last.lon) > MIN_MOVEMENT_THRESHOLD_DEG);
    const wait = last && !moved ? Math.max(0, MIN_EVALUATION_INTERVAL_MS - (Date.now() - last.time)) : 0;
    setError(null);
    // A verdict for another position must not survive while its replacement is pending.
    if (!last || last.lat !== fix.latitude || last.lon !== fix.longitude) {
      setAlerts([]); setEvaluationState('UNKNOWN'); setEvaluationResult(null);
    }
    setIsLoading(true);

    const dispatch = () => {
      const current = latestRef.current;
      if (!usable(current.location, current.status)) { demote('Location fix expired.'); return; }
      const sent = current.location!;
      lastEvaluatedLocationRef.current = { lat: sent.latitude, lon: sent.longitude, time: Date.now() };
      abortControllerRef.current?.abort();
      const abort = new AbortController();
      abortControllerRef.current = abort;
      const generation = ++generationRef.current;
      const isCurrent = () => {
        const latest = latestRef.current;
        const next = latest.location;
        return !abort.signal.aborted && generation === generationRef.current &&
          usable(next, latest.status) && next!.latitude === sent.latitude && next!.longitude === sent.longitude &&
          next!.accuracy === sent.accuracy && next!.heading === sent.heading && next!.speed === sent.speed;
      };
      const API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
      fetch(`${API}/geospatial/evaluate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ latitude: sent.latitude, longitude: sent.longitude, accuracy: sent.accuracy,
          speed: sent.speed, speed_unit: 'm/s', heading: sent.heading, timestamp: sent.timestamp }),
      }).then(async res => {
        if (!res.ok) throw new Error(`Boundary evaluation service failed with HTTP ${res.status}`);
        return res.json() as Promise<LocationEvaluationResponse>;
      }).then(data => {
        if (!isCurrent()) return;
        if (!['CLEAR', 'APPROACHING', 'INSIDE', 'UNKNOWN'].includes(data.evaluation_state) || !Array.isArray(data.warnings)) {
          throw new Error('Invalid boundary evaluation response');
        }
        setEvaluationState(data.evaluation_state); setEvaluationResult(data);
        setAlerts(data.warnings.map(w => ({ layer_id: w.boundary_id, name: w.boundary_name, distanceKm: w.distance_km,
          isInside: w.is_inside, type: w.boundary_type, isHardRestriction: w.is_hard_restriction,
          restrictionLevel: w.restriction_level, projectedCrossing: w.projected_crossing,
          timeToCrossHours: w.time_to_cross_hours, coverageLimitation: w.coverage_limitation })));
        setIsLoading(false);
      }).catch(err => {
        if (!isCurrent()) return;
        setEvaluationState('UNKNOWN'); setAlerts([]); setEvaluationResult(null);
        setError(err.message || 'Boundary evaluation service unavailable'); setIsLoading(false);
      });
    };
    if (wait === 0) dispatch();
    else scheduled = setTimeout(dispatch, wait);
    // Keep a compatible in-flight request alive across stationary GPS ticks.
    // The next dispatch, invalidation or unmount owns request cancellation.
    return () => { if (scheduled !== undefined) clearTimeout(scheduled); if (expiry !== undefined) clearTimeout(expiry); };
  }, [location?.latitude, location?.longitude, location?.accuracy, location?.speed, location?.heading, location?.timestamp, status]);

  useEffect(() => () => { generationRef.current++; abortControllerRef.current?.abort(); }, []);

  return {
    alerts,
    evaluationState,
    evaluationResult,
    isLoading,
    error,
  };
}
