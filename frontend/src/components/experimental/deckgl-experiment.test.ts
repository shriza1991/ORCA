import { describe, it, expect } from 'vitest';
import { buildPFZGeoJSON } from '../researcher/PFZSpatialMap';
import { buildHazardGeoJSON } from '../researcher/HazardSpatialMap';
import type { PFZCandidate, HazardBulletin } from '../../api/researcher-client';
import type { EvaluatedRouteItem } from '../../api/client';
import {
  calculateDistanceKm,
  calculateBearingDeg,
  calculatePointToRouteDistanceKm,
  isPointInHazardPolygon,
  findRouteHazardIntersections,
} from '../../utils/spatial-analytics';

describe('Deck.gl Marine Experiment Data & Calculations', () => {
  const samplePFZ: PFZCandidate[] = [
    {
      public_id: 'pfz-mh-01',
      latitude: 16.82,
      longitude: 72.95,
      sst_gradient: 0.9,
      chlorophyll_a_mg_m3: 1.2,
      distance_km: 42.6,
      bearing_deg: 245,
      rank: 1,
      status: 'ACTIVE',
      valid_from: '2026-09-12T00:00:00Z',
      valid_to: '2026-09-12T23:59:59Z',
      source: 'INCOIS PFZ Advisory',
    },
  ];

  const sampleHazards: HazardBulletin[] = [
    {
      public_id: 'hazard-01',
      headline: 'High Wave Alert',
      severity: 'WARNING',
      status: 'ACTIVE',
      issued_at: '2026-09-12T00:00:00Z',
      valid_until: '2026-09-12T18:00:00Z',
      source: 'IMD Coastal Bulletin',
      geometry_geojson: {
        type: 'Polygon',
        coordinates: [
          [
            [72.8, 16.7],
            [73.1, 16.7],
            [73.1, 17.1],
            [72.8, 17.1],
            [72.8, 16.7],
          ],
        ],
      },
    },
  ];

  const sampleRoute: EvaluatedRouteItem = {
    route_id: 'ROUTE-A-INSHORE',
    name: 'Safest Inshore Passage',
    distance_km: 26.8,
    max_wave_height_m: 1.4,
    risk_rating: 'LOW',
    exposure_score: 2.1,
    waypoints: [
      [73.28, 16.99],
      [73.15, 16.92],
      [72.95, 16.82],
    ],
  };

  it('transforms authentic PFZ candidates into valid GeoJSON FeatureCollection for deck.gl ScatterplotLayer', () => {
    const geojson = buildPFZGeoJSON(samplePFZ);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBe(1);
    expect((geojson.features[0].geometry as any).coordinates).toEqual([72.95, 16.82]);
    expect(geojson.features[0].properties?.rank).toBe(1);
    expect(geojson.features[0].properties?.sst_gradient).toBe(0.9);
  });

  it('transforms authentic hazard bulletins into valid GeoJSON FeatureCollection for deck.gl GeoJsonLayer extrusion', () => {
    const geojson = buildHazardGeoJSON(sampleHazards);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBe(1);
    expect(geojson.features[0].geometry.type).toBe('Polygon');
    expect(geojson.features[0].properties?.severity).toBe('WARNING');
  });

  it('computes spatial proximity and cross-track distance using Turf.js', () => {
    const departureHarbor: [number, number] = [73.28, 16.99]; // Ratnagiri
    const targetPFZ: [number, number] = [72.95, 16.82];

    const dist = calculateDistanceKm(departureHarbor, targetPFZ);
    const bearing = calculateBearingDeg(departureHarbor, targetPFZ);

    expect(dist).toBeGreaterThan(38);
    expect(dist).toBeLessThan(45);
    expect(bearing).toBeGreaterThan(230);
    expect(bearing).toBeLessThan(260);

    // Vessel midway along route
    const midVessel: [number, number] = [73.15, 16.92];
    const crossTrack = calculatePointToRouteDistanceKm(midVessel, sampleRoute.waypoints);
    expect(crossTrack).toBe(0);
  });

  it('computes route-hazard intersection using Turf.js', () => {
    const hazardRings = (sampleHazards[0].geometry_geojson as any).coordinates;
    const intersection = findRouteHazardIntersections(sampleRoute.waypoints, hazardRings);

    expect(intersection.hasIntersection).toBe(true);
    expect(intersection.intersectionCount).toBeGreaterThanOrEqual(1);
  });

  it('determines vessel hazard containment using Turf.js booleanPointInPolygon', () => {
    const hazardRings = (sampleHazards[0].geometry_geojson as any).coordinates;

    const vesselInside: [number, number] = [72.95, 16.90];
    const vesselOutside: [number, number] = [73.40, 17.50];

    expect(isPointInHazardPolygon(vesselInside, hazardRings)).toBe(true);
    expect(isPointInHazardPolygon(vesselOutside, hazardRings)).toBe(false);
  });
});
