import { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Compass,
  Layers,
  Search,
  Clock,
  Waves,
  Thermometer,
  Wind,
  Anchor,
  AlertTriangle,
  MapPin,
  List,
  Map as MapIcon,
} from 'lucide-react';
import {
  fetchNearbyPorts,
  fetchNearbyAquaculture,
  fetchPFZAdvisories,
  executeSpatialQuery,
  searchMarineFeatures,
  type LandingCentre,
  type AquacultureSite,
  type PFZAdvisory,
  type UnifiedSpatialQueryResponse,
  type SpatialSearchResult,
} from '../../api/marinewatch-client';

const TIME_STEPS = [
  { label: 'Now', hours: 0 },
  { label: '+3h', hours: 3 },
  { label: '+6h', hours: 6 },
  { label: '+12h', hours: 12 },
  { label: '+24h', hours: 24 },
  { label: '+48h', hours: 48 },
];

const QUICK_BOOKMARKS = [
  { name: 'Ratnagiri / Mirkarwada', lat: 16.9942, lon: 73.2847, zoom: 10 },
  { name: 'Malvan / Sindhudurg', lat: 16.0583, lon: 73.4658, zoom: 11 },
  { name: 'Angria Bank Coral Atoll', lat: 16.5000, lon: 72.1000, zoom: 9 },
  { name: 'Mumbai / Sassoon Dock', lat: 18.9158, lon: 72.8258, zoom: 10 },
  { name: 'Goa / Mormugao', lat: 15.4125, lon: 73.8056, zoom: 10 },
];

interface OceanWatchGISProps {
  theme?: 'light' | 'dark';
}

