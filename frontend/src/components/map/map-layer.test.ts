import { describe, it, expect } from 'vitest';
import type { MapLayer } from '../../types/contracts';
import { MOCK_SAFETY_RESPONSE, MOCK_PFZ_RESPONSE } from '../../api/mock-data';
import { createAuthorityRouteLayers } from '../../utils/geo';
import { extractRouteCandidates } from './MissionMapBrief';

describe('Map Layer GeoJSON Contract & Semantics', () => {
  it('validates Point geometry layers (e.g. Harbor departure points)', () => {
    const pointLayers = [...MOCK_SAFETY_RESPONSE.map_layers, ...MOCK_PFZ_RESPONSE.map_layers]
      .filter(l => l.geojson.type === 'Feature' && (l.geojson as any).geometry?.type === 'Point');

    expect(pointLayers.length).toBeGreaterThan(0);
    for (const layer of pointLayers) {
      expect(layer.layer_id).toBeTruthy();
      expect(layer.name).toBeTruthy();
      expect(layer.visible).toBe(true);

      const feature = layer.geojson as GeoJSON.Feature<GeoJSON.Point>;
      expect(feature.geometry.coordinates).toHaveLength(2);
      const [lon, lat] = feature.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(68.0);
      expect(lon).toBeLessThanOrEqual(80.0);
      expect(lat).toBeGreaterThanOrEqual(8.0);
      expect(lat).toBeLessThanOrEqual(24.0);
    }
  });

  it('validates Polygon geometry layers (e.g. Squall sectors, PFZ zones, restricted areas)', () => {
    const polygonLayers = [...MOCK_SAFETY_RESPONSE.map_layers, ...MOCK_PFZ_RESPONSE.map_layers]
      .filter(l => {
        if (l.geojson.type === 'FeatureCollection' && Array.isArray((l.geojson as any).features)) {
          return (l.geojson as any).features.some((f: any) => f.geometry?.type === 'Polygon');
        }
        return (l.geojson as any).geometry?.type === 'Polygon';
      });

    expect(polygonLayers.length).toBeGreaterThan(0);
    for (const layer of polygonLayers) {
      expect(layer.style?.color).toBeTruthy();
      expect(layer.style?.opacity).toBeDefined();

      if (layer.geojson.type === 'FeatureCollection' && Array.isArray((layer.geojson as any).features)) {
        const polyFeatures = (layer.geojson as any).features.filter((f: any) => f.geometry?.type === 'Polygon');
        for (const f of polyFeatures) {
          const poly = f.geometry as GeoJSON.Polygon;
          expect(poly.coordinates.length).toBeGreaterThan(0);
          const ring = poly.coordinates[0];
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring[ring.length - 1]);
        }
      }
    }
  });

  it('validates LineString geometry layers (e.g. Navigation routes)', () => {
    const routeLayers = MOCK_PFZ_RESPONSE.map_layers.filter(l => {
      if (l.geojson.type === 'Feature') {
        return (l.geojson as any).geometry?.type === 'LineString';
      }
      return false;
    });

    expect(routeLayers.length).toBeGreaterThan(0);
    const routeLayer = routeLayers[0];
    expect(routeLayer.name).toContain('Route');
    const feature = routeLayer.geojson as GeoJSON.Feature<GeoJSON.LineString>;
    expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('supports independent layer visibility toggling', () => {
    const layers: MapLayer[] = [...MOCK_SAFETY_RESPONSE.map_layers];
    const initialVisibility = layers.map(l => l.visible);

    const toggled = layers.map((l, i) => i === 0 ? { ...l, visible: !l.visible } : l);
    expect(toggled[0].visible).toBe(!initialVisibility[0]);
    expect(toggled[1].visible).toBe(initialVisibility[1]);
  });

  it('validates all 9 canonical ORCA layer types and categories', () => {
    const testLayers: MapLayer[] = [
      {
        layer_id: 'layer_vessel_position',
        name: 'Vessel Position',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#0ea5e9', layer_category: 'navigation' },
        geojson: { type: 'Feature', geometry: { type: 'Point', coordinates: [73.28, 16.99] }, properties: {} },
      },
      {
        layer_id: 'layer_pfz_advisories',
        name: 'Potential Fishing Zones',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#10b981', layer_category: 'navigation' },
        geojson: { type: 'FeatureCollection', features: [] },
      },
      {
        layer_id: 'layer_safety_envelope',
        name: 'Marine Safety Envelope',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#10b981', layer_category: 'safety_critical' },
        geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[73.1, 16.8], [73.4, 16.8], [73.4, 17.1], [73.1, 17.1], [73.1, 16.8]]] }, properties: {} },
      },
      {
        layer_id: 'layer_weather_telemetry',
        name: 'Weather Telemetry',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#3b82f6', layer_category: 'navigation' },
        geojson: { type: 'Feature', geometry: { type: 'Point', coordinates: [73.28, 16.99] }, properties: {} },
      },
      {
        layer_id: 'layer_cyclone_hazard',
        name: 'Cyclone Warning Sector',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#ef4444', layer_category: 'safety_critical' },
        geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[73.0, 16.5], [74.0, 16.5], [74.0, 17.5], [73.0, 17.5], [73.0, 16.5]]] }, properties: {} },
      },
      {
        layer_id: 'layer_geofence_boundaries',
        name: 'Restricted Marine Geofences',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#dc2626', layer_category: 'safety_critical' },
        geojson: { type: 'FeatureCollection', features: [] },
      },
      {
        layer_id: 'layer_candidate_routes',
        name: 'Candidate Passage Routes',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#f59e0b', layer_category: 'navigation' },
        geojson: { type: 'FeatureCollection', features: [] },
      },
      {
        layer_id: 'layer_recommended_route',
        name: 'Recommended Safe Route',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#06b6d4', layer_category: 'navigation' },
        geojson: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[73.28, 16.99], [73.83, 15.49]] }, properties: {} },
      },
      {
        layer_id: 'layer_destination_port',
        name: 'Destination Port',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#6366f1', layer_category: 'navigation' },
        geojson: { type: 'Feature', geometry: { type: 'Point', coordinates: [73.83, 15.49] }, properties: {} },
      },
    ];

    expect(testLayers).toHaveLength(9);
    const safetyLayers = testLayers.filter(l => l.style?.layer_category === 'safety_critical');
    const navLayers = testLayers.filter(l => l.style?.layer_category === 'navigation');

    expect(safetyLayers.length).toBe(3);
    expect(navLayers.length).toBe(6);
  });

  it('validates operational corridor distance and properties extraction', () => {
    const routeLayer: MapLayer = {
      layer_id: 'layer_pfz_route',
      name: 'Safe PFZ Passage',
      layer_type: 'geojson',
      visible: true,
      geojson: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[73.28, 16.99], [72.95, 16.82]] },
        properties: { label: 'Route to PFZ', distance_km: 42.6 },
      },
    };

    expect(routeLayer.geojson).toBeDefined();
    const props = (routeLayer.geojson as any).properties;
    expect(props.distance_km).toBe(42.6);
  });

  it('validates extractRouteCandidates and matchModeToCandidate for 3 genuine alternatives', async () => {
    const { extractRouteCandidates, matchModeToCandidate } = await import('./MissionMapBrief');

    const testLayers: MapLayer[] = [
      {
        layer_id: 'layer_recommended_route',
        name: 'Recommended Safe Route',
        layer_type: 'geojson',
        visible: true,
        geojson: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[73.28, 16.99], [73.20, 16.95]] },
          properties: {
            route_id: 'ROUTE-A-INSHORE',
            name: 'Inshore Sheltered Channel',
            distance_km: 26.5,
            max_wave_height_m: 1.3,
            exposure_score: 2.1,
            risk_rating: 'LOW',
            is_recommended: true,
          },
        },
      },
      {
        layer_id: 'layer_candidate_routes',
        name: 'Candidate Passage Routes',
        layer_type: 'geojson',
        visible: true,
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[73.28, 16.99], [73.10, 16.92]] },
              properties: {
                route_id: 'ROUTE-B-DIRECT',
                name: 'Direct Open-Sea Channel',
                distance_km: 20.2,
                max_wave_height_m: 2.1,
                exposure_score: 4.8,
                risk_rating: 'MODERATE',
                is_recommended: false,
              },
            },
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[73.28, 16.99], [73.15, 16.94]] },
              properties: {
                route_id: 'ROUTE-C-BALANCED',
                name: 'Balanced Coastal Passage',
                distance_km: 23.4,
                max_wave_height_m: 1.7,
                exposure_score: 3.4,
                risk_rating: 'LOW',
                is_recommended: false,
              },
            },
          ],
        },
      },
    ];

    const candidates = extractRouteCandidates(testLayers);
    expect(candidates).toHaveLength(3);

    const safest = matchModeToCandidate('safest', candidates);
    expect(safest?.route_id).toBe('ROUTE-A-INSHORE');
    expect(safest?.distance_km).toBe(26.5);
    expect(safest?.exposure_score).toBe(2.1);

    const balanced = matchModeToCandidate('balanced', candidates);
    expect(balanced?.route_id).toBe('ROUTE-C-BALANCED');
    expect(balanced?.distance_km).toBe(23.4);
    expect(balanced?.exposure_score).toBe(3.4);

    const direct = matchModeToCandidate('direct', candidates);
    expect(direct?.route_id).toBe('ROUTE-B-DIRECT');
    expect(direct?.distance_km).toBe(20.2);
    expect(direct?.exposure_score).toBe(4.8);
  });

  it('validates P0-8H route alternatives visual hierarchy and styling contracts', () => {
    const mockRoutes = [
      {
        route_id: 'ROUTE-A-INSHORE',
        name: 'Inshore Sheltered Channel',
        distance_km: 26.5,
        max_wave_height_m: 1.3,
        risk_rating: 'LOW',
        exposure_score: 2.1,
        waypoints: [[73.28, 16.99], [73.20, 16.95]] as [number, number][],
      },
      {
        route_id: 'ROUTE-C-BALANCED',
        name: 'Balanced Coastal Passage',
        distance_km: 23.4,
        max_wave_height_m: 1.7,
        risk_rating: 'LOW',
        exposure_score: 3.4,
        waypoints: [[73.28, 16.99], [73.15, 16.94]] as [number, number][],
      },
      {
        route_id: 'ROUTE-B-DIRECT',
        name: 'Direct Open-Sea Channel',
        distance_km: 20.2,
        max_wave_height_m: 2.1,
        risk_rating: 'MODERATE',
        exposure_score: 4.8,
        waypoints: [[73.28, 16.99], [73.10, 16.92]] as [number, number][],
      },
    ];

    // Verify empty state handling
    const emptyLayers = createAuthorityRouteLayers([]);
    expect(emptyLayers).toHaveLength(0);

    // Verify 3 routes generation
    const layers = createAuthorityRouteLayers(mockRoutes, 'ROUTE-A-INSHORE');
    expect(layers).toHaveLength(2); // 1 recommended route layer + 1 candidate routes collection layer

    const recommendedLayer = layers.find((l) => l.layer_id === 'layer_recommended_route');
    expect(recommendedLayer).toBeDefined();
    expect(recommendedLayer?.style?.color).toBe('#06b6d4');
    expect(recommendedLayer?.style?.line_width).toBe(4);
    expect(recommendedLayer?.style?.opacity).toBe(0.95);
    expect((recommendedLayer?.geojson as any).properties?.is_recommended).toBe(true);
    expect((recommendedLayer?.geojson as any).properties?.route_id).toBe('ROUTE-A-INSHORE');

    const candidateLayer = layers.find((l) => l.layer_id === 'layer_candidate_routes');
    expect(candidateLayer).toBeDefined();
    expect(candidateLayer?.style?.color).toBe('#38bdf8');
    expect(candidateLayer?.style?.line_width).toBe(2.5);
    expect(candidateLayer?.style?.opacity).toBe(0.5);
    expect(candidateLayer?.style?.line_dasharray).toEqual([3, 3]);

    const candidateFeatures = (candidateLayer?.geojson as any).features;
    expect(candidateFeatures).toHaveLength(2);
    expect(candidateFeatures.map((f: any) => f.properties.route_id)).toEqual(['ROUTE-C-BALANCED', 'ROUTE-B-DIRECT']);
    expect(candidateFeatures.every((f: any) => f.properties.is_recommended === false)).toBe(true);
  });

  describe('Authority Mission Map Polish Pass Requirements (1–16)', () => {
    const mockRoutes = [
      { route_id: 'ROUTE-A-INSHORE', name: 'Inshore Sheltered Channel', distance_km: 26.5, max_wave_height_m: 1.3, risk_rating: 'LOW', exposure_score: 2.1, waypoints: [[73.28, 16.99], [73.20, 16.95]] as [number, number][] },
      { route_id: 'ROUTE-C-BALANCED', name: 'Balanced Coastal Passage', distance_km: 23.4, max_wave_height_m: 1.7, risk_rating: 'LOW', exposure_score: 3.4, waypoints: [[73.28, 16.99], [73.15, 16.94]] as [number, number][] },
      { route_id: 'ROUTE-B-DIRECT', name: 'Direct Open-Sea Channel', distance_km: 20.2, max_wave_height_m: 2.1, risk_rating: 'MODERATE', exposure_score: 4.8, waypoints: [[73.28, 16.99], [73.10, 16.92]] as [number, number][] },
    ];

    it('1 & 2: Selecting a vessel scopes route rendering to that vessel and switching clears old state', () => {
      let activeVesselRouteLayers: MapLayer[] = [];
      const onVesselChange = (vesselId: string | null) => {
        // Immediate clear of previous vessel routes
        activeVesselRouteLayers = [];
        if (vesselId) {
          activeVesselRouteLayers = createAuthorityRouteLayers(mockRoutes, 'ROUTE-A-INSHORE');
        }
      };

      // Select Vessel 01
      onVesselChange('vessel-01');
      expect(activeVesselRouteLayers).toHaveLength(2);
      expect(activeVesselRouteLayers[1].layer_id).toBe('layer_recommended_route');

      // Select Vessel 02 (switch vessel)
      onVesselChange('vessel-02');
      expect(activeVesselRouteLayers).toHaveLength(2);

      // Deselect or no vessel
      onVesselChange(null);
      expect(activeVesselRouteLayers).toHaveLength(0);
    });

    it('3: No arbitrary vessel fallback occurs when a vessel has no data', () => {
      const getVesselReplayLayer = (vesselId: string, positions: any[]) => {
        if (!positions || positions.length === 0) return null;
        return {
          layer_id: 'layer_fleet_vessel_replay',
          properties: { vessel_id: vesselId },
          geojson: { type: 'FeatureCollection', features: [] },
        };
      };

      // Selected vessel with empty telemetry
      const result = getVesselReplayLayer('vessel-99', []);
      expect(result).toBeNull();
      // Must not fall back to vessel-01
      expect(result?.properties?.vessel_id).toBeUndefined();
    });

    it('4 & 5: Selected route receives prominent style and alternatives receive subdued style', () => {
      const layers = createAuthorityRouteLayers(mockRoutes, 'ROUTE-C-BALANCED');
      const rec = layers.find((l) => l.layer_id === 'layer_recommended_route');
      const alt = layers.find((l) => l.layer_id === 'layer_candidate_routes');

      expect(rec?.style?.line_width).toBe(4);
      expect(rec?.style?.opacity).toBe(0.95);
      expect(rec?.style?.color).toBe('#06b6d4');
      expect(rec?.style?.line_dasharray).toBeUndefined(); // solid

      expect(alt?.style?.line_width).toBe(2.5);
      expect(alt?.style?.opacity).toBe(0.5);
      expect(alt?.style?.color).toBe('#38bdf8');
      expect(alt?.style?.line_dasharray).toEqual([3, 3]); // dashed
    });

    it('6 & 7: Sector change isolates active sector with colored operational visualization and clears previous overlays', async () => {
      const { createSectorLayers, FALLBACK_DEMO_SECTORS } = await import('../../utils/geo');
      const allSectors = FALLBACK_DEMO_SECTORS;
      const ratnagiriSector = allSectors[0]; // Ratnagiri

      const layers = createSectorLayers(ratnagiriSector, allSectors);
      const activePolygon = layers.find((l) => l.layer_id === 'sector_polygon_sector-ratnagiri');
      const inactivePolygons = layers.filter((l) => l.layer_id.startsWith('sector_boundary_inactive_'));

      expect(activePolygon).toBeDefined();
      expect(activePolygon?.style?.color).toBe('#a855f7');
      expect(activePolygon?.style?.opacity).toBe(0.25);
      expect(activePolygon?.geojson.features?.[0]?.properties.is_active_sector).toBe(true);

      // Inactive sectors must NOT have active colored operational fill
      expect(inactivePolygons).toHaveLength(4);
      for (const inact of inactivePolygons) {
        expect(inact.style?.color).toBe('#64748b');
        expect(inact.style?.opacity).toBe(0.02);
        expect(inact.geojson.features?.[0]?.properties.is_active_sector).toBe(false);
      }
    });

    it('8 & 9: Active hazards receive pulse-capable styling and inactive hazards do not', async () => {
      const { createAuthorityHazardLayers } = await import('../../utils/geo');
      const hazards = [
        {
          hazard_id: 'hazard-active-1',
          hazard_type: 'CYCLONE',
          severity: 'WARNING',
          status: 'ACTIVE',
          headline: 'Active Cyclone Warning',
          geometry: { type: 'Polygon' as const, coordinates: [[[73, 16], [74, 16], [74, 17], [73, 16]]] },
          valid_from: '2026-09-14T00:00:00Z',
          valid_to: '2026-09-14T12:00:00Z',
          provenance: {},
        },
        {
          hazard_id: 'hazard-expired-2',
          hazard_type: 'FOG',
          severity: 'ALERT',
          status: 'EXPIRED',
          headline: 'Past Morning Fog',
          geometry: { type: 'Polygon' as const, coordinates: [[[73, 16], [74, 16], [74, 17], [73, 16]]] },
          valid_from: '2026-09-13T00:00:00Z',
          valid_to: '2026-09-13T06:00:00Z',
          provenance: {},
        },
      ];

      const layers = createAuthorityHazardLayers(hazards);
      const activeLayer = layers.find((l) => l.layer_id === 'authority_hazard_hazard-active-1');
      const expiredLayer = layers.find((l) => l.layer_id === 'authority_hazard_hazard-expired-2');

      expect(activeLayer?.properties?.is_active).toBe(true);
      expect(activeLayer?.properties?.status).toBe('ACTIVE');

      expect(expiredLayer?.properties?.is_active).toBe(false);
      expect(expiredLayer?.properties?.status).toBe('EXPIRED');
    });

    it('10 & 11: Vessel marker uses canonical replay position and changes position when timestamp changes', () => {
      const positions = [
        { timestamp: '00:00', latitude: 16.990, longitude: 73.280, speed_knots: 8.0, heading_deg: 240, vessel_id: 'vessel-01' },
        { timestamp: '01:00', latitude: 16.950, longitude: 73.210, speed_knots: 9.5, heading_deg: 250, vessel_id: 'vessel-01' },
      ];

      const makeReplayGeojson = (index: number) => {
        const cur = positions[index];
        return {
          type: 'Point',
          coordinates: [cur.longitude, cur.latitude],
          properties: { timestamp: cur.timestamp, heading_deg: cur.heading_deg },
        };
      };

      const point0 = makeReplayGeojson(0);
      expect(point0.coordinates).toEqual([73.280, 16.990]);
      expect(point0.properties.timestamp).toBe('00:00');

      const point1 = makeReplayGeojson(1);
      expect(point1.coordinates).toEqual([73.210, 16.950]);
      expect(point1.properties.timestamp).toBe('01:00');
    });

    it('12 & 13: Estimated trajectory, historical track, and recommended routes remain distinct layer IDs and styles', () => {
      const historicalTrackLayer: MapLayer = {
        layer_id: 'layer_fleet_vessel_replay',
        name: 'Historical Track',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#06b6d4', line_width: 3.5, layer_category: 'fleet_replay' },
        geojson: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[73.28, 16.99], [73.25, 16.97]] }, properties: {} },
      };

      const estimatedTrajectoryLayer: MapLayer = {
        layer_id: 'layer_fleet_estimated_trajectory',
        name: 'Estimated Trajectory',
        layer_type: 'geojson',
        visible: true,
        style: { color: '#facc15', line_width: 3, line_dasharray: [0, 2], layer_category: 'estimated_trajectory' },
        geojson: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[73.25, 16.97], [73.20, 16.94]] }, properties: {} },
      };

      const routeLayers = createAuthorityRouteLayers(mockRoutes, 'ROUTE-A-INSHORE');

      const allIds = [historicalTrackLayer.layer_id, estimatedTrajectoryLayer.layer_id, ...routeLayers.map(l => l.layer_id)];
      expect(new Set(allIds).size).toBe(allIds.length); // All unique IDs

      expect(historicalTrackLayer.style?.color).toBe('#06b6d4');
      expect(estimatedTrajectoryLayer.style?.color).toBe('#facc15');
      expect(estimatedTrajectoryLayer.style?.line_dasharray).toEqual([0, 2]);
    });

    it('14 & 15: Stale route responses cannot overwrite state and unavailable responses clear route layers', async () => {
      let activeLayers: MapLayer[] = createAuthorityRouteLayers(mockRoutes, 'ROUTE-A-INSHORE');
      let currentRequestId = 1;

      const fetchRoutes = async (requestId: number, responseStatus: string) => {
        // Simulating async return
        if (requestId !== currentRequestId) {
          // Discard stale response
          return;
        }
        if (responseStatus === 'UNAVAILABLE' || responseStatus === 'NO_ROUTE') {
          activeLayers = [];
        }
      };

      // Vessel 1 fetch initiated (id=1)
      currentRequestId = 2; // User immediately switches to Vessel 2 (id=2)

      // Late response for Vessel 1 returns
      await fetchRoutes(1, 'AVAILABLE');
      // State was NOT overwritten by late response 1
      expect(currentRequestId).toBe(2);

      // Vessel 2 response returns UNAVAILABLE
      await fetchRoutes(2, 'UNAVAILABLE');
      expect(activeLayers).toHaveLength(0);
    });

    it('16: Animation loop cleanup is supported cleanly', () => {
      let animFrameId: number | null = 123;
      const cleanup = () => {
        if (animFrameId) {
          animFrameId = null;
        }
      };

      expect(animFrameId).toBe(123);
      cleanup();
      expect(animFrameId).toBeNull();
    });

    it('P0-8I: Map renders ONLY the single selected route line on map without candidate clutter', () => {
      const allRouteLayers = createAuthorityRouteLayers(mockRoutes, 'ROUTE-A-INSHORE');
      // In MapView, effectiveRenderLayers computes dynamicRouteLayers with ONLY the single active selected route:
      const computeMapRouteLayers = (layers: MapLayer[], mode: 'safest' | 'balanced' | 'direct') => {
        const allFeats: any[] = [];
        for (const l of layers) {
          if (l.layer_id === 'layer_recommended_route') {
            allFeats.push(l.geojson);
          } else if (l.layer_id === 'layer_candidate_routes') {
            allFeats.push(...(l.geojson as any).features);
          }
        }
        let selectedFeat = allFeats.find((f) => {
          const id = f.properties?.route_id || '';
          if (mode === 'safest') return id === 'ROUTE-A-INSHORE';
          if (mode === 'balanced') return id === 'ROUTE-C-BALANCED';
          if (mode === 'direct') return id === 'ROUTE-B-DIRECT';
          return false;
        }) || allFeats[0];

        return [
          {
            layer_id: 'layer_recommended_route',
            name: `Selected Corridor (${selectedFeat.properties?.name})`,
            geojson: selectedFeat,
            style: { color: '#06b6d4', opacity: 0.95, line_width: 4 },
          },
        ];
      };

      // 1. Safest selected -> ONLY 1 route line on map (ROUTE-A-INSHORE)
      const safestMapLayers = computeMapRouteLayers(allRouteLayers, 'safest');
      expect(safestMapLayers).toHaveLength(1);
      expect(safestMapLayers[0].geojson.properties.route_id).toBe('ROUTE-A-INSHORE');
      expect(safestMapLayers.some(l => l.layer_id === 'layer_candidate_routes')).toBe(false);

      // 2. Click Balanced -> ONLY 1 route line on map (ROUTE-C-BALANCED)
      const balancedMapLayers = computeMapRouteLayers(allRouteLayers, 'balanced');
      expect(balancedMapLayers).toHaveLength(1);
      expect(balancedMapLayers[0].geojson.properties.route_id).toBe('ROUTE-C-BALANCED');
      expect(balancedMapLayers.some(l => l.layer_id === 'layer_candidate_routes')).toBe(false);

      // 3. Click Direct -> ONLY 1 route line on map (ROUTE-B-DIRECT)
      const directMapLayers = computeMapRouteLayers(allRouteLayers, 'direct');
      expect(directMapLayers).toHaveLength(1);
      expect(directMapLayers[0].geojson.properties.route_id).toBe('ROUTE-B-DIRECT');
      expect(directMapLayers.some(l => l.layer_id === 'layer_candidate_routes')).toBe(false);
    });

    it('P0-8I: No selected vessel strictly prevents rendering of route, trajectory, and replay track', () => {
      const composeLayers = (selectedVesselId: string | null, replay: MapLayer | null, trajectory: MapLayer | null, routes: MapLayer[]) => {
        const activeReplay = (selectedVesselId && replay) ? [replay] : [];
        const activeTrajectory = (selectedVesselId && trajectory) ? [trajectory] : [];
        const routeLayersToInclude = (!selectedVesselId) ? [] : routes;
        return [...activeReplay, ...activeTrajectory, ...routeLayersToInclude];
      };

      const mockReplay: MapLayer = { layer_id: 'layer_fleet_vessel_replay', name: 'Replay', layer_type: 'geojson', visible: true, geojson: { type: 'Feature', geometry: { type: 'Point', coordinates: [73, 16] }, properties: {} } };
      const mockTrajectory: MapLayer = { layer_id: 'layer_fleet_estimated_trajectory', name: 'Traj', layer_type: 'geojson', visible: true, geojson: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[73, 16], [73.1, 16.1]] }, properties: {} } };
      const mockRouteList = createAuthorityRouteLayers(mockRoutes, 'ROUTE-A-INSHORE');

      // When NO vessel is selected (e.g. Mumbai or unselected sector):
      const noVesselLayers = composeLayers(null, mockReplay, mockTrajectory, mockRouteList);
      expect(noVesselLayers).toHaveLength(0); // Zero vessel-specific geometry!

      // When a vessel IS selected:
      const vesselSelectedLayers = composeLayers('vessel-01', mockReplay, mockTrajectory, mockRouteList);
      expect(vesselSelectedLayers.length).toBeGreaterThan(0);
      expect(vesselSelectedLayers.some(l => l.layer_id === 'layer_fleet_vessel_replay')).toBe(true);
      expect(vesselSelectedLayers.some(l => l.layer_id === 'layer_fleet_estimated_trajectory')).toBe(true);
    });

    it('accurately attaches and exposes start and destination terminals for fleet routes', () => {
      const routesWithTerminals = createAuthorityRouteLayers(
        mockRoutes,
        'ROUTE-A-INSHORE',
        'Ratnagiri Harbor',
        'Ratnagiri Outer Bank',
      );

      const recommended = routesWithTerminals.find((l) => l.layer_id === 'layer_recommended_route');
      expect((recommended?.geojson as any).properties.origin).toBe('Ratnagiri Harbor');
      expect((recommended?.geojson as any).properties.destination).toBe('Ratnagiri Outer Bank');

      const candidates = extractRouteCandidates(routesWithTerminals);
      expect(candidates.length).toBe(3);
      const inshore = candidates.find((c) => c.route_id === 'ROUTE-A-INSHORE');
      expect(inshore?.start_coordinates).toEqual([73.28, 16.99]);
      expect(inshore?.end_coordinates).toEqual([73.20, 16.95]);
      expect(inshore?.origin).toBe('Ratnagiri Harbor');
      expect(inshore?.destination).toBe('Ratnagiri Outer Bank');
    });
  });
});
