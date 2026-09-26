import { useState, useEffect, useMemo } from 'react';
import {
  Waves, Thermometer, Wind, Navigation, Satellite, Fish,
  AlertTriangle, RefreshCw, ChevronDown,
} from 'lucide-react';
import {
  fetchHarbors, fetchMarineObservations, fetchEOGridCells,
  fetchPFZCandidates, fetchHazards, getLatestEOGridCells,
  type HarborData, type MarineObservation, type EOGridCell,
  type PFZCandidate, type HazardBulletin,
} from '../../api/researcher-client';
import OceanTimeSeriesChart from './OceanTimeSeriesChart';
import TideTimeSeriesChart from './TideTimeSeriesChart';
import PFZSpatialMap from './PFZSpatialMap';
import HazardSpatialMap from './HazardSpatialMap';
import EOTemporalAnalysisChart from './EOTemporalAnalysisChart';
import EOGridSpatialMap from './EOGridSpatialMap';
import DataProvenancePanel from './DataProvenancePanel';
import {
  deriveMarineTrustMetadata,
  deriveTideTrustMetadata,
  deriveEOTrustMetadata,
  deriveEOSpatialTrustMetadata,
  derivePFZTrustMetadata,
  deriveHazardTrustMetadata,
} from '../../utils/provenance';

