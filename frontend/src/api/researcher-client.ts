/**
 * Researcher Dashboard API Client & Mock Data
 *
 * Fetches from /api/v1/demo/* endpoints with in-memory mock fallback.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');

export const CANONICAL_DATA_MODE_LABEL = 'DATA MODE: SYNTHETIC DEMO / SNAPSHOT';
export const CANONICAL_DATA_MODE_TOOLTIP =
  'Deterministic synthetic data modeled on documented marine, meteorological and Earth-observation source semantics. This prototype is not connected to live operational feeds.';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HarborData {
  public_id: string;
  name: string;
  latitude: number;
  longitude: number;
  state: string;
  metadata_json?: Record<string, any>;
}

export interface MarineObservation {
  public_id: string;
  harbor_id: string;
  observation_time: string;
  wave_height_m: number | null;
  sst_celsius: number | null;
  wind_speed_kn: number | null;
  wind_direction_deg: number | null;
  current_speed_kn: number | null;
  swell_period_s: number | null;
  visibility_nm: number | null;
  tide_level_m?: number | null;
  tide_phase?: string | null;
  tide_datum?: string | null;
  source: string;
  data_mode: string;
  quality_flags: string[];
  qc_status?: string;
}

export interface EOGridCell {
  public_id?: string;
  cell_id: string;
  center_lat: number;
  center_lon: number;
  chlorophyll_a_mg_m3: number | null;
  sst_celsius: number | null;
  cloud_cover_pct: number | null;
  cloud_fraction?: number | null;
  uncertainty?: number | null;
  qc_status?: string;
  satellite: string;
  pass_time: string;
  resolution_m: number;
  source: string;
  provenance_json?: Record<string, any>;
}

export interface PFZCandidate {
  public_id: string;
  latitude: number;
  longitude: number;
  sst_gradient: number | null;
  chlorophyll_a_mg_m3: number | null;
  distance_km: number;
  bearing_deg: number;
  rank: number;
  status: string;
  confidence?: string;
  depth_m?: number | null;
  valid_from: string;
  valid_to: string;
  source: string;
  qc_status?: string;
}

export interface HazardBulletin {
  public_id: string;
  headline: string;
  severity: string;
  status: string;
  issued_at: string;
  valid_until: string;
  source: string;
  affected_area?: string;
  description?: string;
  event_type?: string;
  geometry_geojson?: any;
  qc_status?: string;
  provenance_json?: Record<string, any>;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  query: string;
  intent: string;
  expected_status: string;
  harbor?: string;
}

export interface ScenarioRunResult {
  scenario_id: string;
  status: string;
  recommendation_status: string;
  answer: string;
  evidence_count: number;
  evidence_grounded?: boolean;
  trace_steps: number;
  execution_time_ms: number;
  warnings: string[];
  decisive_factors: string[];
  confidence_level: string;
  passed?: boolean;
  actual_intent?: string;
  expected_intent?: string;
  actual_status?: string;
  expected_status?: string;
  actual_confidence?: string;
  expected_confidence?: string;
  executed_tools?: string[];
  validation_notes?: string[];
  is_error?: boolean;
  error?: string;
}

export interface HealthStatus {
  status: string;
  app_name: string;
  app_env: string;
  data_mode: string;
  database: string;
  timestamp: string;
}

export interface DataSourceInfo {
  name: string;
  provider: string;
  data_mode: string;
  status: 'online' | 'degraded' | 'offline' | 'planned';
  last_updated: string;
  freshness_hours: number;
  cadence: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Generic fetcher with mock fallback
// ---------------------------------------------------------------------------

async function fetchOrMock<T>(url: string, mockData: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return res.json();
    return mockData;
  } catch {
    return mockData;
  }
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_HARBORS: HarborData[] = [
  { public_id: 'harbor-ratnagiri', name: 'Ratnagiri', latitude: 16.99, longitude: 73.28, state: 'Maharashtra', metadata_json: { coastal_zone: 'Konkan', vhf_channel: 16 } },
  { public_id: 'harbor-malvan', name: 'Malvan', latitude: 16.06, longitude: 73.47, state: 'Maharashtra', metadata_json: { coastal_zone: 'Sindhudurg', vhf_channel: 16 } },
];

const MOCK_MARINE_OBS: MarineObservation[] = [
  { public_id: 'obs-rat-01', harbor_id: 'harbor-ratnagiri', observation_time: '2026-09-12T06:00:00Z', wave_height_m: 2.1, sst_celsius: 28.6, wind_speed_kn: 18, wind_direction_deg: 225, current_speed_kn: 1.2, swell_period_s: 8.5, visibility_nm: 12, tide_level_m: 0.8, tide_phase: 'FLOOD', tide_datum: 'LAT', source: 'INCOIS OSF', data_mode: 'HYBRID', quality_flags: ['fresh', 'official_source'], qc_status: 'VALID' },
  { public_id: 'obs-rat-02', harbor_id: 'harbor-ratnagiri', observation_time: '2026-09-12T12:00:00Z', wave_height_m: 2.4, sst_celsius: 29.1, wind_speed_kn: 22, wind_direction_deg: 240, current_speed_kn: 1.5, swell_period_s: 9.0, visibility_nm: 10, tide_level_m: 1.6, tide_phase: 'HIGH', tide_datum: 'LAT', source: 'INCOIS OSF', data_mode: 'HYBRID', quality_flags: ['fresh'], qc_status: 'VALID' },
  { public_id: 'obs-rat-03', harbor_id: 'harbor-ratnagiri', observation_time: '2026-09-12T18:00:00Z', wave_height_m: 1.8, sst_celsius: 28.3, wind_speed_kn: 14, wind_direction_deg: 210, current_speed_kn: 0.9, swell_period_s: 7.5, visibility_nm: 15, tide_level_m: 0.5, tide_phase: 'EBB', tide_datum: 'LAT', source: 'Open-Meteo', data_mode: 'LIVE', quality_flags: ['fresh', 'fallback'], qc_status: 'VALID' },
  { public_id: 'obs-mal-01', harbor_id: 'harbor-malvan', observation_time: '2026-09-12T06:00:00Z', wave_height_m: 1.6, sst_celsius: 28.2, wind_speed_kn: 15, wind_direction_deg: 200, current_speed_kn: 0.8, swell_period_s: 7.0, visibility_nm: 18, tide_level_m: 0.6, tide_phase: 'FLOOD', tide_datum: 'LAT', source: 'INCOIS OSF', data_mode: 'HYBRID', quality_flags: ['fresh', 'official_source'], qc_status: 'VALID' },
  { public_id: 'obs-mal-02', harbor_id: 'harbor-malvan', observation_time: '2026-09-12T12:00:00Z', wave_height_m: 1.9, sst_celsius: 28.8, wind_speed_kn: 19, wind_direction_deg: 215, current_speed_kn: 1.1, swell_period_s: 8.0, visibility_nm: 14, tide_level_m: 1.4, tide_phase: 'HIGH', tide_datum: 'LAT', source: 'INCOIS OSF', data_mode: 'HYBRID', quality_flags: ['fresh'], qc_status: 'VALID' },
  { public_id: 'obs-mal-03', harbor_id: 'harbor-malvan', observation_time: '2026-09-12T18:00:00Z', wave_height_m: 1.4, sst_celsius: 27.9, wind_speed_kn: 11, wind_direction_deg: 190, current_speed_kn: 0.6, swell_period_s: 6.5, visibility_nm: 20, tide_level_m: 0.4, tide_phase: 'EBB', tide_datum: 'LAT', source: 'Open-Meteo', data_mode: 'LIVE', quality_flags: ['fresh', 'fallback'], qc_status: 'VALID' },
];

const MOCK_EO_CELLS: EOGridCell[] = [
  { cell_id: 'eo-cell-01', center_lat: 16.85, center_lon: 73.10, chlorophyll_a_mg_m3: 1.2, sst_celsius: 28.4, cloud_cover_pct: 15, satellite: 'Oceansat-3 OCM', pass_time: '2026-09-12T04:30:00Z', resolution_m: 360, source: 'ISRO MOSDAC' },
  { cell_id: 'eo-cell-02', center_lat: 16.95, center_lon: 73.20, chlorophyll_a_mg_m3: 0.8, sst_celsius: 28.9, cloud_cover_pct: 22, satellite: 'Oceansat-3 OCM', pass_time: '2026-09-12T04:30:00Z', resolution_m: 360, source: 'ISRO MOSDAC' },
  { cell_id: 'eo-cell-03', center_lat: 17.05, center_lon: 73.00, chlorophyll_a_mg_m3: 2.1, sst_celsius: 27.8, cloud_cover_pct: 8, satellite: 'INSAT-3DR', pass_time: '2026-09-12T05:00:00Z', resolution_m: 4000, source: 'ISRO MOSDAC' },
  { cell_id: 'eo-cell-04', center_lat: 16.20, center_lon: 73.30, chlorophyll_a_mg_m3: 1.6, sst_celsius: 28.1, cloud_cover_pct: 12, satellite: 'Oceansat-3 OCM', pass_time: '2026-09-12T04:30:00Z', resolution_m: 360, source: 'ISRO MOSDAC' },
  { cell_id: 'eo-cell-05', center_lat: 16.10, center_lon: 73.40, chlorophyll_a_mg_m3: 0.5, sst_celsius: 29.2, cloud_cover_pct: 35, satellite: 'INSAT-3DR', pass_time: '2026-09-12T05:00:00Z', resolution_m: 4000, source: 'ISRO MOSDAC' },
];

const MOCK_PFZ: PFZCandidate[] = [
  { public_id: 'pfz-mh-01', latitude: 16.82, longitude: 72.95, sst_gradient: 0.9, chlorophyll_a_mg_m3: 1.2, distance_km: 42.6, bearing_deg: 245, rank: 1, status: 'ACTIVE', confidence: 'HIGH', depth_m: 28.0, valid_from: '2026-09-12T00:00:00Z', valid_to: '2026-09-12T23:59:59Z', source: 'INCOIS PFZ Advisory', qc_status: 'VALID' },
  { public_id: 'pfz-mh-02', latitude: 16.45, longitude: 72.80, sst_gradient: 1.1, chlorophyll_a_mg_m3: 1.8, distance_km: 78.3, bearing_deg: 225, rank: 2, status: 'ACTIVE', confidence: 'HIGH', depth_m: 35.0, valid_from: '2026-09-12T00:00:00Z', valid_to: '2026-09-12T23:59:59Z', source: 'INCOIS PFZ Advisory', qc_status: 'VALID' },
  { public_id: 'pfz-mh-03', latitude: 17.15, longitude: 72.70, sst_gradient: 0.85, chlorophyll_a_mg_m3: 0.9, distance_km: 65.1, bearing_deg: 280, rank: 3, status: 'ACTIVE', confidence: 'HIGH', depth_m: 22.0, valid_from: '2026-09-12T00:00:00Z', valid_to: '2026-09-12T23:59:59Z', source: 'INCOIS PFZ Advisory', qc_status: 'VALID' },
];

const MOCK_HAZARDS: HazardBulletin[] = [
  { public_id: 'hazard-01', headline: 'High Wave Alert — Konkan Coast', severity: 'WARNING', status: 'ACTIVE', issued_at: '2026-09-12T03:00:00Z', valid_until: '2026-09-12T18:00:00Z', source: 'IMD Coastal Bulletin', affected_area: 'Ratnagiri–Goa corridor', description: 'Significant wave height 2.5-3.5m expected along Konkan coast.' },
  { public_id: 'hazard-02', headline: 'Squally Winds — Arabian Sea', severity: 'WATCH', status: 'ACTIVE', issued_at: '2026-09-12T06:00:00Z', valid_until: '2026-09-13T06:00:00Z', source: 'IMD Marine Weather', affected_area: 'Central Arabian Sea', description: 'Wind gusts 40-50 kmph likely over central Arabian Sea.' },
  { public_id: 'hazard-05', headline: 'Strong Current Advisory', severity: 'ADVISORY', status: 'ACTIVE', issued_at: '2026-09-12T04:00:00Z', valid_until: '2026-09-12T16:00:00Z', source: 'INCOIS OSF', affected_area: 'Ratnagiri offshore', description: 'Surface current 1.5+ knots W-SW direction.' },
];

const MOCK_SCENARIOS: ScenarioMeta[] = [
  { id: 'S1', name: 'Ratnagiri Safety Check', description: 'GO/NO-GO departure safety evaluation from Ratnagiri harbor', query: 'Is it safe to leave Ratnagiri tomorrow morning?', intent: 'GO_NO_GO_SAFETY', expected_status: 'CAUTION', harbor: 'Ratnagiri' },
  { id: 'S2', name: 'PFZ Discovery', description: 'Nearest Potential Fishing Zone discovery from Ratnagiri', query: 'Where is the nearest PFZ from Ratnagiri today?', intent: 'NEAREST_PFZ', expected_status: 'GO', harbor: 'Ratnagiri' },
  { id: 'S3', name: 'Cyclone Hazard Alert', description: 'Active cyclone and hazard advisory check', query: 'Any cyclone or storm risk near Ratnagiri?', intent: 'HAZARD_ALERT', expected_status: 'NO_GO', harbor: 'Ratnagiri' },
  { id: 'S4', name: 'Route Comparison', description: 'Safer route comparison between alternatives', query: 'Which route from Ratnagiri to PFZ is safest?', intent: 'ROUTE_COMPARISON', expected_status: 'CAUTION', harbor: 'Ratnagiri' },
  { id: 'S5', name: 'Malvan Safety Check', description: 'Safety evaluation for Malvan departure', query: 'Is it safe to depart Malvan at dawn?', intent: 'GO_NO_GO_SAFETY', expected_status: 'GO', harbor: 'Malvan' },
  { id: 'S6', name: 'Boundary Alert', description: 'Maritime boundary and restricted zone check', query: 'Am I near any restricted waters sailing south from Malvan?', intent: 'BOUNDARY_ALERT', expected_status: 'CAUTION', harbor: 'Malvan' },
  { id: 'S7', name: 'Hindi Safety Query', description: 'Multilingual safety check in Hindi', query: 'क्या कल सुबह रत्नागिरि से निकलना सुरक्षित है?', intent: 'GO_NO_GO_SAFETY', expected_status: 'CAUTION', harbor: 'Ratnagiri' },
  { id: 'S8', name: 'Marathi PFZ Query', description: 'Multilingual PFZ discovery in Marathi', query: 'रत्नागिरीजवळ आज मासेमारीचे क्षेत्र कुठे आहे?', intent: 'NEAREST_PFZ', expected_status: 'GO', harbor: 'Ratnagiri' },
];

const MOCK_HEALTH: HealthStatus = {
  status: 'healthy',
  app_name: 'SAMUDRA',
  app_env: 'development',
  data_mode: 'SNAPSHOT',
  database: 'connected',
  timestamp: new Date().toISOString(),
};

export const DATA_SOURCES: DataSourceInfo[] = [
  { name: 'INCOIS Ocean State Forecast', provider: 'INCOIS', data_mode: 'SYNTHETIC_OSF', status: 'online', last_updated: '2026-09-12T04:00:00Z', freshness_hours: 1, cadence: '1-hour observation cadence', description: 'Wave height, swell, SST, and currents modeled on INCOIS OSF parameters.' },
  { name: 'INCOIS PFZ Advisory', provider: 'INCOIS', data_mode: 'SYNTHETIC_PFZ', status: 'online', last_updated: '2026-09-12T00:00:00Z', freshness_hours: 6, cadence: '6-hour advisory cycle', description: 'Potential Fishing Zone advisory coordinates, SST gradients, and fronts.' },
  { name: 'INCOIS SVAS', provider: 'INCOIS', data_mode: 'SYNTHETIC_SVAS', status: 'degraded', last_updated: '2026-09-11T18:00:00Z', freshness_hours: 12, cadence: '12-hour advisory cycle', description: 'Small Vessel Advisory Services — capsizing risk indices.' },
  { name: 'IMD Marine Weather', provider: 'IMD', data_mode: 'SYNTHETIC_BULLETIN', status: 'online', last_updated: '2026-09-12T05:30:00Z', freshness_hours: 1, cadence: '1-hour bulletin cadence', description: 'Coastal sea bulletins, port warnings, wind and visibility forecasts.' },
  { name: 'IMD Cyclone & Hazard', provider: 'IMD', data_mode: 'SYNTHETIC_BULLETIN', status: 'online', last_updated: '2026-09-12T06:00:00Z', freshness_hours: 0.5, cadence: '30-minute bulletin cadence', description: 'Cyclone bulletins, squall alerts, depression tracks, red alert triggers.' },
  { name: 'Open-Meteo Marine', provider: 'Open-Meteo', data_mode: 'FALLBACK_PROFILE', status: 'online', last_updated: '2026-09-12T06:00:00Z', freshness_hours: 1, cadence: 'Hourly model profile', description: 'High-resolution wave, swell, and wind fallback profile (unauthoritative).' },
  { name: 'ISRO MOSDAC EO', provider: 'ISRO', data_mode: 'SYNTHETIC_EO', status: 'online', last_updated: '2026-09-14T00:00:00Z', freshness_hours: 24, cadence: '14-day daily raster snapshot', description: 'Satellite SST and Chlorophyll-a 5x5 grid rasters from Oceansat-3.' },
  { name: 'Pilot GIS Restrictions', provider: 'SAMUDRA', data_mode: 'STATIC_GIS', status: 'online', last_updated: '2026-09-01T00:00:00Z', freshness_hours: 720, cadence: 'Static geofence registry', description: 'Static geofences: MPAs, naval firing ranges, IMBL buffer boundaries.' },
];

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function fetchHarbors(): Promise<HarborData[]> {
  const raw = await fetchOrMock<any[]>('/demo/harbors', MOCK_HARBORS);
  return (raw || []).map((h, i) => ({
    public_id: h.public_id || `harbor-${i}`,
    name: h.name || 'Unknown Harbor',
    latitude: typeof h.latitude === 'number' ? h.latitude : 0,
    longitude: typeof h.longitude === 'number' ? h.longitude : 0,
    state: h.state || 'Maharashtra',
    metadata_json: h.metadata_json,
  }));
}

export async function fetchMarineObservations(harborId?: string): Promise<MarineObservation[]> {
  const url = harborId ? `/demo/marine-observations?harbor_id=${harborId}` : '/demo/marine-observations';
  const fallback = harborId ? MOCK_MARINE_OBS.filter(o => o.harbor_id === harborId) : MOCK_MARINE_OBS;
  const raw = await fetchOrMock<any[]>(url, fallback);
  return (raw || []).map((o, i) => ({
    public_id: o.public_id || `obs-${i}`,
    harbor_id: o.harbor_id || harborId || '',
    observation_time: o.observation_time || new Date().toISOString(),
    wave_height_m: typeof o.wave_height_m === 'number' ? o.wave_height_m : typeof o.swh === 'number' ? o.swh : null,
    sst_celsius: typeof o.sst_celsius === 'number' ? o.sst_celsius : typeof o.sea_surface_temp_c === 'number' ? o.sea_surface_temp_c : typeof o.sst === 'number' ? o.sst : null,
    wind_speed_kn: typeof o.wind_speed_kn === 'number' ? o.wind_speed_kn : typeof o.wind_speed_knots === 'number' ? o.wind_speed_knots : null,
    wind_direction_deg: typeof o.wind_direction_deg === 'number' ? o.wind_direction_deg : 0,
    current_speed_kn: typeof o.current_speed_kn === 'number' ? o.current_speed_kn : typeof o.current_speed_knots === 'number' ? o.current_speed_knots : typeof o.current_speed === 'number' ? o.current_speed : null,
    swell_period_s: typeof o.swell_period_s === 'number' ? o.swell_period_s : typeof o.wave_period_sec === 'number' ? o.wave_period_sec : typeof o.swell_period === 'number' ? o.swell_period : null,
    visibility_nm: typeof o.visibility_nm === 'number' ? o.visibility_nm : typeof o.visibility_km === 'number' ? +(o.visibility_km * 0.54).toFixed(1) : 10,
    tide_level_m: typeof o.tide_level_m === 'number' ? o.tide_level_m : typeof o.tide_level === 'number' ? o.tide_level : null,
    tide_phase: o.tide_phase || null,
    tide_datum: o.tide_datum || (o.units_json?.tide_datum || 'LAT'),
    source: o.source || (o.provenance_json?.intended_provider ? `${o.provenance_json.intended_provider} OSF` : 'INCOIS OSF'),
    data_mode: o.data_mode || 'HYBRID',
    quality_flags: Array.isArray(o.quality_flags) ? o.quality_flags : o.qc_status ? [o.qc_status.toLowerCase()] : ['verified'],
    qc_status: o.qc_status || (o.qc_flag === 0 ? 'VALID' : typeof o.qc_flag === 'number' ? 'SUSPECT' : 'VALID'),
  }));
}

export async function fetchEOGridCells(): Promise<EOGridCell[]> {
  const raw = await fetchOrMock<any[]>('/demo/eo-grid-cells', MOCK_EO_CELLS);
  return (raw || []).map((c, i) => ({
    public_id: c.public_id || `cell-${i}`,
    cell_id: c.cell_id || c.public_id || `cell-${i}`,
    center_lat: typeof c.center_lat === 'number' ? c.center_lat : typeof c.latitude === 'number' ? c.latitude : 0,
    center_lon: typeof c.center_lon === 'number' ? c.center_lon : typeof c.longitude === 'number' ? c.longitude : 0,
    chlorophyll_a_mg_m3: typeof c.chlorophyll_a_mg_m3 === 'number' ? c.chlorophyll_a_mg_m3 : typeof c.chlorophyll_mg_m3 === 'number' ? c.chlorophyll_mg_m3 : typeof c.CHL_A === 'number' ? c.CHL_A : null,
    sst_celsius: typeof c.sst_celsius === 'number' ? c.sst_celsius : typeof c.sst_c === 'number' ? c.sst_c : typeof c.SST === 'number' ? c.SST : null,
    cloud_cover_pct: typeof c.cloud_cover_pct === 'number' ? c.cloud_cover_pct : typeof c.cloud_fraction === 'number' ? Math.round(c.cloud_fraction * 100) : null,
    cloud_fraction: typeof c.cloud_fraction === 'number' ? c.cloud_fraction : typeof c.cloud_cover_pct === 'number' ? +(c.cloud_cover_pct / 100).toFixed(2) : null,
    uncertainty: typeof c.uncertainty === 'number' ? c.uncertainty : typeof c.PIXEL_UNCERTAINTY === 'number' ? c.PIXEL_UNCERTAINTY : null,
    qc_status: c.qc_status || (c.QA_FLAGS === 0 ? 'VALID' : 'CLOUD_OBSCURED'),
    satellite: c.satellite || (c.source_name ? c.source_name.split(' ')[2] || 'Oceansat-3' : 'Oceansat-3 OCM'),
    pass_time: c.pass_time || c.observation_time || new Date().toISOString(),
    resolution_m: typeof c.resolution_m === 'number' ? c.resolution_m : 360,
    source: c.source || c.source_name || 'ISRO MOSDAC',
    provenance_json: c.provenance_json,
  }));
}

/**
 * Deduplicates multi-day EO grid cells down to the unique spatial cells taking the latest observation.
 * Used for static latest spatial grid rendering.
 */
