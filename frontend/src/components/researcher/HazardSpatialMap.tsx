import { useState, useMemo, useCallback, useEffect } from 'react';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import { AlertTriangle } from 'lucide-react';
import DeckGLMapFoundation, { DEFAULT_VIEW_STATE } from '../map/DeckGLMapFoundation';
import type { HazardBulletin } from '../../api/researcher-client';

export interface HazardSpatialMapProps {
  hazards: HazardBulletin[];
  selectedHazardId?: string | null;
  onSelectHazard?: (hazardId: string) => void;
  loading?: boolean;
}

/**
 * Pure coordinate pair normalizer.
 * Accepts [number, number] or "lon lat" string pairs and validates coordinate ranges.
 */
function normalizeCoordPair(raw: any): [number, number] | null {
  let lon: number;
  let lat: number;

  if (Array.isArray(raw) && raw.length >= 2) {
    lon = Number(raw[0]);
    lat = Number(raw[1]);
  } else if (typeof raw === 'string') {
    const parts = raw.trim().split(/\s+/);
    if (parts.length >= 2) {
      lon = Number(parts[0]);
      lat = Number(parts[1]);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (
    isNaN(lon) ||
    isNaN(lat) ||
    lon < -180 ||
    lon > 180 ||
    lat < -90 ||
    lat > 90 ||
    (lon === 0 && lat === 0)
  ) {
    return null;
  }

  return [lon, lat];
}

/**
 * Normalizes a single polygon ring (array of coordinate pairs).
 * Ensures at least 3 distinct coordinates and proper closure.
 */
function normalizeRing(ring: any[]): [number, number][] | null {
  if (!Array.isArray(ring) || ring.length < 3) return null;

  const validPoints: [number, number][] = [];
  for (const item of ring) {
    const pt = normalizeCoordPair(item);
    if (pt) {
      validPoints.push(pt);
    }
  }

  if (validPoints.length < 3) return null;

  // Ensure closure
  const first = validPoints[0];
  const last = validPoints[validPoints.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    validPoints.push([first[0], first[1]]);
  }

  return validPoints.length >= 4 ? validPoints : null;
}

/**
 * Pure data transformation: converts Hazard bulletins with polygon geometries into a valid GeoJSON FeatureCollection.
 * Filters out invalid geometries without throwing or generating synthetic coordinates.
 */
export function buildHazardGeoJSON(hazards: HazardBulletin[]): GeoJSON.FeatureCollection {
  const validFeatures: GeoJSON.Feature[] = [];

  for (const h of hazards || []) {
    if (!h || !h.geometry_geojson) continue;

    const geom = h.geometry_geojson;
    const geomType = geom.type;

    if (geomType === 'Polygon' && Array.isArray(geom.coordinates)) {
      const normalizedRings: [number, number][][] = [];
      for (const ring of geom.coordinates) {
        const validRing = normalizeRing(ring);
        if (validRing) {
          normalizedRings.push(validRing);
        }
      }

      if (normalizedRings.length > 0) {
        validFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: normalizedRings,
          },
          properties: {
            public_id: h.public_id,
            headline: h.headline,
            event_type: h.event_type || 'GENERAL_HAZARD',
            severity: h.severity || 'UNKNOWN',
            status: h.status || 'ACTIVE',
            is_active: h.status === 'ACTIVE',
            is_expired: h.status === 'EXPIRED',
            issued_at: h.issued_at,
            valid_until: h.valid_until,
            source: h.source,
            affected_area: h.affected_area || '',
            description: h.description || '',
            qc_status: h.qc_status || 'VALID',
            provenance_json: h.provenance_json || null,
          },
        });
      }
    } else if (geomType === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      const normalizedPolygons: [number, number][][][] = [];
      for (const poly of geom.coordinates) {
        const polyRings: [number, number][][] = [];
        if (Array.isArray(poly)) {
          for (const ring of poly) {
            const validRing = normalizeRing(ring);
            if (validRing) {
              polyRings.push(validRing);
            }
          }
        }
        if (polyRings.length > 0) {
          normalizedPolygons.push(polyRings);
        }
      }

      if (normalizedPolygons.length > 0) {
        validFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'MultiPolygon',
            coordinates: normalizedPolygons,
          },
          properties: {
            public_id: h.public_id,
            headline: h.headline,
            event_type: h.event_type || 'GENERAL_HAZARD',
            severity: h.severity || 'UNKNOWN',
            status: h.status || 'ACTIVE',
            is_active: h.status === 'ACTIVE',
            is_expired: h.status === 'EXPIRED',
            issued_at: h.issued_at,
            valid_until: h.valid_until,
            source: h.source,
            affected_area: h.affected_area || '',
            description: h.description || '',
            qc_status: h.qc_status || 'VALID',
            provenance_json: h.provenance_json || null,
          },
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: validFeatures,
  };
}

