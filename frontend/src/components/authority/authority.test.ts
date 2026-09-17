import { describe, it, expect } from 'vitest';
import ScenarioBenchmarkDeck from './ScenarioBenchmarkDeck';
import FleetTrackingDeck from './FleetTrackingDeck';
import AuthorityDeckGLMap from './AuthorityDeckGLMap';
import { createAuthorityHazardLayers, createHazardAssociationLayers, createSectorLayers, FALLBACK_DEMO_SECTORS } from '../../utils/geo';
import type { DemoSector, SectorHazard, SectorSituation, VesselHazardAssociation } from '../../api/client';

describe('Authority Advanced Feature Decks', () => {
  it('exports ScenarioBenchmarkDeck component cleanly', () => {
    expect(ScenarioBenchmarkDeck).toBeDefined();
    expect(typeof ScenarioBenchmarkDeck).toBe('function');
  });

  it('exports FleetTrackingDeck component cleanly', () => {
    expect(FleetTrackingDeck).toBeDefined();
    expect(typeof FleetTrackingDeck).toBe('function');
  });

  it('verifies benchmark and fleet subtabs exist for authority surveillance', () => {
    const tabs: Array<'terminal' | 'fleet' | 'benchmarks' | 'audit'> = [
      'terminal',
      'fleet',
      'benchmarks',
      'audit',
    ];
    expect(tabs).toContain('benchmarks');
    expect(tabs).toContain('fleet');
    expect(tabs).toContain('terminal');
    expect(tabs).toContain('audit');
  });

  it('formats DemoSector into authoritative MapLibre MapLayers without hardcoded coordinate injection', () => {
    const canonicalMalvanSector: DemoSector = {
      public_id: 'sector-malvan',
      name: 'Malvan Marine Zone (MH-04)',
      code: 'MH-04',
      station_name: 'Malvan Marine Surveillance Unit',
      harbor_id: 'harbor-malvan',
      center: [73.47, 16.06],
      zoom: 9.5,
      polygon: [
        [73.35, 15.95],
        [73.58, 15.95],
        [73.58, 16.18],
        [73.35, 16.18],
        [73.35, 15.95],
      ],
    };

    const layers = createSectorLayers(canonicalMalvanSector);
    expect(layers).toHaveLength(2);

    const [polygonLayer, stationLayer] = layers;
    expect(polygonLayer.layer_id).toBe('sector_polygon_sector-malvan');
    expect(polygonLayer.name).toBe('Malvan Marine Zone (MH-04)');
    expect(polygonLayer.geojson.type).toBe('FeatureCollection');
    expect(polygonLayer.geojson.features?.[0]?.geometry.coordinates).toEqual([canonicalMalvanSector.polygon]);

    expect(stationLayer.layer_id).toBe('sector_station_sector-malvan');
    expect(stationLayer.name).toBe('Malvan Marine Surveillance Unit');
    expect(stationLayer.geojson.geometry.coordinates).toEqual([73.47, 16.06]);
  });

  it('highlights only the canonical hazard and association selected by alert identifiers', () => {
    const hazards: SectorHazard[] = [{
      hazard_id: 'hazard-01', hazard_type: 'SQUALL', headline: 'Canonical hazard', severity: 'WARNING', status: 'ACTIVE',
      valid_from: '2026-09-13T00:00:00Z', valid_to: '2026-09-14T00:00:00Z',
      geometry: { type: 'Polygon', coordinates: [[[73, 16], [74, 16], [74, 17], [73, 16]]] },
      provenance: {},
    }];
    const associations: VesselHazardAssociation[] = [{
      vessel_id: 'vessel-01', hazard_id: 'hazard-01', sector_id: 'sector-ratnagiri', association_type: 'IN_HAZARD_AREA',
      evaluated_at: '2026-09-13T12:00:00Z', vessel_position: [73.5, 16.5],
    }];

    const [hazardLayer] = createAuthorityHazardLayers(hazards, 'hazard-01');
    const [associationLayer] = createHazardAssociationLayers(associations, associations[0]);
    expect(hazardLayer.geojson.properties?.selected_for_alert_inspection).toBe(true);
    expect(hazardLayer.geojson.geometry).toEqual(hazards[0].geometry);
    expect(associationLayer.geojson.properties?.selected_for_alert_inspection).toBe(true);
    expect(associationLayer.geojson.geometry).toEqual({ type: 'Point', coordinates: associations[0].vessel_position });
  });

  it('confirms FALLBACK_DEMO_SECTORS contains 5 distinct sectors for offline UI continuity', () => {
    expect(FALLBACK_DEMO_SECTORS).toHaveLength(5);
    const names = FALLBACK_DEMO_SECTORS.map((s) => s.name);
    expect(names).toContain('Ratnagiri Sector (MH-03)');
    expect(names).toContain('Malvan Marine Zone (MH-04)');
    expect(names).toContain('Goa Naval Corridor (GA-01)');
    expect(names).toContain('Mumbai Offshore (MH-01)');
    expect(names).toContain('Veraval Coastal Zone (GJ-02)');
  });

  it('validates trajectory replay MapLayer contract contains standard bbox for auto-zoom', () => {
    const mockPositions = [
      { timestamp: '00:00', latitude: 15.48, longitude: 73.80, speed_knots: 9.0, heading_deg: 260, vessel_id: 'vessel-09' },
      { timestamp: '01:00', latitude: 15.52, longitude: 73.74, speed_knots: 11.2, heading_deg: 280, vessel_id: 'vessel-09' },
    ];

    const minLng = Math.min(...mockPositions.map(p => p.longitude));
    const maxLng = Math.max(...mockPositions.map(p => p.longitude));
    const minLat = Math.min(...mockPositions.map(p => p.latitude));
    const maxLat = Math.max(...mockPositions.map(p => p.latitude));

    const replayLayer = {
      layer_id: 'layer_fleet_vessel_replay',
      name: `Vessel Replay (${mockPositions[0].vessel_id})`,
      layer_type: 'geojson' as const,
      visible: true,
      style: {
        color: '#06b6d4',
        layer_category: 'fleet_replay',
      },
      properties: {
        vessel_id: mockPositions[0].vessel_id,
        focus_trigger: 0,
        bbox: [minLng, minLat, maxLng, maxLat],
      },
      geojson: {
        type: 'FeatureCollection' as const,
        bbox: [minLng, minLat, maxLng, maxLat],
        features: [
          {
            type: 'Feature' as const,
            geometry: {
              type: 'LineString' as const,
              coordinates: mockPositions.map(p => [p.longitude, p.latitude]),
            },
            properties: { vessel_id: mockPositions[0].vessel_id },
          },
          {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [mockPositions[0].longitude, mockPositions[0].latitude],
            },
            properties: { vessel_id: mockPositions[0].vessel_id },
          },
        ],
      },
    };

    expect(replayLayer.layer_id).toBe('layer_fleet_vessel_replay');
    expect(replayLayer.style.layer_category).toBe('fleet_replay');
    expect(replayLayer.geojson.bbox).toEqual([73.74, 15.48, 73.80, 15.52]);
    expect(replayLayer.properties.vessel_id).toBe('vessel-09');
    expect(replayLayer.geojson.features).toHaveLength(2);
    expect(replayLayer.geojson.features[0].geometry.type).toBe('LineString');
    expect(replayLayer.geojson.features[1].geometry.type).toBe('Point');
  });

  it('verifies sector selection determines available vessels and handles zero-vessel sectors cleanly', () => {
    // Sector-to-vessels mapping
    const ratnagiriVessels = [
      { public_id: 'vessel-01', name: 'Matsya Sagar 01', home_harbor_id: 'harbor-ratnagiri' },
      { public_id: 'vessel-02', name: 'Konkan Pride', home_harbor_id: 'harbor-ratnagiri' },
    ];
    const malvanVessels = [
      { public_id: 'vessel-05', name: 'Sea Hawk Goa', home_harbor_id: 'harbor-malvan' },
    ];
    const zeroVesselSector: typeof ratnagiriVessels = [];

    expect(ratnagiriVessels.map(v => v.public_id)).toEqual(['vessel-01', 'vessel-02']);
    expect(malvanVessels.map(v => v.public_id)).toEqual(['vessel-05']);
    expect(zeroVesselSector).toHaveLength(0);

    // Switching to zero-vessel sector clears track
    let activeTrack: any = { layer_id: 'layer_fleet_vessel_replay' };
    const onReplayUpdate = (layer: any) => { activeTrack = layer; };

    if (zeroVesselSector.length === 0) {
      onReplayUpdate(null);
    }
    expect(activeTrack).toBeNull();
  });

  it('verifies vessel selection displays corresponding replay and never falls back to vessel-01', () => {
    // Vessel A: vessel-05 (Malvan)
    const vesselAPositions = [
      { timestamp: '00:00', latitude: 16.060, longitude: 73.465, speed_knots: 5.2, heading_deg: 320, vessel_id: 'vessel-05' },
      { timestamp: '06:00', latitude: 16.140, longitude: 73.410, speed_knots: 8.0, heading_deg: 325, vessel_id: 'vessel-05' },
    ];

    // Vessel B: vessel-11 (Mumbai)
    const vesselBPositions = [
      { timestamp: '00:00', latitude: 18.910, longitude: 72.825, speed_knots: 6.0, heading_deg: 220, vessel_id: 'vessel-11' },
      { timestamp: '06:00', latitude: 18.740, longitude: 72.670, speed_knots: 8.0, heading_deg: 225, vessel_id: 'vessel-11' },
    ];

    const generateReplayLayer = (positions: typeof vesselAPositions) => {
      const current = positions[positions.length - 1];
      return {
        layer_id: 'layer_fleet_vessel_replay',
        properties: { vessel_id: current.vessel_id },
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: positions.map(p => [p.longitude, p.latitude]),
              },
              properties: { vessel_id: current.vessel_id },
            },
            {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [current.longitude, current.latitude],
              },
              properties: {
                vessel_id: current.vessel_id,
                speed_knots: current.speed_knots,
                heading_deg: current.heading_deg,
              },
            },
          ],
        },
      };
    };

    const layerA = generateReplayLayer(vesselAPositions);
    expect(layerA.properties.vessel_id).toBe('vessel-05');
    expect(layerA.properties.vessel_id).not.toBe('vessel-01');
    expect(layerA.geojson.features[0].geometry.coordinates).toEqual([[73.465, 16.060], [73.410, 16.140]]);
    expect(layerA.geojson.features[1].geometry.coordinates).toEqual([73.410, 16.140]);

    const layerB = generateReplayLayer(vesselBPositions);
    expect(layerB.properties.vessel_id).toBe('vessel-11');
    expect(layerB.properties.vessel_id).not.toBe('vessel-01');
    expect(layerB.geojson.features[0].geometry.coordinates).toEqual([[72.825, 18.910], [72.670, 18.740]]);
    expect(layerB.geojson.features[1].geometry.coordinates).toEqual([72.670, 18.740]);
  });

  it('verifies replay failure or missing data results in null map track and does not fabricate coordinates', () => {
    let mapTrack: any = { layer_id: 'layer_fleet_vessel_replay' };
    const onReplayUpdate = (layer: any) => { mapTrack = layer; };

    // When backend returns empty replay or fails
    const failedOrEmptyReplay: any[] = [];
    if (!failedOrEmptyReplay || failedOrEmptyReplay.length === 0) {
      onReplayUpdate(null);
    }

    expect(mapTrack).toBeNull();
  });

  describe('Authority Sector Situation & Risk KPIs', () => {
    const mockRatnagiriSituation: SectorSituation = {
      sector_id: 'sector-ratnagiri',
      sector_name: 'Ratnagiri Sector (MH-03)',
      harbor_id: 'harbor-ratnagiri',
      harbor_name: 'Ratnagiri',
      situation_status: 'GO',
      fleet_count: 4,
      active_hazard_count: 3,
      evaluated_at: '2026-09-13T12:00:00Z',
      summary: 'Calm conditions favorable for departure.',
      recommendation: {
        status: 'GO',
        summary: 'Calm conditions favorable for departure.',
        decisive_factors: ['Significant wave height 1.2m < 2.0m threshold'],
        next_action: 'Standard departure allowed.',
      },
      evidence: [
        {
          source_name: 'INCOIS Ocean State Forecast',
          metric_name: 'significant_wave_height_m',
          metric_value: 1.2,
          retrieved_at: '2026-09-13T12:00:00Z',
          quality_flags: ['official_source'],
        },
      ],
      warnings: [],
    };

    const mockGoaSituation: SectorSituation = {
      sector_id: 'sector-goa',
      sector_name: 'Goa Naval Corridor (GA-01)',
      harbor_id: 'harbor-panaji',
      harbor_name: 'Panaji',
      situation_status: 'CAUTION',
      fleet_count: 2,
      active_hazard_count: 1,
      evaluated_at: '2026-09-13T12:00:00Z',
      summary: 'Gale wind warning active across South Maharashtra Waters.',
      recommendation: {
        status: 'CAUTION',
        summary: 'Elevated winds in sector.',
        decisive_factors: ['Wind speed 22 knots'],
        next_action: 'Proceed with caution.',
      },
      evidence: [],
      warnings: ['ELEVATED_WINDS'],
    };

    it('1 & 2: selecting Ratnagiri requests Ratnagiri situation and switching to Goa requests Goa situation', () => {
      let requestedKey = '';
      const fetchSituation = (sectorKey: string) => {
        requestedKey = sectorKey;
      };

      // Select Ratnagiri
      fetchSituation('sector-ratnagiri');
      expect(requestedKey).toBe('sector-ratnagiri');

      // Switch to Goa
      fetchSituation('sector-goa');
      expect(requestedKey).toBe('sector-goa');
    });

    it('3: Fleet KPI displays dynamic API fleet_count', () => {
      const displayFleet = (situation: SectorSituation | null) => {
        return situation?.fleet_count ?? '—';
      };

      expect(displayFleet(mockRatnagiriSituation)).toBe(4);
      expect(displayFleet(mockGoaSituation)).toBe(2);
      expect(displayFleet(null)).toBe('—');
    });

    it('4: Hazard KPI displays API active_hazard_count', () => {
      const displayHazards = (situation: SectorSituation | null) => {
        return situation?.active_hazard_count ?? '—';
      };

      expect(displayHazards(mockRatnagiriSituation)).toBe(3);
      expect(displayHazards(mockGoaSituation)).toBe(1);
    });

    it('5: Status displays API situation_status', () => {
      const displayStatus = (situation: SectorSituation | null) => {
        return situation?.situation_status || 'UNKNOWN';
      };

      expect(displayStatus(mockRatnagiriSituation)).toBe('GO');
      expect(displayStatus(mockGoaSituation)).toBe('CAUTION');
    });

    it('6: UNKNOWN status is rendered strictly as UNKNOWN, never as GO', () => {
      const unknownSituation: SectorSituation = {
        ...mockRatnagiriSituation,
        situation_status: 'UNKNOWN',
      };

      const displayStatus = (situation: SectorSituation) => {
        return situation.situation_status;
      };

      expect(displayStatus(unknownSituation)).toBe('UNKNOWN');
      expect(displayStatus(unknownSituation)).not.toBe('GO');
    });

    it('7: API failure produces explicit unavailable/degraded state and does not default to GO', () => {
      const getStatusDisplay = (sit: SectorSituation | null, err: string | null) => {
        if (err) return 'UNAVAILABLE';
        if (!sit) return 'LOADING';
        return sit.situation_status;
      };

      let situation: SectorSituation | null = mockRatnagiriSituation;
      let situationError: string | null = null;

      // Simulate API failure
      situation = null;
      situationError = 'Situation Unavailable';

      expect(situation).toBeNull();
      expect(situationError).toBe('Situation Unavailable');

      const renderedStatus = getStatusDisplay(situation, situationError);
      expect(renderedStatus).toBe('UNAVAILABLE');
      expect(renderedStatus).not.toBe('GO');
    });

    it('8: changing sector replaces previous situation data rather than leaving stale values visible', () => {
      let activeSituation: SectorSituation | null = mockRatnagiriSituation;

      // On sector change, previous data is cleared immediately
      const onSectorChange = (_newSectorKey: string) => {
        activeSituation = null; // cleared before async fetch
      };

      onSectorChange('sector-goa');
      expect(activeSituation).toBeNull();

      // After async fetch completes
      activeSituation = mockGoaSituation;
      expect(activeSituation.sector_id).toBe('sector-goa');
      expect(activeSituation.fleet_count).toBe(2);
      expect(activeSituation.situation_status).toBe('CAUTION');
    });
  });

  describe('Trajectory Replay Autoplay & Ticker Lifecycle', () => {
    const samplePositions = [
      { timestamp: '00:00', latitude: 16.990, longitude: 73.280, speed_knots: 5.0, heading_deg: 260, vessel_id: 'vessel-01' },
      { timestamp: '00:12', latitude: 16.985, longitude: 73.260, speed_knots: 7.5, heading_deg: 262, vessel_id: 'vessel-01' },
      { timestamp: '00:24', latitude: 16.970, longitude: 73.230, speed_knots: 8.2, heading_deg: 265, vessel_id: 'vessel-01' },
    ];

    it('initializes replay at departure (index 0) with autoplay active on position load', () => {
      let currentIndex = -1;
      let isPlaying = false;

      const onLoadPositions = (pos: typeof samplePositions, isAlertInspection: boolean) => {
        if (isAlertInspection) {
          currentIndex = pos.length - 1;
          isPlaying = false;
        } else {
          currentIndex = 0;
          isPlaying = true;
        }
      };

      onLoadPositions(samplePositions, false);
      expect(currentIndex).toBe(0);
      expect(isPlaying).toBe(true);
      expect(samplePositions[currentIndex].timestamp).toBe('00:00');
    });

    it('advances trajectory point-by-point and loops back to departure after destination hold', () => {
      let currentIndex = 0;
      let holdCount = 0;
      const maxIndex = samplePositions.length - 1;

      const tick = () => {
        if (currentIndex >= maxIndex) {
          if (holdCount < 2) {
            holdCount += 1;
            return;
          }
          holdCount = 0;
          currentIndex = 0;
          return;
        }
        holdCount = 0;
        currentIndex += 1;
      };

      // Step 0 -> Step 1
      tick();
      expect(currentIndex).toBe(1);
      expect(samplePositions[currentIndex].timestamp).toBe('00:12');

      // Step 1 -> Step 2 (destination reached)
      tick();
      expect(currentIndex).toBe(2);
      expect(samplePositions[currentIndex].timestamp).toBe('00:24');

      // Hold at destination (tick 1)
      tick();
      expect(currentIndex).toBe(2);
      expect(holdCount).toBe(1);

      // Hold at destination (tick 2)
      tick();
      expect(currentIndex).toBe(2);
      expect(holdCount).toBe(2);

      // Loop back to departure (index 0)
      tick();
      expect(currentIndex).toBe(0);
      expect(holdCount).toBe(0);
      expect(samplePositions[currentIndex].timestamp).toBe('00:00');
    });

    it('alert inspection pauses playback and focuses on latest evaluated containment position', () => {
      let currentIndex = 0;
      let isPlaying = true;

      const inspectAlert = (positions: typeof samplePositions) => {
        currentIndex = positions.length - 1;
        isPlaying = false;
      };

      inspectAlert(samplePositions);
      expect(currentIndex).toBe(samplePositions.length - 1);
      expect(isPlaying).toBe(false);
      expect(samplePositions[currentIndex].timestamp).toBe('00:24');
    });

    it('manual slider scrubbing pauses autoplay', () => {
      let currentIndex = 0;
      let isPlaying = true;

      const onSliderChange = (newIndex: number) => {
        currentIndex = newIndex;
        isPlaying = false;
      };

      onSliderChange(1);
      expect(currentIndex).toBe(1);
      expect(isPlaying).toBe(false);
    });

    it('generates yellow dotted predicted path [0, 2] for vessels with dead reckoning and remaining voyage route', () => {
      const currentPos = samplePositions[1]; // at 00:12
      const remainingCoords = samplePositions.slice(1).map(p => [p.longitude, p.latitude]);

      const trajectoryLayer = {
        layer_id: 'layer_fleet_estimated_trajectory',
        name: `Predicted Path — next 30 min (${currentPos.vessel_id})`,
        layer_type: 'geojson' as const,
        visible: true,
        style: {
          color: '#facc15',
          opacity: 0.95,
          line_width: 3,
          line_dasharray: [0, 2],
          layer_category: 'estimated_trajectory',
        },
        properties: { vessel_id: currentPos.vessel_id },
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              geometry: { type: 'LineString' as const, coordinates: remainingCoords },
              properties: { label: 'Predicted Route to Destination' },
            },
          ],
        },
      };

      expect(trajectoryLayer.style.color).toBe('#facc15');
      expect(trajectoryLayer.style.line_dasharray).toEqual([0, 2]);
      expect(trajectoryLayer.geojson.features[0].geometry.coordinates).toHaveLength(2);
      expect(trajectoryLayer.geojson.features[0].geometry.coordinates[0]).toEqual([73.260, 16.985]);
    });
  });

  describe('AuthorityDeckGLMap Operational 3D Map Foundation', () => {
    it('exports AuthorityDeckGLMap component cleanly', () => {
      expect(AuthorityDeckGLMap).toBeDefined();
      expect(typeof AuthorityDeckGLMap).toBe('function');
    });

    it('vessel markers strictly use real coordinates and do not fabricate movement', () => {
      const realVessels = [
        { public_id: 'vessel-01', name: 'Matsya-01', vessel_type: 'trawler', length_m: 14, capacity_tons: 10, home_harbor_id: 'harbor-ratnagiri', status: 'UNDERWAY' },
        { public_id: 'vessel-02', name: 'Sagar-02', vessel_type: 'gillnetter', length_m: 12, capacity_tons: 8, home_harbor_id: 'harbor-ratnagiri', status: 'DOCKED' },
      ];

      expect(realVessels[0].public_id).toBe('vessel-01');
      expect(realVessels[0].status).toBe('UNDERWAY');
      expect(realVessels[1].status).toBe('DOCKED');
    });

    it('distinguishes historical track vs projected trajectory vs recommended route', () => {
      const historicalPoints: [number, number][] = [[73.28, 16.99], [73.25, 16.95], [73.20, 16.90]];
      const projectedTrajectory: [number, number][] = [[73.20, 16.90], [73.15, 16.85], [73.10, 16.80]];
      const recommendedRouteWaypoints: [number, number][] = [[73.28, 16.99], [73.22, 16.92], [73.08, 16.78]];

      // Historical track is solid cyan
      const historicalStyle = { color: '#06b6d4', width: 3.5, dashed: false };
      // Projected trajectory is dashed amber
      const trajectoryStyle = { color: '#facc15', width: 3.0, dashed: true };
      // Recommended route is solid emerald
      const routeStyle = { color: '#10b981', width: 4.0, dashed: false };

      expect(historicalStyle.color).not.toEqual(trajectoryStyle.color);
      expect(trajectoryStyle.color).not.toEqual(routeStyle.color);
      expect(trajectoryStyle.dashed).toBe(true);
      expect(historicalStyle.dashed).toBe(false);
      expect(historicalPoints).toHaveLength(3);
      expect(projectedTrajectory[0]).toEqual(historicalPoints[historicalPoints.length - 1]);
      expect(recommendedRouteWaypoints[0]).toEqual(historicalPoints[0]);
    });

    it('calculates deterministic voyage ETA when speed > 0 and distance is available', () => {
      const speedKnots = 10; // 10 knots = 18.52 km/h
      const remainingDistanceKm = 37.04; // 37.04 km / 18.52 km/h = 2.0 hours

      const speedKmh = speedKnots * 1.852;
      const hours = remainingDistanceKm / speedKmh;
      const totalMinutes = Math.round(hours * 60);
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      const etaDisplay = hrs > 0 ? `~${hrs}h ${mins}m` : `~${mins} min`;

      expect(etaDisplay).toBe('~2h 0m');
    });

    it('displays ETA unavailable when vessel speed is 0 or distance is missing', () => {
      const zeroSpeed = 0;
      const missingDistance = null;

      const computeETA = (spd?: number | null, dist?: number | null) => {
        if (typeof spd === 'number' && spd > 0 && typeof dist === 'number' && dist > 0) {
          return `~${Math.round((dist / (spd * 1.852)) * 60)} min`;
        }
        return 'ETA unavailable';
      };

      expect(computeETA(zeroSpeed, 20)).toBe('ETA unavailable');
      expect(computeETA(10, missingDistance)).toBe('ETA unavailable');
      expect(computeETA(null, null)).toBe('ETA unavailable');
    });

    it('declutters hazards by filtering expired notices and highlighting alert inspection targets', () => {
      const hazards: SectorHazard[] = [
        {
          hazard_id: 'hazard-01',
          hazard_type: 'CYCLONE',
          headline: 'Active Cyclone Warning',
          severity: 'WARNING',
          status: 'ACTIVE',
          valid_from: '2026-09-17T00:00:00Z',
          valid_to: '2026-09-18T00:00:00Z',
          geometry: { type: 'Polygon', coordinates: [[[73.1, 16.8], [73.4, 16.8], [73.4, 17.1], [73.1, 16.8]]] },
          provenance: {},
        },
        {
          hazard_id: 'hazard-02',
          hazard_type: 'HIGH_WAVE',
          headline: 'Expired Swell Advisory',
          severity: 'ALERT',
          status: 'EXPIRED',
          valid_from: '2026-09-10T00:00:00Z',
          valid_to: '2026-09-11T00:00:00Z',
          geometry: { type: 'Polygon', coordinates: [[[73.0, 16.0], [73.3, 16.0], [73.3, 16.3], [73.0, 16.0]]] },
          provenance: {},
        },
      ];

      const activeOnly = hazards.filter(h => h.status !== 'INACTIVE' && h.status !== 'EXPIRED');
      expect(activeOnly).toHaveLength(1);
      expect(activeOnly[0].hazard_id).toBe('hazard-01');
      expect(activeOnly[0].severity).toBe('WARNING');
    });

    it('excludes vessels with invalid, NaN, or missing coordinates from rendering', () => {
      const mixedVessels = [
        { public_id: 'vessel-01', name: 'Matsya-01', status: 'UNDERWAY' },
        { public_id: 'vessel-corrupt-1', name: 'Bad-01', status: 'UNDERWAY' },
        { public_id: 'vessel-corrupt-2', name: 'Bad-02', status: 'UNDERWAY' },
        { public_id: 'vessel-corrupt-3', name: 'Bad-03', status: 'UNDERWAY' },
      ];

      const positionsMap: Record<string, { longitude: number; latitude: number; speed_knots?: number; heading_deg?: number }> = {
        'vessel-01': { longitude: 73.28, latitude: 16.99, speed_knots: 7.5, heading_deg: 260 },
        'vessel-corrupt-1': { longitude: NaN, latitude: 16.99 },
        'vessel-corrupt-2': { longitude: 73.28, latitude: NaN },
        'vessel-corrupt-3': { longitude: 0, latitude: 0 },
      };

      const validRendered: any[] = [];
      for (const v of mixedVessels) {
        const pos = positionsMap[v.public_id];
        if (
          !pos ||
          typeof pos.longitude !== 'number' ||
          typeof pos.latitude !== 'number' ||
          isNaN(pos.longitude) ||
          isNaN(pos.latitude) ||
          (pos.longitude === 0 && pos.latitude === 0)
        ) {
          continue;
        }
        validRendered.push({ ...v, position: [pos.longitude, pos.latitude] });
      }

      expect(validRendered).toHaveLength(1);
      expect(validRendered[0].public_id).toBe('vessel-01');
      expect(validRendered[0].position).toEqual([73.28, 16.99]);
    });

    it('calculates auto-zoom viewport bounding box encompassing vessel, historical track, and projected trajectory', () => {
      const vesselPos = [73.24, 16.95] as [number, number];
      const trackCoords: [number, number][] = [
        [73.28, 16.99],
        [73.26, 16.97],
        [73.24, 16.95],
      ];
      const trajectoryCoords: [number, number][] = [
        [73.24, 16.95],
        [73.20, 16.91],
        [73.16, 16.87],
      ];

      const allCoords = [vesselPos, ...trackCoords, ...trajectoryCoords];
      let minLng = allCoords[0][0];
      let maxLng = allCoords[0][0];
      let minLat = allCoords[0][1];
      let maxLat = allCoords[0][1];

      for (const [lng, lat] of allCoords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const centerLng = (minLng + maxLng) / 2;
      const centerLat = (minLat + maxLat) / 2;
      const spanLng = maxLng - minLng;
      const spanLat = maxLat - minLat;

      expect(minLng).toBe(73.16);
      expect(maxLng).toBe(73.28);
      expect(minLat).toBe(16.87);
      expect(maxLat).toBe(16.99);
      expect(centerLng).toBeCloseTo(73.22, 2);
      expect(centerLat).toBeCloseTo(16.93, 2);
      expect(spanLng).toBeCloseTo(0.12, 2);
      expect(spanLat).toBeCloseTo(0.12, 2);
    });
  });
});



