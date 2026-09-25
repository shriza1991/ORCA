import type { MapLayer } from '../types/contracts';
import type { EvaluatedRouteItem, SectorHazard, VesselHazardAssociation } from '../api/client';
import { getBaseLayers } from '../api/client';

/**
 * Authoritative Indian Coastal Harbor Coordinates [longitude, latitude] (EPSG:4326)
 * Aligned with backend/app/connectors/harbors.py and data/reference/landing_centres.json
 */
export const HARBOR_COORDINATES: Record<string, [number, number]> = {
  Ratnagiri: [73.28, 16.99],
  Malvan: [73.47, 16.06],
  Panaji: [73.83, 15.49],
  Mumbai: [72.87, 18.92],
  Veraval: [70.37, 20.90],
  Porbandar: [69.60, 21.64],
};

export function getHarborCoordinates(harborName?: string): [number, number] {
  if (!harborName) return HARBOR_COORDINATES.Ratnagiri;
  const match = Object.keys(HARBOR_COORDINATES).find(
    (k) => k.toLowerCase() === harborName.trim().toLowerCase()
  );
  return match ? HARBOR_COORDINATES[match] : HARBOR_COORDINATES.Ratnagiri;
}

/**
 * Creates a baseline GeoJSON MapLayer representing the selected Departure Harbor.
 */