export function getLatestEOGridCells(cells: EOGridCell[]): EOGridCell[] {
  const cellMap = new Map<string, EOGridCell>();
  for (const c of cells || []) {
    const key = c.cell_id || c.public_id || '';
    if (!cellMap.has(key) || (c.pass_time && c.pass_time > (cellMap.get(key)!.pass_time || ''))) {
      cellMap.set(key, c);
    }
  }
  return Array.from(cellMap.values());
}

export async function fetchPFZCandidates(): Promise<PFZCandidate[]> {
  const raw = await fetchOrMock<any[]>('/demo/pfz-candidates?valid_only=true', MOCK_PFZ);
  return (raw || []).map((p, i) => ({
    public_id: p.public_id || `pfz-${i}`,
    latitude: typeof p.latitude === 'number' ? p.latitude : 0,
    longitude: typeof p.longitude === 'number' ? p.longitude : 0,
    sst_gradient: typeof p.sst_gradient === 'number' ? p.sst_gradient : null,
    chlorophyll_a_mg_m3: typeof p.chlorophyll_a_mg_m3 === 'number' ? p.chlorophyll_a_mg_m3 : typeof p.chlorophyll_value === 'number' ? p.chlorophyll_value : null,
    distance_km: typeof p.distance_km === 'number' ? p.distance_km : 0,
    bearing_deg: typeof p.bearing_deg === 'number' ? p.bearing_deg : 0,
    rank: typeof p.rank === 'number' ? p.rank : i + 1,
    status: p.status || p.qc_status || 'ACTIVE',
    confidence: p.confidence ? String(p.confidence) : undefined,
    depth_m: typeof p.depth_m === 'number' ? p.depth_m : null,
    valid_from: p.valid_from || p.detected_at || new Date().toISOString(),
    valid_to: p.valid_to || new Date().toISOString(),
    source: p.source || 'INCOIS PFZ Advisory',
    qc_status: p.qc_status || (p.status === 'VALID' ? 'VALID' : 'VALID'),
  }));
}

