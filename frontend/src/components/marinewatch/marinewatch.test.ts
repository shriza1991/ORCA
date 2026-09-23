import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchPointForecast,
  fetchRouteForecast,
  fetchActiveHazards,
  fetchPFZAdvisories,
  fetchNearbyPorts,
  fetchNearbyAquaculture,
  fetchCoastProfile,
  fetchDatasets,
  fetchDatasetById,
  searchMarineFeatures,
  executeSpatialQuery,
} from '../../api/marinewatch-client';

describe('India MarineWatch API Client Contracts (§213, §214, §215)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchPointForecast queries /api/v1/forecast/point with lat and lon', async () => {
    const mockData = {
      location: { lat: 16.99, lon: 73.28 },
      forecast: { wave_height_m: 1.4 },
      tide: { current_height_m: 1.2 },
      profile: { bathymetry_depth_m: 22.0 },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchPointForecast(16.99, 73.28);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/forecast/point?lat=16.99&lon=73.28')
    );
    expect(result.forecast.wave_height_m).toBe(1.4);
  });

  it('fetchRouteForecast serializes waypoints correctly', async () => {
    const mockData = {
      total_distance_nm: 25.4,
      status: 'GO',
      max_wave_height_m: 1.8,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchRouteForecast(
      [
        [16.99, 73.28],
        [16.82, 72.95],
      ],
      'MOTORIZED_FIBERGLASS'
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('waypoints=16.99%2C73.28%3B16.82%2C72.95')
    );
    expect(result.status).toBe('GO');
  });

  it('fetchActiveHazards requests /api/v1/hazards/active', async () => {
    const mockData = {
      count: 2,
      hazards: [
        {
          hazard_id: 'HAZ-01',
          headline: 'Squally weather',
          severity: 'WARNING',
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchActiveHazards('Maharashtra');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/hazards/active?sector=Maharashtra')
    );
    expect(result.count).toBe(2);
  });

  it('fetchPFZAdvisories requests active sectors', async () => {
    const mockData = {
      sector: 'Maharashtra',
      advisories_count: 2,
      advisories: [
        {
          advisory_id: 'PFZ-01',
          location_name: 'Ratnagiri Front',
          sst_celsius: 28.4,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchPFZAdvisories('Maharashtra');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/fisheries/pfz?sector=Maharashtra')
    );
    expect(result.advisories[0].sst_celsius).toBe(28.4);
  });

  it('fetchNearbyPorts queries CMFRI landing centres', async () => {
    const mockData = {
      count: 1,
      ports: [
        {
          id: 'CMFRI-RAT-01',
          name: 'Mirkarwada',
          distance_km: 4.2,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchNearbyPorts(16.99, 73.28, 50, 5);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/ports/nearby?lat=16.99&lon=73.28&radius_km=50&limit=5')
    );
    expect(result.ports[0].name).toBe('Mirkarwada');
  });

  it('fetchNearbyAquaculture queries CAA registered sites', async () => {
    const mockData = {
      count: 1,
      aquaculture_sites: [
        {
          id: 'CAA-01',
          farm_name: 'Dahanu Farm',
          distance_km: 12.5,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchNearbyAquaculture(19.9, 72.7, 40, 5);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/aquaculture/sites/nearby?lat=19.9&lon=72.7&radius_km=40&limit=5')
    );
    expect(result.aquaculture_sites[0].farm_name).toBe('Dahanu Farm');
  });

  it('fetchCoastProfile queries GEBCO bathymetric profile', async () => {
    const mockData = {
      latitude: 16.99,
      longitude: 73.28,
      bathymetry_depth_m: 14.5,
      shelf_zone: 'Nearshore Coastal Waters',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchCoastProfile(16.99, 73.28);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/coast/profile?lat=16.99&lon=73.28')
    );
    expect(result.bathymetry_depth_m).toBe(14.5);
  });

  it('fetchDatasets supports category and provider filters', async () => {
    const mockData = {
      total_datasets: 30,
      datasets: [{ id: 'DS-01', title: 'INCOIS OSF' }],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchDatasets('Ocean', 'INCOIS');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/datasets?category=Ocean&provider=INCOIS')
    );
    expect(result.total_datasets).toBe(30);
  });

  it('fetchDatasetById looks up specific canonical dataset', async () => {
    const mockData = {
      id: 'DS-01',
      title: 'INCOIS OSF',
      provider: 'INCOIS',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchDatasetById('DS-01');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/datasets/DS-01');
    expect(result.id).toBe('DS-01');
  });

  it('searchMarineFeatures executes spatial search', async () => {
    const mockData = {
      query: 'Ratnagiri',
      count: 2,
      results: [
        { id: '1', name: 'Mirkarwada (Ratnagiri)', category: 'PORT_LANDING_CENTRE' },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await searchMarineFeatures('Ratnagiri');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/search?q=Ratnagiri')
    );
    expect(result.results[0].name).toBe('Mirkarwada (Ratnagiri)');
  });

  it('executeSpatialQuery posts composite what-is-here payload', async () => {
    const mockData = {
      query_point: { lat: 16.99, lon: 73.28 },
      search_radius_km: 50,
      ocean_state: { wave_height_m: 1.2 },
      bathymetry_and_shelf: { bathymetry_depth_m: 24.0 },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await executeSpatialQuery(16.99, 73.28, 50);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/spatial/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 16.99, lon: 73.28, radius_km: 50 }),
    });
    expect(result.ocean_state.wave_height_m).toBe(1.2);
  });
});
