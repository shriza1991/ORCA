import { useState, useCallback, useRef, useEffect } from 'react';
import type { TripAssessmentRequest, TripAssessmentResponse } from '../types/assessment';

const API_BASE_URL = 'http://127.0.0.1:8000'; // Assuming standard local dev server

export function useTripAssessment() {
  const [data, setData] = useState<TripAssessmentResponse | null>(null);
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
    // Note: Do not clear previous data immediately to prevent flashing empty state,
    // but the UI must ensure "Initial/loading/error states must not appear favourable" (Req 3).

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/trip-assessments`, {
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
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'An error occurred during assessment.');
        setIsLoading(false);
        // Requirement 12: Never display previous location's assessment as current.
        // If an error happens, we should clear the data to prevent showing stale/unsafe data.
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
    assessTrip,
  };
}
