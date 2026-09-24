import { useState, useEffect } from 'react';
import {
  Compass,
  Waves,
  Fish,
  AlertTriangle,
  Anchor,
  Database,
  ArrowLeft,
  Radio,
} from 'lucide-react';
import OceanWatchGIS from '../components/marinewatch/OceanWatchGIS';
import FisherWatchView from '../components/marinewatch/FisherWatchView';
import DataCatalogueView from '../components/marinewatch/DataCatalogueView';
import {
  fetchNearbyAquaculture,
  fetchActiveHazards,
  fetchNearbyPorts,
  type AquacultureSite,
  type ActiveHazard,
  type LandingCentre,
} from '../api/marinewatch-client';

import { translateText, type SupportedLanguage } from '../i18n/translations';

type MarineWatchTab = 'oceanwatch' | 'fisherwatch' | 'aquawatch' | 'hazards' | 'portwatch' | 'catalogue';

interface MarineWatchPageProps {
  onBackToPortal?: () => void;
  theme?: 'light' | 'dark';
  language?: SupportedLanguage;
}

export default function MarineWatchPage({ onBackToPortal, theme = 'light', language = 'en' }: MarineWatchPageProps) {
  const [activeTab, setActiveTab] = useState<MarineWatchTab>('oceanwatch');
  const [aquacultureSites, setAquacultureSites] = useState<AquacultureSite[]>([]);
  const [hazards, setHazards] = useState<ActiveHazard[]>([]);
  const [ports, setPorts] = useState<LandingCentre[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadAuxData() {
      try {
        const [aquaRes, hazRes, portRes] = await Promise.all([
          fetchNearbyAquaculture(17.0, 73.2, 300, 20),
          fetchActiveHazards(),
          fetchNearbyPorts(17.0, 73.2, 300, 20),
        ]);
        setAquacultureSites(aquaRes.aquaculture_sites);
        setHazards(hazRes.hazards);
        setPorts(portRes.ports);
      } catch (err) {
        console.error('Failed to load aux MarineWatch data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAuxData();
  }, []);

  return (
    <div className="marinewatch-full-page">
      {/* Platform Sub-Header & Navigation */}
      <header className="marinewatch-nav-header">
        <div className="marinewatch-brand-row">
          <div className="flex items-center gap-3">
            {onBackToPortal && (
              <button
                type="button"
                className="marinewatch-back-btn"
                onClick={onBackToPortal}
                title={translateText("Return to Main Portal", language)}
              >
                <ArrowLeft size={16} />
                <span>{translateText("Portal", language)}</span>
              </button>
            )}
            <div className="marinewatch-brand-title">
              <Compass size={22} className="text-primary" />
              <h1>{translateText("India MarineWatch", language)}</h1>
              <span className="marinewatch-version-badge">{translateText("National Ocean Intelligence", language)}</span>
            </div>
          </div>

          <div className="marinewatch-pilot-tag">
            <span className="pilot-dot" />
            <span>{translateText("Pilot Region:", language)} <strong>{translateText("Maharashtra & Goa Coastal Shelf", language)}</strong> {loading && <small>({translateText("Syncing…", language)})</small>}</span>
          </div>
        </div>

        {/* BarentsWatch-style Service Hub Tabs */}
        <nav className="marinewatch-tabs-bar" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'oceanwatch'}
            className={`marinewatch-tab ${activeTab === 'oceanwatch' ? 'active' : ''}`}
            onClick={() => setActiveTab('oceanwatch')}
          >
            <Waves size={15} />
            <span>{translateText("OceanWatch (GIS)", language)}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'fisherwatch'}
            className={`marinewatch-tab ${activeTab === 'fisherwatch' ? 'active' : ''}`}
            onClick={() => setActiveTab('fisherwatch')}
          >
            <Fish size={15} />
            <span>{translateText("FisherWatch", language)}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'aquawatch'}
            className={`marinewatch-tab ${activeTab === 'aquawatch' ? 'active' : ''}`}
            onClick={() => setActiveTab('aquawatch')}
          >
            <span>🦐</span>
            <span>{translateText("AquaWatch", language)}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'hazards'}
            className={`marinewatch-tab ${activeTab === 'hazards' ? 'active' : ''}`}
            onClick={() => setActiveTab('hazards')}
          >
            <AlertTriangle size={15} />
            <span>{translateText("Marine Hazards", language)}</span>
            {hazards.length > 0 && <span className="tab-counter">{hazards.length}</span>}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'portwatch'}
            className={`marinewatch-tab ${activeTab === 'portwatch' ? 'active' : ''}`}
            onClick={() => setActiveTab('portwatch')}
          >
            <Anchor size={15} />
            <span>{translateText("PortWatch", language)}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'catalogue'}
            className={`marinewatch-tab ${activeTab === 'catalogue' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalogue')}
          >
            <Database size={15} />
            <span>{translateText("Data Catalogue (§212)", language)}</span>
          </button>
        </nav>
      </header>

      {/* Main Tab Content */}
      <main className="marinewatch-body-content">
        {activeTab === 'oceanwatch' && <OceanWatchGIS theme={theme} language={language} />}

        {activeTab === 'fisherwatch' && <FisherWatchView language={language} />}

        {/* AquaWatch Tab */}
        {activeTab === 'aquawatch' && (
          <div className="marinewatch-tab-inner-view">
            <div className="tab-view-header">
              <div>
                <h2>Coastal Aquaculture Authority (CAA) Farm Registry</h2>
                <p>
                  Statutory brackish-water shrimp and fish aquaculture facilities registered under the Coastal
                  Aquaculture Authority Act, 2005. Environmental parameters, biosecurity status, and water sources.
                </p>
              </div>
              <span className="registry-count-pill">{aquacultureSites.length} Certified Farms</span>
            </div>

            <div className="aqua-cards-grid">
              {aquacultureSites.map((farm) => (
                <div key={farm.id} className="aqua-farm-card">
                  <div className="farm-card-header">
                    <div>
                      <h4 className="farm-name">{farm.farm_name}</h4>
                      <span className="farm-reg-no">Reg: {farm.caa_registration_number}</span>
                    </div>
                    <span className="farm-status-pill">{farm.caa_status}</span>
                  </div>

                  <div className="farm-attributes-grid">
                    <div className="attr-item">
                      <span className="attr-label">District</span>
                      <span className="attr-val">{farm.district}, {farm.state}</span>
                    </div>
                    <div className="attr-item">
                      <span className="attr-label">Cultured Species</span>
                      <span className="attr-val font-semibold">{farm.cultured_species}</span>
                    </div>
                    <div className="attr-item">
                      <span className="attr-label">Water Source</span>
                      <span className="attr-val">{farm.water_source}</span>
                    </div>
                    <div className="attr-item">
                      <span className="attr-label">Salinity</span>
                      <span className="attr-val">{farm.water_salinity_ppt} ppt</span>
                    </div>
                    <div className="attr-item">
                      <span className="attr-label">Water Spread Area</span>
                      <span className="attr-val">{farm.water_spread_area_ha} ha ({farm.ponds_count} ponds)</span>
                    </div>
                    <div className="attr-item">
                      <span className="attr-label">Biosecurity / ETP</span>
                      <span className="attr-val text-emerald-600 font-semibold">
                        {farm.biosecurity_compliant ? 'Certified Compliant' : 'Pending Audit'}
                      </span>
                    </div>
                  </div>

                  <div className="farm-card-footer">
                    <span className="text-xs text-muted-foreground">
                      Coordinates: {farm.latitude.toFixed(4)}°N, {farm.longitude.toFixed(4)}°E
                    </span>
                    <span className="source-tag">CAA Official Registry</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Marine Hazards Tab */}
        {activeTab === 'hazards' && (
          <div className="marinewatch-tab-inner-view">
            <div className="tab-view-header">
              <div>
                <h2>Active Marine Hazards & Port Warning Signals</h2>
                <p>
                  Official warnings issued by the India Meteorological Department (IMD) and INCOIS.
                  Includes squall warnings, high swell alerts, and port danger flag signals.
                </p>
              </div>
              <span className="hazards-badge-count">{hazards.length} Active Bulletins</span>
            </div>

            <div className="hazards-stack">
              {hazards.map((hz) => (
                <div key={hz.hazard_id} className={`hazard-banner-card severity-${hz.severity.toLowerCase()}`}>
                  <div className="hazard-top-row">
                    <span className={`hazard-severity-tag severity-${hz.severity.toLowerCase()}`}>
                      {hz.severity}
                    </span>
                    <span className="hazard-source-tag">{hz.source}</span>
                  </div>
                  <h3 className="hazard-headline">{hz.headline}</h3>
                  <div className="hazard-affected">Area: <strong>{hz.affected_area}</strong></div>
                  <p className="hazard-advisory-text">{hz.advisory}</p>

                  {hz.port_signals && hz.port_signals.length > 0 && (
                    <div className="port-signals-section">
                      <span className="text-xs font-semibold text-muted-foreground">Local Port Signals:</span>
                      <div className="port-signals-row">
                        {hz.port_signals.map((sig) => (
                          <div key={sig.port} className="port-signal-chip">
                            <span className="signal-num">Signal {sig.signal}</span>
                            <span className="signal-port">{sig.port}: {sig.meaning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="hazard-footer">
                    <span>Valid until: {new Date(hz.valid_until).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PortWatch Tab */}
        {activeTab === 'portwatch' && (
          <div className="marinewatch-tab-inner-view">
            <div className="tab-view-header">
              <div>
                <h2>CMFRI Fish Landing Centres & Major Ports</h2>
                <p>
                  Comprehensive infrastructure, craft census statistics, and communication frequencies for
                  fishing ports across the Konkan and West Coast maritime sectors.
                </p>
              </div>
              <span className="registry-count-pill">{ports.length} Harbours</span>
            </div>

            <div className="ports-table-wrap">
              <table className="oceanwatch-table">
                <thead>
                  <tr>
                    <th>Harbour Name</th>
                    <th>District & State</th>
                    <th>Type</th>
                    <th>Total Fleet</th>
                    <th>Mechanized</th>
                    <th>Motorized</th>
                    <th>VHF Channel</th>
                    <th>Key Facilities</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">{p.name}</td>
                      <td>{p.district}, {p.state}</td>
                      <td><span className="centre-type-pill">{p.type.replace(/_/g, ' ')}</span></td>
                      <td className="font-bold">{p.craft_count.total}</td>
                      <td>{p.craft_count.mechanized}</td>
                      <td>{p.craft_count.motorized}</td>
                      <td><Radio size={12} className="inline mr-1 text-primary" />Ch {p.vhf_channel}</td>
                      <td className="text-xs text-muted-foreground">{p.facilities.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Data Catalogue Tab */}
        {activeTab === 'catalogue' && <DataCatalogueView language={language} />}
      </main>
    </div>
  );
}
