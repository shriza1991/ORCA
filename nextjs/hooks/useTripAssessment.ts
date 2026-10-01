"use client";
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

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1").replace(
  /\/+$/,
  "",
);
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

function missionStateMatchesRequest(
  state: MissionState | null,
  request: TripAssessmentRequest,
): boolean {
  if (!state) return false;
  return (
    (!request.origin_harbor || state.origin.name === request.origin_harbor) &&
    (!request.craft_profile || state.vessel.type === request.craft_profile) &&
    (!request.vessel_size || (state.vessel.size_category || state.vessel.vessel_size) === request.vessel_size) &&
    (!request.departure_time ||
      state.timing.departure === request.departure_time) &&
    (!request.return_time ||
      state.timing.return_deadline === request.return_time) &&
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

  // Requirement 11: Cancel or ignore obsolete requests when harbour/trip context changes.
  const abortControllerRef = useRef<AbortController | null>(null);

  const assessTrip = useCallback(
    async (request: TripAssessmentRequest) => {
      // Cancel any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);
      setIsOffline(false);
      setIsExpired(false);
      // Note: Do not clear previous data immediately to prevent flashing empty state,
      // but the UI must ensure "Initial/loading/error states must not appear favourable" (Req 3).

      // Attach canonical mission_state with every assessment request (M1.1)
      const effectiveRequest: TripAssessmentRequest = {
        ...request,
        mission_state:
          request.mission_state ??
          (missionStateMatchesRequest(missionState, request)
            ? (missionState ?? undefined)
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

        if (!res.ok) {
          throw new Error(`API Error: ${res.status} ${res.statusText}`);
        }
        const result: TripAssessmentResponse = await res.json();

        // Update state only if request wasn't aborted
        if (!controller.signal.aborted) {
          setData(result);
          if (result.mission_state) {
            setMissionState(result.mission_state);
          }
          setIsLoading(false);
          // Save to offline cache with craft and departure discrimination
          await saveOfflineAssessment(
            request.origin_harbor || "Ratnagiri",
            result,
            request.craft_profile || "motorized_boat",
            request.departure_time || "default",
          );
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setIsOffline(true);
          // Try to load from offline cache with discriminatory key
          const cached = await loadOfflineAssessment(
            request.origin_harbor || "Ratnagiri",
            request.craft_profile || "motorized_boat",
            request.departure_time || "default",
          );

          if (cached) {
            if (cached.data.mission_state) {
              setMissionState(cached.data.mission_state);
            }
            const ageMs = Date.now() - cached.timestamp;
            if (ageMs > CACHE_EXPIRY_MS) {
              setIsExpired(true);
              // Requirement: Do not issue a new favourable decision from expired evidence.
              // decision must remain a plain RecommendationStatus string — it is NEVER an object.
              const expiredData: TripAssessmentResponse = {
                ...cached.data,
                decision: 'UNKNOWN' as const,
                brief: {
                  summary: 'Offline mode: Cached assessment has expired. Safety status is unknown.',
                  recommended_action: 'Please reconnect to the internet to fetch fresh assessments.',
                  positive_factors: [],
                  negative_factors: ['Cached evidence exceeded the 6-hour validity window.'],
                  confidence: 'LOW',
                  confidence_reasons: ['Evidence expired — reassessment required before departing.'],
                },
              };
              setData(expiredData);
            } else {
              setData(cached.data);
            }
            setIsLoading(false);
            return;
          }

          setError(
            err.message ||
              "An error occurred during assessment and no offline cache was found.",
          );
          setIsLoading(false);
          setData(null);
        }
      }
    },
    [missionState],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    setData,
    missionState,
    setMissionState,
    isLoading,
    error,
    isOffline,
    isExpired,
    assessTrip,
  };
}
