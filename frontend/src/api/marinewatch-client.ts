/**
 * India MarineWatch API Client & Types.
 *
 * Implements the 10 foundation API contracts (§213, §214, §215)
 * connecting frontend to real INCOIS, IMD, GEBCO, CMFRI, and CAA datasets.
 */

const API_BASE = '/api/v1';

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface PointLocation {
  lat: number;
  lon: number;
}

export interface BathymetryProfile {
  latitude: number;
  longitude: number;
  bathymetry_depth_m: number;
  shelf_zone: string;
  distance_to_shore_km: number;
  nearest_landing_centre: string;
  is_submerged_coral_bank: boolean;
  intersections: Array<{
    id: string;
    name: string;
    type: string;
    level: string;
    authority?: string;
    description?: string;
  }>;
  dataset: string;
  source: string;
}

export interface OceanForecast {
  wave_height_m: number;
  swell_height_m: number;
  swell_period_s: number;
  swell_direction_deg: number;
  wind_speed_kn: number;
  wind_direction_deg: number;
  current_speed_kn: number;
  current_direction_deg: number;
  sst_c: number;
  visibility_nm: number;
  observed_at: string;
  valid_until: string;
}

export interface TideForecast {
  station_id: string;
  station_name: string;
  calculation_time: string;
  current_height_m: number;
  phase: 'FLOOD' | 'EBB' | 'HIGH_SLACK' | 'LOW_SLACK';
  rate_m_per_hr: number;
  datum: string;
  next_high: {
    time: string;
    height_m: number;
    type: string;
    station: string;
  };
  next_low: {
    time: string;
    height_m: number;
    type: string;
    station: string;
  };
  hourly_curve: Array<{
    time: string;
    hour_offset: number;
    height_m: number;
  }>;
  source: string;
}

export interface ActiveHazard {
  hazard_id: string;
  headline: string;
  severity: 'WARNING' | 'ALERT' | 'WATCH' | 'LEGAL_RESTRICTION' | 'ADVISORY';
  source: string;
  category: string;
  affected_area: string;
  wind_speed_kmph?: string;
  sea_condition?: string;
  swell_height_m?: number;
  swell_period_sec?: number;
  issued_at: string;
  valid_until: string;
  advisory: string;
  port_signals?: Array<{
    port: string;
    signal: number;
    meaning: string;
  }>;
}

export interface PFZAdvisory {
  advisory_id: string;
  sector: string;
  location_name: string;
  latitude: number;
  longitude: number;
  depth_range_m: string;
  distance_km: number;
  bearing_deg: number;
  sst_celsius: number;
  chlorophyll_mg_m3: number;
  target_species: string[];
  gear_recommended: string[];
  valid_from: string;
  valid_to: string;
  source: string;
  status: string;
}

export interface LandingCentre {
  id: string;
  name: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  type: string;
  craft_count: {
    mechanized: number;
    motorized: number;
    non_motorized: number;
    total: number;
  };
  major_gears: string[];
  facilities: string[];
  vhf_channel: number;
  distance_km?: number;
  source: string;
}

export interface AquacultureSite {
  id: string;
  farm_code: string;
  farm_name: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  water_source: string;
  water_salinity_ppt: number;
  cultured_species: string;
  water_spread_area_ha: number;
  ponds_count: number;
  caa_registration_number: string;
  caa_status: string;
  biosecurity_compliant: boolean;
  distance_km?: number;
  source: string;
}

export interface DatasetItem {
  id: string;
  title: string;
  provider: string;
  category: string;
  description: string;
  spatial_coverage: string;
  temporal_resolution: string;
  update_cadence: string;
  license: string;
  access_mode: string;
  provenance_url: string;
  status: 'ONLINE' | 'DEGRADED' | 'PLANNED';
  quality_tier: string;
}

export interface PointForecastResponse {
  location: PointLocation;
  profile: BathymetryProfile;
  forecast: OceanForecast;
  tide: TideForecast;
  hazards: ActiveHazard[];
  nearby: {
    ports: LandingCentre[];
    aquaculture_sites: AquacultureSite[];
  };
  sources: Array<{
    provider: string;
    dataset: string;
    issued_at: string;
    license: string;
  }>;
}

export interface RouteForecastResponse {
  total_distance_km: number;
  total_distance_nm: number;
  max_wave_height_m: number;
  status: 'GO' | 'CAUTION' | 'NO_GO';
  verdict: string;
  restricted_violations: string[];
  segments_count: number;
  segments: Array<{
    segment_index: number;
    from_lat: number;
    from_lon: number;
    to_lat: number;
    to_lon: number;
    distance_km: number;
    depth_m: number;
    wave_height_m: number;
    wind_speed_kn: number;
    intersections: string[];
  }>;
  sources: string[];
}

