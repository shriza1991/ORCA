import { useState } from 'react';
import { ShieldAlert, Volume2, VolumeX, CheckCircle } from 'lucide-react';
import type { ActionableAlertDto } from '../../types/alerts';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface FisherAlertPanelProps {
  alerts: ActionableAlertDto[];
  language: SupportedLanguage;
  onAcknowledge: (alertId: string) => void;
  onReplay: (text: string) => void;
}

export default function FisherAlertPanel({ alerts, language, onAcknowledge, onReplay }: FisherAlertPanelProps) {
  const [muted, setMuted] = useState(false);

  const unacknowledged = alerts.filter(a => !a.is_acknowledged && a.status === 'ACTIVE');
  if (unacknowledged.length === 0) return null;

  const topAlert = unacknowledged[0];

  const handleReplay = () => {
    if (muted) return;
    onReplay(`Alert: ${topAlert.title}. ${topAlert.recommended_action}`);
  };

  return (
    <div className="fisher-alert-panel" style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', padding: '16px', marginBottom: '16px', borderRadius: '4px' }}>
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
            onClick={() => setMuted(!muted)} 
            style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX color="#ef4444" /> : <Volume2 color="#ef4444" />}
          </button>
          {!muted && (
            <button 
              onClick={handleReplay}
              style={{ fontSize: '0.8rem', padding: '4px 8px', backgroundColor: '#fecaca', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', color: '#991b1b' }}
            >
              Replay
            </button>
          )}
        </div>
      </div>
      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          onClick={() => onAcknowledge(topAlert.id)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          <CheckCircle size={18} />
          {translateText('Acknowledge', language)}
        </button>
      </div>
    </div>
  );
}