export default function OceanDataExplorer() {
  const [harbors, setHarbors] = useState<HarborData[]>([]);
  const [selectedHarbor, setSelectedHarbor] = useState<string>('');
  const [observations, setObservations] = useState<MarineObservation[]>([]);
  const [eoCells, setEoCells] = useState<EOGridCell[]>([]);
  const [pfzCandidates, setPfzCandidates] = useState<PFZCandidate[]>([]);
  const [hazards, setHazards] = useState<HazardBulletin[]>([]);
  const [selectedPfzId, setSelectedPfzId] = useState<string | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [obsLoading, setObsLoading] = useState(false);

  const latestEoCells = useMemo(() => getLatestEOGridCells(eoCells), [eoCells]);

  const harborName = harbors.find((h) => h.public_id === selectedHarbor)?.name || 'Ratnagiri';

  const marineTrust = useMemo(
    () => deriveMarineTrustMetadata(observations, harborName),
    [observations, harborName]
  );
  const tideTrust = useMemo(
    () => deriveTideTrustMetadata(observations, harborName),
    [observations, harborName]
  );
  const eoTrust = useMemo(() => deriveEOTrustMetadata(eoCells), [eoCells]);
  const eoSpatialTrust = useMemo(
    () => deriveEOSpatialTrustMetadata(eoCells, '2026-09-12'),
    [eoCells]
  );
  const pfzTrust = useMemo(() => derivePFZTrustMetadata(pfzCandidates), [pfzCandidates]);
  const hazardTrust = useMemo(() => deriveHazardTrustMetadata(hazards), [hazards]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedHarbor) {
      loadObservations(selectedHarbor);
    }
  }, [selectedHarbor]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [h, eo, pfz, hz] = await Promise.all([
        fetchHarbors(), fetchEOGridCells(), fetchPFZCandidates(), fetchHazards(),
      ]);
      setHarbors(h);
      setEoCells(eo);
      setPfzCandidates(pfz);
      setHazards(hz);
      if (h.length > 0) {
        setSelectedHarbor(h[0].public_id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadObservations(harborId: string) {
    setObsLoading(true);
    try {
      const obs = await fetchMarineObservations(harborId);
      setObservations(obs);
    } finally {
      setObsLoading(false);
    }
  }

  // Explicitly sort chronologically by observation_time ascending
  const sortedObs = useMemo(() => {
    return [...observations].sort((a, b) => {
      const ta = new Date(a.observation_time).getTime();
      const tb = new Date(b.observation_time).getTime();
      return ta - tb;
    });
  }, [observations]);

  // Determine latest observation by newest timestamp (never by arbitrary array position)
  const latest = sortedObs.length > 0 ? sortedObs[sortedObs.length - 1] : null;

  function formatTime(iso: string) {
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return iso; }
  }
  function formatDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch { return iso; }
  }

  if (loading) {
    return (
      <div className="researcher-loading">
        <RefreshCw size={20} className="researcher-spinner" />
        <span>Loading ocean data…</span>
      </div>
    );
  }

  return (
    <div className="researcher-ocean-explorer">
      {/* Harbor Selector */}
      <div className="researcher-toolbar">
        <div className="researcher-harbor-select">
          <Navigation size={14} />
          <select
            value={selectedHarbor}
            onChange={e => setSelectedHarbor(e.target.value)}
            aria-label="Select harbor"
          >
            {harbors.map(h => (
              <option key={h.public_id} value={h.public_id}>{h.name} ({h.state})</option>
            ))}
          </select>
          <ChevronDown size={12} className="researcher-select-chevron" />
        </div>
        <button className="researcher-refresh-btn" onClick={loadInitialData} aria-label="Refresh data">
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Marine Condition Cards */}
      <section className="researcher-section">
        <h3 className="researcher-section-title">Marine Conditions — {harborName}</h3>
        <div className="researcher-metric-grid">
          <div className="researcher-metric-card">
            <div className="researcher-metric-icon" style={{ color: '#3b82f6' }}><Waves size={20} /></div>
            <div className="researcher-metric-body">
              <span className="researcher-metric-label">Wave Height</span>
              <span className="researcher-metric-value">{latest?.wave_height_m?.toFixed(1) ?? '—'} <small>m</small></span>
              <span className="researcher-metric-sub">Swell {latest?.swell_period_s?.toFixed(1) ?? '—'}s</span>
            </div>
          </div>
          <div className="researcher-metric-card">
            <div className="researcher-metric-icon" style={{ color: '#ef4444' }}><Thermometer size={20} /></div>
            <div className="researcher-metric-body">
              <span className="researcher-metric-label">Sea Surface Temp</span>
              <span className="researcher-metric-value">{latest?.sst_celsius?.toFixed(1) ?? '—'} <small>°C</small></span>
              <span className="researcher-metric-sub">Source: {latest?.source ?? '—'}</span>
            </div>
          </div>
          <div className="researcher-metric-card">
            <div className="researcher-metric-icon" style={{ color: '#0ea5e9' }}><Wind size={20} /></div>
            <div className="researcher-metric-body">
              <span className="researcher-metric-label">Wind Speed</span>
              <span className="researcher-metric-value">{latest?.wind_speed_kn ?? '—'} <small>kn</small></span>
              <span className="researcher-metric-sub">{latest?.wind_direction_deg ?? '—'}° direction</span>
            </div>
          </div>
          <div className="researcher-metric-card">
            <div className="researcher-metric-icon" style={{ color: '#8b5cf6' }}><Navigation size={20} /></div>
            <div className="researcher-metric-body">
              <span className="researcher-metric-label">Current Speed</span>
              <span className="researcher-metric-value">{latest?.current_speed_kn?.toFixed(1) ?? '—'} <small>kn</small></span>
              <span className="researcher-metric-sub">Visibility {latest?.visibility_nm ?? '—'} nm</span>
            </div>
          </div>
        </div>
      </section>

      {/* 48-Hour Marine Observation Time Series Chart */}
      <section className="researcher-section">
        <OceanTimeSeriesChart
          observations={sortedObs}
          harborName={harborName}
          loading={obsLoading}
        />
        <DataProvenancePanel metadata={marineTrust} loading={obsLoading} />
      </section>

      {/* 48-Hour Tide Level & Phase Temporal Analysis Chart */}
      <section className="researcher-section">
        <TideTimeSeriesChart
          observations={sortedObs}
          harborName={harborName}
          loading={obsLoading}
        />
        <DataProvenancePanel metadata={tideTrust} loading={obsLoading} />
      </section>

      {/* Observation Timeline Table */}
      <section className="researcher-section">
        <h3 className="researcher-section-title">Observation Timeline</h3>
        <div className="researcher-table-wrap">
          <table className="researcher-table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Wave (m)</th>
                <th>SST (°C)</th>
                <th>Wind (kn)</th>
                <th>Swell (s)</th>
                <th>Tide (m)</th>
                <th>Phase</th>
                <th>QC Status</th>
                <th>Source</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {sortedObs.map(obs => (
                <tr key={obs.public_id}>
                  <td className="researcher-cell-mono">{formatTime(obs.observation_time)}</td>
                  <td className={(obs.wave_height_m ?? 0) > 2.5 ? 'researcher-cell-danger' : (obs.wave_height_m ?? 0) > 1.8 ? 'researcher-cell-warning' : ''}>
                    {obs.wave_height_m != null ? obs.wave_height_m.toFixed(1) : '—'}
                  </td>
                  <td>{obs.sst_celsius != null ? obs.sst_celsius.toFixed(1) : '—'}</td>
                  <td className={(obs.wind_speed_kn ?? 0) > 25 ? 'researcher-cell-danger' : (obs.wind_speed_kn ?? 0) > 18 ? 'researcher-cell-warning' : ''}>
                    {obs.wind_speed_kn ?? '—'}
                  </td>
                  <td>{obs.swell_period_s != null ? obs.swell_period_s.toFixed(1) : '—'}</td>
                  <td style={{ color: '#0284c7', fontWeight: 600 }}>
                    {obs.tide_level_m != null ? obs.tide_level_m.toFixed(2) : '—'}
                  </td>
                  <td>
                    {obs.tide_phase ? (
                      <span className="tide-mini-phase-badge" style={{
                        background: obs.tide_phase === 'FLOOD' ? 'rgba(2, 132, 199, 0.12)' : obs.tide_phase === 'EBB' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        color: obs.tide_phase === 'FLOOD' ? '#0284c7' : obs.tide_phase === 'EBB' ? '#d97706' : '#059669'
                      }}>
                        {obs.tide_phase}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`ocean-tooltip-qc ${obs.qc_status === 'VALID' || !obs.qc_status ? 'valid' : 'suspect'}`}>
                      {obs.qc_status || 'VALID'}
                    </span>
                  </td>
                  <td><span className="researcher-source-badge">{obs.source}</span></td>
                  <td>
                    {(obs.quality_flags || []).map(f => (
                      <span key={f} className={`researcher-quality-flag ${f === 'official_source' ? 'official' : f === 'fallback' ? 'fallback' : ''}`}>{f}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 14-Day Earth Observation Temporal Analysis Chart */}
      <section className="researcher-section">
        <EOTemporalAnalysisChart records={eoCells} loading={loading} />
        <DataProvenancePanel metadata={eoTrust} loading={loading} />
      </section>

      {/* Earth Observation 5×5 Spatial Grid Map */}
      <section className="researcher-section">
        <EOGridSpatialMap records={eoCells} loading={loading} />
        <DataProvenancePanel metadata={eoSpatialTrust} loading={loading} />
      </section>

      {/* Two-Column: EO Grid + PFZ */}
      <div className="researcher-two-col">
        {/* EO Satellite Data (Latest Snapshot) */}
        <section className="researcher-section">
          <h3 className="researcher-section-title">
            <Satellite size={14} />
            Earth Observation Grid (Latest Snapshot)
          </h3>
          <div className="researcher-table-wrap">
            <table className="researcher-table researcher-table-compact">
              <thead>
                <tr>
                  <th>Cell</th>
                  <th>Chl-a (mg/m³)</th>
                  <th>SST (°C)</th>
                  <th>Cloud %</th>
                  <th>Satellite</th>
                  <th>Res.</th>
                </tr>
              </thead>
              <tbody>
                {latestEoCells.map((cell, idx) => (
                  <tr key={cell.public_id || `${cell.cell_id}-${cell.pass_time || idx}`}>
                    <td className="researcher-cell-mono">{cell.cell_id}</td>
                    <td style={{ color: (cell.chlorophyll_a_mg_m3 ?? 0) > 1.5 ? '#10b981' : undefined, fontWeight: (cell.chlorophyll_a_mg_m3 ?? 0) > 1.5 ? 600 : undefined }}>
                      {cell.chlorophyll_a_mg_m3 != null ? cell.chlorophyll_a_mg_m3.toFixed(2) : '—'}
                    </td>
                    <td>{cell.sst_celsius != null ? cell.sst_celsius.toFixed(1) : '—'}</td>
                    <td className={(cell.cloud_cover_pct ?? 0) > 30 ? 'researcher-cell-warning' : ''}>
                      {cell.cloud_cover_pct != null ? `${cell.cloud_cover_pct}%` : '—'}
                    </td>
                    <td><span className="researcher-source-badge">{cell.satellite}</span></td>
                    <td>{cell.resolution_m}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataProvenancePanel metadata={eoTrust} loading={loading} />
        </section>

        {/* PFZ Candidates */}
        <section className="researcher-section">
          <h3 className="researcher-section-title">
            <Fish size={14} />
            PFZ Advisory Candidates
          </h3>
          <div className="researcher-pfz-spatial-container">
            <PFZSpatialMap
              candidates={pfzCandidates}
              selectedCandidateId={selectedPfzId}
              onSelectCandidate={setSelectedPfzId}
              loading={loading}
            />
            <div className="researcher-pfz-cards">
              {pfzCandidates.map(pfz => (
                <div
                  key={pfz.public_id}
                  className={`researcher-pfz-card ${selectedPfzId === pfz.public_id ? 'selected' : ''}`}
                  onClick={() => setSelectedPfzId(pfz.public_id === selectedPfzId ? null : pfz.public_id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select PFZ candidate ${pfz.public_id}`}
                >
                  <div className="researcher-pfz-rank">#{pfz.rank}</div>
                  <div className="researcher-pfz-body">
                    <div className="researcher-pfz-id">
                      {pfz.public_id}
                      {pfz.confidence && (
                        <span className={`pfz-popup-conf ${pfz.confidence.toLowerCase()}`} style={{ marginLeft: 6 }}>
                          {pfz.confidence}
                        </span>
                      )}
                    </div>
                    <div className="researcher-pfz-stats">
                      <span>{pfz.distance_km != null ? pfz.distance_km.toFixed(1) : '—'} km · {pfz.bearing_deg ?? 0}°{pfz.depth_m != null ? ` · ${pfz.depth_m}m depth` : ''} · ({pfz.latitude?.toFixed(2)}°N, {pfz.longitude?.toFixed(2)}°E)</span>
                      <span>SST Gradient: {pfz.sst_gradient != null ? pfz.sst_gradient : '—'} · Chl-a {pfz.chlorophyll_a_mg_m3 != null ? `${pfz.chlorophyll_a_mg_m3} mg/m³` : '—'}</span>
                    </div>
                    <div className="researcher-pfz-validity">
                      Valid: {formatDate(pfz.valid_from)} — {formatDate(pfz.valid_to)}
                    </div>
                  </div>
                  <span className={`researcher-status-badge ${pfz.status === 'ACTIVE' || pfz.status === 'VALID' ? 'go' : ''}`}>{pfz.status}</span>
                </div>
              ))}
            </div>
          </div>
          <DataProvenancePanel metadata={pfzTrust} loading={loading} />
        </section>
      </div>

      {/* Hazard Bulletins */}
      <section className="researcher-section">
        <h3 className="researcher-section-title">
          <AlertTriangle size={14} />
          Observed / Advisory Hazard Bulletins
        </h3>
        <div className="researcher-hazard-spatial-container">
          <HazardSpatialMap
            hazards={hazards}
            selectedHazardId={selectedHazardId}
            onSelectHazard={setSelectedHazardId}
            loading={loading}
          />
          <div className="researcher-hazard-list">
            {hazards.map(hz => (
              <div
                key={hz.public_id}
                className={`researcher-hazard-card severity-${hz.severity.toLowerCase()} ${selectedHazardId === hz.public_id ? 'selected' : ''} ${hz.status === 'EXPIRED' ? 'status-expired' : ''}`}
                onClick={() => setSelectedHazardId(hz.public_id === selectedHazardId ? null : hz.public_id)}
                role="button"
                tabIndex={0}
                aria-label={`Select hazard bulletin ${hz.public_id}`}
              >
                <div className="researcher-hazard-header">
                  <span className={`researcher-severity-badge ${hz.severity.toLowerCase()}`}>{hz.severity}</span>
                  <span className={`researcher-hazard-status-badge ${hz.status.toLowerCase()}`}>{hz.status}</span>
                  <span className="researcher-hazard-type-badge">{hz.event_type || 'GENERAL'}</span>
                  <span className="researcher-hazard-title">{hz.headline}</span>
                </div>
                {hz.description && <p className="researcher-hazard-desc">{hz.description}</p>}
                <div className="researcher-hazard-meta">
                  <span>Source: {hz.source}</span>
                  <span>Area: {hz.affected_area ?? '—'}</span>
                  <span>Valid: {formatTime(hz.issued_at)} → {formatTime(hz.valid_until)}</span>
                  {hz.qc_status && <span>QC: {hz.qc_status}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DataProvenancePanel metadata={hazardTrust} loading={loading} />
      </section>
    </div>
  );
}
