import type { GeolocationStatus } from '../../hooks/useGeolocation';
import type { GeofenceAlert } from '../../hooks/useGeofence';
import type { LocationEvaluationState } from '../../types/contracts';
import { AlertTriangle, MapPinOff, NavigationOff, ShieldAlert, AlertCircle } from 'lucide-react';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface LocationWarningsOverlayProps {
  status: GeolocationStatus;
  alerts: GeofenceAlert[];
  language: SupportedLanguage;
  evaluationState?: LocationEvaluationState;
  unknownReason?: string | null;
  onSelectBoundary?: (boundaryId: string) => void;
}

export default function LocationWarningsOverlay({
  status,
  alerts,
  language,
  evaluationState,
  unknownReason,
  onSelectBoundary,
}: LocationWarningsOverlayProps) {
  // If GPS is inactive or initializing, show nothing
  if (status === 'idle' || status === 'loading') return null;

  // Derive effective evaluation state if not explicitly passed
  const effectiveState: LocationEvaluationState =
    evaluationState ||
    (status !== 'accurate'
      ? 'UNKNOWN'
      : alerts.some((a) => a.isInside)
      ? 'INSIDE'
      : alerts.length > 0
      ? 'APPROACHING'
      : 'CLEAR');

  // If location is accurate and evaluation confirms CLEAR, no warning overlay is displayed
  if (status === 'accurate' && effectiveState === 'CLEAR') return null;

  // Deterministic sorting of boundary warnings:
  // 1. isInside (inside first)
  // 2. isHardRestriction (NO_GO hard exclusion zones first)
  // 3. distanceKm (closest first)
  // 4. layer_id (stable key tie-breaker)
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.isInside !== b.isInside) return a.isInside ? -1 : 1;
    if (Boolean(a.isHardRestriction) !== Boolean(b.isHardRestriction)) {
      return a.isHardRestriction ? -1 : 1;
    }
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.layer_id.localeCompare(b.layer_id);
  });

  // Display top 3 alerts to prevent vertical map occlusion
  const displayedAlerts = sortedAlerts.slice(0, 3);

  const hasGpsIssue =
    status === 'stale' ||
    status === 'denied' ||
    status === 'unavailable' ||
    status === 'timeout';

  const showEvaluationUnavailable =
    status === 'accurate' &&
    effectiveState === 'UNKNOWN';

  return (
    <div
      className="location-warnings-overlay"
      style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '92%',
        maxWidth: '430px',
        pointerEvents: 'none',
      }}
    >
      {/* 1. Inside Warnings (Red, High-Severity) */}
      {displayedAlerts
        .filter((alert) => alert.isInside)
        .map((alert) => (
          <div
            key={alert.layer_id}
            data-testid={`geofence-alert-inside-${alert.layer_id}`}
            onClick={() => onSelectBoundary?.(alert.layer_id)}
            style={{
              background: 'rgba(220, 38, 38, 0.96)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
              pointerEvents: onSelectBoundary ? 'auto' : 'none',
              cursor: onSelectBoundary ? 'pointer' : 'default',
            }}
          >
            <ShieldAlert size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span>{translateText('Inside Restricted Area', language)}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  {alert.restrictionLevel || 'NO_GO'}
                </span>
              </div>
              <div style={{ fontSize: '0.86rem', marginTop: '3px', lineHeight: 1.35 }}>
                {translateText(
                  `Inside restricted area: ${alert.name}. Check the applicable restriction and navigate away when safe.`,
                  language,
                )}
              </div>
            </div>
          </div>
        ))}

      {/* 2. Approaching Warnings (Amber, Proximity Advisory) */}
      {displayedAlerts
        .filter((alert) => !alert.isInside)
        .map((alert) => (
          <div
            key={alert.layer_id}
            data-testid={`geofence-alert-approaching-${alert.layer_id}`}
            onClick={() => onSelectBoundary?.(alert.layer_id)}
            style={{
              background: 'rgba(245, 158, 11, 0.96)',
              color: '#78350f',
              padding: '12px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
              pointerEvents: onSelectBoundary ? 'auto' : 'none',
              cursor: onSelectBoundary ? 'pointer' : 'default',
            }}
          >
            <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span>{translateText('Near Restricted Area', language)}</span>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: 'rgba(120, 53, 15, 0.15)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {alert.distanceKm.toFixed(1)} km
                </span>
              </div>
              <div style={{ fontSize: '0.86rem', marginTop: '3px', lineHeight: 1.35 }}>
                {translateText(
                  `Near restricted area: ${alert.name} — ${alert.distanceKm.toFixed(1)} km from boundary.`,
                  language,
                )}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  marginTop: '4px',
                  opacity: 0.9,
                  fontWeight: 500,
                }}
              >
                {alert.projectedCrossing &&
                alert.timeToCrossHours !== undefined &&
                alert.timeToCrossHours !== null
                  ? translateText(
                      `Course intercepts boundary in ${alert.timeToCrossHours.toFixed(1)}h.`,
                      language,
                    )
                  : translateText(
                      'Navigate with caution and stay clear of restricted waters.',
                      language,
                    )}
              </div>
            </div>
          </div>
        ))}

      {/* 3. Evaluation Service Unavailable Banner */}
      {showEvaluationUnavailable && (
        <div
          data-testid="geofence-alert-evaluation-unavailable"
          style={{
            background: 'rgba(100, 116, 139, 0.95)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.15)',
          }}
        >
          <AlertCircle size={24} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {translateText(
                'Boundary evaluation unavailable. Your location cannot currently be checked.',
                language,
              )}
            </div>
            {unknownReason && (
              <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '2px' }}>
                {unknownReason}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. GPS Sensor / Permission Status Warnings */}
      {hasGpsIssue && (
        <div
          data-testid="geofence-alert-gps-issue"
          style={{
            background: 'rgba(245, 158, 11, 0.95)',
            color: '#78350f',
            padding: '12px 16px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.15)',
          }}
        >
          {status === 'denied' ? (
            <MapPinOff size={24} style={{ flexShrink: 0 }} />
          ) : (
            <NavigationOff size={24} style={{ flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {status === 'stale'
                ? translateText('GPS Signal Lost', language)
                : status === 'denied'
                ? translateText('Location Denied', language)
                : translateText('GPS Unavailable', language)}
            </div>
            <div style={{ fontSize: '0.82rem', marginTop: '2px' }}>
              {status === 'stale'
                ? translateText('Showing last known location.', language)
                : translateText('Cannot track your position.', language)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