export function createHarborLayer(harborName: string, status: string = 'UNKNOWN'): MapLayer {
  const [lon, lat] = getHarborCoordinates(harborName);
  const color =
    status === 'NO_GO' ? '#ef4444' : status === 'CAUTION' ? '#eab308' : status === 'GO' ? '#0ea5e9' : '#64748b';

  return {
    layer_id: `layer_harbor_${harborName.toLowerCase().replace(/\s+/g, '_')}`,
    name: `Departure Station: ${harborName}`,
    layer_type: 'geojson',
    visible: true,
    style: {
      color,
      opacity: 1.0,
      circle_radius: 10,
      layer_category: 'navigation',
    },
    geojson: {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
      properties: {
        harbor: harborName,
        label: `${harborName} Departure Station`,
        coordinates: `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
        operational_status: status,
        type: 'Departure Harbor Station',
      },
    },
  };
}

import type { DemoSector } from '../api/client';

export interface SectorDefinition {
  center: [number, number];
  zoom: number;
  label: string;
  stationName: string;
  polygon: [number, number][];
  bufferPolygon?: [number, number][];
}

/**
 * DEMO / SYNTHETIC FALLBACK ONLY
 * Used solely for offline dropdown continuity when backend API is unreachable.
 * Never used to fabricate operational telemetry, vessel coordinates, or alerts.
 * Authoritative sector geometry is served dynamically via GET /api/v1/demo/sectors.
 */
export const FALLBACK_DEMO_SECTORS: DemoSector[] = [
  {
    public_id: 'sector-ratnagiri',
    name: 'Ratnagiri Sector (MH-03)',
    code: 'MH-03',
    station_name: 'Ratnagiri Coast Guard & Fisheries Post',
    harbor_id: 'harbor-ratnagiri',
    center: [73.28, 16.99],
    zoom: 8.8,
    polygon: [
      [72.50, 16.45],
      [73.35, 16.50],
      [73.34, 16.70],
      [73.30, 16.88],
      [73.30, 17.05],
      [73.24, 17.32],
      [73.18, 17.55],
      [72.55, 17.55],
      [72.45, 17.00],
      [72.50, 16.45],
    ],
  },
  {
    public_id: 'sector-malvan',
    name: 'Malvan Marine Zone (MH-04)',
    code: 'MH-04',
    station_name: 'Malvan Marine Surveillance Unit',
    harbor_id: 'harbor-malvan',
    center: [73.47, 16.06],
    zoom: 9.5,
    polygon: [
      [73.25, 15.90],
      [73.55, 15.90],
      [73.52, 16.00],
      [73.49, 16.07],
      [73.48, 16.16],
      [73.42, 16.25],
      [73.20, 16.25],
      [73.20, 16.05],
      [73.25, 15.90],
    ],
  },
  {
    public_id: 'sector-goa',
    name: 'Goa Naval Corridor (GA-01)',
    code: 'GA-01',
    station_name: 'Goa Port & Naval Traffic Center',
    harbor_id: 'harbor-panaji',
    center: [73.83, 15.49],
    zoom: 9.0,
    polygon: [
      [73.35, 15.05],
      [74.05, 15.05],
      [73.98, 15.25],
      [73.83, 15.42],
      [73.82, 15.52],
      [73.74, 15.72],
      [73.68, 15.82],
      [73.38, 15.82],
      [73.30, 15.45],
      [73.35, 15.05],
    ],
  },
  {
    public_id: 'sector-mumbai',
    name: 'Mumbai Offshore (MH-01)',
    code: 'MH-01',
    station_name: 'Mumbai Maritime Rescue Coordination Centre',
    harbor_id: 'harbor-mumbai',
    center: [72.87, 18.92],
    zoom: 8.8,
    polygon: [
      [72.10, 18.45],
      [72.95, 18.45],
      [72.90, 18.70],
      [72.85, 18.95],
      [72.84, 19.18],
      [72.80, 19.38],
      [72.15, 19.38],
      [72.05, 18.95],
      [72.10, 18.45],
    ],
  },
  {
    public_id: 'sector-veraval',
    name: 'Veraval Coastal Zone (GJ-02)',
    code: 'GJ-02',
    station_name: 'Veraval Coastal Police & Fisheries Command',
    harbor_id: 'harbor-veraval',
    center: [70.37, 20.90],
    zoom: 8.5,
    polygon: [
      [69.75, 20.60],
      [70.92, 20.35],
      [70.95, 20.72],
      [70.75, 20.80],
      [70.40, 20.92],
      [70.12, 21.15],
      [69.75, 21.32],
      [69.65, 20.95],
      [69.75, 20.60],
    ],
  },
];

export const SECTOR_SURVEILLANCE_CONFIGS: Record<string, SectorDefinition> = Object.fromEntries(
  FALLBACK_DEMO_SECTORS.map((s) => [
    s.name,
    {
      center: s.center,
      zoom: s.zoom,
      label: s.name,
      stationName: s.station_name,
      polygon: s.polygon,
    },
  ])
);

export function getSectorConfig(sectorName: string): SectorDefinition {
  return SECTOR_SURVEILLANCE_CONFIGS[sectorName] || SECTOR_SURVEILLANCE_CONFIGS['Ratnagiri Sector (MH-03)'];
}

/**
 * Presentation helper: maps a canonical backend DemoSector or sector name to MapLibre MapLayer objects.
 * When allSectors is provided, only the active sector receives colored operational visualization,
 * while other sectors remain subtle faint background boundaries.
 */
export function createSectorLayers(
  sectorInput: DemoSector | string,
  _allSectors?: DemoSector[],
): MapLayer[] {
  let activeSector: DemoSector;
  if (typeof sectorInput === 'string') {
    activeSector = FALLBACK_DEMO_SECTORS.find((s) => s.name === sectorInput || s.public_id === sectorInput) || FALLBACK_DEMO_SECTORS[0];
  } else {
    activeSector = sectorInput;
  }

  const activeSectorId = activeSector.public_id || activeSector.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const layers: MapLayer[] = [];

  // 1. Inactive sector boundaries as subtle background context (faint outline only, no active colored operational fill)
  if (_allSectors && _allSectors.length > 0) {
    for (const sec of _allSectors) {
      const secId = sec.public_id || sec.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (secId === activeSectorId) continue;

      layers.push({
        layer_id: `sector_boundary_inactive_${secId}`,
        name: `${sec.name} (Boundary)`,
        layer_type: 'geojson',
        visible: true,
        style: {
          color: '#64748b',
          opacity: 0.02,
          line_width: 1,
          line_dasharray: [4, 4],
          layer_category: 'background',
        },
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [sec.polygon],
              },
              properties: {
                sector: sec.name,
                status: 'INACTIVE_SECTOR_BOUNDARY',
                is_active_sector: false,
              },
            },
          ],
        },
      });
    }
  }

  // 2. Active selected sector: prominent colored operational zone & station marker
  const sectorPolygonLayer: MapLayer = {
    layer_id: `sector_polygon_${activeSectorId}`,
    name: activeSector.name,
    layer_type: 'geojson',
    visible: true,
    style: {
      color: '#a855f7',
      opacity: 0.25,
      line_width: 2.5,
      layer_category: 'surveillance',
    },
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [activeSector.polygon],
          },
          properties: {
            sector: activeSector.name,
            type: 'Active Maritime Surveillance Sector',
            authority: 'Coastal Security & Fisheries Enforcement',
            is_active_sector: true,
          },
        },
      ],
    },
  };

  const sectorStationLayer: MapLayer = {
    layer_id: `sector_station_${activeSectorId}`,
    name: activeSector.station_name,
    layer_type: 'geojson',
    visible: true,
    style: {
      color: '#c084fc',
      opacity: 1.0,
      circle_radius: 10,
      layer_category: 'surveillance',
    },
    geojson: {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: activeSector.center,
      },
      properties: {
        station: activeSector.station_name,
        sector: activeSector.name,
        type: 'Maritime Command & Radar Station',
        status: 'ACTIVE_SURVEILLANCE',
        is_active_sector: true,
      },
    },
  };

  layers.push(sectorPolygonLayer, sectorStationLayer);
  return layers;
}

/** Convert canonical Authority hazard geometry into inspectable MapLibre layers. */
export function createAuthorityHazardLayers(
  hazards: SectorHazard[],
  selectedHazardId?: string | null,
): MapLayer[] {
  return hazards.map((hazard) => {
    const isSelected = hazard.hazard_id === selectedHazardId;
    const isActive = hazard.status !== 'INACTIVE' && hazard.status !== 'EXPIRED';
    const color = isSelected
      ? '#facc15'
      : hazard.severity === 'WARNING'
      ? '#ef4444'
      : hazard.severity === 'ALERT'
      ? '#f97316'
      : '#eab308';

    return {
      layer_id: `authority_hazard_${hazard.hazard_id}`,
      name: hazard.headline,
      layer_type: 'geojson',
      visible: true,
      style: {
        color,
        opacity: isSelected ? 0.58 : 0.32,
        line_width: isSelected ? 4.5 : 2.5,
        layer_category: 'authority_hazard',
      },
      properties: {
        hazard_id: hazard.hazard_id,
        hazard_type: hazard.hazard_type,
        severity: hazard.severity,
        status: hazard.status,
        is_active: isActive,
        valid_from: hazard.valid_from,
        valid_to: hazard.valid_to,
        selected_for_alert_inspection: isSelected,
      },
      geojson: {
        type: 'Feature',
        geometry: hazard.geometry,
        properties: {
          hazard_id: hazard.hazard_id,
          hazard_type: hazard.hazard_type,
          severity: hazard.severity,
          status: hazard.status,
          is_active: isActive,
          valid_from: hazard.valid_from,
          valid_to: hazard.valid_to,
          selected_for_alert_inspection: isSelected,
        },
      },
    };
  });
}

/** Highlight current canonical vessel positions already inside an active hazard area. */
export function createHazardAssociationLayers(
  associations: VesselHazardAssociation[],
  selectedAssociation?: Pick<VesselHazardAssociation, 'vessel_id' | 'hazard_id'> | null,
): MapLayer[] {
  return associations.map((association) => {
    const isSelected = association.vessel_id === selectedAssociation?.vessel_id
      && association.hazard_id === selectedAssociation.hazard_id;
    return {
    layer_id: `hazard_association_${association.vessel_id}_${association.hazard_id}`,
    name: `Hazard association: ${association.vessel_id}`,
    layer_type: 'geojson',
    visible: true,
    style: {
      color: isSelected ? '#facc15' : '#ef4444',
      opacity: 1,
      circle_radius: isSelected ? 16 : 12,
      line_width: isSelected ? 3 : undefined,
      layer_category: 'hazard_association',
    },
    geojson: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: association.vessel_position },
      properties: {
        vessel_id: association.vessel_id,
        hazard_id: association.hazard_id,
        association_type: association.association_type,
        evaluated_at: association.evaluated_at,
        selected_for_alert_inspection: isSelected,
      },
    },
  };
  });
}

/**
 * Fetches official base operational boundaries (IMBL, Naval ranges, MPAs)
 * from GET /api/v1/layers/base and maps them to canonical MapLayers.
 */
export async function fetchAndFormatBaseLayers(): Promise<MapLayer[]> {
  try {
    const fc = await getBaseLayers();
    if (!fc || !Array.isArray(fc.features)) return [];

    return fc.features.map((f: any, idx: number) => {
      const props = f.properties || {};
      const level = props.restriction_level || 'INFORMATIONAL';
      const polyType = (props.polygon_type || '').toUpperCase();
      const isEEZ = polyType === 'EEZ_BOUNDARY' || (props.name && String(props.name).includes('EEZ'));
      const isTerritorial = polyType === 'TERRITORIAL_WATERS' || (props.name && String(props.name).includes('Territorial'));
      const isNational = isEEZ || isTerritorial;
      const color =
        level === 'NO_GO'
          ? '#ef4444'
          : level === 'NO_GO_TRAWLING'
          ? '#f97316'
          : level === 'ADVISORY_ALERT'
          ? '#eab308'
          : isTerritorial
          ? '#0ea5e9'
          : isEEZ
          ? '#38bdf8'
          : '#38bdf8';

      return {
        layer_id: `base_${props.polygon_id || idx}`,
        name: props.name || `Operational Zone ${idx + 1}`,
        layer_type: 'geojson' as const,
        visible: true,
        style: {
          color,
          opacity: isTerritorial ? 0.08 : isEEZ ? 0.04 : 0.22,
          line_width: isTerritorial ? 2 : isEEZ ? 1.5 : 2,
          layer_category: isNational ? 'national_boundary' : 'base_geofence',
        },
        geojson: f,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Checks whether a MapLayer represents a national maritime boundary (EEZ or territorial sea),
 * which should remain visible nationwide and not be culled by local harbor/sector bounds.
 */
function isNationalMaritimeBoundary(layer: MapLayer): boolean {
  const id = (layer.layer_id || '').toLowerCase();
  const name = (layer.name || '').toLowerCase();
  const category = (layer.style?.layer_category || '').toLowerCase();
  const polyType = (layer.geojson?.properties?.polygon_type || '').toLowerCase();

  return (
    id.includes('eez') ||
    id.includes('territorial') ||
    id.includes('boundary') ||
    name.includes('exclusive economic zone') ||
    name.includes('eez') ||
    name.includes('territorial') ||
    name.includes('water boundary') ||
    category === 'national_boundary' ||
    category === 'national_eez' ||
    polyType === 'eez_boundary' ||
    polyType === 'territorial_waters' ||
    polyType === 'island_water_boundary'
  );
}

/**
 * Extracts a bounding box from a GeoJSON Feature or FeatureCollection.
 */
function extractGeojsonBBox(geojson: any): [number, number, number, number] | null {
  if (!geojson) return null;

  const coords: [number, number][] = [];

  function collectCoords(obj: any): void {
    if (!obj) return;
    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      obj.features.forEach(collectCoords);
    } else if (obj.type === 'Feature') {
      collectCoords(obj.geometry);
    } else if (obj.coordinates) {
      flattenCoords(obj.coordinates);
    }
  }

  function flattenCoords(c: any): void {
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      coords.push([c[0], c[1]]);
    } else if (Array.isArray(c)) {
      c.forEach(flattenCoords);
    }
  }

  collectCoords(geojson);
  if (coords.length === 0) return null;

  let minLng = coords[0][0], maxLng = coords[0][0];
  let minLat = coords[0][1], maxLat = coords[0][1];
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Filters MapLayers to only include those whose GeoJSON geometry falls within
 * a region defined by a center point and a padding (in degrees).
 *
 * Used by Fisher and Authority pages to show only region-specific base layers
 * (IMBL, MPAs, Naval ranges) instead of all global boundaries. Sovereign national
 * water boundaries (EEZ, Territorial Waters) are preserved across all regions.
 */
export function filterLayersByRegion(
  layers: MapLayer[],
  regionCenter: [number, number],
  paddingDeg: number = 2.0,
): MapLayer[] {
  const [centerLng, centerLat] = regionCenter;
  const bbox: [number, number, number, number] = [
    centerLng - paddingDeg,
    centerLat - paddingDeg,
    centerLng + paddingDeg,
    centerLat + paddingDeg,
  ];

  return layers.filter((layer) => {
    if (isNationalMaritimeBoundary(layer)) return true;
    if (!layer.geojson) return true;
    const layerBBox = extractGeojsonBBox(layer.geojson);
    if (!layerBBox) return true;
    const [lMinLng, lMinLat, lMaxLng, lMaxLat] = layerBBox;
    return lMinLng <= bbox[2] && lMaxLng >= bbox[0] && lMinLat <= bbox[3] && lMaxLat >= bbox[1];
  });
}

/**
 * Filters MapLayers to only include those whose GeoJSON geometry falls within
 * a sector's bounding polygon (with padding).
 *
 * Sovereign national water boundaries (EEZ, Territorial Waters) are preserved across all sectors.
 */
export function filterLayersBySectorPolygon(
  layers: MapLayer[],
  polygon: [number, number][],
  paddingDeg: number = 1.0,
): MapLayer[] {
  if (!polygon || polygon.length < 3) return layers;

  // Compute bbox from sector polygon with padding
  let minLng = polygon[0][0], maxLng = polygon[0][0];
  let minLat = polygon[0][1], maxLat = polygon[0][1];
  for (const [lng, lat] of polygon) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const bbox: [number, number, number, number] = [
    minLng - paddingDeg,
    minLat - paddingDeg,
    maxLng + paddingDeg,
    maxLat + paddingDeg,
  ];

  return layers.filter((layer) => {
    if (isNationalMaritimeBoundary(layer)) return true;
    if (!layer.geojson) return true;
    const layerBBox = extractGeojsonBBox(layer.geojson);
    if (!layerBBox) return true;
    const [lMinLng, lMinLat, lMaxLng, lMaxLat] = layerBBox;
    return lMinLng <= bbox[2] && lMaxLng >= bbox[0] && lMinLat <= bbox[3] && lMaxLat >= bbox[1];
  });
}

/**
 * Creates canonical MapLayers for Route Alternatives.
 */
export function createAuthorityRouteLayers(
  routes: EvaluatedRouteItem[],
  recommendedRouteId?: string | null,
  origin?: string,
  destination?: string,
): MapLayer[] {
  if (!routes || routes.length === 0) return [];
  const recId = recommendedRouteId || routes[0]?.route_id;
  const recommendedRoute = routes.find((r) => r.route_id === recId) || routes[0];
  const candidateRoutes = routes.filter((r) => r !== recommendedRoute);

  const layers: MapLayer[] = [];

  if (candidateRoutes.length > 0) {
    layers.push({
      layer_id: 'layer_candidate_routes',
      name: 'Candidate Passage Routes',
      layer_type: 'geojson',
      visible: true,
      style: {
        color: '#38bdf8',
        opacity: 0.5,
        line_width: 2.5,
        line_dasharray: [3, 3],
        layer_category: 'navigation',
      },
      geojson: {
        type: 'FeatureCollection',
        features: candidateRoutes.map((r) => ({
          type: 'Feature',
          id: r.route_id,
          geometry: {
            type: 'LineString',
            coordinates: r.waypoints,
          },
          properties: {
            route_id: r.route_id,
            name: r.name,
            distance_km: r.distance_km,
            max_wave_height_m: r.max_wave_height_m,
            risk_rating: r.risk_rating,
            exposure_score: r.exposure_score,
            is_recommended: false,
            origin,
            destination,
          },
        })),
      },
    });
  }

  if (recommendedRoute) {
    layers.push({
      layer_id: 'layer_recommended_route',
      name: `Recommended Route (${recommendedRoute.name})`,
      layer_type: 'geojson',
      visible: true,
      style: {
        color: '#06b6d4',
        opacity: 0.95,
        line_width: 4,
        layer_category: 'navigation',
      },
      geojson: {
        type: 'Feature',
        id: recommendedRoute.route_id,
        geometry: {
          type: 'LineString',
          coordinates: recommendedRoute.waypoints,
        },
        properties: {
          route_id: recommendedRoute.route_id,
          name: recommendedRoute.name,
          distance_km: recommendedRoute.distance_km,
          max_wave_height_m: recommendedRoute.max_wave_height_m,
          risk_rating: recommendedRoute.risk_rating,
          exposure_score: recommendedRoute.exposure_score,
          is_recommended: true,
          origin,
          destination,
        },
      },
    });
  }

  return layers;
}
