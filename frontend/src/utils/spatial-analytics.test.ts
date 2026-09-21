import { describe, it, expect } from 'vitest';
import {
  calculateDistanceKm,
  calculateBearingDeg,
  calculatePointToRouteDistanceKm,
  isPointInHazardPolygon,
  findRouteHazardIntersections,
  calculateRouteLengthKm,
} from './spatial-analytics';
import { HARBOR_COORDINATES } from './geo';

describe('Spatial Analytics with Turf.js', () => {
  const ratnagiri = HARBOR_COORDINATES.Ratnagiri; // [73.28, 16.99]
  const malvan = HARBOR_COORDINATES.Malvan; // [73.47, 16.06]

  it('calculates geodesic distance accurately between Ratnagiri and Malvan', () => {
    const dist = calculateDistanceKm(ratnagiri, malvan);
    // Distance between Ratnagiri (16.99°N, 73.28°E) and Malvan (16.06°N, 73.47°E) is ~105 km
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(110);
  });

  it('calculates initial bearing from Ratnagiri to Malvan (South-Southeast direction)', () => {
    const bearing = calculateBearingDeg(ratnagiri, malvan);
    // Heading south-southeast from Ratnagiri to Malvan is ~165° - 175°
    expect(bearing).toBeGreaterThan(160);
    expect(bearing).toBeLessThan(180);
  });

  it('calculates cross-track distance from a vessel to a route corridor', () => {
    // Route from Ratnagiri out to sea
    const routeCoords: [number, number][] = [
      [73.28, 16.99],
      [73.10, 16.95],
      [72.90, 16.90],
    ];

    // Vessel is directly on the first waypoint
    const distOnRoute = calculatePointToRouteDistanceKm([73.28, 16.99], routeCoords);
    expect(distOnRoute).toBe(0);

    // Vessel is 10-15 km north of the route
    const distOffRoute = calculatePointToRouteDistanceKm([73.10, 17.05], routeCoords);
    expect(distOffRoute).toBeGreaterThan(10);
    expect(distOffRoute).toBeLessThan(15);
  });

  it('evaluates point-in-polygon containment for vessel in hazard zone', () => {
    // A synthetic hazard polygon covering [72.8, 16.8] to [73.2, 17.2]
    const hazardPolygon: [number, number][] = [
      [72.80, 16.80],
      [73.20, 16.80],
      [73.20, 17.20],
      [72.80, 17.20],
      [72.80, 16.80],
    ];

    // Point inside hazard
    const insidePoint: [number, number] = [73.00, 17.00];
    expect(isPointInHazardPolygon(insidePoint, hazardPolygon)).toBe(true);

    // Point outside hazard (e.g. Malvan area)
    const outsidePoint: [number, number] = [73.47, 16.06];
    expect(isPointInHazardPolygon(outsidePoint, hazardPolygon)).toBe(false);
  });

  it('detects route intersections through hazard polygons', () => {
    const hazardPolygon: [number, number][] = [
      [73.00, 16.80],
      [73.20, 16.80],
      [73.20, 17.10],
      [73.00, 17.10],
      [73.00, 16.80],
    ];

    // Route cutting straight through the hazard polygon
    const crossingRoute: [number, number][] = [
      [73.28, 16.99], // Ratnagiri (outside, east)
      [72.90, 16.99], // Offshore (outside, west)
    ];

    const result = findRouteHazardIntersections(crossingRoute, hazardPolygon);
    expect(result.hasIntersection).toBe(true);
    expect(result.intersectionCount).toBe(2); // enters east edge, exits west edge
    expect(result.intersectionCoordinates.length).toBe(2);
  });

  it('calculates total route length accurately', () => {
    const routeCoords: [number, number][] = [
      [73.28, 16.99],
      [73.10, 16.90],
      [72.95, 16.82],
    ];
    const len = calculateRouteLengthKm(routeCoords);
    expect(len).toBeGreaterThan(35);
    expect(len).toBeLessThan(45);
  });
});
