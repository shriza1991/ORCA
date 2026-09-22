import { useState, useEffect, useCallback, useRef } from 'react';

export type GeolocationStatus = 'idle' | 'loading' | 'accurate' | 'stale' | 'denied' | 'unavailable' | 'timeout';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null; // meters/sec
  heading: number | null; // degrees from true north
  timestamp: number;
}

export function useGeolocation(staleThresholdMs = 60000) {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }

    setIsTracking(true);
    setStatus('loading');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp,
        });
        setStatus('accurate');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied');
        } else if (error.code === error.TIMEOUT) {
          setStatus('timeout');
        } else {
          setStatus('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  }, []);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    clearWatch();
    setStatus('idle');
  }, [clearWatch]);

  // Handle staleness
  useEffect(() => {
    if (status !== 'accurate' && status !== 'stale') return;
    if (!location) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - location.timestamp > staleThresholdMs) {
        setStatus('stale');
      } else {
        setStatus('accurate');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [status, location, staleThresholdMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearWatch();
  }, [clearWatch]);

  return {
    status,
    location,
    isTracking,
    startTracking,
    stopTracking,
  };
}
