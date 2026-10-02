import { useState, useEffect } from 'react';
import { ShieldCheck, Search, Filter, RefreshCw, AlertTriangle } from 'lucide-react';
import { fetchNearbyAquaculture, type AquacultureSite } from '../../api/marinewatch-client';

export default function AquaWatchRegistry() {
  const [farms, setFarms] = useState<AquacultureSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string>('ALL');

  useEffect(() => {
    loadFarms();
  }, []);

  async function loadFarms() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNearbyAquaculture(20.0, 78.0, 2500, 50);
      if (data && Array.isArray(data.aquaculture_sites)) {
        setFarms(data.aquaculture_sites);
      } else {
        setFarms([]);
      }
    } catch (err: any) {
      console.error('Failed to load aquaculture farms:', err);
      setError(err?.message || 'Failed to fetch aquaculture facilities from CAA registry');
      setFarms([]);
    } finally {
      setLoading(false);
    }
  }

  const states = ['ALL', ...Array.from(new Set(farms.map((f) => f.state).filter(Boolean)))];

  const filteredFarms = farms.filter((f) => {
    const matchesSearch =
      !searchQuery ||
      f.farm_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.district?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.cultured_species?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.caa_registration_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedState === 'ALL' || f.state === selectedState;
    return matchesSearch && matchesState;
  });

  const totalArea = filteredFarms.reduce((acc, f) => acc + (f.water_spread_area_ha || 0), 0);
  const compliantCount = filteredFarms.filter((f) => f.biosecurity_compliant).length;

  return (
    <div className="aquawatch-view">
      <div className="aquawatch-header">
        <div>
          <h2 className="aquawatch-header-title">
            <ShieldCheck size={20} style={{ color: '#10b981' }} />
            Coastal Aquaculture Authority (CAA) Farm & Biosecurity Registry
          </h2>
          <p className="aquawatch-header-subtitle">
            Statutory brackishwater shrimp and fish aquaculture facilities registered under the Coastal
            Aquaculture Authority Act, 2005. Environmental parameters, biosecurity status, and water sources.
          </p>
        </div>
        <div className="portwatch-header-actions">
          <span className="aquawatch-count-badge">
            {loading ? 'Loading…' : error ? 'Unavailable' : `${filteredFarms.length} Certified Facilities`}
          </span>
          <button
            type="button"
            onClick={loadFarms}
            className="portwatch-refresh-btn"
            title="Refresh farm registry"
            aria-label="Refresh farm registry"
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="aquawatch-kpi-grid">
        <div className="aquawatch-kpi-card">
          <span className="aquawatch-kpi-label">Monitored Facilities</span>
          <span className="aquawatch-kpi-value" style={{ color: 'var(--color-accent)' }}>
            {loading ? '…' : error ? '—' : filteredFarms.length}
          </span>
        </div>
        <div className="aquawatch-kpi-card">
          <span className="aquawatch-kpi-label">Water Spread Area</span>
          <span className="aquawatch-kpi-value">
            {loading ? '…' : error ? '—' : `${totalArea.toFixed(1)} ha`}
          </span>
        </div>
        <div className="aquawatch-kpi-card">
          <span className="aquawatch-kpi-label">Biosecurity Audited</span>
          <span className="aquawatch-kpi-value accent-emerald">
            {loading ? '…' : error ? '—' : `${compliantCount} Compliant`}
          </span>
        </div>
        <div className="aquawatch-kpi-card">
          <span className="aquawatch-kpi-label">Statutory Authority</span>
          <span className="aquawatch-kpi-value" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            CAA, Min of Fisheries (GoI)
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="portwatch-toolbar">
        <div className="portwatch-search-wrap">
          <Search size={14} className="portwatch-search-icon" />
          <input
            type="text"
            placeholder="Search by farm name, registration #, cultured species, or district…"
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

      {/* Loading State */}
      {loading && (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <RefreshCw size={16} className="spin-icon" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Loading CAA aquaculture registry data…
        </div>
      )}

      {/* Error / Unavailable State */}
      {!loading && error && (
        <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '8px', marginTop: '16px' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-warning, #d97706)', fontWeight: 600 }}>
              <AlertTriangle size={16} />
              <span>Aquaculture Registry Unavailable</span>
            </div>
            <span style={{ fontSize: '12px', maxWidth: '420px' }}>{error}</span>
            <button
              type="button"
              onClick={loadFarms}
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
        </div>
      )}

      {/* Empty Database State */}
      {!loading && !error && farms.length === 0 && (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '8px', marginTop: '16px' }}>
          No registered aquaculture facilities found in the database.
        </div>
      )}

      {/* Filter Yielded 0 Matches */}
      {!loading && !error && farms.length > 0 && filteredFarms.length === 0 && (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '8px', marginTop: '16px' }}>
          No aquaculture sites match the current search filter.
        </div>
      )}

      {/* Farm Cards Grid */}
      {!loading && !error && filteredFarms.length > 0 && (
        <div className="aquawatch-cards-grid">
          {filteredFarms.map((farm) => (
            <div key={farm.id} className="aquawatch-card">
              <div className="aquawatch-card-header">
                <div>
                  <h4 className="aquawatch-farm-name">{farm.farm_name}</h4>
                  <div className="aquawatch-reg-no">
                    Reg: {farm.caa_registration_number}
                  </div>
                </div>
                <span className="aquawatch-status-badge">
                  {farm.caa_status}
                </span>
              </div>

              <div className="aquawatch-attr-list">
                <div className="aquawatch-attr-row">
                  <span className="aquawatch-attr-label">Location</span>
                  <span className="aquawatch-attr-value">{farm.district}, {farm.state}</span>
                </div>
                <div className="aquawatch-attr-row">
                  <span className="aquawatch-attr-label">Cultured Species</span>
                  <span className="aquawatch-attr-value" style={{ color: 'var(--color-accent)' }}>{farm.cultured_species}</span>
                </div>
                <div className="aquawatch-attr-row">
                  <span className="aquawatch-attr-label">Water Source</span>
                  <span className="aquawatch-attr-value">{farm.water_source}</span>
                </div>
                <div className="aquawatch-attr-row">
                  <span className="aquawatch-attr-label">Salinity</span>
                  <span className="aquawatch-attr-value" style={{ fontFamily: 'monospace' }}>{farm.water_salinity_ppt} ppt</span>
                </div>
                <div className="aquawatch-attr-row">
                  <span className="aquawatch-attr-label">Water Spread</span>
                  <span className="aquawatch-attr-value">{farm.water_spread_area_ha} ha ({farm.ponds_count} ponds)</span>
                </div>
                <div className="aquawatch-attr-row" style={{ paddingTop: '6px', borderTop: '1px dashed var(--color-border)' }}>
                  <span className="aquawatch-attr-label">Biosecurity / ETP</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: farm.biosecurity_compliant ? '#10b981' : '#f59e0b' }}>
                    {farm.biosecurity_compliant ? 'Certified Compliant' : 'Audit Required'}
                  </span>
                </div>
              </div>

              <div className="aquawatch-card-footer">
                <span>{farm.latitude.toFixed(4)}°N, {farm.longitude.toFixed(4)}°E</span>
                <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--color-bg-tertiary)', fontSize: '10px', fontWeight: 600 }}>CAA Registry</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
