import { useEffect, useState } from 'react';
import { Database, ShieldCheck, WifiOff } from 'lucide-react';
import { getHealth, type HealthResponse } from '../../api/client';
import { useTranslation } from "react-i18next";

interface DataModeIndicatorProps {
  initialHealth?: HealthResponse | null;
}

export default function DataModeIndicator({ initialHealth }: DataModeIndicatorProps) {
    const { t } = useTranslation();
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

  const rawMode = health?.data_mode?.trim();
  const mode = rawMode && !rawMode.includes('{{') ? rawMode.toUpperCase() : 'UNKNOWN';
  const databaseConnected = health?.database?.trim().toLowerCase() === 'connected';

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
        <span>{t('DataModeIndicator.mode', { val: t('DataModeIndicator.' + mode, mode) })}</span>
      </span>
      {health?.database && !health.database.includes('{{') && (
        <span
          className={`pilot-badge ${databaseConnected ? 'db-connected' : 'db-offline'}`}
          title={databaseConnected ? 'PostgreSQL Database Connected' : 'PostgreSQL Database Offline (Operating in in-memory snapshot mode)'}
        >
          <ShieldCheck size={12} />
          <span>{t('DataModeIndicator.db', { val: databaseConnected ? t('DataModeIndicator.Connected', 'Connected') : t('DataModeIndicator.Offline', 'Offline') })}</span>
        </span>
      )}
    </div>
  );
}