export async function fetchHazards(): Promise<HazardBulletin[]> {
  const raw = await fetchOrMock<any[]>('/demo/hazards', MOCK_HAZARDS);
  return (raw || []).map((h, i) => ({
    public_id: h.public_id || `hazard-${i}`,
    headline: h.headline || h.title || 'Marine Hazard Alert',
    event_type: h.event_type || h.hazard_type || 'GENERAL_HAZARD',
    severity: h.severity || 'UNKNOWN',
    status: h.status || 'ACTIVE',
    issued_at: h.start_time || h.issued_at || h.created_at || new Date().toISOString(),
    valid_until: h.end_time || h.valid_until || h.expires_at || new Date().toISOString(),
    source: h.source || (h.provenance_json?.intended_provider ? `${h.provenance_json.intended_provider}` : 'IMD Coastal Bulletin'),
    affected_area: h.affected_area || h.sector_id || 'Konkan Coast',
    description: h.description || h.headline || '',
    geometry_geojson: h.geometry_geojson || h.geometry || null,
    qc_status: h.qc_status || 'VALID',
    provenance_json: h.provenance_json,
  }));
}

export async function fetchScenarios(): Promise<ScenarioMeta[]> {
  try {
    const res = await fetch(`${API_BASE}/scenarios`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const list = data.scenarios || data;
      if (Array.isArray(list) && list.length > 0) {
        return list.map((s: any) => ({
          id: s.id || '',
          name: s.name || '',
          description: s.description || '',
          query: s.query || '',
          intent: s.expected?.intent || s.intent || 'GENERAL',
          expected_status: s.expected?.status || s.expected_status || 'UNKNOWN',
          harbor: s.harbor || 'Ratnagiri',
        }));
      }
    }
    return MOCK_SCENARIOS;
  } catch {
    return MOCK_SCENARIOS;
  }
}

