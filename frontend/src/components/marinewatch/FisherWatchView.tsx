import { useState, useEffect } from 'react';
import {
  Fish,
  Anchor,
  Compass,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Waves,
  Thermometer,
  ArrowRight,
  Radio,
} from 'lucide-react';
import {
  fetchPFZAdvisories,
  fetchNearbyPorts,
  fetchRouteForecast,
  type PFZAdvisory,
  type LandingCentre,
  type RouteForecastResponse,
} from '../../api/marinewatch-client';

const COASTAL_SECTORS = [
  'All India',
  'Gujarat',
  'Maharashtra',
  'Goa',
  'Karnataka',
  'Kerala',
  'Tamil Nadu',
  'Andhra Pradesh',
  'Odisha',
  'West Bengal',
  'Andaman & Nicobar',
  'Lakshadweep',
];

export default function FisherWatchView() {
  const [selectedSector, setSelectedSector] = useState<string>('All India');
  const [pfzList, setPfzList] = useState<PFZAdvisory[]>([]);
  const [landingCentres, setLandingCentres] = useState<LandingCentre[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('CMFRI-MH-RAT-01');
  const [selectedPfz, setSelectedPfz] = useState<string>('INCOIS-PFZ-MH-01');
  const [craftType, setCraftType] = useState<string>('MOTORIZED_FIBERGLASS');
  const [routeResult, setRouteResult] = useState<RouteForecastResponse | null>(null);
  const [evaluatingRoute, setEvaluatingRoute] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const secParam = selectedSector === 'All India' ? 'All' : selectedSector;
        const [pfzRes, portsRes] = await Promise.all([
          fetchPFZAdvisories(secParam),
          fetchNearbyPorts(20.0, 78.0, 2500, 50),
        ]);
        setPfzList(pfzRes.advisories || []);

        const filteredPorts =
          selectedSector === 'All India'
            ? portsRes.ports || []
            : (portsRes.ports || []).filter((p) =>
                p.state.toLowerCase().includes(selectedSector.toLowerCase())
              );

        setLandingCentres(filteredPorts.length > 0 ? filteredPorts : portsRes.ports || []);

        if (filteredPorts.length > 0) {
          setSelectedPort(filteredPorts[0].id);
        } else if (portsRes.ports && portsRes.ports.length > 0) {
          setSelectedPort(portsRes.ports[0].id);
        }

        if (pfzRes.advisories && pfzRes.advisories.length > 0) {
          setSelectedPfz(pfzRes.advisories[0].advisory_id);
        }
      } catch (err) {
        console.error('Failed to load FisherWatch data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedSector]);

  async function handleEvaluateDeparture() {
    const origin = landingCentres.find((p) => p.id === selectedPort);
    const target = pfzList.find((z) => z.advisory_id === selectedPfz);
    if (!origin || !target) return;

    setEvaluatingRoute(true);
    try {
      const res = await fetchRouteForecast(
        [
          [origin.latitude, origin.longitude],
          [target.latitude, target.longitude],
        ],
        craftType
      );
      setRouteResult(res);
    } catch (err) {
      console.error('Route evaluation failed:', err);
    } finally {
      setEvaluatingRoute(false);
    }
  }

  if (loading) {
    return (
      <div className="marinewatch-fisher-container" style={{ padding: '40px', textAlign: 'center' }}>
        Loading FisherWatch data…
      </div>
    );
  }

  return (
    <div className="marinewatch-fisher-container">
      {/* Top Banner */}
      <div className="marinewatch-fisher-header">
        <div className="header-left">
          <div className="fisher-badge">
            <Fish size={14} />
            <span>FisherWatch India — Operational Pelagic Intelligence</span>
          </div>
          <h2>Potential Fishing Zones & Harbours Directory</h2>
          <p>
            Real INCOIS PFZ advisories synthesized with CMFRI landing centres, craft safety ceilings, and
            passage evaluation. Official data provided by INCOIS & Central Marine Fisheries Research Institute.
          </p>
        </div>

        {/* Craft Safety Matrix */}
        <div className="craft-ceilings-card">
          <h4>Vessel Safety Limits (INCOIS Ceilings)</h4>
          <div className="craft-ceiling-grid">
            <div className="ceiling-item">
              <span className="craft-name">Non-Motorized</span>
              <span className="craft-limit">≤ 1.4 m wave</span>
            </div>
            <div className="ceiling-item highlight">
              <span className="craft-name">Motorized OBM</span>
              <span className="craft-limit">≤ 2.2 m wave</span>
            </div>
            <div className="ceiling-item">
              <span className="craft-name">Mechanized Trawler</span>
              <span className="craft-limit">≤ 3.5 m wave</span>
            </div>
          </div>
        </div>
      </div>

      {/* Coastal Sector Selector (Nationwide Coverage) */}
      <div className="coastal-sector-selector-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>Sector:</span>
        {COASTAL_SECTORS.map((sec) => (
          <button
            key={sec}
            type="button"
            className={`bookmark-chip ${selectedSector === sec ? 'active' : ''}`}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '9999px',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              border: selectedSector === sec ? '1px solid var(--primary)' : '1px solid var(--border)',
              backgroundColor: selectedSector === sec ? 'var(--primary)' : 'var(--card)',
              color: selectedSector === sec ? '#fff' : 'var(--foreground)',
            }}
            onClick={() => setSelectedSector(sec)}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Route & Passage Safety Evaluator */}
      <section className="fisher-route-evaluator-card">
        <div className="evaluator-title-row">
          <div className="flex items-center gap-2">
            <Compass size={20} className="text-primary" />
            <h3>Passage Safety & Departure Evaluator</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            Deterministic Evaluation (No AI Hallucinations)
          </span>
        </div>

        <div className="evaluator-form-grid">
          <div className="evaluator-input-group">
            <label>Departure Harbour / Landing Centre</label>
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              aria-label="Departure Harbour"
            >
              {landingCentres.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.district}, {p.state})
                </option>
              ))}
            </select>
          </div>

          <div className="evaluator-input-group">
            <label>Target Potential Fishing Zone (PFZ)</label>
            <select
              value={selectedPfz}
              onChange={(e) => setSelectedPfz(e.target.value)}
              aria-label="Target PFZ"
            >
              {pfzList.map((z) => (
                <option key={z.advisory_id} value={z.advisory_id}>
                  {z.location_name} (Bearing {z.bearing_deg}°, ~{z.distance_km} km)
                </option>
              ))}
            </select>
          </div>

          <div className="evaluator-input-group">
            <label>Vessel Profile</label>
            <select
              value={craftType}
              onChange={(e) => setCraftType(e.target.value)}
              aria-label="Vessel Profile"
            >
              <option value="NON_MOTORIZED_CANOE">Non-Motorized Country Craft (≤1.4m limit)</option>
              <option value="MOTORIZED_FIBERGLASS">Motorized OBM Fiberglass (≤2.2m limit)</option>
              <option value="MECHANIZED_TRAWLER">Mechanized Inboard Trawler (≤3.5m limit)</option>
            </select>
          </div>

          <div className="evaluator-btn-wrap">
            <button
              type="button"
              className="evaluator-submit-btn"
              onClick={handleEvaluateDeparture}
              disabled={evaluatingRoute}
            >
              {evaluatingRoute ? 'Assessing Passage…' : 'Evaluate Voyage'}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {/* Route Assessment Verdict */}
        {routeResult && (
          <div className={`route-verdict-banner status-${routeResult.status.toLowerCase()}`}>
            <div className="verdict-icon">
              {routeResult.status === 'GO' ? (
                <ShieldCheck size={28} className="text-emerald-500" />
              ) : routeResult.status === 'CAUTION' ? (
                <AlertTriangle size={28} className="text-amber-500" />
              ) : (
                <ShieldAlert size={28} className="text-rose-500" />
              )}
            </div>
            <div className="verdict-details">
              <div className="flex items-center gap-2">
                <span className={`verdict-pill status-${routeResult.status.toLowerCase()}`}>
                  {routeResult.status}
                </span>
                <span className="verdict-summary font-semibold">{routeResult.verdict}</span>
              </div>
              <div className="verdict-metrics">
                <span>Distance: <strong>{routeResult.total_distance_nm} nm</strong> ({routeResult.total_distance_km} km)</span>
                <span>Max Significant Wave: <strong>{routeResult.max_wave_height_m} m</strong></span>
                {routeResult.restricted_violations.length > 0 && (
                  <span className="text-rose-600 font-semibold">
                    Violations: {routeResult.restricted_violations.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Two Column Grid: PFZ Advisories & Landing Centres */}
      <div className="fisher-content-columns">
        {/* Left Column: Active PFZ Advisories */}
        <div className="fisher-column">
          <div className="column-header">
            <div className="flex items-center gap-2">
              <Fish size={18} className="text-primary" />
              <h3>Active INCOIS PFZ Advisories</h3>
            </div>
            <span className="column-count-badge">{pfzList.length} Active Zones</span>
          </div>

          <div className="pfz-cards-list">
            {pfzList.map((pfz) => (
              <div key={pfz.advisory_id} className="pfz-advisory-card">
                <div className="pfz-card-top">
                  <span className="pfz-badge">INCOIS ADVISORY</span>
                  <span className="pfz-status-active">
                    <CheckCircle2 size={12} />
                    {pfz.status}
                  </span>
                </div>
                <h4 className="pfz-name">{pfz.location_name}</h4>
                <div className="pfz-coordinates">
                  {pfz.latitude.toFixed(3)}°N, {pfz.longitude.toFixed(3)}°E · Depth {pfz.depth_range_m}
                </div>

                <div className="pfz-indicators-row">
                  <div className="indicator-pill">
                    <Thermometer size={13} className="text-rose-500" />
                    <span>SST: {pfz.sst_celsius}°C</span>
                  </div>
                  <div className="indicator-pill">
                    <Waves size={13} className="text-emerald-500" />
                    <span>Chl-a: {pfz.chlorophyll_mg_m3} mg/m³</span>
                  </div>
                  <div className="indicator-pill">
                    <Navigation size={13} className="text-blue-500" />
                    <span>Bearing: {pfz.bearing_deg}°</span>
                  </div>
                </div>

                <div className="pfz-species-row">
                  <span className="species-label">Target Species:</span>
                  <span className="species-names">{pfz.target_species.join(', ')}</span>
                </div>

                <div className="pfz-footer">
                  <span className="pfz-gears">Gear: {pfz.gear_recommended.join(', ')}</span>
                  <span className="pfz-source-tag">Oceansat-3 OCM</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: CMFRI Landing Centres Directory */}
        <div className="fisher-column">
          <div className="column-header">
            <div className="flex items-center gap-2">
              <Anchor size={18} className="text-primary" />
              <h3>CMFRI Fish Landing Centres & Ports</h3>
            </div>
            <span className="column-count-badge">{landingCentres.length} Harbours</span>
          </div>

          <div className="ports-directory-list">
            {landingCentres.map((port) => (
              <div key={port.id} className="landing-centre-card">
                <div className="centre-card-header">
                  <div>
                    <h4 className="centre-name">{port.name}</h4>
                    <span className="centre-location">
                      {port.district}, {port.state} · {port.latitude.toFixed(4)}°N, {port.longitude.toFixed(4)}°E
                    </span>
                  </div>
                  <span className="centre-type-pill">{port.type.replace(/_/g, ' ')}</span>
                </div>

                <div className="craft-fleet-breakdown">
                  <div className="fleet-stat">
                    <span className="fleet-num">{port.craft_count.mechanized}</span>
                    <span className="fleet-desc">Mechanized</span>
                  </div>
                  <div className="fleet-stat">
                    <span className="fleet-num">{port.craft_count.motorized}</span>
                    <span className="fleet-desc">Motorized</span>
                  </div>
                  <div className="fleet-stat">
                    <span className="fleet-num">{port.craft_count.non_motorized}</span>
                    <span className="fleet-desc">Traditional</span>
                  </div>
                  <div className="fleet-stat total">
                    <span className="fleet-num">{port.craft_count.total}</span>
                    <span className="fleet-desc">Total Fleet</span>
                  </div>
                </div>

                <div className="centre-details-row">
                  <div className="flex items-center gap-1 text-xs">
                    <Radio size={12} className="text-primary" />
                    <span>VHF Ch <strong>{port.vhf_channel}</strong></span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Facilities: {port.facilities.slice(0, 3).join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
