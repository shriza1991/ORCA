import { useState, useEffect } from 'react';
import { ShieldAlert, Volume2, VolumeX, CheckCircle } from 'lucide-react';
import type { ActionableAlertDto } from '../../types/alerts';
import type { MonitoringMode } from '../../hooks/useAlerts';
import { translateText, type SupportedLanguage } from '../../i18n/translations';
import { speechCoordinator } from '../../utils/speech-coordinator';

interface FisherAlertPanelProps {
  alerts: ActionableAlertDto[];
  language: SupportedLanguage;
  monitoringMode?: MonitoringMode;
  isMonitoringEnabled?: boolean;
  onToggleMonitoring?: (enabled: boolean) => void;
  onAcknowledge: (alertId: string) => void;
  onApplyRefreshed?: (alertId: string) => void;
  onReplay: (text: string) => void;
}

export default function FisherAlertPanel({
  alerts,
  language,
  monitoringMode,
  isMonitoringEnabled,
  onToggleMonitoring,
  onAcknowledge,
  onApplyRefreshed,
  onReplay,
}: FisherAlertPanelProps) {
  const [muted, setMuted] = useState<boolean>(speechCoordinator.getMuted());

  useEffect(() => {
    return speechCoordinator.subscribeMute(setMuted);
  }, []);

  const unacknowledged = alerts.filter(a => !a.is_acknowledged && a.status === 'ACTIVE');
  if (unacknowledged.length === 0) {
    if (!monitoringMode) return null;
    return (
      <div className="fisher-monitoring-status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', marginBottom: '12px', fontSize: '0.85rem' }}>
        <span style={{ color: '#64748b' }}>
          Monitoring: <strong>{monitoringMode === 'session-only' ? 'DEMO / Session-Only (Active)' : monitoringMode === 'durable' ? 'Operational / Durable (Active)' : 'Unavailable / Degraded'}</strong>
        </span>
        {onToggleMonitoring && (
          <button
            onClick={() => onToggleMonitoring(!isMonitoringEnabled)}
            style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#e2e8f0', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            {isMonitoringEnabled ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>
    );
  }

  const topAlert = unacknowledged[0];

  const handleReplay = () => {
    onReplay(`Alert: ${topAlert.title}. ${topAlert.recommended_action}`);
  };

  return (
    <div className="fisher-alert-panel" style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', padding: '16px', marginBottom: '16px', borderRadius: '4px' }}>
      {monitoringMode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.75rem', color: '#991b1b' }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            {topAlert.is_session_only ? 'DEMO · Session-Only Alert' : 'Operational Warning'}
          </span>
          {onToggleMonitoring && (
            <button
              onClick={() => onToggleMonitoring(!isMonitoringEnabled)}
              style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#fecaca', border: '1px solid #fca5a5', borderRadius: '3px', cursor: 'pointer' }}
            >
              {isMonitoringEnabled ? 'Pause monitoring' : 'Resume monitoring'}
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <ShieldAlert color="#ef4444" size={28} />
          <div>
            <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1.1rem' }}>{topAlert.title}</h3>
            <p style={{ margin: '4px 0', color: '#7f1d1d' }}>{topAlert.description}</p>
            <p style={{ margin: '4px 0', fontWeight: 'bold', color: '#991b1b' }}>{translateText('Action:', language)} {topAlert.recommended_action}</p>
            {topAlert.valid_to && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#b91c1c' }}>
                {translateText('Valid until:', language)} {new Date(topAlert.valid_to).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
          <button 
            onClick={() => speechCoordinator.toggleMute()} 
            style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            aria-label={muted ? "Unmute" : "Mute"}
            title={muted ? "Unmute automatic speech" : "Mute automatic speech"}
          >
            {muted ? <VolumeX color="#ef4444" /> : <Volume2 color="#ef4444" />}
          </button>
          <button 
            onClick={handleReplay}
            style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', color: '#991b1b' }}
            title="Replay alert guidance"
          >
            Replay
          </button>
        </div>
      </div>
      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        {topAlert.refreshed_assessment && onApplyRefreshed && (
          <button 
            onClick={() => onApplyRefreshed(topAlert.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            <CheckCircle size={18} />
            Apply Refreshed Plan
          </button>
        )}
        <button 
          onClick={() => onAcknowledge(topAlert.id)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          <CheckCircle size={18} />
          {topAlert.refreshed_assessment ? 'Acknowledge (Keep Current Plan)' : translateText('Acknowledge', language)}
        </button>
      </div>
    </div>
  );
}
