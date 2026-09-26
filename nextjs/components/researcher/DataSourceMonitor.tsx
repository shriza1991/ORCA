import { useState, useEffect } from 'react';
import {
  Activity, Database, Shield,
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Calendar,
  Layers, Info,
} from 'lucide-react';
import { fetchHealthStatus, DATA_SOURCES, type HealthStatus, type DataSourceInfo } from '../../api/researcher-client';

function StatusIcon({ status }: { status: DataSourceInfo['status'] }) {
  switch (status) {
    case 'online': return <CheckCircle2 size={14} style={{ color: '#22c55e' }} />;
    case 'degraded': return <AlertTriangle size={14} style={{ color: '#eab308' }} />;
    case 'offline': return <XCircle size={14} style={{ color: '#ef4444' }} />;
    case 'planned': return <Calendar size={14} style={{ color: '#94a3b8' }} />;
  }
}

export default function DataSourceMonitor() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHealth(); }, []);

  async function loadHealth() {
    setLoading(true);
    try {
      const h = await fetchHealthStatus();
      setHealth(h);
    } finally {
      setLoading(false);
    }
  }

  const configuredCount = DATA_SOURCES.filter(s => s.status !== 'planned').length;

  return (
    <div className="researcher-source-monitor">
      {/* System Health Banner */}
      <div className={`researcher-health-banner ${health?.status ?? 'unknown'}`}>
        <div className="researcher-health-left">
          <Activity size={18} />
          <div>
            <span className="researcher-health-label">System Status</span>
            <span className="researcher-health-value">{health?.status?.toUpperCase() ?? 'CHECKING…'}</span>
          </div>
        </div>
        <div className="researcher-health-stats">
          <div className="researcher-health-stat">
            <Database size={13} />
            <span>{health?.database ?? '—'}</span>
          </div>
          <div className="researcher-health-stat">
            <Shield size={13} />
            <span>Mode: {health?.data_mode ?? 'SNAPSHOT'}</span>
          </div>
          <div className="researcher-health-stat">
            <Layers size={13} />
            <span>{configuredCount} configured profiles</span>
          </div>
        </div>
        <button className="researcher-refresh-btn" onClick={loadHealth} aria-label="Refresh health">
          <RefreshCw size={14} className={loading ? 'researcher-spinner' : ''} />
        </button>
      </div>

      {/* Prototype Disclosure Card */}
      <div className="researcher-prototype-info-card">
        <Info size={16} className="researcher-prototype-info-icon" />
        <div className="researcher-prototype-info-content">
          <strong>Configured Prototype Source Profiles</strong>
          <p>
            The profiles below describe the authoritative schema, provider semantics, and update cadences configured for this prototype environment. All observations are deterministic synthetic snapshots modeled on published Indian oceanographic data formats.
          </p>
        </div>
      </div>

      {/* Data Source Grid */}
      <section className="researcher-section">
        <h3 className="researcher-section-title">Configured Data Source Profiles</h3>
        <div className="researcher-source-grid">
          {DATA_SOURCES.map(src => {
            return (
              <div key={src.name} className={`researcher-source-card status-${src.status}`}>
                <div className="researcher-source-header">
                  <StatusIcon status={src.status} />
                  <span className="researcher-source-name">{src.name}</span>
                  <span className={`researcher-mode-badge mode-${src.data_mode.toLowerCase().replace(/[^a-z]/g, '_')}`}>{src.data_mode}</span>
                </div>
                <p className="researcher-source-desc">{src.description}</p>
                <div className="researcher-source-footer">
                  <span className="researcher-source-provider">{src.provider}</span>
                  <span className="researcher-cadence-badge">
                    {src.cadence}
                  </span>
                  <span className={`researcher-status-pill ${src.status}`}>{src.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Data Precedence Hierarchy */}
      <section className="researcher-section">
        <h3 className="researcher-section-title">Authoritative Source Precedence</h3>
        <div className="researcher-precedence-list">
          <div className="researcher-precedence-item rank-1">
            <span className="researcher-precedence-rank">1</span>
            <div>
              <strong>IMD — Cyclone Warning Division</strong>
              <p>Supreme authority for severe weather, cyclone tracks, and coastal alerts. Triggers hard-stop NO_GO.</p>
            </div>
          </div>
          <div className="researcher-precedence-item rank-2">
            <span className="researcher-precedence-rank">2</span>
            <div>
              <strong>INCOIS — Ocean State Forecast</strong>
              <p>Primary authority for wave height, swell, currents, and sea surface temperature.</p>
            </div>
          </div>
          <div className="researcher-precedence-item rank-3">
            <span className="researcher-precedence-rank">3</span>
            <div>
              <strong>INCOIS — PFZ Advisory</strong>
              <p>Primary authority for Potential Fishing Zone advisories. Satellite SST/Chl-a provides corroboration.</p>
            </div>
          </div>
          <div className="researcher-precedence-item rank-4">
            <span className="researcher-precedence-rank">4</span>
            <div>
              <strong>Open-Meteo Marine</strong>
              <p>Unauthoritative fallback profile. Used only when primary synthetic feeds simulate timeout or unavailability.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
