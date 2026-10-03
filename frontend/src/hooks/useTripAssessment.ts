import { useState, useCallback, useRef, useEffect } from "react";
import type {
  TripAssessmentRequest,
  TripAssessmentResponse,
} from "../types/assessment";
import type { MissionState } from "../types/mission";
import {
  saveOfflineAssessment,
  loadOfflineAssessment,
} from "../utils/offline-cache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(
  /\/+$/,
  "",
);
export const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

export function makeExpiredAssessment(
  original: TripAssessmentResponse,
): TripAssessmentResponse {
  return {
    ...original,
    decision: "UNKNOWN" as const,
    route_candidates: (original.route_candidates || []).map((route) => ({
      ...route,
      departure_supported: false,
      is_recommended: false,
      rejection_reasons: [
        "Cached evidence expired. Reconnect to reevaluate this corridor.",
      ],
    })),
    brief: {
      summary:
        "Offline mode: Cached assessment has expired. Safety status is unknown.",
      recommended_action:
        "Please reconnect to the internet to fetch fresh assessments.",
      positive_factors: [],
      negative_factors: [
        "Cached evidence exceeded the 6-hour validity window.",
      ],
      confidence: "LOW",
      confidence_reasons: [
        "Evidence expired — reassessment required before departing.",
      ],
    },
  };
}

function missionStateMatchesRequest(
  state: MissionState | null,
  request: TripAssessmentRequest,
): boolean {
  if (!state) return false;
  return (
    (!request.origin_harbor || state.origin?.name === request.origin_harbor) &&
    (!request.craft_profile || state.vessel?.type === request.craft_profile) &&
    (!request.vessel_size ||
      (state.vessel?.size_category || state.vessel?.vessel_size) ===
        request.vessel_size) &&
    (!request.departure_time ||
      state.timing?.departure === request.departure_time) &&
    (!request.return_time ||
      state.timing?.return_deadline === request.return_time) &&
    (!request.destination_id ||
      state.destination?.name === request.destination_id)
  );
}

export function useTripAssessment() {
  const [data, setData] = useState<TripAssessmentResponse | null>(null);
  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef<number>(0);
  const expiryTimerRef = useRef<any>(null);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const assessTrip = useCallback(
    async (request: TripAssessmentRequest) => {
      const generation = ++requestGenerationRef.current;
      clearExpiryTimer();

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      setIsOffline(false);
      setIsExpired(false);

      const effectiveRequest: TripAssessmentRequest = {
        ...request,
        mission_state:
          request.mission_state ??
          (missionStateMatchesRequest(missionState, request)
            ? missionState ?? undefined
            : undefined),
      };

      try {
        const res = await fetch(`${API_BASE_URL}/trip-assessments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(effectiveRequest),
          signal: controller.signal,
        });

        if (generation !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }

        if (!res.ok) {
          throw new Error(`API Error: ${res.status} ${res.statusText}`);
        }
        const result: TripAssessmentResponse = await res.json();

        if (generation !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }

        setData(result);
        // When an assessment has no mission_state, clear obsolete mission state instead of retaining it.
        setMissionState(result.mission_state || null);
        setIsLoading(false);
        setIsOffline(false);
        setIsExpired(false);
        setError(null);

        // Cache-write failure must not convert a successful API assessment into a failed/offline assessment
        try {
          await saveOfflineAssessment(
            request.origin_harbor || "Ratnagiri",
            result,
            request.craft_profile || "motorized_boat",
            request.departure_time || "default",
            request.return_time,
            request.vessel_size,
            request.destination_id,
            request.coordinates,
            request.data_mode,
          );
        } catch (cacheErr) {
          console.warn("Failed to write assessment to offline cache:", cacheErr);
        }
      } catch (err: any) {
        // Obsolete or aborted requests must not enter offline fallback or modify state
        if (
          generation !== requestGenerationRef.current ||
          controller.signal.aborted ||
          err.name === "AbortError"
        ) {
          return;
        }

        setIsOffline(true);
        try {
          const cached = await loadOfflineAssessment(
            request.origin_harbor || "Ratnagiri",
            request.craft_profile || "motorized_boat",
            request.departure_time || "default",
            request.return_time,
            request.vessel_size,
            request.destination_id,
            request.coordinates,
            request.data_mode,
          );

          if (generation !== requestGenerationRef.current || controller.signal.aborted) {
            return;
          }

          if (cached) {
            setMissionState(cached.data.mission_state || null);
            const ageMs = Date.now() - cached.timestamp;
            if (ageMs > CACHE_EXPIRY_MS) {
              setIsExpired(true);
              setData(makeExpiredAssessment(cached.data));
            } else {
              setIsExpired(false);
              setData(cached.data);
              const remainingMs = CACHE_EXPIRY_MS - ageMs;
              if (remainingMs > 0) {
                expiryTimerRef.current = setTimeout(() => {
                  if (generation === requestGenerationRef.current) {
                    setIsExpired(true);
                    setData((prev) => (prev ? makeExpiredAssessment(prev) : null));
                  }
                }, remainingMs);
              }
            }
            setIsLoading(false);
            setError(null);
            return;
          }
        } catch {
          // If offline cache read fails, proceed to surface error
        }

        if (generation !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }

        setError(
          err.message ||
            "An error occurred during assessment and no offline cache was found.",
        );
        setIsLoading(false);
        setData(null);
        setMissionState(null);
      }
    },
    [missionState, clearExpiryTimer],
  );

  const adoptAssessment = useCallback(
    (assessment: TripAssessmentResponse) => {
      // Explicit adoption invalidates previous in-flight requests and cache fallbacks
      requestGenerationRef.current++;
      clearExpiryTimer();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setData(assessment);
      setMissionState(assessment.mission_state || null);
      setIsLoading(false);
      setIsOffline(false);
      setIsExpired(false);
      setError(null);
    },
    [clearExpiryTimer],
  );

  // Cleanup on unmount invalidates outstanding work
  useEffect(() => {
    return () => {
      requestGenerationRef.current++;
      clearExpiryTimer();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [clearExpiryTimer]);

  return {
    data,
    setData,
    adoptAssessment,
    missionState,
    setMissionState,
    isLoading,
    error,
    isOffline,
    isExpired,
    assessTrip,
  };
}
