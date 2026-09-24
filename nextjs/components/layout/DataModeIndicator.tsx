import { useEffect, useState } from 'react';
import { Database, ShieldCheck, WifiOff } from 'lucide-react';
import { getHealth, type HealthResponse } from '../../api/client';

interface DataModeIndicatorProps {
  initialHealth?: HealthResponse | null;
}

export default function DataModeIndicator({ initialHealth }: DataModeIndicatorProps) {
  const [health, setHealth] = useState<HealthResponse | null>(initialHealth ?? null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getHealth()
      .then((data) => {
        if (isMounted) {
          setHealth(data);
          setIsOffline(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsOffline(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const mode = health?.data_mode?.toUpperCase() || 'UNKNOWN';

  const getModeClass = () => {
    switch (mode) {
      case 'LIVE':
        return 'mode-live';
      case 'HYBRID':
        return 'mode-hybrid';
      case 'SNAPSHOT':
        return 'mode-snapshot';
      default:
        return 'mode-snapshot';
    }
  };

  if (isOffline && !health) {
    return (
      <div className="data-mode-indicator">
        <span className="mode-badge mode-snapshot" title="Backend service not connected">
          <WifiOff size={12} />
          <span>Backend Offline</span>
        </span>
      </div>
    );
  }

  return (
    <div className="data-mode-indicator">
      <span className={`mode-badge ${getModeClass()}`} title="System Data Ingestion Mode">
        <Database size={12} />
        <span>Mode: {mode}</span>
      </span>
      {health?.database && (
        <span
          className={`pilot-badge ${health.database === 'connected' ? 'db-connected' : 'db-offline'}`}
          title={health.database === 'connected' ? 'PostgreSQL Database Connected' : 'PostgreSQL Database Offline (Operating in in-memory snapshot mode)'}
        >
          <ShieldCheck size={12} />
          <span>DB: {health.database === 'connected' ? 'Connected' : 'Offline'}</span>
        </span>
      )}
    </div>
  );
}
