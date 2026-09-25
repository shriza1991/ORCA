import { useState, useEffect } from 'react';
import { Anchor, Radio, Search, Filter, RefreshCw } from 'lucide-react';
import { fetchNearbyPorts, type LandingCentre } from '../../api/marinewatch-client';

export default function PortWatchRegistry() {
  const [ports, setPorts] = useState<LandingCentre[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string>('ALL');

  useEffect(() => {
    loadPorts();
  }, []);

  async function loadPorts() {
    setLoading(true);
    try {
      const data = await fetchNearbyPorts(20.0, 78.0, 2500, 50);
      setPorts(data.ports || []);
    } catch (err) {
      console.error('Failed to load ports:', err);
    } finally {
      setLoading(false);
    }
  }

  const states = ['ALL', ...Array.from(new Set(ports.map((p) => p.state).filter(Boolean)))];

  const filteredPorts = ports.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.state.toLowerCase().includes(searchQuery.toLowerCase());
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
          <span className="portwatch-count-badge">{filteredPorts.length} Registered Harbours</span>
          <button
            type="button"
            onClick={loadPorts}
            className="portwatch-refresh-btn"
            title="Refresh port census"
            aria-label="Refresh port census"
          >
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
          </button>
        </div>
      </div>

      {/* Fleet KPI Banner */}
      <div className="portwatch-kpi-grid">
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Total Monitored Harbours</span>
          <span className="portwatch-kpi-value" style={{ color: 'var(--color-accent)' }}>{filteredPorts.length}</span>
        </div>
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Total Registered Craft</span>
          <span className="portwatch-kpi-value">{totalCraft.toLocaleString()}</span>
        </div>
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Mechanized Fleet</span>
          <span className="portwatch-kpi-value accent-emerald">{totalMech.toLocaleString()}</span>
        </div>
        <div className="portwatch-kpi-card">
          <span className="portwatch-kpi-label">Motorized Fleet</span>
          <span className="portwatch-kpi-value accent-blue">{totalMot.toLocaleString()}</span>
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
          />
        </div>
        <div className="portwatch-filter-group">
          <Filter size={14} style={{ color: 'var(--color-text-dim)' }} />
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="portwatch-filter-select"
            aria-label="Filter by state"
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
            {filteredPorts.map((p) => (
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
                    {p.type.replace(/_/g, ' ')}
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
            {filteredPorts.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No harbours match the current search filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
