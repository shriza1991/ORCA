import { useState, useCallback, useRef, useEffect } from 'react';
import type { TripAssessmentRequest, TripAssessmentResponse } from '../types/assessment';
import { saveOfflineAssessment, loadOfflineAssessment } from '../utils/offline-cache';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

export function useTripAssessment() {
  const [data, setData] = useState<TripAssessmentResponse | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Requirement 11: Cancel or ignore obsolete requests when harbour/trip context changes.
  const abortControllerRef = useRef<AbortController | null>(null);

  const assessTrip = useCallback(async (request: TripAssessmentRequest) => {
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

    try {
      const res = await fetch(`${API_BASE_URL}/trip-assessments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
      }

      const result: TripAssessmentResponse = await res.json();
      
      // Update state only if request wasn't aborted
      if (!controller.signal.aborted) {
        setData(result);
        setIsLoading(false);
        // Save to offline cache
        await saveOfflineAssessment(request.origin_harbor || 'Ratnagiri', result);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setIsOffline(true);
        // Try to load from offline cache
        const cached = await loadOfflineAssessment(request.origin_harbor || 'Ratnagiri');
        
        if (cached) {
          const ageMs = Date.now() - cached.timestamp;
          if (ageMs > CACHE_EXPIRY_MS) {
            setIsExpired(true);
            // Requirement: Do not issue a new favourable decision from expired evidence
            const expiredData: TripAssessmentResponse = {
              ...cached.data,
              decision: {
                ...cached.data.decision,
                status: 'UNKNOWN',
                summary: 'Offline mode: Cached assessment has expired. Safety status is unknown.',
                next_action: 'Please reconnect to the internet to fetch fresh assessments.',
              }
            };
            setData(expiredData);
          } else {
            setData(cached.data);
          }
          setIsLoading(false);
          return;
        }

        setError(err.message || 'An error occurred during assessment and no offline cache was found.');
        setIsLoading(false);
        setData(null);
      }
    }
  }, []);

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
    isLoading,
    error,
    isOffline,
    isExpired,
    assessTrip,
  };
}