export async function runScenario(scenarioId: string): Promise<ScenarioRunResult> {
  const startTime = Date.now();
  try {
    const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const latency = Date.now() - startTime;
    if (res.ok) {
      const raw = await res.json();
      return {
        scenario_id: raw.scenario_id || scenarioId,
        status: raw.passed === true ? 'passed' : raw.passed === false ? 'failed' : 'completed',
        passed: raw.passed,
        recommendation_status: raw.actual_status || raw.recommendation_status || raw.expected_status || 'UNKNOWN',
        answer: raw.response_text || raw.answer || `Scenario ${scenarioId} evaluation completed successfully.`,
        evidence_count: typeof raw.evidence_count === 'number' ? raw.evidence_count : (Array.isArray(raw.evidence) ? raw.evidence.length : 0),
        trace_steps: typeof raw.trace_steps_count === 'number' ? raw.trace_steps_count : typeof raw.trace_steps === 'number' ? raw.trace_steps : 0,
        execution_time_ms: typeof raw.execution_time_ms === 'number' ? raw.execution_time_ms : latency,
        warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
        decisive_factors: Array.isArray(raw.validation_notes) ? raw.validation_notes : Array.isArray(raw.decisive_factors) ? raw.decisive_factors : [],
        confidence_level: raw.actual_confidence || raw.confidence_level || 'HIGH',
        actual_intent: raw.actual_intent,
        expected_intent: raw.expected_intent,
        actual_status: raw.actual_status,
        expected_status: raw.expected_status,
        actual_confidence: raw.actual_confidence,
        expected_confidence: raw.expected_confidence,
        executed_tools: Array.isArray(raw.executed_tools) ? raw.executed_tools : [],
        validation_notes: Array.isArray(raw.validation_notes) ? raw.validation_notes : [],
        is_error: false,
      };
    }
    const errData = await res.json().catch(() => ({}));
    const errorMessage = errData.error || errData.detail || `HTTP ${res.status}: Scenario execution failed.`;
    return {
      scenario_id: scenarioId,
      status: 'error',
      passed: false,
      recommendation_status: 'UNKNOWN',
      answer: `Scenario execution unavailable: ${errorMessage}`,
      evidence_count: 0,
      trace_steps: 0,
      execution_time_ms: latency,
      warnings: [`[UNAVAILABLE] ${errorMessage}`],
      decisive_factors: [],
      confidence_level: 'UNKNOWN',
      is_error: true,
      error: errorMessage,
      executed_tools: [],
      validation_notes: [],
    };
  } catch (err: any) {
    const latency = Date.now() - startTime;
    const errorMessage = err?.message || 'Network or service timeout.';
    return {
      scenario_id: scenarioId,
      status: 'error',
      passed: false,
      recommendation_status: 'UNKNOWN',
      answer: `Scenario execution unavailable: ${errorMessage}`,
      evidence_count: 0,
      trace_steps: 0,
      execution_time_ms: latency,
      warnings: [`[UNAVAILABLE] ${errorMessage}`],
      decisive_factors: [],
      confidence_level: 'UNKNOWN',
      is_error: true,
      error: errorMessage,
      executed_tools: [],
      validation_notes: [],
    };
  }
}

export async function fetchHealthStatus(): Promise<HealthStatus> {
  return fetchOrMock('/health', MOCK_HEALTH);
}
