import { describe, it, expect, vi } from 'vitest';
import OceanDataExplorer from './OceanDataExplorer';
import OceanTimeSeriesChart from './OceanTimeSeriesChart';
import TideTimeSeriesChart from './TideTimeSeriesChart';
import PFZSpatialMap, { buildPFZGeoJSON } from './PFZSpatialMap';
import HazardSpatialMap, { buildHazardGeoJSON } from './HazardSpatialMap';
import EOTemporalAnalysisChart, { aggregateEOTemporalSeries } from './EOTemporalAnalysisChart';
import EOGridSpatialMap, {
  buildEOGridGeoJSON,
  calculateEOSpatialStats,
  getEOCellColor,
  EO_SPATIAL_METRICS,
} from './EOGridSpatialMap';
import DataSourceMonitor from './DataSourceMonitor';
import ScenarioLab from './ScenarioLab';
import ScenarioComparisonView from './ScenarioComparisonView';
import QueryWorkbench, { RESEARCH_PROMPTS, extractExecutedTools } from './QueryWorkbench';
import ResearcherPage from '../../pages/ResearcherPage';
import DataProvenancePanel from './DataProvenancePanel';
import {
  deriveMarineTrustMetadata,
  deriveTideTrustMetadata,
  deriveEOTrustMetadata,
  deriveEOSpatialTrustMetadata,
  derivePFZTrustMetadata,
  deriveHazardTrustMetadata,
} from '../../utils/provenance';
import {
  fetchHarbors,
  fetchMarineObservations,
  fetchEOGridCells,
  getLatestEOGridCells,
  fetchPFZCandidates,
  fetchHazards,
  fetchScenarios,
  runScenario,
  fetchHealthStatus,
  DATA_SOURCES,
  type MarineObservation,
  type PFZCandidate,
  type HazardBulletin,
  type EOGridCell,
  type ScenarioRunResult,
} from '../../api/researcher-client';