export default function OceanWatchGIS({ theme = 'light' }: OceanWatchGISProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedTimeStep, setSelectedTimeStep] = useState<number>(0);
  const [pointData, setPointData] = useState<UnifiedSpatialQueryResponse | null>(null);
  const [inspectingPoint, setInspectingPoint] = useState<boolean>(false);
  const [pointCoordinates, setPointCoordinates] = useState<[number, number]>([16.9942, 73.2847]);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SpatialSearchResult[]>([]);

  // Layers state
  const [visibleLayers, setVisibleLayers] = useState({
    waves: true,
    pfz: true,
    ports: true,
    aquaculture: true,
    boundaries: true,
    bathymetry: true,
    hazards: true,
  });

  // Loaded Data
  const [ports, setPorts] = useState<LandingCentre[]>([]);
  const [farms, setFarms] = useState<AquacultureSite[]>([]);
  const [pfzs, setPfzs] = useState<PFZAdvisory[]>([]);

  // Initial Data Load
  useEffect(() => {
    async function loadAllData() {
      try {
        const [portsRes, aquaRes, pfzRes] = await Promise.all([
          fetchNearbyPorts(16.99, 73.28, 300, 20),
          fetchNearbyAquaculture(16.99, 73.28, 300, 20),
          fetchPFZAdvisories('Maharashtra'),
        ]);
        setPorts(portsRes.ports);
        setFarms(aquaRes.aquaculture_sites);
        setPfzs(pfzRes.advisories);

        // Initial default point query for Ratnagiri
        const ratnagiriPoint = await executeSpatialQuery(16.9942, 73.2847);
        setPointData(ratnagiriPoint);
      } catch (err) {
        console.error('Error loading initial MarineWatch GIS data:', err);
      }
    }
    loadAllData();
  }, []);

  // MapLibre Initialization
  useEffect(() => {
    if (!mapContainer.current) return;

    const styleUrl =
      theme === 'dark'
        ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: [73.0, 16.8],
      zoom: 7.8,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapRef.current = map;

    map.on('click', async (e) => {
      const lat = parseFloat(e.lngLat.lat.toFixed(4));
      const lon = parseFloat(e.lngLat.lng.toFixed(4));
      setPointCoordinates([lat, lon]);
      setInspectingPoint(true);
      try {
        const res = await executeSpatialQuery(lat, lon);
        setPointData(res);
      } catch (err) {
        console.error('Point inspection failed:', err);
      } finally {
        setInspectingPoint(false);
      }
    });

    return () => {
      map.remove();
    };
  }, [theme]);

  // Sync Markers to Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing markers if any
    const existingMarkers = document.querySelectorAll('.marinewatch-custom-marker');
    existingMarkers.forEach((m) => m.remove());

    // 1. Add CMFRI Landing Centres Markers
    if (visibleLayers.ports) {
      ports.forEach((p) => {
        const el = document.createElement('div');
        el.className = 'marinewatch-custom-marker port-marker';
        el.innerHTML = `<span style="font-size: 14px;">⚓</span>`;
        el.title = `${p.name} (${p.craft_count.total} craft)`;
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [p.longitude, p.latitude], zoom: 11 });
          setPointCoordinates([p.latitude, p.longitude]);
          executeSpatialQuery(p.latitude, p.longitude).then(setPointData);
        };
        new maplibregl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(map);
      });
    }

    // 2. Add PFZ Advisory Markers
    if (visibleLayers.pfz) {
      pfzs.forEach((z) => {
        const el = document.createElement('div');
        el.className = 'marinewatch-custom-marker pfz-marker';
        el.innerHTML = `<span style="font-size: 14px;">🐟</span>`;
        el.title = `${z.location_name} (SST ${z.sst_celsius}°C)`;
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [z.longitude, z.latitude], zoom: 10 });
          setPointCoordinates([z.latitude, z.longitude]);
          executeSpatialQuery(z.latitude, z.longitude).then(setPointData);
        };
        new maplibregl.Marker({ element: el }).setLngLat([z.longitude, z.latitude]).addTo(map);
      });
    }

    // 3. Add CAA Aquaculture Markers
    if (visibleLayers.aquaculture) {
      farms.forEach((f) => {
        const el = document.createElement('div');
        el.className = 'marinewatch-custom-marker aqua-marker';
        el.innerHTML = `<span style="font-size: 12px;">🦐</span>`;
        el.title = `${f.farm_name} (${f.cultured_species})`;
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [f.longitude, f.latitude], zoom: 12 });
          setPointCoordinates([f.latitude, f.longitude]);
          executeSpatialQuery(f.latitude, f.longitude).then(setPointData);
        };
        new maplibregl.Marker({ element: el }).setLngLat([f.longitude, f.latitude]).addTo(map);
      });
    }
  }, [ports, farms, pfzs, visibleLayers]);

  // Search handler
  async function handleSearch(val: string) {
    setSearchQuery(val);
    if (val.trim().length >= 2) {
      try {
        const res = await searchMarineFeatures(val);
        setSearchResults(res.results);
      } catch (err) {
        console.error('Search error:', err);
      }
    } else {
      setSearchResults([]);
    }
  }

  function handleSelectSearchResult(item: SpatialSearchResult) {
    setSearchResults([]);
    setSearchQuery(item.name);
    setPointCoordinates([item.latitude, item.longitude]);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [item.longitude, item.latitude], zoom: 10 });
    }
    executeSpatialQuery(item.latitude, item.longitude).then(setPointData);
  }

  function handleBookmark(bm: (typeof QUICK_BOOKMARKS)[0]) {
    setPointCoordinates([bm.lat, bm.lon]);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [bm.lon, bm.lat], zoom: bm.zoom });
    }
    executeSpatialQuery(bm.lat, bm.lon).then(setPointData);
  }

  return (
    <div className="oceanwatch-gis-workspace">
      {/* Top Controls Toolbar */}
      <div className="oceanwatch-top-toolbar">
        {/* Search Bar */}
        <div className="oceanwatch-search-container">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search harbours, PFZ zones, aquaculture farms, protected areas…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="oceanwatch-search-dropdown">
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  className="search-dropdown-item"
                  onClick={() => handleSelectSearchResult(r)}
                >
                  <div className="font-semibold text-sm">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Geographic Bookmarks */}
        <div className="oceanwatch-bookmarks">
          {QUICK_BOOKMARKS.map((bm) => (
            <button
              key={bm.name}
              type="button"
              className="bookmark-chip"
              onClick={() => handleBookmark(bm)}
            >
              <MapPin size={12} />
              <span>{bm.name.split('/')[0].trim()}</span>
            </button>
          ))}
        </div>

        {/* View Mode Toggle: Map vs List */}
        <div className="view-mode-toggle">
          <button
            className={`toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
            onClick={() => setViewMode('map')}
            title="Map View"
          >
            <MapIcon size={14} />
            <span>Map</span>
          </button>
          <button
            className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            <List size={14} />
            <span>List</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="oceanwatch-main-area">
        {viewMode === 'map' ? (
          <div className="oceanwatch-map-wrapper">
            {/* Map Container */}
            <div ref={mapContainer} className="maplibre-full-map" />

            {/* Time Scrubber / Slider (BarentsWatch Pattern) */}
            <div className="oceanwatch-time-scrubber">
              <div className="scrubber-header">
                <Clock size={14} />
                <span>Forecast Horizon: <strong>{TIME_STEPS[selectedTimeStep].label}</strong></span>
              </div>
              <div className="scrubber-steps">
                {TIME_STEPS.map((step, idx) => (
                  <button
                    key={step.label}
                    className={`step-btn ${selectedTimeStep === idx ? 'active' : ''}`}
                    onClick={() => setSelectedTimeStep(idx)}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Floating Layer Switcher Panel */}
            <div className="oceanwatch-layer-panel">
              <div className="layer-panel-header">
                <Layers size={14} />
                <span>Layer Registry</span>
              </div>
              <div className="layer-toggle-list">
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.waves}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, waves: e.target.checked }))
                    }
                  />
                  <span>🌊 Wave & Swell (INCOIS)</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.pfz}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, pfz: e.target.checked }))
                    }
                  />
                  <span>🐟 Potential Fishing Zones</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.ports}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, ports: e.target.checked }))
                    }
                  />
                  <span>⚓ CMFRI Landing Centres</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.aquaculture}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, aquaculture: e.target.checked }))
                    }
                  />
                  <span>🦐 CAA Coastal Aquaculture</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.boundaries}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, boundaries: e.target.checked }))
                    }
                  />
                  <span>📏 12nm & 200nm EEZ Limits</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.bathymetry}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, bathymetry: e.target.checked }))
                    }
                  />
                  <span>🏔️ GEBCO Depth Contours</span>
                </label>
              </div>
            </div>
          </div>
        ) : (
          /* Dual List View (BarentsWatch Pattern) */
          <div className="oceanwatch-list-view-container">
            <h3>Registered Maritime Entities & Advisory Catalog</h3>
            <div className="list-view-grid">
              <div className="list-view-card">
                <h4>CMFRI Landing Centres ({ports.length})</h4>
                <div className="list-table-wrap">
                  <table className="oceanwatch-table">
                    <thead>
                      <tr>
                        <th>Harbour</th>
                        <th>District</th>
                        <th>Fleet Size</th>
                        <th>VHF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ports.map((p) => (
                        <tr key={p.id}>
                          <td className="font-semibold">{p.name}</td>
                          <td>{p.district}</td>
                          <td>{p.craft_count.total} craft</td>
                          <td>Ch {p.vhf_channel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="list-view-card">
                <h4>Active PFZ Advisories ({pfzs.length})</h4>
                <div className="list-table-wrap">
                  <table className="oceanwatch-table">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Coordinates</th>
                        <th>SST</th>
                        <th>Chl-a</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pfzs.map((z) => (
                        <tr key={z.advisory_id}>
                          <td className="font-semibold">{z.location_name}</td>
                          <td>{z.latitude.toFixed(2)}°N, {z.longitude.toFixed(2)}°E</td>
                          <td>{z.sst_celsius}°C</td>
                          <td>{z.chlorophyll_mg_m3} mg/m³</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Point Inspection Side Panel ("What is Here?" - §214/§215) */}
        <aside className="oceanwatch-point-panel">
          <div className="point-panel-header">
            <div>
              <span className="point-panel-eyebrow">UNIFIED POINT INTELLIGENCE</span>
              <h3>
                {pointCoordinates[0].toFixed(3)}°N, {pointCoordinates[1].toFixed(3)}°E
              </h3>
            </div>
            {inspectingPoint && <span className="text-xs text-primary animate-pulse">Querying…</span>}
          </div>

          {pointData ? (
            <div className="point-panel-content">
              {/* Bathymetry & Continental Shelf Card */}
              <div className="point-info-card">
                <div className="card-badge">GEBCO BATHYMETRY</div>
                <div className="depth-big-value">
                  {pointData.bathymetry_and_shelf.bathymetry_depth_m} <small>m depth</small>
                </div>
                <div className="text-xs font-semibold text-primary mt-1">
                  {pointData.bathymetry_and_shelf.shelf_zone}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Distance to coast: <strong>{pointData.bathymetry_and_shelf.distance_to_shore_km} km</strong>
                  {pointData.bathymetry_and_shelf.nearest_landing_centre && (
                    <span> (nearest: {pointData.bathymetry_and_shelf.nearest_landing_centre})</span>
                  )}
                </div>
              </div>

              {/* Astronomical Tide Card */}
              <div className="point-info-card">
                <div className="card-badge">INCOIS PREDICTED TIDE (PAT)</div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground">Current Tide Elevation</span>
                    <div className="text-lg font-bold">
                      {pointData.astronomical_tide.current_height_m} m
                    </div>
                  </div>
                  <span className={`tide-phase-pill ${pointData.astronomical_tide.phase.toLowerCase()}`}>
                    {pointData.astronomical_tide.phase}
                  </span>
                </div>
                <div className="tide-extrema-row">
                  <div className="extrema-box">
                    <span className="extrema-label">Next High Water</span>
                    <span className="extrema-val">{pointData.astronomical_tide.next_high.height_m} m</span>
                  </div>
                  <div className="extrema-box">
                    <span className="extrema-label">Next Low Water</span>
                    <span className="extrema-val">{pointData.astronomical_tide.next_low.height_m} m</span>
                  </div>
                </div>
              </div>

              {/* Sea Conditions Card */}
              <div className="point-info-card">
                <div className="card-badge">INCOIS OSF / HIGH-RES MARINE</div>
                <div className="conditions-grid">
                  <div className="condition-item">
                    <Waves size={16} className="text-blue-500" />
                    <div>
                      <span className="condition-label">Wave Height</span>
                      <span className="condition-val">{pointData.ocean_state.wave_height_m} m</span>
                    </div>
                  </div>
                  <div className="condition-item">
                    <Thermometer size={16} className="text-rose-500" />
                    <div>
                      <span className="condition-label">SST</span>
                      <span className="condition-val">{pointData.ocean_state.sst_c}°C</span>
                    </div>
                  </div>
                  <div className="condition-item">
                    <Wind size={16} className="text-sky-500" />
                    <div>
                      <span className="condition-label">Wind Speed</span>
                      <span className="condition-val">{pointData.ocean_state.wind_speed_kn} kn</span>
                    </div>
                  </div>
                  <div className="condition-item">
                    <Compass size={16} className="text-indigo-500" />
                    <div>
                      <span className="condition-label">Swell Period</span>
                      <span className="condition-val">{pointData.ocean_state.swell_period_s} s</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nearby Harbours */}
              {pointData.nearby_landing_centres.length > 0 && (
                <div className="point-info-card">
                  <div className="card-badge">NEARBY CMFRI HARBOURS</div>
                  <div className="nearby-list">
                    {pointData.nearby_landing_centres.slice(0, 3).map((p) => (
                      <div key={p.id} className="nearby-item">
                        <Anchor size={14} className="text-primary mt-0.5" />
                        <div>
                          <div className="text-sm font-semibold">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.distance_km} km away · VHF Ch {p.vhf_channel}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Warnings */}
              {pointData.active_hazards.length > 0 && (
                <div className="point-info-card warning-card">
                  <div className="card-badge">IMD & INCOIS WARNINGS</div>
                  {pointData.active_hazards.map((h) => (
                    <div key={h.hazard_id} className="hazard-snippet">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold">{h.headline}</div>
                        <div className="text-[11px] text-muted-foreground">{h.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Provenance Footnote */}
              <div className="provenance-footer">
                <span>Official Sources: INCOIS, IMD, GEBCO 2024, CMFRI</span>
              </div>
            </div>
          ) : (
            <div className="point-empty-state">
              <MapPin size={24} className="text-muted-foreground" />
              <p>Click anywhere on the Arabian Sea or coastline to inspect conditions, bathymetry, and tide.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