export interface SpatialSearchResult {
  id: string;
  name: string;
  category: 'PORT_LANDING_CENTRE' | 'AQUACULTURE_FARM' | 'POTENTIAL_FISHING_ZONE' | 'RESTRICTED_ZONE';
  latitude: number;
  longitude: number;
  state: string;
  district: string;
  subtitle: string;
}

export interface UnifiedSpatialQueryResponse {
  query_point: PointLocation;
  search_radius_km: number;
  ocean_state: OceanForecast;
  bathymetry_and_shelf: BathymetryProfile;
  astronomical_tide: TideForecast;
  active_hazards: ActiveHazard[];
  nearby_landing_centres: LandingCentre[];
  nearby_aquaculture_sites: AquacultureSite[];
  sources: Array<{
    provider: string;
    dataset: string;
    issued_at: string;
    license: string;
  }>;
}

// ---------------------------------------------------------------------------
// API Client Functions
// ---------------------------------------------------------------------------

export async function fetchPointForecast(
  lat: number,
  lon: number,
  timestamp?: string
): Promise<PointForecastResponse> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
  });
  if (timestamp) params.append('timestamp', timestamp);

  const res = await fetch(`${API_BASE}/forecast/point?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch point forecast: ${res.statusText}`);
  return res.json();
}

export async function fetchRouteForecast(
  waypoints: Array<[number, number]>,
  craftProfile = 'MOTORIZED_FIBERGLASS'
): Promise<RouteForecastResponse> {
  const wpStr = waypoints.map(([lat, lon]) => `${lat},${lon}`).join(';');
  const params = new URLSearchParams({
    waypoints: wpStr,
    craft_profile: craftProfile,
  });

  const res = await fetch(`${API_BASE}/forecast/route?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch route forecast: ${res.statusText}`);
  return res.json();
}

export async function fetchActiveHazards(sector?: string): Promise<{ count: number; hazards: ActiveHazard[] }> {
  const url = sector
    ? `${API_BASE}/hazards/active?sector=${encodeURIComponent(sector)}`
    : `${API_BASE}/hazards/active`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch active hazards: ${res.statusText}`);
  return res.json();
}

export async function fetchPFZAdvisories(sector = 'Maharashtra'): Promise<{ sector: string; advisories_count: number; advisories: PFZAdvisory[] }> {
  const res = await fetch(`${API_BASE}/fisheries/pfz?sector=${encodeURIComponent(sector)}`);
  if (!res.ok) throw new Error(`Failed to fetch PFZ advisories: ${res.statusText}`);
  return res.json();
}

export async function fetchNearbyPorts(
  lat: number,
  lon: number,
  radiusKm = 100,
  limit = 10
): Promise<{ count: number; ports: LandingCentre[] }> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius_km: radiusKm.toString(),
    limit: limit.toString(),
  });
  const res = await fetch(`${API_BASE}/ports/nearby?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch nearby ports: ${res.statusText}`);
  return res.json();
}

export async function fetchNearbyAquaculture(
  lat: number,
  lon: number,
  radiusKm = 80,
  limit = 10
): Promise<{ count: number; aquaculture_sites: AquacultureSite[] }> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius_km: radiusKm.toString(),
    limit: limit.toString(),
  });
  const res = await fetch(`${API_BASE}/aquaculture/sites/nearby?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch nearby aquaculture: ${res.statusText}`);
  return res.json();
}

export async function fetchCoastProfile(lat: number, lon: number): Promise<BathymetryProfile> {
  const res = await fetch(`${API_BASE}/coast/profile?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error(`Failed to fetch coast profile: ${res.statusText}`);
  return res.json();
}

export async function fetchDatasets(category?: string, provider?: string): Promise<{ total_datasets: number; datasets: DatasetItem[] }> {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (provider) params.append('provider', provider);

  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/datasets${q}`);
  if (!res.ok) throw new Error(`Failed to fetch datasets: ${res.statusText}`);
  return res.json();
}

export async function fetchDatasetById(id: string): Promise<DatasetItem> {
  const res = await fetch(`${API_BASE}/datasets/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch dataset ${id}: ${res.statusText}`);
  return res.json();
}

export async function searchMarineFeatures(query: string): Promise<{ query: string; count: number; results: SpatialSearchResult[] }> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Failed to search marine features: ${res.statusText}`);
  return res.json();
}

export async function executeSpatialQuery(
  lat: number,
  lon: number,
  radiusKm = 50
): Promise<UnifiedSpatialQueryResponse> {
  const res = await fetch(`${API_BASE}/spatial/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, radius_km: radiusKm }),
  });
  if (!res.ok) throw new Error(`Failed to execute spatial query: ${res.statusText}`);
  return res.json();
}