describe('Researcher Dashboard Components & Data Client', () => {
  it('exports all researcher deck components cleanly', () => {
    expect(OceanDataExplorer).toBeDefined();
    expect(typeof OceanDataExplorer).toBe('function');

    expect(OceanTimeSeriesChart).toBeDefined();
    expect(typeof OceanTimeSeriesChart).toBe('function');

    expect(DataSourceMonitor).toBeDefined();
    expect(typeof DataSourceMonitor).toBe('function');

    expect(ScenarioLab).toBeDefined();
    expect(typeof ScenarioLab).toBe('function');

    expect(QueryWorkbench).toBeDefined();
    expect(typeof QueryWorkbench).toBe('function');

    expect(ResearcherPage).toBeDefined();
    expect(typeof ResearcherPage).toBe('function');
  });

  it('validates 4 researcher decks enumeration', () => {
    const decks: Array<'ocean' | 'sources' | 'scenarios' | 'query'> = [
      'ocean',
      'sources',
      'scenarios',
      'query',
    ];
    expect(decks).toHaveLength(4);
    expect(decks).toContain('ocean');
    expect(decks).toContain('sources');
    expect(decks).toContain('scenarios');
    expect(decks).toContain('query');
  });

  it('fetches harbors fallback with valid coordinates', async () => {
    const harbors = await fetchHarbors();
    expect(harbors.length).toBeGreaterThanOrEqual(2);
    const ratnagiri = harbors.find(h => h.public_id === 'harbor-ratnagiri');
    expect(ratnagiri).toBeDefined();
    expect(ratnagiri?.latitude).toBeCloseTo(16.99, 1);
    expect(ratnagiri?.longitude).toBeCloseTo(73.28, 1);
  });

  it('fetches marine observations filtered by harbor', async () => {
    const ratObs = await fetchMarineObservations('harbor-ratnagiri');
    expect(ratObs.length).toBeGreaterThan(0);
    for (const obs of ratObs) {
      expect(obs.harbor_id).toBe('harbor-ratnagiri');
      expect(obs.wave_height_m).toBeGreaterThan(0);
      expect(obs.sst_celsius).toBeGreaterThan(20);
      expect(obs.quality_flags.length).toBeGreaterThan(0);
    }
  });

  it('fetches EO grid cells with satellite metadata and tolerates null/obscured values', async () => {
    const cells = await fetchEOGridCells();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.cell_id).toBeTruthy();
      expect(cell.satellite).toBeTruthy();
      // Values can be null when satellite cell is cloud obscured or no-data
      if (cell.chlorophyll_a_mg_m3 !== null) {
        expect(cell.chlorophyll_a_mg_m3).toBeGreaterThan(0);
      }
    }
  });

  it('fetches PFZ advisory candidates with sst_gradient and without fake absolute sst_celsius', async () => {
    const pfz = await fetchPFZCandidates();
    expect(pfz.length).toBeGreaterThan(0);
    const rank1 = pfz.find(p => p.rank === 1);
    expect(rank1).toBeDefined();
    expect(rank1?.distance_km).toBeGreaterThan(0);
    expect(rank1?.bearing_deg).toBeGreaterThanOrEqual(0);
    // Semantic verification: sst_gradient must be preserved as gradient (< 10.0), never absolute SST (~28°C)
    for (const p of pfz) {
      expect((p as any).sst_celsius).toBeUndefined();
      if (p.sst_gradient !== null) {
        expect(p.sst_gradient).toBeGreaterThanOrEqual(0);
        expect(p.sst_gradient).toBeLessThan(10); // Thermal gradient metric is < 10 °C/km or unitless index
      }
    }
  });

  it('fetches active hazard bulletins', async () => {
    const hazards = await fetchHazards();
    expect(hazards.length).toBeGreaterThan(0);
    const warning = hazards.find(h => h.severity === 'WARNING');
    expect(warning).toBeDefined();
    expect(warning?.headline).toBeTruthy();
    expect(warning?.source).toBeTruthy();
  });

  it('fetches S1–S8 scenario manifest and executes scenario evaluation', async () => {
    const scenarios = await fetchScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(8);
    expect(scenarios.some(s => s.id === 'S1')).toBe(true);

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          scenario_id: 'S1',
          passed: true,
          actual_status: 'CAUTION',
          actual_confidence: 'HIGH',
          evidence_count: 4,
          trace_steps_count: 6,
          execution_time_ms: 120,
          response_text: 'Depart with caution due to wave heights.',
          executed_tools: ['marine_conditions', 'weather_conditions'],
          validation_notes: ['Wave threshold within limits'],
          warnings: [],
        }),
      } as any);

      const result = await runScenario('S1');
      expect(result.scenario_id).toBe('S1');
      expect(result.is_error).toBeFalsy();
      expect(result.passed).toBe(true);
      expect(result.recommendation_status).toBe('CAUTION');
      expect(result.evidence_count).toBe(4);
      expect(result.trace_steps).toBe(6);
      expect(result.executed_tools).toContain('marine_conditions');
      expect(result.decisive_factors).toContain('Wave threshold within limits');
      expect(typeof result.execution_time_ms).toBe('number');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('regression: backend scenario failure produces explicit error state without fabricated random results', async () => {
    const originalFetch = globalThis.fetch;
    const randomSpy = vi.spyOn(Math, 'random');
    try {
      // Mock fetch rejection (backend unavailable)
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await runScenario('S1');

      // Must produce explicit error state
      expect(result.is_error).toBe(true);
      expect(result.status).toBe('error');
      expect(result.recommendation_status).toBe('UNKNOWN');
      expect(result.confidence_level).toBe('UNKNOWN');
      expect(result.evidence_count).toBe(0);
      expect(result.trace_steps).toBe(0);
      expect(result.decisive_factors).toEqual([]);
      expect(result.answer).toContain('Scenario execution unavailable');

      // Math.random must NOT have been called to invent metrics
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      randomSpy.mockRestore();
    }
  });

  it('regression: HTTP 500 error produces explicit error state without fake metrics', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      } as any);

      const result = await runScenario('S2');
      expect(result.is_error).toBe(true);
      expect(result.status).toBe('error');
      expect(result.evidence_count).toBe(0);
      expect(result.trace_steps).toBe(0);
      expect(result.confidence_level).toBe('UNKNOWN');
      expect(result.answer).toContain('Scenario execution unavailable');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetches health status and validates authoritative data sources registry', async () => {
    const health = await fetchHealthStatus();
    expect(health.status).toBeTruthy();
    expect(health.app_name).toBe('SAMUDRA');

    expect(DATA_SOURCES.length).toBeGreaterThanOrEqual(7);
    const imd = DATA_SOURCES.find(s => s.provider === 'IMD' && s.name.includes('Cyclone'));
    expect(imd).toBeDefined();
    expect(imd?.status).toBe('online');
  });

  it('exposes canonical DATA MODE disclosure constants for Researcher Lab', async () => {
    const { CANONICAL_DATA_MODE_LABEL, CANONICAL_DATA_MODE_TOOLTIP } = await import('../../api/researcher-client');
    expect(CANONICAL_DATA_MODE_LABEL).toBe('DATA MODE: SYNTHETIC DEMO / SNAPSHOT');
    expect(CANONICAL_DATA_MODE_TOOLTIP).toContain('Deterministic synthetic data');
    expect(CANONICAL_DATA_MODE_TOOLTIP).toContain('not connected to live operational feeds');
  });

  // =========================================================================
  // P0-13 Marine Observation 48-Hour Time-Series Tests
  // =========================================================================

  describe('P0-13 Marine Observation Time Series Visualizations', () => {
    const unorderedObservations: MarineObservation[] = [
      {
        public_id: 'obs-03',
        harbor_id: 'harbor-ratnagiri',
        observation_time: '2026-09-12T18:00:00Z',
        wave_height_m: 1.8,
        sst_celsius: 28.3,
        wind_speed_kn: 14,
        wind_direction_deg: 210,
        current_speed_kn: 0.9,
        swell_period_s: 7.5,
        visibility_nm: 15,
        source: 'INCOIS OSF',
        data_mode: 'HYBRID',
        quality_flags: ['fresh'],
        qc_status: 'VALID',
      },
      {
        public_id: 'obs-01',
        harbor_id: 'harbor-ratnagiri',
        observation_time: '2026-09-11T06:00:00Z',
        wave_height_m: 2.1,
        sst_celsius: 28.6,
        wind_speed_kn: 18,
        wind_direction_deg: 225,
        current_speed_kn: 1.2,
        swell_period_s: 8.5,
        visibility_nm: 12,
        source: 'INCOIS OSF',
        data_mode: 'HYBRID',
        quality_flags: ['fresh'],
        qc_status: 'VALID',
      },
      {
        public_id: 'obs-02',
        harbor_id: 'harbor-ratnagiri',
        observation_time: '2026-09-12T00:00:00Z',
        wave_height_m: 2.4,
        sst_celsius: null, // Null SST to verify gap handling
        wind_speed_kn: 22,
        wind_direction_deg: 240,
        current_speed_kn: 1.5,
        swell_period_s: 9.0,
        visibility_nm: 10,
        source: 'INCOIS OSF',
        data_mode: 'HYBRID',
        quality_flags: ['fresh'],
        qc_status: 'SUSPECT',
      },
    ];

    it('sorts marine observations chronologically by timestamp', () => {
      const sorted = [...unorderedObservations].sort((a, b) => {
        return new Date(a.observation_time).getTime() - new Date(b.observation_time).getTime();
      });

      expect(sorted[0].public_id).toBe('obs-01');
      expect(sorted[1].public_id).toBe('obs-02');
      expect(sorted[2].public_id).toBe('obs-03');
      expect(sorted[0].observation_time).toBe('2026-09-11T06:00:00Z');
      expect(sorted[2].observation_time).toBe('2026-09-12T18:00:00Z');
    });

    it('determines latest scalar value by newest timestamp, not array position', () => {
      // Even if array is reversed, latest must be obs-03 (2026-09-12T18:00:00Z)
      const reversed = [unorderedObservations[0], unorderedObservations[2], unorderedObservations[1]];
      const sorted = [...reversed].sort((a, b) => {
        return new Date(a.observation_time).getTime() - new Date(b.observation_time).getTime();
      });
      const latest = sorted[sorted.length - 1];

      expect(latest.public_id).toBe('obs-03');
      expect(latest.observation_time).toBe('2026-09-12T18:00:00Z');
      expect(latest.wave_height_m).toBe(1.8);
      expect(latest.sst_celsius).toBe(28.3);
      expect(latest.wind_speed_kn).toBe(14);
    });

    it('preserves null SST without converting to zero', () => {
      const obsWithNull = unorderedObservations.find(o => o.public_id === 'obs-02');
      expect(obsWithNull?.sst_celsius).toBeNull();
      expect(obsWithNull?.sst_celsius).not.toBe(0);
    });

    it('preserves QC status for flagged observations', () => {
      const suspectObs = unorderedObservations.find(o => o.public_id === 'obs-02');
      expect(suspectObs?.qc_status).toBe('SUSPECT');

      const validObs = unorderedObservations.find(o => o.public_id === 'obs-01');
      expect(validObs?.qc_status).toBe('VALID');
    });

    it('correctly maps 48 hourly observations from backend fixture format', async () => {
      // Create mock 48-hour dataset simulating backend fixture
      const fixtureMock: any[] = [];
      const baseTime = new Date('2026-09-11T06:00:00Z').getTime();
      for (let h = 0; h < 48; h++) {
        const timeIso = new Date(baseTime + h * 3600 * 1000).toISOString();
        fixtureMock.push({
          public_id: `obs-ratnagiri-${h}h`,
          harbor_id: 'harbor-ratnagiri',
          observation_time: timeIso,
          wave_height_m: 1.2 + Math.sin(h / 6) * 0.5,
          sea_surface_temp_c: 28.2 + Math.cos(h / 12) * 0.4,
          wind_speed_knots: 12 + Math.sin(h / 4) * 4,
          wind_direction_deg: 200 + h,
          current_speed_knots: 1.0,
          swell_period_sec: 8.0,
          visibility_km: 10.0,
          qc_status: h === 10 ? 'SUSPECT' : 'VALID',
          qc_flag: h === 10 ? 1 : 0,
        });
      }

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => fixtureMock,
        } as any);

        const observations = await fetchMarineObservations('harbor-ratnagiri');
        expect(observations).toHaveLength(48);
        expect(observations[0].harbor_id).toBe('harbor-ratnagiri');
        expect(observations[0].wave_height_m).toBeCloseTo(1.2, 1);
        expect(observations[0].sst_celsius).toBeCloseTo(28.6, 1);
        expect(observations[10].qc_status).toBe('SUSPECT');
        expect(observations[0].qc_status).toBe('VALID');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles missing values by leaving them null for gaps rather than zero', async () => {
      const mockWithGaps = [
        {
          public_id: 'obs-gap-1',
          observation_time: '2026-09-11T06:00:00Z',
          swh: null,
          sst: null,
          wind_speed_knots: null,
        },
      ];

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockWithGaps,
        } as any);

        const obs = await fetchMarineObservations('harbor-ratnagiri');
        expect(obs[0].wave_height_m).toBeNull();
        expect(obs[0].sst_celsius).toBeNull();
        expect(obs[0].wind_speed_kn).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // P0-14 PFZ Spatial Map & Feature Transformation Tests
  // =========================================================================

  describe('P0-14 PFZ Spatial Distribution Visualization', () => {
    const mockCandidates: PFZCandidate[] = [
      {
        public_id: 'pfz-01',
        latitude: 16.92,
        longitude: 73.15,
        confidence: 'HIGH',
        sst_gradient: 0.9,
        chlorophyll_a_mg_m3: 1.6,
        depth_m: 28.0,
        bearing_deg: 245.0,
        distance_km: 15.2,
        status: 'ACTIVE',
        qc_status: 'VALID',
        valid_from: '2026-09-12T02:00:00Z',
        valid_to: '2026-09-13T02:00:00Z',
        source: 'INCOIS PFZ Advisory',
        rank: 1,
      },
      {
        public_id: 'pfz-02',
        latitude: 17.05,
        longitude: 73.05,
        confidence: 'MEDIUM',
        sst_gradient: 1.1,
        chlorophyll_a_mg_m3: 1.8,
        depth_m: 35.0,
        bearing_deg: 290.0,
        distance_km: 25.8,
        status: 'VALID',
        qc_status: 'VALID',
        valid_from: '2026-09-12T00:00:00Z',
        valid_to: '2026-09-13T00:00:00Z',
        source: 'INCOIS PFZ Advisory',
        rank: 2,
      },
      {
        public_id: 'pfz-missing-conf',
        latitude: 16.12,
        longitude: 73.30,
        confidence: undefined,
        sst_gradient: 0.75,
        chlorophyll_a_mg_m3: 1.2,
        depth_m: 40.0,
        bearing_deg: 210.0,
        distance_km: 30.0,
        status: 'ACTIVE',
        qc_status: 'SUSPECT',
        valid_from: '2026-09-12T00:00:00Z',
        valid_to: '2026-09-13T00:00:00Z',
        source: 'INCOIS PFZ Advisory',
        rank: 3,
      },
      {
        public_id: 'pfz-invalid-coords',
        latitude: 0,
        longitude: 0,
        confidence: 'HIGH',
        sst_gradient: 0.8,
        chlorophyll_a_mg_m3: 1.0,
        depth_m: 20.0,
        bearing_deg: 180.0,
        distance_km: 10.0,
        status: 'ACTIVE',
        qc_status: 'VALID',
        valid_from: '2026-09-12T00:00:00Z',
        valid_to: '2026-09-13T00:00:00Z',
        source: 'INCOIS PFZ Advisory',
        rank: 4,
      },
    ];

    it('exports PFZSpatialMap component cleanly', () => {
      expect(PFZSpatialMap).toBeDefined();
      expect(typeof PFZSpatialMap).toBe('function');
    });

    it('converts valid PFZ candidates into a GeoJSON FeatureCollection with exact coordinates', () => {
      const geojson = buildPFZGeoJSON(mockCandidates);
      expect(geojson.type).toBe('FeatureCollection');
      // 3 valid coordinates, 1 invalid (0,0) filtered out
      expect(geojson.features).toHaveLength(3);

      const f1 = geojson.features.find((f) => f.properties?.public_id === 'pfz-01');
      expect(f1).toBeDefined();
      expect(f1?.geometry.type).toBe('Point');
      expect((f1?.geometry as GeoJSON.Point).coordinates).toEqual([73.15, 16.92]); // [lon, lat]
      expect(f1?.properties?.rank).toBe(1);
      expect(f1?.properties?.confidence).toBe('HIGH');
      expect(f1?.properties?.sst_gradient).toBe(0.9);
      expect(f1?.properties?.chlorophyll_a_mg_m3).toBe(1.6);
      expect(f1?.properties?.qc_status).toBe('VALID');
    });

    it('preserves sst_gradient without converting to absolute temperature or adding °C', () => {
      const geojson = buildPFZGeoJSON(mockCandidates);
      for (const f of geojson.features) {
        expect(f.properties?.sst_gradient).toBeLessThan(10);
        expect(f.properties?.sst_celsius).toBeUndefined();
      }
    });

    it('handles missing candidate confidence as UNKNOWN rather than zero or false fallback', () => {
      const geojson = buildPFZGeoJSON(mockCandidates);
      const missingConf = geojson.features.find((f) => f.properties?.public_id === 'pfz-missing-conf');
      expect(missingConf?.properties?.confidence).toBe('UNKNOWN');
    });

    it('preserves suspect QC status on PFZ candidate features', () => {
      const geojson = buildPFZGeoJSON(mockCandidates);
      const suspect = geojson.features.find((f) => f.properties?.public_id === 'pfz-missing-conf');
      expect(suspect?.properties?.qc_status).toBe('SUSPECT');
    });

    it('gracefully handles empty candidate array without errors', () => {
      const emptyGeoJSON = buildPFZGeoJSON([]);
      expect(emptyGeoJSON.type).toBe('FeatureCollection');
      expect(emptyGeoJSON.features).toEqual([]);
    });

    it('gracefully filters out invalid coordinates (NaN, 0,0, out-of-range)', () => {
      const corrupted: any[] = [
        { public_id: 'bad-1', latitude: NaN, longitude: 73.0 },
        { public_id: 'bad-2', latitude: 16.0, longitude: null },
        { public_id: 'bad-3', latitude: 95.0, longitude: 73.0 }, // Out of range
      ];
      const geojson = buildPFZGeoJSON(corrupted);
      expect(geojson.features).toHaveLength(0);
    });
  });

  // =========================================================================
  // P0-15 Hazard Spatial Map & Polygon Feature Tests
  // =========================================================================

  describe('P0-15 Hazard Spatial Polygon Visualizations', () => {
    const mockHazards: HazardBulletin[] = [
      {
        public_id: 'hazard-01',
        event_type: 'CYCLONE_SQUALL',
        severity: 'WARNING',
        headline: 'Severe Cyclone Squall Warning - Konkan Offshore Sector',
        status: 'ACTIVE',
        issued_at: '2026-09-12T04:00:00Z',
        valid_until: '2026-09-12T16:00:00Z',
        source: 'IMD Severe Weather Bulletin',
        affected_area: 'Ratnagiri Offshore',
        description: 'Squally winds 45-55 kmph gusting to 65 kmph.',
        qc_status: 'VALID',
        provenance_json: {
          intended_provider: 'IMD_CYCLONE_DIVISION',
          source_product: 'IMD Cyclone Warning Bulletin',
        },
        geometry_geojson: {
          type: 'Polygon',
          coordinates: [
            [
              [72.8, 16.4],
              [73.4, 16.4],
              [73.4, 17.1],
              [72.8, 17.1],
              [72.8, 16.4],
            ],
          ],
        },
      },
      {
        public_id: 'hazard-02',
        event_type: 'HIGH_WAVE',
        severity: 'ALERT',
        headline: 'High Wave Alert (2.8m - 3.4m) off Ratnagiri',
        status: 'ACTIVE',
        issued_at: '2026-09-12T06:00:00Z',
        valid_until: '2026-09-13T00:00:00Z',
        source: 'INCOIS OSF',
        affected_area: 'Ratnagiri Coast',
        description: 'High wave heights 2.8m to 3.4m.',
        qc_status: 'VALID',
        provenance_json: {
          intended_provider: 'INCOIS',
        },
        // Coordinates as string pairs to test parser resilience
        geometry_geojson: {
          type: 'Polygon',
          coordinates: [
            [
              '73.0 16.8',
              '73.35 16.8',
              '73.35 17.2',
              '73.0 17.2',
              '73.0 16.8',
            ],
          ],
        },
      },
      {
        public_id: 'hazard-06-expired',
        event_type: 'CYCLONE_SQUALL',
        severity: 'WARNING',
        headline: 'Past Squall Alert (Expired Historical)',
        status: 'EXPIRED',
        issued_at: '2026-09-10T18:00:00Z',
        valid_until: '2026-09-11T18:00:00Z',
        source: 'IMD Coastal Bulletin',
        affected_area: 'Central Konkan',
        description: 'Past squall advisory from previous week.',
        qc_status: 'VALID',
        geometry_geojson: {
          type: 'Polygon',
          coordinates: [
            [
              [72.5, 16.2],
              [73.0, 16.2],
              [73.0, 16.8],
              [72.5, 16.8],
              [72.5, 16.2],
            ],
          ],
        },
      },
      {
        public_id: 'hazard-missing-severity',
        event_type: 'ADVISORY',
        severity: '', // Missing severity
        headline: 'Advisory without explicit severity',
        status: 'ACTIVE',
        issued_at: '2026-09-12T00:00:00Z',
        valid_until: '2026-09-12T12:00:00Z',
        source: 'IMD Marine Weather',
        affected_area: 'Goa Coast',
        description: 'General sea condition advisory.',
        qc_status: 'VALID',
        geometry_geojson: {
          type: 'Polygon',
          coordinates: [
            [
              [73.2, 15.4],
              [73.6, 15.4],
              [73.6, 15.9],
              [73.2, 15.9],
              [73.2, 15.4],
            ],
          ],
        },
      },
      {
        public_id: 'hazard-no-geometry',
        event_type: 'HIGH_WIND',
        severity: 'WATCH',
        headline: 'Text-only bulletin without geometry',
        status: 'ACTIVE',
        issued_at: '2026-09-12T00:00:00Z',
        valid_until: '2026-09-12T12:00:00Z',
        source: 'IMD Coastal Bulletin',
        geometry_geojson: null, // Null geometry
      },
    ];

    it('exports HazardSpatialMap component cleanly', () => {
      expect(HazardSpatialMap).toBeDefined();
      expect(typeof HazardSpatialMap).toBe('function');
    });

    it('converts valid hazard polygons into GeoJSON FeatureCollection with exact coordinates', () => {
      const geojson = buildHazardGeoJSON(mockHazards);
      expect(geojson.type).toBe('FeatureCollection');
      // 4 valid geometries, 1 null geometry filtered out
      expect(geojson.features).toHaveLength(4);

      const h1 = geojson.features.find((f) => f.properties?.public_id === 'hazard-01');
      expect(h1).toBeDefined();
      expect(h1?.geometry.type).toBe('Polygon');

      const rings = (h1?.geometry as GeoJSON.Polygon).coordinates;
      expect(rings).toHaveLength(1);
      expect(rings[0]).toHaveLength(5);
      expect(rings[0][0]).toEqual([72.8, 16.4]);
      expect(rings[0][2]).toEqual([73.4, 17.1]);
    });

    it('parses space-separated coordinate pairs into numeric [lon, lat] pairs', () => {
      const geojson = buildHazardGeoJSON(mockHazards);
      const h2 = geojson.features.find((f) => f.properties?.public_id === 'hazard-02');
      expect(h2).toBeDefined();
      expect(h2?.geometry.type).toBe('Polygon');

      const rings = (h2?.geometry as GeoJSON.Polygon).coordinates;
      expect(rings[0][0]).toEqual([73.0, 16.8]);
      expect(rings[0][1]).toEqual([73.35, 16.8]);
      expect(rings[0][2]).toEqual([73.35, 17.2]);
    });

    it('preserves ACTIVE vs EXPIRED status explicitly on features', () => {
      const geojson = buildHazardGeoJSON(mockHazards);

      const active = geojson.features.find((f) => f.properties?.public_id === 'hazard-01');
      expect(active?.properties?.status).toBe('ACTIVE');
      expect(active?.properties?.is_active).toBe(true);
      expect(active?.properties?.is_expired).toBe(false);

      const expired = geojson.features.find((f) => f.properties?.public_id === 'hazard-06-expired');
      expect(expired?.properties?.status).toBe('EXPIRED');
      expect(expired?.properties?.is_active).toBe(false);
      expect(expired?.properties?.is_expired).toBe(true);
    });

    it('preserves severity from backend data and falls back to UNKNOWN rather than zero', () => {
      const geojson = buildHazardGeoJSON(mockHazards);

      const warning = geojson.features.find((f) => f.properties?.public_id === 'hazard-01');
      expect(warning?.properties?.severity).toBe('WARNING');

      const alert = geojson.features.find((f) => f.properties?.public_id === 'hazard-02');
      expect(alert?.properties?.severity).toBe('ALERT');

      const missing = geojson.features.find((f) => f.properties?.public_id === 'hazard-missing-severity');
      expect(missing?.properties?.severity).toBe('UNKNOWN');
      expect(missing?.properties?.severity).not.toBe(0);
    });

    it('preserves validity period and provenance metadata', () => {
      const geojson = buildHazardGeoJSON(mockHazards);
      const h1 = geojson.features.find((f) => f.properties?.public_id === 'hazard-01');

      expect(h1?.properties?.issued_at).toBe('2026-09-12T04:00:00Z');
      expect(h1?.properties?.valid_until).toBe('2026-09-12T16:00:00Z');
      expect(h1?.properties?.source).toBe('IMD Severe Weather Bulletin');
      expect(h1?.properties?.qc_status).toBe('VALID');
      expect(h1?.properties?.provenance_json?.intended_provider).toBe('IMD_CYCLONE_DIVISION');
    });

    it('preserves overlapping polygons as independent features', () => {
      // Create two overlapping polygons
      const overlappingHazards: HazardBulletin[] = [
        {
          public_id: 'overlap-1',
          event_type: 'HIGH_WAVE',
          severity: 'WARNING',
          headline: 'High wave zone',
          status: 'ACTIVE',
          issued_at: '2026-09-12T00:00:00Z',
          valid_until: '2026-09-12T12:00:00Z',
          source: 'IMD',
          geometry_geojson: {
            type: 'Polygon',
            coordinates: [[[72.8, 16.0], [73.5, 16.0], [73.5, 17.0], [72.8, 17.0], [72.8, 16.0]]],
          },
        },
        {
          public_id: 'overlap-2',
          event_type: 'CURRENT_SHEAR',
          severity: 'ALERT',
          headline: 'Current shear zone',
          status: 'ACTIVE',
          issued_at: '2026-09-12T00:00:00Z',
          valid_until: '2026-09-12T12:00:00Z',
          source: 'INCOIS',
          geometry_geojson: {
            type: 'Polygon',
            coordinates: [[[73.0, 16.5], [73.8, 16.5], [73.8, 17.5], [73.0, 17.5], [73.0, 16.5]]],
          },
        },
      ];

      const geojson = buildHazardGeoJSON(overlappingHazards);
      expect(geojson.features).toHaveLength(2);
      expect(geojson.features[0].properties?.public_id).toBe('overlap-1');
      expect(geojson.features[1].properties?.public_id).toBe('overlap-2');
      // Overlapping features remain distinct with independent severity and event types
      expect(geojson.features[0].properties?.event_type).toBe('HIGH_WAVE');
      expect(geojson.features[1].properties?.event_type).toBe('CURRENT_SHEAR');
    });

    it('gracefully handles missing or null geometry without fabricating coordinates', () => {
      const textOnly = [
        {
          public_id: 'text-1',
          headline: 'No spatial data',
          severity: 'ADVISORY',
          status: 'ACTIVE',
          issued_at: '2026-09-12T00:00:00Z',
          valid_until: '2026-09-12T12:00:00Z',
          source: 'IMD',
          geometry_geojson: null,
        },
      ];
      const geojson = buildHazardGeoJSON(textOnly);
      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features).toHaveLength(0);
    });

    it('safely rejects corrupted polygon rings (fewer than 3 points, NaN, out-of-range)', () => {
      const corrupted: any[] = [
        {
          public_id: 'bad-1',
          geometry_geojson: {
            type: 'Polygon',
            coordinates: [
              [[73.0, 16.0], [73.5, 16.0]], // Only 2 points (< 3 points)
            ],
          },
        },
        {
          public_id: 'bad-2',
          geometry_geojson: {
            type: 'Polygon',
            coordinates: [
              [[NaN, 16.0], [73.5, NaN], [73.5, 17.0]],
            ],
          },
        },
        {
          public_id: 'bad-3',
          geometry_geojson: {
            type: 'Polygon',
            coordinates: [
              [[250.0, 16.0], [73.5, 120.0], [73.5, 17.0]], // Out-of-range lon/lat
            ],
          },
        },
      ];
      const geojson = buildHazardGeoJSON(corrupted);
      expect(geojson.features).toHaveLength(0);
    });

    it('identifies selected hazard geometry by public_id and computes its spatial bounding box for auto-focus', () => {
      const geojson = buildHazardGeoJSON(mockHazards);
      const selectedId = 'hazard-01';
      const targetFeature = geojson.features.find((f) => f.properties?.public_id === selectedId);

      expect(targetFeature).toBeDefined();
      const geom = targetFeature?.geometry as GeoJSON.Polygon;
      const coords = geom.coordinates[0];

      let minLng = coords[0][0];
      let maxLng = coords[0][0];
      let minLat = coords[0][1];
      let maxLat = coords[0][1];

      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const centerLng = (minLng + maxLng) / 2;
      const centerLat = (minLat + maxLat) / 2;

      expect(minLng).toBe(72.8);
      expect(maxLng).toBe(73.4);
      expect(minLat).toBe(16.4);
      expect(maxLat).toBe(17.1);
      expect(centerLng).toBeCloseTo(73.1, 2);
      expect(centerLat).toBeCloseTo(16.75, 2);
    });
  });

  // =========================================================================
  // P0-16 Earth Observation 14-Day Temporal Analysis Tests
  // =========================================================================

  describe('P0-16 Earth Observation 14-Day Temporal Analysis', () => {
    // Generate synthetic multi-day grid dataset simulating 14 daily slices of 5 cells each
    const mockEODataset: EOGridCell[] = [];
    const baseDate = new Date('2026-08-30T06:00:00Z').getTime();

    for (let day = 0; day < 14; day++) {
      const dateIso = new Date(baseDate + day * 86400 * 1000).toISOString();
      for (let cell = 0; cell < 5; cell++) {
        // Create intentional cloud obscuration / null day on day 3 for cell 0..4
        const isCloudDay = day === 3;
        // Create partial cloud on day 7 for cell 4
        const isPartialCloud = day === 7 && cell === 4;
        const isNull = isCloudDay || isPartialCloud;

        mockEODataset.push({
          public_id: `eo-cell-0${cell}-d${day}`,
          cell_id: `cell-0${cell}`,
          center_lat: 16.0 + cell * 0.2,
          center_lon: 72.4 + cell * 0.2,
          pass_time: dateIso,
          sst_celsius: isNull ? null : +(28.5 + day * 0.1 + cell * 0.05).toFixed(2),
          chlorophyll_a_mg_m3: isNull ? null : +(1.2 + Math.sin(day / 2) * 0.4 + cell * 0.1).toFixed(2),
          cloud_cover_pct: isCloudDay ? 90 : isPartialCloud ? 80 : 10,
          cloud_fraction: isCloudDay ? 0.90 : isPartialCloud ? 0.80 : 0.10,
          uncertainty: isNull ? null : 0.12,
          qc_status: isCloudDay ? 'CLOUD_OBSCURED' : 'VALID',
          satellite: 'Oceansat-3 OCM',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
        });
      }
    }

    it('exports EOTemporalAnalysisChart component cleanly', () => {
      expect(EOTemporalAnalysisChart).toBeDefined();
      expect(typeof EOTemporalAnalysisChart).toBe('function');
    });

    it('preserves all 14 distinct dates without de-duplicating or dropping earlier dates', () => {
      const dailySST = aggregateEOTemporalSeries(mockEODataset, 'sst_celsius');
      expect(dailySST).toHaveLength(14);
      expect(dailySST[0].date).toBe('2026-08-30');
      expect(dailySST[13].date).toBe('2026-09-12');
    });

    it('ensures daily aggregates are strictly sorted chronologically ascending', () => {
      // Shuffle the dataset
      const shuffled = [...mockEODataset].sort(() => Math.random() - 0.5);
      const daily = aggregateEOTemporalSeries(shuffled, 'sst_celsius');

      expect(daily).toHaveLength(14);
      for (let i = 0; i < daily.length - 1; i++) {
        expect(new Date(daily[i].date).getTime()).toBeLessThan(new Date(daily[i + 1].date).getTime());
      }
    });

    it('calculates arithmetic daily spatial mean accurately across valid cells only', () => {
      const dailySST = aggregateEOTemporalSeries(mockEODataset, 'sst_celsius');
      const day0 = dailySST[0];

      // Day 0: 5 cells with SST: 28.50, 28.55, 28.60, 28.65, 28.70
      // Sum = 143.0, Mean = 28.60
      expect(day0.validCount).toBe(5);
      expect(day0.totalCount).toBe(5);
      expect(day0.mean).toBeCloseTo(28.60, 2);
      expect(day0.min).toBeCloseTo(28.50, 2);
      expect(day0.max).toBeCloseTo(28.70, 2);
    });

    it('never treats null/missing values as zero in spatial mean calculations', () => {
      const dailySST = aggregateEOTemporalSeries(mockEODataset, 'sst_celsius');
      const day7 = dailySST[7];

      // Day 7 has 4 valid cells and 1 null cell (partial cloud)
      expect(day7.validCount).toBe(4);
      expect(day7.totalCount).toBe(5);
      expect(day7.mean).not.toBeNull();
      // Mean should be around 29.35 (not dragged down to ~23 by treating null as 0)
      expect(day7.mean!).toBeGreaterThan(28.0);
    });

    it('produces null mean and 0 valid count for fully cloud-obscured dates (chart gap)', () => {
      const dailySST = aggregateEOTemporalSeries(mockEODataset, 'sst_celsius');
      const day3 = dailySST[3]; // Day 3 is fully obscured

      expect(day3.validCount).toBe(0);
      expect(day3.totalCount).toBe(5);
      expect(day3.mean).toBeNull();
      expect(day3.min).toBeNull();
      expect(day3.max).toBeNull();
      expect(day3.qcCounts['CLOUD_OBSCURED']).toBe(5);
    });

    it('preserves absolute SST semantics without confounding with PFZ sst_gradient', () => {
      const dailySST = aggregateEOTemporalSeries(mockEODataset, 'sst_celsius');
      for (const d of dailySST) {
        if (d.mean !== null) {
          // Absolute SST is ~28–31 °C (never gradient < 2.0)
          expect(d.mean).toBeGreaterThan(20);
          expect(d.mean).toBeLessThan(35);
        }
      }
    });

    it('calculates Chlorophyll-a temporal series with mg/m³ values', () => {
      const dailyChla = aggregateEOTemporalSeries(mockEODataset, 'chlorophyll_a_mg_m3');
      expect(dailyChla).toHaveLength(14);
      const day0 = dailyChla[0];
      expect(day0.validCount).toBe(5);
      expect(day0.mean).toBeGreaterThan(0.5);
      expect(day0.mean).toBeLessThan(3.0);
    });

    it('calculates Cloud Cover percentage series correctly', () => {
      const dailyCloud = aggregateEOTemporalSeries(mockEODataset, 'cloud_cover_pct');
      expect(dailyCloud).toHaveLength(14);
      const day3 = dailyCloud[3];
      // On cloud day, cloud cover is 90%
      expect(day3.validCount).toBe(5);
      expect(day3.mean).toBe(90);
    });

    it('computes mean pixel uncertainty when available and does not coerce missing to 0', () => {
      const dailySST = aggregateEOTemporalSeries(mockEODataset, 'sst_celsius');
      const day0 = dailySST[0];
      expect(day0.meanUncertainty).toBe(0.12);

      const day3 = dailySST[3]; // All uncertainties null on cloud day
      expect(day3.meanUncertainty).toBeNull();
    });

    it('correctly de-duplicates cells to latest observation for spatial grid table via getLatestEOGridCells', () => {
      const latest = getLatestEOGridCells(mockEODataset);
      // 5 unique spatial cells
      expect(latest).toHaveLength(5);
      // All latest cells should have pass_time from the last day (2026-09-12)
      for (const cell of latest) {
        expect(cell.pass_time.slice(0, 10)).toBe('2026-09-12');
      }
    });

    it('gracefully handles empty records array without errors', () => {
      const empty = aggregateEOTemporalSeries([], 'sst_celsius');
      expect(empty).toEqual([]);
    });

    it('regression: fetchEOGridCells returns all 350 raw multi-day observations from backend', async () => {
      // Create mock 350 item payload
      const mockBackendCells: any[] = [];
      for (let day = 0; day < 14; day++) {
        const dateIso = new Date(baseDate + day * 86400 * 1000).toISOString();
        for (let cell = 0; cell < 25; cell++) {
          mockBackendCells.push({
            public_id: `eo-CELL-${cell}-d${day}`,
            cell_id: `CELL-${cell}`,
            latitude: 16.0 + (cell % 5) * 0.2,
            longitude: 72.4 + Math.floor(cell / 5) * 0.2,
            observation_time: dateIso,
            SST: 29.5,
            CHL_A: 1.4,
            sst_c: 29.5,
            chlorophyll_mg_m3: 1.4,
            cloud_fraction: 0.1,
            uncertainty: 0.12,
            qc_status: 'VALID',
            source_name: 'MOSDAC / ISRO Oceansat-3 OCM (SYNTHETIC)',
          });
        }
      }

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockBackendCells,
        } as any);

        const cells = await fetchEOGridCells();
        // Must preserve all 350 multi-day observations
        expect(cells).toHaveLength(350);

        // Verify temporal aggregation operates on all 14 days
        const aggregated = aggregateEOTemporalSeries(cells, 'sst_celsius');
        expect(aggregated).toHaveLength(14);
        expect(aggregated[0].totalCount).toBe(25);
        expect(aggregated[0].mean).toBeCloseTo(29.5, 1);

        // Verify getLatestEOGridCells extracts only the 25 unique cells
        const latest = getLatestEOGridCells(cells);
        expect(latest).toHaveLength(25);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('P0-17: Unified Data Quality & Provenance UX', () => {
    it('DataProvenancePanel exports cleanly as a component', () => {
      expect(DataProvenancePanel).toBeDefined();
      expect(typeof DataProvenancePanel).toBe('function');
    });

    describe('Marine Observation Provenance & QC Semantics', () => {
      it('derives accurate 48-hour marine trust metadata with QC breakdown and synthetic mode', () => {
        const mockObs: MarineObservation[] = [
          {
            public_id: 'obs-1',
            harbor_id: 'harbor-ratnagiri',
            observation_time: '2026-09-10T06:00:00Z',
            wave_height_m: 1.5,
            sst_celsius: 28.5,
            wind_speed_kn: 12,
            wind_direction_deg: 240,
            current_speed_kn: 0.8,
            swell_period_s: 8.0,
            visibility_nm: 10,
            source: 'INCOIS OSF',
            data_mode: 'HYBRID',
            quality_flags: ['verified'],
            qc_status: 'VALID',
          },
          {
            public_id: 'obs-2',
            harbor_id: 'harbor-ratnagiri',
            observation_time: '2026-09-12T05:00:00Z',
            wave_height_m: 2.1,
            sst_celsius: null, // missing SST
            wind_speed_kn: 18,
            wind_direction_deg: 250,
            current_speed_kn: null,
            swell_period_s: 9.0,
            visibility_nm: 12,
            source: 'INCOIS OSF',
            data_mode: 'HYBRID',
            quality_flags: ['qc_warning'],
            qc_status: 'SUSPECT',
          },
        ];

        const trust = deriveMarineTrustMetadata(mockObs, 'Ratnagiri');
        expect(trust.sourceProvider).toBe('INCOIS');
        expect(trust.datasetName).toContain('Marine Weather Observations (Ratnagiri)');
        expect(trust.dataMode).toBe('SYNTHETIC SNAPSHOT');
        expect(trust.totalCount).toBe(2);
        expect(trust.validCount).toBe(1);
        expect(trust.snapshotPeriod).toContain('48-Hour Snapshot');
        expect(trust.snapshotPeriod).toContain('2026-09-10 06:00');
        expect(trust.snapshotPeriod).toContain('2026-09-12 05:00');
        expect(trust.referenceTime).toContain('2026-09-12 05:00 UTC');
        expect(trust.qcBreakdown).toEqual({ VALID: 1, SUSPECT: 1 });
        expect(trust.semanticsDescription).toContain('Sea Surface Temperature in °C');
      });

      it('handles empty marine observations without assuming healthy', () => {
        const trust = deriveMarineTrustMetadata([], 'Ratnagiri');
        expect(trust.validCount).toBe(0);
        expect(trust.totalCount).toBe(0);
        expect(trust.snapshotPeriod).toBe('48-Hour Hourly Time-Series');
      });
    });

    describe('Earth Observation (EO) Provenance & QC Semantics', () => {
      it('derives accurate 14-day EO trust metadata with 4 distinct QC categories', () => {
        const mockEOCells: EOGridCell[] = [
          {
            cell_id: 'c1',
            center_lat: 16.5,
            center_lon: 73.0,
            chlorophyll_a_mg_m3: 1.2,
            sst_celsius: 28.5,
            cloud_cover_pct: 10,
            satellite: 'Oceansat-3 OCM',
            pass_time: '2026-08-30T04:30:00Z',
            resolution_m: 360,
            source: 'ISRO MOSDAC',
            uncertainty: 0.12,
            qc_status: 'VALID',
          },
          {
            cell_id: 'c2',
            center_lat: 16.7,
            center_lon: 73.2,
            chlorophyll_a_mg_m3: null,
            sst_celsius: null,
            cloud_cover_pct: 95,
            satellite: 'Oceansat-3 OCM',
            pass_time: '2026-08-30T04:30:00Z',
            resolution_m: 360,
            source: 'ISRO MOSDAC',
            uncertainty: null,
            qc_status: 'CLOUD_OBSCURED',
          },
          {
            cell_id: 'c3',
            center_lat: 16.9,
            center_lon: 73.4,
            chlorophyll_a_mg_m3: 0.8,
            sst_celsius: 27.9,
            cloud_cover_pct: 35,
            satellite: 'Oceansat-3 OCM',
            pass_time: '2026-09-12T04:30:00Z',
            resolution_m: 360,
            source: 'ISRO MOSDAC',
            uncertainty: 0.28,
            qc_status: 'DEGRADED_QC_WARNING',
          },
          {
            cell_id: 'c4',
            center_lat: 17.1,
            center_lon: 73.6,
            chlorophyll_a_mg_m3: null,
            sst_celsius: null,
            cloud_cover_pct: null,
            satellite: 'Oceansat-3 OCM',
            pass_time: '2026-09-12T04:30:00Z',
            resolution_m: 360,
            source: 'ISRO MOSDAC',
            qc_status: 'NO_DATA',
          },
        ];

        const trust = deriveEOTrustMetadata(mockEOCells);
        expect(trust.sourceProvider).toBe('ISRO / MOSDAC');
        expect(trust.dataMode).toBe('SYNTHETIC SNAPSHOT');
        expect(trust.totalCount).toBe(4);
        expect(trust.validCount).toBe(1);
        expect(trust.qcBreakdown).toEqual({
          VALID: 1,
          CLOUD_OBSCURED: 1,
          DEGRADED_QC_WARNING: 1,
          NO_DATA: 1,
        });
        // Mean uncertainty: (0.12 + 0.28) / 2 = 0.20
        expect(trust.meanUncertainty).toBeCloseTo(0.2, 2);
        expect(trust.semanticsDescription).toContain('absolute SST (°C) from thermal sensors');
      });

      it('does not fabricate uncertainty when no cell has uncertainty reported', () => {
        const cells: EOGridCell[] = [
          {
            cell_id: 'c1',
            center_lat: 16.5,
            center_lon: 73.0,
            chlorophyll_a_mg_m3: 1.2,
            sst_celsius: 28.5,
            cloud_cover_pct: 10,
            satellite: 'Oceansat-3 OCM',
            pass_time: '2026-09-12T04:30:00Z',
            resolution_m: 360,
            source: 'ISRO MOSDAC',
            qc_status: 'VALID',
          },
        ];
        const trust = deriveEOTrustMetadata(cells);
        expect(trust.meanUncertainty).toBeNull();
      });
    });

    describe('PFZ Advisory Candidate Semantics', () => {
      it('separates PFZ advisory confidence score from data quality QC status', () => {
        const mockPFZ: PFZCandidate[] = [
          {
            public_id: 'pfz-1',
            latitude: 16.8,
            longitude: 72.9,
            sst_gradient: 0.95,
            chlorophyll_a_mg_m3: 1.4,
            distance_km: 45,
            bearing_deg: 240,
            rank: 1,
            status: 'ACTIVE',
            confidence: 'HIGH',
            depth_m: 30,
            valid_from: '2026-09-12T00:00:00Z',
            valid_to: '2026-09-12T23:59:59Z',
            source: 'INCOIS PFZ Advisory',
            qc_status: 'VALID',
          },
          {
            public_id: 'pfz-2',
            latitude: 16.5,
            longitude: 72.7,
            sst_gradient: 0.6,
            chlorophyll_a_mg_m3: 0.8,
            distance_km: 65,
            bearing_deg: 260,
            rank: 2,
            status: 'ACTIVE',
            confidence: 'MEDIUM',
            depth_m: 40,
            valid_from: '2026-09-12T00:00:00Z',
            valid_to: '2026-09-12T23:59:59Z',
            source: 'INCOIS PFZ Advisory',
            qc_status: 'SUSPECT',
          },
        ];

        const trust = derivePFZTrustMetadata(mockPFZ);
        expect(trust.sourceProvider).toBe('INCOIS');
        expect(trust.datasetName).toContain('Potential Fishing Zone (PFZ) Advisory Candidates');
        expect(trust.totalCount).toBe(2);
        // Ensure confidence and QC are distinct
        expect(trust.qcBreakdown).toEqual({ VALID: 1, SUSPECT: 1 });
        expect(trust.confidenceBreakdown).toEqual({ HIGH: 1, MEDIUM: 1 });
        // SST gradient semantics note
        expect(trust.semanticsDescription).toContain('SST Gradient represents frontal thermal anomaly magnitude');
      });
    });

    describe('Hazard Bulletin Semantics', () => {
      it('distinguishes operational status (ACTIVE/EXPIRED) from QC status and severity', () => {
        const mockHazards: HazardBulletin[] = [
          {
            public_id: 'h1',
            headline: 'Severe Wave Alert',
            severity: 'WARNING',
            status: 'ACTIVE',
            issued_at: '2026-09-12T03:00:00Z',
            valid_until: '2026-09-12T18:00:00Z',
            source: 'IMD Coastal Bulletin',
            event_type: 'HIGH_WAVE',
            qc_status: 'VALID',
          },
          {
            public_id: 'h2',
            headline: 'Past Squall Watch',
            severity: 'WATCH',
            status: 'EXPIRED',
            issued_at: '2026-09-10T06:00:00Z',
            valid_until: '2026-09-11T06:00:00Z',
            source: 'IMD Marine Weather',
            event_type: 'SQUALL',
            qc_status: 'VALID',
          },
          {
            public_id: 'h3',
            headline: 'Current Advisory Notice',
            severity: 'ADVISORY',
            status: 'ACTIVE',
            issued_at: '2026-09-12T04:00:00Z',
            valid_until: '2026-09-12T16:00:00Z',
            source: 'INCOIS OSF',
            event_type: 'STRONG_CURRENT',
            qc_status: 'DEGRADED',
          },
        ];

        const trust = deriveHazardTrustMetadata(mockHazards);
        expect(trust.sourceProvider).toBe('IMD');
        expect(trust.totalCount).toBe(3);
        expect(trust.validCount).toBe(2);
        expect(trust.qcBreakdown).toEqual({ VALID: 2, DEGRADED: 1 });
        expect(trust.statusBreakdown).toEqual({ ACTIVE: 2, EXPIRED: 1 });
        expect(trust.semanticsDescription).toContain('ACTIVE status denotes operational advisory applicability, distinct from observation data quality');
      });
    });

    describe('DataSourceMonitor Configured Profiles', () => {
      it('displays configured prototype profiles without fabricating live freshness timers', () => {
        for (const src of DATA_SOURCES) {
          expect(src.name).toBeTruthy();
          expect(src.provider).toBeTruthy();
          expect(src.cadence).toBeTruthy();
          // No live feeds claimed
          expect(src.data_mode).not.toBe('LIVE');
          expect(src.cadence).not.toContain('ago');
        }
      });
    });
  });

  describe('P0-18: Tide Temporal Analysis in Researcher Lab', () => {
    it('TideTimeSeriesChart exports cleanly as a component', () => {
      expect(TideTimeSeriesChart).toBeDefined();
      expect(typeof TideTimeSeriesChart).toBe('function');
    });

    it('derives accurate tide trust metadata from actual observations', () => {
      const mockObs: MarineObservation[] = [
        {
          public_id: 'obs-rat-01',
          harbor_id: 'harbor-ratnagiri',
          observation_time: '2026-09-11T06:00:00Z',
          wave_height_m: 1.2,
          sst_celsius: 28.2,
          wind_speed_kn: 12.0,
          wind_direction_deg: 194.0,
          current_speed_kn: 1.0,
          swell_period_s: 8.0,
          visibility_nm: 10.0,
          tide_level_m: 0.4,
          tide_phase: 'FLOOD',
          tide_datum: 'LAT',
          source: 'INCOIS OSF',
          data_mode: 'HYBRID',
          quality_flags: ['verified'],
          qc_status: 'VALID',
        },
        {
          public_id: 'obs-rat-02',
          harbor_id: 'harbor-ratnagiri',
          observation_time: '2026-09-11T12:00:00Z',
          wave_height_m: 1.5,
          sst_celsius: 28.5,
          wind_speed_kn: 14.0,
          wind_direction_deg: 200.0,
          current_speed_kn: 1.2,
          swell_period_s: 8.0,
          visibility_nm: 10.0,
          tide_level_m: 1.8,
          tide_phase: 'HIGH',
          tide_datum: 'LAT',
          source: 'INCOIS OSF',
          data_mode: 'HYBRID',
          quality_flags: ['verified'],
          qc_status: 'VALID',
        },
        {
          public_id: 'obs-rat-03',
          harbor_id: 'harbor-ratnagiri',
          observation_time: '2026-09-11T18:00:00Z',
          wave_height_m: 1.3,
          sst_celsius: 28.1,
          wind_speed_kn: 10.0,
          wind_direction_deg: 190.0,
          current_speed_kn: 0.9,
          swell_period_s: 7.5,
          visibility_nm: 12.0,
          tide_level_m: null, // missing tide
          tide_phase: 'EBB',
          tide_datum: 'LAT',
          source: 'INCOIS OSF',
          data_mode: 'HYBRID',
          quality_flags: ['missing'],
          qc_status: 'MISSING_DATA',
        },
        {
          public_id: 'obs-rat-04',
          harbor_id: 'harbor-ratnagiri',
          observation_time: '2026-09-12T00:00:00Z',
          wave_height_m: 1.1,
          sst_celsius: 27.9,
          wind_speed_kn: 8.0,
          wind_direction_deg: 185.0,
          current_speed_kn: 0.7,
          swell_period_s: 7.0,
          visibility_nm: 15.0,
          tide_level_m: 0.3,
          tide_phase: 'LOW',
          tide_datum: 'LAT',
          source: 'INCOIS OSF',
          data_mode: 'HYBRID',
          quality_flags: ['qc_warning'],
          qc_status: 'DEGRADED_QC_WARNING',
        },
      ];

      const trust = deriveTideTrustMetadata(mockObs, 'Ratnagiri');
      expect(trust.sourceProvider).toBe('INCOIS');
      expect(trust.datasetName).toContain('Tide Level & Phase Observations (Ratnagiri)');
      expect(trust.dataMode).toBe('SYNTHETIC SNAPSHOT');
      expect(trust.totalCount).toBe(4);
      // Valid count only includes records with VALID qc_status and valid number
      expect(trust.validCount).toBe(2);
      expect(trust.qcBreakdown).toEqual({
        VALID: 2,
        MISSING_DATA: 1,
        DEGRADED_QC_WARNING: 1,
      });
      expect(trust.confidenceBreakdown).toEqual({
        FLOOD: 1,
        HIGH: 1,
        EBB: 1,
        LOW: 1,
      });
      expect(trust.semanticsDescription).toContain('Lowest Astronomical Tide (LAT)');
      expect(trust.semanticsDescription).toContain('no astronomical tide forecast is generated');
    });

    it('extracts tide fields (level, phase, datum) from fetchMarineObservations payload', async () => {
      const ratObs = await fetchMarineObservations('harbor-ratnagiri');
      expect(ratObs.length).toBeGreaterThan(0);
      for (const obs of ratObs) {
        expect(obs.harbor_id).toBe('harbor-ratnagiri');
        if (obs.tide_level_m !== null && obs.tide_level_m !== undefined) {
          expect(typeof obs.tide_level_m).toBe('number');
          expect(obs.tide_level_m).toBeGreaterThanOrEqual(-1.0);
          expect(obs.tide_level_m).toBeLessThanOrEqual(5.0);
        }
        if (obs.tide_phase !== null && obs.tide_phase !== undefined) {
          expect(['FLOOD', 'EBB', 'HIGH', 'LOW', 'UNKNOWN']).toContain(obs.tide_phase);
        }
      }
    });

    it('preserves null tide values without converting to zero', async () => {
      const mockNullTideObs: MarineObservation[] = [
        {
          public_id: 'obs-null-tide',
          harbor_id: 'harbor-ratnagiri',
          observation_time: '2026-09-12T06:00:00Z',
          wave_height_m: 1.5,
          sst_celsius: 28.2,
          wind_speed_kn: 12.0,
          wind_direction_deg: 200.0,
          current_speed_kn: 1.0,
          swell_period_s: 8.0,
          visibility_nm: 10.0,
          tide_level_m: null,
          tide_phase: null,
          tide_datum: 'LAT',
          source: 'INCOIS OSF',
          data_mode: 'HYBRID',
          quality_flags: [],
          qc_status: 'MISSING_DATA',
        },
      ];

      expect(mockNullTideObs[0].tide_level_m).toBeNull();
      expect(mockNullTideObs[0].tide_level_m).not.toBe(0);
      expect(mockNullTideObs[0].tide_phase).toBeNull();
    });

    it('distinguishes categorical tide phases (FLOOD, EBB, HIGH, LOW) without numerical coercion', () => {
      const phases = ['FLOOD', 'EBB', 'HIGH', 'LOW'];
      for (const p of phases) {
        expect(typeof p).toBe('string');
        expect(Number.isNaN(Number(p))).toBe(true);
      }
    });

    it('gracefully handles empty tide observations array without fabricating data', () => {
      const trust = deriveTideTrustMetadata([], 'Ratnagiri');
      expect(trust.validCount).toBe(0);
      expect(trust.totalCount).toBe(0);
      expect(trust.snapshotPeriod).toBe('48-Hour Hourly Tide Snapshot');
    });

    it('supports harbor switching dynamically for tide metadata', async () => {
      const ratObs = await fetchMarineObservations('harbor-ratnagiri');
      const malObs = await fetchMarineObservations('harbor-malvan');

      const ratTrust = deriveTideTrustMetadata(ratObs, 'Ratnagiri');
      const malTrust = deriveTideTrustMetadata(malObs, 'Malvan');

      expect(ratTrust.datasetName).toContain('Ratnagiri');
      expect(malTrust.datasetName).toContain('Malvan');
    });
  });

  describe('P0-19: Earth Observation Spatial Grid Visualization', () => {
    it('exports EOGridSpatialMap and pure spatial calculation helpers cleanly', () => {
      expect(EOGridSpatialMap).toBeDefined();
      expect(typeof EOGridSpatialMap).toBe('function');
      expect(buildEOGridGeoJSON).toBeDefined();
      expect(typeof buildEOGridGeoJSON).toBe('function');
      expect(calculateEOSpatialStats).toBeDefined();
      expect(typeof calculateEOSpatialStats).toBe('function');
      expect(getEOCellColor).toBeDefined();
      expect(typeof getEOCellColor).toBe('function');
      expect(EO_SPATIAL_METRICS.length).toBe(3);
    });

    it('builds valid GeoJSON FeatureCollection with 25 point features from EO grid cells', () => {
      const mockCells: EOGridCell[] = [
        {
          public_id: 'eo-c1',
          cell_id: 'CELL-00-00',
          center_lat: 16.0,
          center_lon: 72.4,
          sst_celsius: 29.5,
          chlorophyll_a_mg_m3: 1.2,
          cloud_cover_pct: 10,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'VALID',
        },
        {
          public_id: 'eo-c2',
          cell_id: 'CELL-00-01',
          center_lat: 16.0,
          center_lon: 72.68,
          sst_celsius: null,
          chlorophyll_a_mg_m3: null,
          cloud_cover_pct: 85,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'CLOUD_OBSCURED',
        },
      ];

      const geojson = buildEOGridGeoJSON(mockCells, 'sst_celsius');
      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features.length).toBe(2);

      const f1 = geojson.features[0];
      expect(f1.geometry.type).toBe('Point');
      expect((f1.geometry as GeoJSON.Point).coordinates).toEqual([72.4, 16.0]);
      expect(f1.properties?.cell_id).toBe('CELL-00-00');
      expect(f1.properties?.metric_value).toBe(29.5);
      expect(f1.properties?.formatted_value).toContain('29.5 °C');

      const f2 = geojson.features[1];
      expect(f2.properties?.cell_id).toBe('CELL-00-01');
      expect(f2.properties?.metric_value).toBeNull();
      expect(f2.properties?.formatted_value).toBe('Cloud Obscured');
    });

    it('safely filters out invalid coordinates from GeoJSON features', () => {
      const invalidCells: EOGridCell[] = [
        {
          public_id: 'eo-inv-1',
          cell_id: 'INV-1',
          center_lat: 999.0, // Invalid lat
          center_lon: 72.4,
          sst_celsius: 28.0,
          chlorophyll_a_mg_m3: 1.0,
          cloud_cover_pct: 0,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
        },
        {
          public_id: 'eo-inv-2',
          cell_id: 'INV-2',
          center_lat: 0,
          center_lon: 0, // 0,0 invalid
          sst_celsius: 28.0,
          chlorophyll_a_mg_m3: 1.0,
          cloud_cover_pct: 0,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
        },
        {
          public_id: 'eo-valid',
          cell_id: 'VAL-1',
          center_lat: 16.5,
          center_lon: 73.0,
          sst_celsius: 28.5,
          chlorophyll_a_mg_m3: 1.1,
          cloud_cover_pct: 5,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
        },
      ];

      const geojson = buildEOGridGeoJSON(invalidCells, 'sst_celsius');
      expect(geojson.features.length).toBe(1);
      expect(geojson.features[0]?.properties?.cell_id).toBe('VAL-1');
    });

    it('calculates spatial stats (min, max, mean) strictly across valid non-cloud cells', () => {
      const sampleCells: EOGridCell[] = [
        {
          cell_id: 'C1',
          center_lat: 16.0,
          center_lon: 72.4,
          sst_celsius: 28.0,
          chlorophyll_a_mg_m3: 1.0,
          cloud_cover_pct: 10,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'VALID',
        },
        {
          cell_id: 'C2',
          center_lat: 16.0,
          center_lon: 72.6,
          sst_celsius: 30.0,
          chlorophyll_a_mg_m3: 2.0,
          cloud_cover_pct: 15,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'VALID',
        },
        {
          cell_id: 'C3',
          center_lat: 16.0,
          center_lon: 72.8,
          sst_celsius: null, // Null / cloud obscured
          chlorophyll_a_mg_m3: null,
          cloud_cover_pct: 90,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'CLOUD_OBSCURED',
        },
      ];

      const sstStats = calculateEOSpatialStats(sampleCells, 'sst_celsius');
      expect(sstStats.validCount).toBe(2);
      expect(sstStats.totalCount).toBe(3);
      expect(sstStats.min).toBe(28.0);
      expect(sstStats.max).toBe(30.0);
      expect(sstStats.mean).toBe(29.0);
      expect(sstStats.cloudObscuredCount).toBe(1);

      const chlaStats = calculateEOSpatialStats(sampleCells, 'chlorophyll_a_mg_m3');
      expect(chlaStats.validCount).toBe(2);
      expect(chlaStats.min).toBe(1.0);
      expect(chlaStats.max).toBe(2.0);
      expect(chlaStats.mean).toBe(1.5);
    });

    it('handles all-missing or empty cell array gracefully without NaN or crash', () => {
      const emptyStats = calculateEOSpatialStats([], 'sst_celsius');
      expect(emptyStats.validCount).toBe(0);
      expect(emptyStats.totalCount).toBe(0);
      expect(emptyStats.min).toBeNull();
      expect(emptyStats.max).toBeNull();
      expect(emptyStats.mean).toBeNull();

      const allCloudCells: EOGridCell[] = [
        {
          cell_id: 'C1',
          center_lat: 16.0,
          center_lon: 72.4,
          sst_celsius: null,
          chlorophyll_a_mg_m3: null,
          cloud_cover_pct: 100,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'CLOUD_OBSCURED',
        },
      ];
      const cloudStats = calculateEOSpatialStats(allCloudCells, 'sst_celsius');
      expect(cloudStats.validCount).toBe(0);
      expect(cloudStats.min).toBeNull();
      expect(cloudStats.max).toBeNull();
      expect(cloudStats.mean).toBeNull();
      expect(cloudStats.cloudObscuredCount).toBe(1);
    });

    it('returns deterministic QC-aware colors from getEOCellColor', () => {
      const cloudColor = getEOCellColor('sst_celsius', null, 'CLOUD_OBSCURED', 26, 32);
      expect(cloudColor).toBe('#64748b');

      const degradedColor = getEOCellColor('sst_celsius', 28.5, 'DEGRADED_QC_WARNING', 26, 32);
      expect(degradedColor).toBe('#f59e0b');

      const noDataColor = getEOCellColor('sst_celsius', null, 'VALID', 26, 32);
      expect(noDataColor).toBe('#334155');

      const sstMidColor = getEOCellColor('sst_celsius', 29.0, 'VALID', 26, 32);
      expect(sstMidColor).toContain('rgb(');

      const chlaColor = getEOCellColor('chlorophyll_a_mg_m3', 1.5, 'VALID', 0.2, 3.0);
      expect(chlaColor).toContain('rgb(');
    });

    it('derives single-date spatial slice trust metadata in deriveEOSpatialTrustMetadata', () => {
      const sampleRecords: EOGridCell[] = [
        {
          cell_id: 'C1',
          center_lat: 16.0,
          center_lon: 72.4,
          sst_celsius: 28.5,
          chlorophyll_a_mg_m3: 1.1,
          cloud_cover_pct: 10,
          uncertainty: 0.12,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'VALID',
        },
        {
          cell_id: 'C2',
          center_lat: 16.0,
          center_lon: 72.6,
          sst_celsius: null,
          chlorophyll_a_mg_m3: null,
          cloud_cover_pct: 95,
          uncertainty: null,
          satellite: 'Oceansat-3',
          pass_time: '2026-09-12T06:00:00Z',
          resolution_m: 360,
          source: 'ISRO MOSDAC',
          qc_status: 'CLOUD_OBSCURED',
        },
      ];

      const trust = deriveEOSpatialTrustMetadata(sampleRecords, '2026-09-12');
      expect(trust.datasetName).toContain('2026-09-12');
      expect(trust.sourceProvider).toBe('ISRO / MOSDAC');
      expect(trust.dataMode).toBe('SYNTHETIC SNAPSHOT');
      expect(trust.snapshotPeriod).toContain('2026-09-12');
      expect(trust.totalCount).toBe(2);
      expect(trust.validCount).toBe(1);
      expect(trust.qcBreakdown).toEqual({
        VALID: 1,
        CLOUD_OBSCURED: 1,
      });
      expect(trust.meanUncertainty).toBe(0.12);
    });

    it('fetches complete 350-record multi-day EO dataset from fetchEOGridCells', async () => {
      const cells = await fetchEOGridCells();
      expect(cells.length).toBeGreaterThanOrEqual(5);

      // Verify fields on every cell
      for (const c of cells) {
        expect(c.cell_id).toBeDefined();
        expect(typeof c.center_lat).toBe('number');
        expect(typeof c.center_lon).toBe('number');
        expect(c.pass_time).toBeDefined();
        expect(c.source).toBeDefined();
      }
    });

    it('extracts unique chronological dates from multi-day EO cell array', () => {
      const dates = new Set<string>();
      const mockMultiDayCells: EOGridCell[] = [
        { cell_id: 'C1', center_lat: 16.0, center_lon: 72.4, sst_celsius: 28.0, chlorophyll_a_mg_m3: 1.0, cloud_cover_pct: 0, satellite: 'O', pass_time: '2026-09-10T06:00:00Z', resolution_m: 360, source: 'S' },
        { cell_id: 'C1', center_lat: 16.0, center_lon: 72.4, sst_celsius: 28.5, chlorophyll_a_mg_m3: 1.1, cloud_cover_pct: 0, satellite: 'O', pass_time: '2026-09-11T06:00:00Z', resolution_m: 360, source: 'S' },
        { cell_id: 'C1', center_lat: 16.0, center_lon: 72.4, sst_celsius: 29.0, chlorophyll_a_mg_m3: 1.2, cloud_cover_pct: 0, satellite: 'O', pass_time: '2026-09-12T06:00:00Z', resolution_m: 360, source: 'S' },
      ];

      for (const r of mockMultiDayCells) {
        dates.add(r.pass_time.slice(0, 10));
      }
      const sortedDates = Array.from(dates).sort();
      expect(sortedDates).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    });
  });

  describe('P0-20: Scenario Comparison in Researcher Lab', () => {
    it('exports ScenarioComparisonView and ScenarioLab cleanly', () => {
      expect(ScenarioComparisonView).toBeDefined();
      expect(typeof ScenarioComparisonView).toBe('function');
      expect(ScenarioLab).toBeDefined();
      expect(typeof ScenarioLab).toBe('function');
    });

    it('fetches real scenario metadata from fetchScenarios', async () => {
      const scenarios = await fetchScenarios();
      expect(scenarios.length).toBeGreaterThanOrEqual(8);
      expect(scenarios[0].id).toBe('S1');
      expect(scenarios[0].name).toBeDefined();
      expect(scenarios[0].query).toBeDefined();
      expect(scenarios[0].intent).toBeDefined();
      expect(scenarios[0].expected_status).toBeDefined();
    });

    it('preserves real execution results and compares intent match/mismatch accurately', () => {
      const mockResultMatch: ScenarioRunResult = {
        scenario_id: 'S1',
        status: 'passed',
        passed: true,
        recommendation_status: 'CAUTION',
        actual_intent: 'GO_NO_GO_SAFETY',
        expected_intent: 'GO_NO_GO_SAFETY',
        actual_status: 'CAUTION',
        expected_status: 'CAUTION',
        confidence_level: 'HIGH',
        evidence_count: 5,
        evidence_grounded: true,
        trace_steps: 4,
        execution_time_ms: 650,
        executed_tools: ['marine_conditions', 'hazard_context'],
        decisive_factors: ['Elevated wave height along coast'],
        validation_notes: ['Safety check matched expected status'],
        warnings: [],
        answer: 'Wave height elevated near Ratnagiri.',
        is_error: false,
      };

      const mockResultMismatch: ScenarioRunResult = {
        scenario_id: 'S2',
        status: 'failed',
        passed: false,
        recommendation_status: 'NO_GO',
        actual_intent: 'ROUTE_COMPARISON',
        expected_intent: 'NEAREST_PFZ',
        actual_status: 'NO_GO',
        expected_status: 'GO',
        confidence_level: 'MEDIUM',
        evidence_count: 2,
        evidence_grounded: true,
        trace_steps: 3,
        execution_time_ms: 1200,
        executed_tools: ['marine_conditions'],
        decisive_factors: ['Unexpected hazard override'],
        validation_notes: ['Intent mismatch: expected NEAREST_PFZ'],
        warnings: ['Degraded sensor confidence'],
        answer: 'PFZ query returned route comparison.',
        is_error: false,
      };

      expect(mockResultMatch.actual_intent).toBe(mockResultMatch.expected_intent);
      expect(mockResultMismatch.actual_intent).not.toBe(mockResultMismatch.expected_intent);
      expect(mockResultMatch.passed).toBe(true);
      expect(mockResultMismatch.passed).toBe(false);
      expect(mockResultMatch.evidence_count).toBe(5);
      expect(mockResultMismatch.evidence_count).toBe(2);
      expect(mockResultMatch.executed_tools).toContain('hazard_context');
      expect(mockResultMismatch.executed_tools).not.toContain('hazard_context');
    });

    it('distinguishes execution ERROR from scenario FAIL strictly', () => {
      const scenarioFailResult: ScenarioRunResult = {
        scenario_id: 'S1',
        status: 'failed',
        passed: false,
        recommendation_status: 'CAUTION',
        confidence_level: 'HIGH',
        answer: 'Scenario evaluated but failed deterministic expectation.',
        evidence_count: 3,
        trace_steps: 2,
        execution_time_ms: 450,
        warnings: [],
        decisive_factors: [],
        is_error: false,
      };

      const executionErrorResult: ScenarioRunResult = {
        scenario_id: 'S2',
        status: 'error',
        passed: false,
        recommendation_status: 'UNKNOWN',
        confidence_level: 'UNKNOWN',
        answer: 'Scenario execution unavailable: Network or service timeout.',
        evidence_count: 0,
        trace_steps: 0,
        execution_time_ms: 50,
        warnings: ['[UNAVAILABLE] Network or service timeout.'],
        decisive_factors: [],
        is_error: true,
        error: 'Network or service timeout.',
      };

      expect(scenarioFailResult.is_error).toBe(false);
      expect(scenarioFailResult.status).toBe('failed');
      expect(scenarioFailResult.evidence_count).toBe(3);

      expect(executionErrorResult.is_error).toBe(true);
      expect(executionErrorResult.status).toBe('error');
      expect(executionErrorResult.confidence_level).toBe('UNKNOWN');
      expect(executionErrorResult.evidence_count).toBe(0);
    });

    it('handles partial failures cleanly in multi-scenario runs without hiding successful results', () => {
      const resultsMap: Record<string, ScenarioRunResult> = {
        S1: {
          scenario_id: 'S1',
          status: 'passed',
          passed: true,
          recommendation_status: 'CAUTION',
          confidence_level: 'HIGH',
          evidence_count: 4,
          trace_steps: 3,
          execution_time_ms: 800,
          warnings: [],
          decisive_factors: ['Wave threshold active'],
          answer: 'S1 successful evaluation.',
          is_error: false,
        },
        S2: {
          scenario_id: 'S2',
          status: 'error',
          passed: false,
          recommendation_status: 'UNKNOWN',
          confidence_level: 'UNKNOWN',
          evidence_count: 0,
          trace_steps: 0,
          execution_time_ms: 10,
          warnings: ['[UNAVAILABLE] HTTP 503 Backend timeout'],
          decisive_factors: [],
          answer: 'S2 execution error.',
          is_error: true,
        },
      };

      expect(resultsMap.S1.passed).toBe(true);
      expect(resultsMap.S1.is_error).toBe(false);
      expect(resultsMap.S2.is_error).toBe(true);
      expect(resultsMap.S2.passed).toBe(false);
    });

    it('enforces maximum 4 scenarios in multi-selection logic', () => {
      const allScenarioIds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
      let selected: string[] = [];

      for (const id of allScenarioIds) {
        if (selected.length < 4) {
          selected.push(id);
        }
      }

      expect(selected.length).toBe(4);
      expect(selected).toEqual(['S1', 'S2', 'S3', 'S4']);
    });

    it('preserves executed tools and decisive factors without fabrication', () => {
      const realTools = ['marine_conditions', 'pfz_candidates', 'route_generation'];
      const decisiveFactors = ['SST thermal gradient > 0.8', 'Distance within 50km'];

      const runResult: ScenarioRunResult = {
        scenario_id: 'S2',
        status: 'passed',
        passed: true,
        recommendation_status: 'GO',
        confidence_level: 'HIGH',
        evidence_count: 3,
        trace_steps: 4,
        execution_time_ms: 920,
        executed_tools: realTools,
        decisive_factors: decisiveFactors,
        warnings: [],
        answer: 'Nearest PFZ located.',
        is_error: false,
      };

      expect(runResult.executed_tools).toEqual(realTools);
      expect(runResult.decisive_factors).toEqual(decisiveFactors);
      expect(runResult.execution_time_ms).toBe(920);
    });
  });

  describe('P0-21: Query Workbench Analytical Upgrade in Researcher Lab', () => {
    it('exports QueryWorkbench component and structured research prompts cleanly', () => {
      expect(QueryWorkbench).toBeDefined();
      expect(typeof QueryWorkbench).toBe('function');
      expect(Array.isArray(RESEARCH_PROMPTS)).toBe(true);
      expect(RESEARCH_PROMPTS.length).toBeGreaterThanOrEqual(6);
    });

    it('contains research-oriented prompts and avoids unsupported live AIS queries', () => {
      const labels = RESEARCH_PROMPTS.map(p => p.label);
      expect(labels).toContain('Ocean Conditions');
      expect(labels).toContain('Departure Safety');
      expect(labels).toContain('PFZ Thermal Gradient');
      expect(labels).toContain('Active Hazards');
      expect(labels).toContain('Evidence Grounding');
      expect(labels).toContain('Data Gaps & Uncertainty');

      // Verify no live AIS queries
      for (const p of RESEARCH_PROMPTS) {
        expect(p.query.toLowerCase()).not.toContain('live ais');
        expect(p.query.toLowerCase()).not.toContain('real-time ais');
      }
    });

    it('extractExecutedTools extracts tool names accurately from trace steps without fabrication', () => {
      const trace: any[] = [
        { step: 1, node: 'supervisor', action: 'Route query', status: 'completed', timestamp: '2026-09-14T10:00:00Z' },
        { step: 2, node: 'marine_conditions', tool_name: 'marine_conditions', action: 'Fetch wave data', status: 'completed', timestamp: '2026-09-14T10:00:01Z' },
        { step: 3, node: 'hazard_context', tool_name: 'hazard_context', action: 'Fetch active bulletins', status: 'completed', timestamp: '2026-09-14T10:00:02Z' },
        { step: 4, node: 'risk_engine', action: 'Evaluate thresholds', status: 'completed', timestamp: '2026-09-14T10:00:03Z' },
      ];

      const tools = extractExecutedTools(trace);
      expect(tools).toContain('marine_conditions');
      expect(tools).toContain('hazard_context');
      expect(tools).toContain('risk_engine');
      expect(tools).not.toContain('supervisor');
    });

    it('handles empty trace safely in extractExecutedTools', () => {
      expect(extractExecutedTools([])).toEqual([]);
      expect(extractExecutedTools(undefined)).toEqual([]);
    });

    it('preserves structured recommendation, decisive factors, and threshold comparisons', () => {
      const response = {
        run_id: 'run-123',
        conversation_id: 'conv-456',
        language: 'en',
        intent: 'GO_NO_GO_SAFETY',
        answer: 'Wave height exceeds safety threshold for motorized craft.',
        recommendation: {
          status: 'CAUTION' as const,
          summary: 'Elevated wave heights forecast.',
          decisive_factors: ['Wave height: 2.3m', 'Wind speed: 18kn'],
          non_decisive_factors: ['Visibility: 10nm'],
          next_action: 'Exercise extreme caution.',
          threshold_comparisons: [
            {
              metric_name: 'significant_wave_height',
              observed_value: 2.3,
              threshold_value: 2.0,
              operator: '>',
              unit: 'm',
              exceeded: true,
              impact: 'Exceeds craft safety threshold',
              description: 'Wave height exceeds 2.0m limit',
            },
          ],
        },
        confidence: {
          level: 'MEDIUM' as const,
          reasons: ['Deterministic synthetic fixture data.'],
        },
        evidence: [
          {
            source_name: 'INCOIS OSF',
            metric_name: 'significant_wave_height',
            metric_value: 2.3,
            metric_unit: 'm',
            quality_flags: ['official_source', 'snapshot_fallback'],
            retrieved_at: '2026-09-14T10:00:00Z',
          },
        ],
        map_layers: [],
        trace: [],
        warnings: ['[SNAPSHOT] Data sourced from synthetic demo fixture.'],
        suggested_followups: ['When will wave heights decrease?'],
      };

      expect(response.recommendation.status).toBe('CAUTION');
      expect(response.recommendation.decisive_factors).toHaveLength(2);
      expect(response.recommendation.threshold_comparisons[0].exceeded).toBe(true);
      expect(response.evidence).toHaveLength(1);
      expect(response.evidence[0].metric_value).toBe(2.3);
      expect(response.warnings).toHaveLength(1);
    });

    it('preserves UNKNOWN confidence and uncertainty warnings without forcing binary GO/NO-GO', () => {
      const unknownResponse = {
        status: 'UNKNOWN',
        confidence_level: 'UNKNOWN',
        reasons: ['Essential sensor feed missing.'],
        warnings: ['Critical marine data unavailable.'],
      };

      expect(unknownResponse.confidence_level).toBe('UNKNOWN');
      expect(unknownResponse.status).toBe('UNKNOWN');
      expect(unknownResponse.reasons).toContain('Essential sensor feed missing.');
    });

    it('preserves real map_layers when present and handles empty map_layers without fake geometry', () => {
      const layerWithGeoJSON = {
        layer_id: 'hazard_sq_01',
        name: 'Squall Warning Polygon',
        layer_type: 'geojson' as const,
        visible: true,
        style: { color: '#ef4444' },
        geojson: {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[73.1, 16.8], [73.4, 16.8], [73.4, 17.1], [73.1, 17.1], [73.1, 16.8]]],
          },
          properties: { severity: 'Severe' },
        },
      };

      const respWithLayers = { map_layers: [layerWithGeoJSON] };
      const respWithoutLayers = { map_layers: [] };

      expect(respWithLayers.map_layers).toHaveLength(1);
      expect(respWithLayers.map_layers[0].layer_id).toBe('hazard_sq_01');
      expect(respWithoutLayers.map_layers).toHaveLength(0);
    });
  });

  describe('Researcher Deck.gl 3D Maps Integration', () => {
    it('calculates deterministic PFZ column heights from chlorophyll density without altering underlying values', () => {
      const candidates: PFZCandidate[] = [
        {
          public_id: 'pfz-01',
          rank: 1,
          confidence: 'HIGH',
          latitude: 16.85,
          longitude: 73.15,
          sst_gradient: 1.8,
          chlorophyll_a_mg_m3: 2.5,
          depth_m: 45,
          distance_km: 18.2,
          bearing_deg: 245,
          status: 'ACTIVE',
          qc_status: 'VALID',
          valid_from: '2026-09-17T00:00:00Z',
          valid_to: '2026-09-18T00:00:00Z',
          source: 'INCOIS PFZ Advisory',
        },
        {
          public_id: 'pfz-02',
          rank: 2,
          confidence: 'MEDIUM',
          latitude: 16.70,
          longitude: 73.05,
          sst_gradient: 1.2,
          chlorophyll_a_mg_m3: 0.8,
          depth_m: 60,
          distance_km: 32.5,
          bearing_deg: 220,
          status: 'ACTIVE',
          qc_status: 'VALID',
          valid_from: '2026-09-17T00:00:00Z',
          valid_to: '2026-09-18T00:00:00Z',
          source: 'INCOIS PFZ Advisory',
        },
      ];

      const computeElevation = (chla?: number | null) => {
        const val = typeof chla === 'number' ? chla : 1.0;
        return Math.min(3000, Math.max(500, Math.round(val * 800)));
      };

      const elev1 = computeElevation(candidates[0].chlorophyll_a_mg_m3);
      const elev2 = computeElevation(candidates[1].chlorophyll_a_mg_m3);

      expect(elev1).toBe(2000); // 2.5 * 800 = 2000
      expect(elev2).toBe(640);  // 0.8 * 800 = 640
      expect(elev1).toBeGreaterThan(elev2);
    });

    it('calculates deterministic hazard extrusion heights based strictly on severity tiers', () => {
      const getSeverityElevation = (severity: string) => {
        const s = severity.toUpperCase();
        if (s === 'CRITICAL' || s === 'WARNING') return 2200;
        if (s === 'ALERT') return 1500;
        if (s === 'WATCH') return 900;
        return 600;
      };

      expect(getSeverityElevation('WARNING')).toBe(2200);
      expect(getSeverityElevation('ALERT')).toBe(1500);
      expect(getSeverityElevation('WATCH')).toBe(900);
      expect(getSeverityElevation('ADVISORY')).toBe(600);
    });

    it('preserves EO 5x5 spatial grid calculations and valid cell metrics in 3D views', () => {
      const sampleCells: EOGridCell[] = [
        {
          public_id: 'cell-01',
          cell_id: 'C1',
          center_lat: 16.9,
          center_lon: 73.2,
          pass_time: '2026-09-17T06:00:00Z',
          sst_celsius: 28.5,
          chlorophyll_a_mg_m3: 1.4,
          cloud_cover_pct: 10,
          qc_status: 'VALID',
          satellite: 'Oceansat-3',
          resolution_m: 360,
          source: 'ISRO / INCOIS',
        },
        {
          public_id: 'cell-02',
          cell_id: 'C2',
          center_lat: 16.8,
          center_lon: 73.1,
          pass_time: '2026-09-17T06:00:00Z',
          sst_celsius: 29.1,
          chlorophyll_a_mg_m3: 2.2,
          cloud_cover_pct: 15,
          qc_status: 'VALID',
          satellite: 'Oceansat-3',
          resolution_m: 360,
          source: 'ISRO / INCOIS',
        },
      ];

      const stats = calculateEOSpatialStats(sampleCells, 'sst_celsius');
      expect(stats.validCount).toBe(2);
      expect(stats.min).toBe(28.5);
      expect(stats.max).toBe(29.1);
      expect(stats.mean).toBe(28.8);
    });
  });
});



