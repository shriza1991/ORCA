import type { GeolocationStatus } from '../../hooks/useGeolocation';
import type { GeofenceAlert } from '../../hooks/useGeofence';
import { AlertTriangle, MapPinOff, NavigationOff } from 'lucide-react';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface LocationWarningsOverlayProps {
  status: GeolocationStatus;
  alerts: GeofenceAlert[];
  language: SupportedLanguage;
}

export default function LocationWarningsOverlay({ status, alerts, language }: LocationWarningsOverlayProps) {
  const activeAlerts = alerts.filter(a => a.isInside);
  
  if (status === 'accurate' && activeAlerts.length === 0) return null;
  if (status === 'idle' || status === 'loading') return null;

  return (
    <div className="location-warnings-overlay" style={{
      position: 'absolute',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      width: '90%',
      maxWidth: '400px'
    }}>
      {/* Geofence Warnings */}
      {activeAlerts.map(alert => (
        <div key={alert.layer_id} style={{
          background: 'rgba(239, 68, 68, 0.95)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          <AlertTriangle size={24} />
          <div>
            <div style={{ fontWeight: 'bold' }}>{translateText('Restricted Area', language)}</div>
            <div style={{ fontSize: '0.9rem' }}>{alert.name}</div>
          </div>
        </div>
      ))}

      {/* GPS Status Warnings */}
      {(status === 'stale' || status === 'denied' || status === 'unavailable' || status === 'timeout') && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.95)',
          color: '#78350f',
          padding: '12px 16px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          {status === 'denied' ? <MapPinOff size={24} /> : <NavigationOff size={24} />}
          <div>
            <div style={{ fontWeight: 'bold' }}>
              {status === 'stale' ? translateText('GPS Signal Lost', language) : 
               status === 'denied' ? translateText('Location Denied', language) : 
               translateText('GPS Unavailable', language)}
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              {status === 'stale' ? translateText('Showing last known location.', language) : 
               translateText('Cannot track your position.', language)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