export default function HazardSpatialMap({
  hazards = [],
  selectedHazardId,
  onSelectHazard,
  loading = false,
}: HazardSpatialMapProps) {
  const geojson = useMemo(() => buildHazardGeoJSON(hazards), [hazards]);

  // Derive initial geographic center from loaded hazards or Konkan coastline
  const initialMapCenter = useMemo<[number, number]>(() => {
    if (geojson.features.length === 0) return [73.28, 16.99];
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;

    for (const f of geojson.features) {
      const geom = f.geometry;
      if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
        for (const pt of geom.coordinates[0]) {
          sumLng += pt[0];
          sumLat += pt[1];
          count += 1;
        }
      }
    }

    return count > 0 ? [sumLng / count, sumLat / count] : [73.28, 16.99];
  }, [geojson]);

  const [viewState, setViewState] = useState<MapViewState>(() => ({
    ...DEFAULT_VIEW_STATE,
    longitude: initialMapCenter[0],
    latitude: initialMapCenter[1],
    zoom: 8.5,
    pitch: 48,
    bearing: -15,
  }));

  // Auto-focus camera on selected hazard bulletin
  useEffect(() => {
    if (!selectedHazardId) return;

    const targetFeature = geojson.features.find(
      (f) => f.properties?.public_id === selectedHazardId,
    );
    if (!targetFeature) return;

    const coords: [number, number][] = [];
    const geom = targetFeature.geometry;

    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
      coords.push(...(geom.coordinates[0] as [number, number][]));
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      for (const poly of geom.coordinates) {
        if (Array.isArray(poly[0])) coords.push(...(poly[0] as [number, number][]));
      }
    }

    if (coords.length === 0) return;

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
    const spanLng = Math.max(0.04, maxLng - minLng);
    const spanLat = Math.max(0.04, maxLat - minLat);
    const maxSpan = Math.max(spanLng, spanLat);

    let zoom = 10.2;
    if (maxSpan > 0.8) zoom = 8.6;
    else if (maxSpan > 0.4) zoom = 9.4;
    else if (maxSpan > 0.15) zoom = 10.0;
    else zoom = 10.8;

    setViewState((prev) => ({
      ...prev,
      longitude: centerLng,
      latitude: centerLat,
      zoom,
      transitionDuration: 600,
    }));
  }, [selectedHazardId, geojson]);

  // Deck.gl 3D Layers
  const layers = useMemo(() => {
    if (geojson.features.length === 0) return [];

    return [
      new GeoJsonLayer({
        id: 'researcher-hazards-3d',
        data: geojson,
        pickable: true,
        stroked: true,
        filled: true,
        extruded: true,
        wireframe: true,
        lineWidthMinPixels: 2,
        getElevation: (f: any) => {
          const isSelected = f.properties?.public_id === selectedHazardId;
          const sev = (f.properties?.severity || '').toUpperCase();
          if (isSelected) return 2600;
          if (sev === 'CRITICAL' || sev === 'WARNING') return 2000;
          if (sev === 'ALERT') return 1400;
          if (sev === 'WATCH') return 800;
          return 500;
        },
        getLineColor: (f: any) => {
          const isSelected = f.properties?.public_id === selectedHazardId;
          if (isSelected) return [250, 204, 21, 255]; // Bright Gold
          if (f.properties?.is_expired) return [100, 116, 139, 140]; // Slate expired
          const sev = (f.properties?.severity || '').toUpperCase();
          if (sev === 'CRITICAL' || sev === 'WARNING') return [239, 68, 68, 230]; // Red
          if (sev === 'ALERT') return [249, 115, 22, 210]; // Orange
          return [234, 179, 8, 190]; // Yellow
        },
        getFillColor: (f: any) => {
          const isSelected = f.properties?.public_id === selectedHazardId;
          if (isSelected) return [250, 204, 21, 60];
          if (f.properties?.is_expired) return [100, 116, 139, 20];
          const sev = (f.properties?.severity || '').toUpperCase();
          if (sev === 'CRITICAL' || sev === 'WARNING') return [239, 68, 68, 35];
          if (sev === 'ALERT') return [249, 115, 22, 28];
          return [234, 179, 8, 22];
        },
        getLineWidth: (f: any) => (f.properties?.public_id === selectedHazardId ? 4 : 2),
      }),
    ];
  }, [geojson, selectedHazardId]);

  // Tooltip
  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.picked || !info.object) return null;
    const p = info.object.properties || info.object;
    return {
      html: `
        <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.96); border: 1px solid #ef4444; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
          <div style="font-weight: 700; color: #ef4444; display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
            ⚠️ ${p.event_type || 'Marine Hazard'}
          </div>
          <div style="font-weight: 600; color: #fff; font-size: 11px;">${p.headline || 'Active Hazard Bulletin'}</div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 3px;">
            Severity: <strong style="color: #facc15;">${p.severity || 'UNKNOWN'}</strong> · Status: <strong>${p.status || 'ACTIVE'}</strong>
          </div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 2px;">
            Affected Area: <strong>${p.affected_area || 'Coastal Zone'}</strong>
          </div>
          <div style="color: #94a3b8; font-size: 10px; margin-top: 3px;">
            Valid: ${p.issued_at ? new Date(p.issued_at).toLocaleDateString() : '—'} → ${p.valid_until ? new Date(p.valid_until).toLocaleDateString() : '—'} · Source: ${p.source || 'IMD / INCOIS'}
          </div>
        </div>
      `,
      style: { zIndex: '1000' },
    };
  }, []);

  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (info.picked && info.object?.properties?.public_id && onSelectHazard) {
        onSelectHazard(info.object.properties.public_id);
      }
    },
    [onSelectHazard],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '380px' }}>
      <DeckGLMapFoundation
        layers={layers}
        viewState={viewState}
        onViewStateChange={setViewState}
        getTooltip={getTooltip}
        onClick={handleClick}
        topOverlay={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '12px', fontWeight: 700 }}>Hazard Bulletin 3D Spatial Zones</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>({geojson.features.length} Bulletins)</span>
            </div>
            {loading && <span style={{ fontSize: '11px', color: '#38bdf8' }}>Loading hazards...</span>}
          </div>
        }
        bottomOverlay={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              background: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#cbd5e1',
              fontSize: '11px',
              maxWidth: '540px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#ef4444', display: 'inline-block' }} />
              <span>Critical / Warning</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#f97316', display: 'inline-block' }} />
              <span>Alert</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#eab308', display: 'inline-block' }} />
              <span>Watch</span>
            </div>
            <div style={{ borderLeft: '1px solid #334155', paddingLeft: '8px', color: '#94a3b8', fontSize: '10px' }}>
              Extrusion: Severity threat tier
            </div>
          </div>
        }
      />
    </div>
  );
}
