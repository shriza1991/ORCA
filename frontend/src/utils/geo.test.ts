import { describe, it, expect } from "vitest";
import {
  HARBOR_COORDINATES,
  getHarborCoordinates,
  createHarborLayer,
  SECTOR_SURVEILLANCE_CONFIGS,
  getSectorConfig,
  createSectorLayers,
  createAuthorityHazardLayers,
  filterLayersByRegion,
  filterLayersBySectorPolygon,
  haversineDistanceKm,
  haversineDistanceNm,
  initialBearingDeg,
  compassDirection,
  calculateTransitTime,
  generateRadarRangeRings,
  generateWindVectorGrid,
} from "./geo";
import type { MapLayer } from "../types/contracts";

describe("Geospatial Utilities & Baseline Situational Layers", () => {
  it("maps only supplied canonical Authority hazards and clears old-sector layers", () => {
    const ratnagiriLayers = createAuthorityHazardLayers([
      {
        hazard_id: "hazard-01",
        hazard_type: "CYCLONE_SQUALL",
        severity: "WARNING",
        status: "ACTIVE",
        headline: "Konkan warning",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [72.8, 16.4],
              [73.4, 16.4],
              [73.4, 17.1],
              [72.8, 16.4],
            ],
          ],
        },
        valid_from: "2026-09-12T00:00:00Z",
        valid_to: "2026-09-12T10:00:00Z",
        provenance: {},
      },
    ]);
    const goaLayers = createAuthorityHazardLayers([
      {
        hazard_id: "hazard-03",
        hazard_type: "HIGH_WIND",
        severity: "WARNING",
        status: "ACTIVE",
        headline: "Goa wind warning",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [73.4, 15.2],
              [73.8, 15.2],
              [73.8, 15.6],
              [73.4, 15.2],
            ],
          ],
        },
        valid_from: "2026-09-12T00:00:00Z",
        valid_to: "2026-09-12T10:00:00Z",
        provenance: {},
      },
    ]);

    expect(ratnagiriLayers.map((layer) => layer.layer_id)).toEqual([
      "authority_hazard_hazard-01",
    ]);
    expect(goaLayers.map((layer) => layer.layer_id)).toEqual([
      "authority_hazard_hazard-03",
    ]);
    expect(createAuthorityHazardLayers([])).toEqual([]);
  });
  it("resolves canonical harbor coordinates accurately", () => {
    expect(getHarborCoordinates("Ratnagiri")).toEqual([73.2847, 16.9942]);
    expect(getHarborCoordinates("Mumbai")).toEqual([72.8258, 18.9158]);
    expect(getHarborCoordinates("Malvan")).toEqual([73.4658, 16.0583]);
    expect(getHarborCoordinates("Panaji")).toEqual([73.8378, 15.5033]);
    expect(getHarborCoordinates("Veraval")).toEqual([70.3689, 20.9022]);
    expect(getHarborCoordinates("Porbandar")).toEqual([69.6, 21.64]);
    // Case-insensitive fallback
    expect(getHarborCoordinates("mumbai")).toEqual([72.8258, 18.9158]);
    expect(getHarborCoordinates(undefined)).toEqual(
      HARBOR_COORDINATES.Ratnagiri,
    );
  });

  it("generates valid GeoJSON MapLayer for departure harbors", () => {
    const layer = createHarborLayer("Malvan", "GO");
    expect(layer.layer_id).toBe("layer_harbor_malvan");
    expect(layer.name).toContain("Malvan");
    expect(layer.layer_type).toBe("geojson");
    expect(layer.geojson.type).toBe("Feature");
    expect(layer.geojson.geometry.coordinates).toEqual([73.4658, 16.0583]);
    expect(layer.style?.color).toBe("#0ea5e9");

    const noGoLayer = createHarborLayer("Ratnagiri", "NO_GO");
    expect(noGoLayer.style?.color).toBe("#ef4444");
  });

  it("resolves authority surveillance sector configs and polygons", () => {
    const config = getSectorConfig("Malvan Marine Zone (MH-04)");
    expect(config.center).toEqual([73.47, 16.06]);
    expect(config.label).toContain("Malvan");
    expect(config.polygon.length).toBeGreaterThanOrEqual(4);

    const fallbackConfig = getSectorConfig("Unknown Sector");
    expect(fallbackConfig).toEqual(
      SECTOR_SURVEILLANCE_CONFIGS["Ratnagiri Sector (MH-03)"],
    );
  });

  it("generates sector polygon and surveillance station layers", () => {
    const layers = createSectorLayers("Goa Naval Corridor (GA-01)");
    expect(layers).toHaveLength(2);

    const [polygonLayer, stationLayer] = layers;
    expect(polygonLayer.geojson.type).toBe("FeatureCollection");
    expect(polygonLayer.style?.color).toBe("#a855f7");
    expect(polygonLayer.geojson.features?.[0]?.geometry.type).toBe("Polygon");

    expect(stationLayer.geojson.type).toBe("Feature");
    expect(stationLayer.geojson.geometry.type).toBe("Point");
    expect(stationLayer.geojson.geometry.coordinates).toEqual([73.83, 15.49]);
  });

  it("filters local geofences by region while preserving national maritime boundaries (EEZ and island waters)", () => {
    const mockLayers: MapLayer[] = [
      {
        layer_id: "base_POLY-NAV-GOA-01",
        name: "Naval Firing Range Foxtrot (Goa Sector)",
        layer_type: "geojson",
        visible: true,
        geojson: {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [73.15, 15.3],
                [73.35, 15.3],
                [73.35, 15.55],
                [73.15, 15.55],
                [73.15, 15.3],
              ],
            ],
          },
          properties: {
            polygon_id: "POLY-NAV-GOA-01",
            polygon_type: "NAVAL_FIRING_RANGE",
          },
        },
      },
      {
        layer_id: "base_POLY-EEZ-IND-ANDAMAN",
        name: "Indian Exclusive Economic Zone (Andaman & Nicobar Islands)",
        layer_type: "geojson",
        visible: true,
        geojson: {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [88.8, 3.84],
                [95.7, 3.84],
                [95.7, 15.72],
                [88.8, 15.72],
                [88.8, 3.84],
              ],
            ],
          },
          properties: {
            polygon_id: "POLY-EEZ-IND-ANDAMAN",
            polygon_type: "EEZ_BOUNDARY",
          },
        },
      },
      {
        layer_id: "base_POLY-TERRITORIAL-LAKSHADWEEP",
        name: "Lakshadweep Islands Sovereign Territorial Waters (12 NM)",
        layer_type: "geojson",
        visible: true,
        geojson: {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [71.52, 8.06],
                [73.91, 8.06],
                [73.91, 12.6],
                [71.52, 12.6],
                [71.52, 8.06],
              ],
            ],
          },
          properties: {
            polygon_id: "POLY-TERRITORIAL-LAKSHADWEEP",
            polygon_type: "TERRITORIAL_WATERS",
          },
        },
      },
    ];

    // Filter by Ratnagiri region (center: [73.28, 16.99], padding: 1.0 deg)
    // Goa firing range (lat ~15.4) is outside 1.0 deg padding from Ratnagiri (lat 16.99)
    const filtered = filterLayersByRegion(mockLayers, [73.28, 16.99], 1.0);

    // Local Goa range should be filtered out
    expect(filtered.some((l) => l.layer_id === "base_POLY-NAV-GOA-01")).toBe(
      false,
    );

    // Sovereign Andaman & Nicobar and Lakshadweep boundaries MUST be preserved
    expect(
      filtered.some((l) => l.layer_id === "base_POLY-EEZ-IND-ANDAMAN"),
    ).toBe(true);
    expect(
      filtered.some((l) => l.layer_id === "base_POLY-TERRITORIAL-LAKSHADWEEP"),
    ).toBe(true);

    // Also test filterLayersBySectorPolygon with a tight Ratnagiri sector polygon
    const ratnagiriPoly: [number, number][] = [
      [72.5, 16.5],
      [73.5, 16.5],
      [73.5, 17.5],
      [72.5, 17.5],
      [72.5, 16.5],
    ];
    const sectorFiltered = filterLayersBySectorPolygon(
      mockLayers,
      ratnagiriPoly,
      0.5,
    );
    expect(
      sectorFiltered.some((l) => l.layer_id === "base_POLY-NAV-GOA-01"),
    ).toBe(false);
    expect(
      sectorFiltered.some((l) => l.layer_id === "base_POLY-EEZ-IND-ANDAMAN"),
    ).toBe(true);
    expect(
      sectorFiltered.some(
        (l) => l.layer_id === "base_POLY-TERRITORIAL-LAKSHADWEEP",
      ),
    ).toBe(true);
  });

  describe('Nautical Mathematics & Radar/Wind Vector Systems', () => {
    const ratnagiri: [number, number] = [73.28, 16.99];
    const malvan: [number, number] = [73.47, 16.06];

    it('calculates deterministic spherical Haversine distances in km and nm', () => {
      const distKm = haversineDistanceKm(ratnagiri, malvan);
      const distNm = haversineDistanceNm(ratnagiri, malvan);

      expect(distKm).toBeGreaterThan(100);
      expect(distKm).toBeLessThan(110);
      expect(distNm).toBeCloseTo(distKm / 1.852, 2);
    });

    it('calculates true bearing and cardinal compass directions accurately', () => {
      // Ratnagiri to Malvan sails South-Southeast (~169°)
      const bearing = initialBearingDeg(ratnagiri, malvan);
      expect(bearing).toBeGreaterThan(160);
      expect(bearing).toBeLessThan(180);
      expect(compassDirection(bearing)).toBe('S');
      expect(compassDirection(157.5)).toBe('SSE');

      // Cardinal direction checks
      expect(compassDirection(0)).toBe('N');
      expect(compassDirection(90)).toBe('E');
      expect(compassDirection(180)).toBe('S');
      expect(compassDirection(270)).toBe('W');
      expect(compassDirection(245)).toBe('WSW');
    });

    it('calculates transit time estimates based on nautical distance and vessel speed', () => {
      // 57 nm at 9.5 knots = 6 hours
      const transit = calculateTransitTime(57, 9.5);
      expect(transit.hours).toBe(6);
      expect(transit.minutes).toBe(0);
      expect(transit.text).toBe('~6h');

      // 12.5 nm at 8 knots = ~1h 34m
      const transitShort = calculateTransitTime(12.5, 8.0);
      expect(transitShort.hours).toBe(1);
      expect(transitShort.minutes).toBe(34);
      expect(transitShort.text).toBe('~1h 34m');
    });

    it('generates radar range rings with concentric nautical radii and closed polygons', () => {
      const rings = generateRadarRangeRings(73.28, 16.99, [5, 12, 24]);
      expect(rings).toHaveLength(3);
      expect(rings[0].label).toBe('5 NM INNER PATROL');
      expect(rings[1].label).toBe('12 NM TERRITORIAL SEAS');
      expect(rings[2].label).toBe('24 NM SURVEILLANCE');

      // Check polygon is closed (first coord equals last coord)
      for (const r of rings) {
        expect(r.coords.length).toBeGreaterThan(24);
        const first = r.coords[0];
        const last = r.coords[r.coords.length - 1];
        expect(first[0]).toEqual(last[0]);
        expect(first[1]).toEqual(last[1]);
      }
    });

    it('generates directional wind and current vectors across sea sectors', () => {
      const vectors = generateWindVectorGrid(73.28, 16.99, 230, 22);
      expect(vectors.length).toBeGreaterThan(10);
      for (const v of vectors) {
        expect(v.position).toHaveLength(2);
        expect(v.bearing).toBeGreaterThanOrEqual(0);
        expect(v.bearing).toBeLessThanOrEqual(360);
        expect(v.speed).toBe(22);
        expect(v.color).toBe('#f59e0b'); // Fresh/Strong breeze color
      }
    });
  });
});

