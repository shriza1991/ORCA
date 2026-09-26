/**
 * Spatial Analytics Utilities using Turf.js
 *
 * Real deterministic geospatial calculations over authentic SAMUDRA coordinates:
 * - Geodesic distance (Haversine/Turf)
 * - Initial navigational bearing
 * - Cross-track distance (point-to-route distance)
 * - Point-in-polygon containment (vessel in hazard area)
 * - Route-hazard line/polygon intersection detection
 * - Route path length computation
 */

import * as turf from '@turf/turf';

export interface SpatialProximityResult {
  distanceKm: number;
  bearingDeg: number;
}

export interface RouteHazardIntersectionResult {
  hasIntersection: boolean;
  intersectionCount: number;
  intersectionCoordinates: [number, number][];
}

/**
 * Calculates geodesic distance between two [longitude, latitude] coordinates in kilometers.
 */
export function calculateDistanceKm(
  fromCoord: [number, number],
  toCoord: [number, number],
): number {
  if (!fromCoord || !toCoord) return 0;
  const fromPt = turf.point(fromCoord);
  const toPt = turf.point(toCoord);
  const dist = turf.distance(fromPt, toPt, { units: 'kilometers' });
  return Number(dist.toFixed(2));
}

/**
 * Calculates initial navigational bearing from origin to destination coordinate in degrees [0, 360).
 */
export function calculateBearingDeg(
  fromCoord: [number, number],
  toCoord: [number, number],
): number {
  if (!fromCoord || !toCoord) return 0;
  const fromPt = turf.point(fromCoord);
  const toPt = turf.point(toCoord);
  let b = turf.bearing(fromPt, toPt);
  // Normalize [-180, 180] to [0, 360)
  if (b < 0) {
    b += 360;
  }
  return Number(b.toFixed(1));
}

/**
 * Calculates cross-track distance in kilometers from a given point [longitude, latitude]
 * to a route defined by an array of coordinates [[lon, lat], ...].
 */
export function calculatePointToRouteDistanceKm(
  pointCoord: [number, number],
  routeCoords: [number, number][],
): number {
  if (!pointCoord || !Array.isArray(routeCoords) || routeCoords.length < 2) return 0;
  const pt = turf.point(pointCoord);
  const line = turf.lineString(routeCoords);
  const dist = turf.pointToLineDistance(pt, line, { units: 'kilometers' });
  return Number(dist.toFixed(2));
}

/**
 * Checks if a point [longitude, latitude] falls inside a polygon ring [[lon, lat], ...].
 */
export function isPointInHazardPolygon(
  pointCoord: [number, number],
  polygonRings: [number, number][][] | [number, number][],
): boolean {
  if (!pointCoord || !polygonRings || polygonRings.length === 0) return false;

  try {
    const pt = turf.point(pointCoord);
    // Determine whether polygonRings is a single ring or array of rings
    const rings = Array.isArray(polygonRings[0]) && Array.isArray(polygonRings[0][0])
      ? (polygonRings as [number, number][][])
      : [polygonRings as [number, number][]];

    // Ensure first and last coordinate match in ring
    const closedRings = rings.map((ring) => {
      if (ring.length < 3) return ring;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, first];
      }
      return ring;
    });

    if (closedRings[0].length < 4) return false;

    const poly = turf.polygon(closedRings);
    return turf.booleanPointInPolygon(pt, poly);
  } catch {
    return false;
  }
}

/**
 * Finds all intersection points between a route line and a hazard polygon.
 */
export function findRouteHazardIntersections(
  routeCoords: [number, number][],
  polygonRings: [number, number][][] | [number, number][],
): RouteHazardIntersectionResult {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2 || !polygonRings || polygonRings.length === 0) {
    return { hasIntersection: false, intersectionCount: 0, intersectionCoordinates: [] };
  }

  try {
    const line = turf.lineString(routeCoords);
    const rings = Array.isArray(polygonRings[0]) && Array.isArray(polygonRings[0][0])
      ? (polygonRings as [number, number][][])
      : [polygonRings as [number, number][]];

    const closedRings = rings.map((ring) => {
      if (ring.length < 3) return ring;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, first];
      }
      return ring;
    });

    if (closedRings[0].length < 4) {
      return { hasIntersection: false, intersectionCount: 0, intersectionCoordinates: [] };
    }

    const poly = turf.polygon(closedRings);
    const intersectFc = turf.lineIntersect(line, poly);

    const coords: [number, number][] = (intersectFc.features || []).map((f) => {
      const c = f.geometry.coordinates as [number, number];
      return [Number(c[0].toFixed(4)), Number(c[1].toFixed(4))];
    });

    return {
      hasIntersection: coords.length > 0,
      intersectionCount: coords.length,
      intersectionCoordinates: coords,
    };
  } catch {
    return { hasIntersection: false, intersectionCount: 0, intersectionCoordinates: [] };
  }
}

/**
 * Computes total route distance in kilometers.
 */
export function calculateRouteLengthKm(routeCoords: [number, number][]): number {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2) return 0;
  try {
    const line = turf.lineString(routeCoords);
    const len = turf.length(line, { units: 'kilometers' });
    return Number(len.toFixed(2));
  } catch {
    return 0;
  }
}
