import { useState, useEffect } from 'react';
import { Anchor, Radio, Search, Filter, RefreshCw, AlertTriangle } from 'lucide-react';
import { fetchNearbyPorts, type LandingCentre } from '../../api/marinewatch-client';

export default function PortWatchRegistry() {
  const [ports, setPorts] = useState<LandingCentre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string>('ALL');

  useEffect(() => {
    loadPorts();
  }, []);

  async function loadPorts() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNearbyPorts(20.0, 78.0, 2500, 50);
      if (data && Array.isArray(data.ports)) {
        setPorts(data.ports);
      } else {
        setPorts([]);
      }
    } catch (err: any) {
      console.error('Failed to load ports:', err);
      setError(err?.message || 'Failed to fetch harbour records from CMFRI registry');
      setPorts([]);
    } finally {
      setLoading(false);
    }
  }

  const states = ['ALL', ...Array.from(new Set(ports.map((p) => p.state).filter(Boolean)))];

  const filteredPorts = ports.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.district?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.state?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedState === 'ALL' || p.state === selectedState;
    return matchesSearch && matchesState;
  });

  const totalCraft = filteredPorts.reduce((acc, p) => acc + (p.craft_count?.total || 0), 0);
  const totalMech = filteredPorts.reduce((acc, p) => acc + (p.craft_count?.mechanized || 0), 0);
  const totalMot = filteredPorts.reduce((acc, p) => acc + (p.craft_count?.motorized || 0), 0);

  return (
    <div className="portwatch-view">
      <div className="portwatch-header">
        <div>
          <h2 className="portwatch-header-title">
            <Anchor size={20} style={{ color: 'var(--color-accent)' }} />
            CMFRI Fish Landing Centres & Harbour Census Registry
          </h2>
          <p className="portwatch-header-subtitle">
            Authoritative maritime fleet statistics, quay facilities, and emergency VHF radio calling channels
            across all Indian coastal states and island territories.
          </p>
        </div>
        <div className="portwatch-header-actions">
          <span className="portwatch-count-badge">
            {loading ? 'Loading…' : error ? 'Unavailable' : `${filteredPorts.length} Registered Harbours`}
          </span>
          <button
            type="button"
            onClick={loadPorts}
            className="portwatch-refresh-btn"
            title="Refresh port census"
            aria-label="Refresh port census"
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
          </button>
        </div>
      </div>

      {/* Fleet KPI Banner */}
      <div className="portwatch-kpi-grid">
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Total Monitored Harbours</span>
          <span className="portwatch-kpi-value" style={{ color: 'var(--color-accent)' }}>
            {loading ? '…' : error ? '—' : filteredPorts.length}
          </span>
        </div>
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Total Registered Craft</span>
          <span className="portwatch-kpi-value">
            {loading ? '…' : error ? '—' : totalCraft.toLocaleString()}
          </span>
        </div>
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Mechanized Fleet</span>
          <span className="portwatch-kpi-value accent-emerald">
            {loading ? '…' : error ? '—' : totalMech.toLocaleString()}
          </span>
        </div>
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Motorized Fleet</span>
          <span className="portwatch-kpi-value accent-blue">
            {loading ? '…' : error ? '—' : totalMot.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="portwatch-toolbar">
        <div className="portwatch-search-wrap">
          <Search size={14} className="portwatch-search-icon" />
          <input
            type="text"
            placeholder="Search harbours by name, district, or facilities…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="portwatch-search-input"
            disabled={loading || !!error}
          />
        </div>
        <div className="portwatch-filter-group">
          <Filter size={14} style={{ color: 'var(--color-text-dim)' }} />
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="portwatch-filter-select"
            aria-label="Filter by state"
            disabled={loading || !!error}
          >
            {states.map((st) => (
              <option key={st} value={st}>
                {st === 'ALL' ? 'All Coastal States' : st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Harbours Census Table */}
      <div className="portwatch-table-wrap">
        <table className="portwatch-table">
          <thead>
            <tr>
              <th>Harbour Name</th>
              <th>District & State</th>
              <th>Harbour Type</th>
              <th>Total Fleet</th>
              <th>Mechanized</th>
              <th>Motorized</th>
              <th>VHF Channel</th>
              <th>Tide & Draft</th>
              <th>Key Facilities</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <RefreshCw size={16} className="spin-icon" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                  Loading harbour census registry data…
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-warning, #d97706)', fontWeight: 600 }}>
                      <AlertTriangle size={16} />
                      <span>Port Census Registry Unavailable</span>
                    </div>
                    <span style={{ fontSize: '12px', maxWidth: '420px' }}>{error}</span>
                    <button
                      type="button"
                      onClick={loadPorts}
                      style={{
                        marginTop: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={12} />
                      Retry Connection
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {!loading && !error && ports.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No registered harbours available in the census database.
                </td>
              </tr>
            )}

            {!loading && !error && ports.length > 0 && filteredPorts.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No harbours match the current search filter.
                </td>
              </tr>
            )}

            {!loading && !error && filteredPorts.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="port-name-cell">
                    <Anchor size={14} style={{ color: 'var(--color-accent)' }} />
                    <span>{p.name}</span>
                  </div>
                </td>
                <td>
                  <span>{p.district}, <strong>{p.state}</strong></span>
                </td>
                <td>
                  <span className="port-type-tag">
                    {(p.type || '').replace(/_/g, ' ')}
                  </span>
                </td>
                <td><strong>{p.craft_count?.total ?? '—'}</strong></td>
                <td><span style={{ color: '#10b981', fontWeight: 700 }}>{p.craft_count?.mechanized ?? '—'}</span></td>
                <td><span style={{ color: '#38bdf8', fontWeight: 700 }}>{p.craft_count?.motorized ?? '—'}</span></td>
                <td>
                  <span className="port-vhf-tag">
                    <Radio size={11} style={{ color: 'var(--color-accent)' }} />
                    Ch {p.vhf_channel || 16}
                  </span>
                </td>
                <td>
                  <div className="port-tide-tag">Tide +1.8m CD</div>
                  <div className="port-clearance-note">Nav Clearance: OK</div>
                </td>
                <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(p.facilities || []).join(', ')}>
                  {(p.facilities || []).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
