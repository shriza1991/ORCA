import { useState, useMemo, useCallback, useEffect } from 'react';
import { ColumnLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import { Fish } from 'lucide-react';
import DeckGLMapFoundation, { DEFAULT_VIEW_STATE } from '../map/DeckGLMapFoundation';
import type { PFZCandidate } from '../../api/researcher-client';

export interface PFZSpatialMapProps {
  candidates: PFZCandidate[];
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidateId: string) => void;
  loading?: boolean;
}

/**
 * Pure data transformation: converts PFZ candidates into a valid GeoJSON FeatureCollection.
 * Filters out invalid or missing coordinates without throwing.
 */
export function buildPFZGeoJSON(candidates: PFZCandidate[]): GeoJSON.FeatureCollection {
  const validFeatures = (candidates || [])
    .filter(
      (c) =>
        typeof c.latitude === 'number' &&
        typeof c.longitude === 'number' &&
        !isNaN(c.latitude) &&
        !isNaN(c.longitude) &&
        (c.latitude !== 0 || c.longitude !== 0) &&
        c.latitude >= -90 &&
        c.latitude <= 90 &&
        c.longitude >= -180 &&
        c.longitude <= 180,
    )
    .map((c) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [c.longitude, c.latitude],
      },
      properties: {
        public_id: c.public_id,
        rank: c.rank,
        confidence: c.confidence || 'UNKNOWN',
        sst_gradient: c.sst_gradient,
        chlorophyll_a_mg_m3: c.chlorophyll_a_mg_m3,
        depth_m: c.depth_m,
        distance_km: c.distance_km,
        bearing_deg: c.bearing_deg,
        status: c.status,
        qc_status: c.qc_status || 'VALID',
        valid_from: c.valid_from,
        valid_to: c.valid_to,
        source: c.source,
      },
    }));

  return {
    type: 'FeatureCollection',
    features: validFeatures,
  };
}

export default function PFZSpatialMap({
  candidates = [],
  selectedCandidateId,
  onSelectCandidate,
  loading = false,
}: PFZSpatialMapProps) {
  const validCandidates = useMemo(() => {
    return (candidates || []).filter(
      (c) =>
        typeof c.latitude === 'number' &&
        typeof c.longitude === 'number' &&
        !isNaN(c.latitude) &&
        !isNaN(c.longitude) &&
        (c.latitude !== 0 || c.longitude !== 0) &&
        c.latitude >= -90 &&
        c.latitude <= 90 &&
        c.longitude >= -180 &&
        c.longitude <= 180,
    );
  }, [candidates]);

  // Compute map center from candidates or fallback to Konkan coast
  const mapCenter = useMemo<[number, number]>(() => {
    if (validCandidates.length === 0) return [73.28, 16.99];
    const avgLng = validCandidates.reduce((sum, c) => sum + c.longitude, 0) / validCandidates.length;
    const avgLat = validCandidates.reduce((sum, c) => sum + c.latitude, 0) / validCandidates.length;
    return [avgLng, avgLat];
  }, [validCandidates]);

  const [viewState, setViewState] = useState<MapViewState>(() => ({
    ...DEFAULT_VIEW_STATE,
    longitude: mapCenter[0],
    latitude: mapCenter[1],
    zoom: 8.6,
    pitch: 0,
    bearing: 0,
  }));

  // Auto-focus camera on selected candidate
  useEffect(() => {
    if (!selectedCandidateId) return;
    const target = validCandidates.find((c) => c.public_id === selectedCandidateId);
    if (!target) return;

    setViewState((prev) => ({
      ...prev,
      longitude: target.longitude,
      latitude: target.latitude,
      zoom: 10.4,
      transitionDuration: 600,
    }));
  }, [selectedCandidateId, validCandidates]);

  // Transform candidates into Deck.gl data points
  const pfzData = useMemo(() => {
    return validCandidates.map((c) => {
      const isSelected = c.public_id === selectedCandidateId;
      // Deterministic elevation: 500m baseline + (chl-a * 800m), capped at 3000m
      const chla = typeof c.chlorophyll_a_mg_m3 === 'number' ? c.chlorophyll_a_mg_m3 : 1.0;
      const elevation = Math.min(3000, Math.max(500, Math.round(chla * 800)));

      let colorRgb = [16, 185, 129]; // High: Emerald
      if (c.confidence === 'MEDIUM') colorRgb = [6, 182, 212]; // Medium: Cyan
      else if (c.confidence === 'LOW') colorRgb = [245, 158, 11]; // Low: Amber

      return {
        ...c,
        position: [c.longitude, c.latitude] as [number, number],
        elevation,
        colorRgb,
        isSelected,
      };
    });
  }, [validCandidates, selectedCandidateId]);

  // Deck.gl 3D Layers
  const layers = useMemo(() => {
    if (pfzData.length === 0) return [];

    const result: any[] = [];

    // 1. 3D Volumetric Chlorophyll Columns
    result.push(
      new ColumnLayer({
        id: 'pfz-3d-columns',
        data: pfzData,
        diskResolution: 18,
        radius: 650,
        extruded: true,
        pickable: true,
        elevationScale: 1,
        getPosition: (d: any) => d.position,
        getElevation: (d: any) => d.elevation,
        getFillColor: (d: any) => [d.colorRgb[0], d.colorRgb[1], d.colorRgb[2], d.isSelected ? 230 : 160],
        getLineColor: (d: any) => (d.isSelected ? [250, 204, 21, 255] : [255, 255, 255, 200]),
        lineWidthMinPixels: 1.5,
        stroked: true,
        wireframe: true,
      }),
    );

    // 2. Base Glowing Halos
    result.push(
      new ScatterplotLayer({
        id: 'pfz-base-halos',
        data: pfzData,
        pickable: false,
        getPosition: (d: any) => d.position,
        getRadius: (d: any) => (d.isSelected ? 1800 : 1200),
        getFillColor: (d: any) => [d.colorRgb[0], d.colorRgb[1], d.colorRgb[2], d.isSelected ? 70 : 40],
        getLineColor: (d: any) => (d.isSelected ? [250, 204, 21, 230] : [d.colorRgb[0], d.colorRgb[1], d.colorRgb[2], 120]),
        stroked: true,
        lineWidthMinPixels: 1.5,
        radiusMinPixels: 14,
        radiusMaxPixels: 35,
      }),
    );

    // 3. Floating Rank Label
    result.push(
      new TextLayer({
        id: 'pfz-rank-labels',
        data: pfzData,
        pickable: false,
        getPosition: (d: any) => [d.position[0], d.position[1], d.elevation + 200],
        getText: (d: any) => `#${d.rank || 1} (${d.confidence || 'PFZ'})`,
        getSize: 12,
        getColor: [255, 255, 255, 255],
        getAngle: 0,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system',
        fontWeight: 'bold',
        outlineWidth: 3,
        outlineColor: [15, 23, 42, 240],
      }),
    );

    return result;
  }, [pfzData]);

  // Tooltip formatter
  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.picked || !info.object) return null;
    const p = info.object;
    return {
      html: `
        <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.96); border: 1px solid #10b981; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
          <div style="font-weight: 700; color: #10b981; display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
            🐟 Potential Fishing Zone #${p.rank || 1}
          </div>
          <div style="color: #cbd5e1; font-size: 11px;">Confidence: <strong style="color: #34d399;">${p.confidence || 'HIGH'}</strong> · Status: <strong>${p.status || 'ACTIVE'}</strong></div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 2px;">
            SST Gradient: <strong>${p.sst_gradient ?? '—'}</strong> · Chl-a: <strong>${p.chlorophyll_a_mg_m3 != null ? `${p.chlorophyll_a_mg_m3} mg/m³` : '—'}</strong>
          </div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 2px;">
            Distance: <strong>${p.distance_km != null ? `${p.distance_km} km` : '—'}</strong> · Bearing: <strong>${p.bearing_deg ?? '—'}°</strong>${p.depth_m != null ? ` · Depth: <strong>${p.depth_m}m</strong>` : ''}
          </div>
          <div style="color: #94a3b8; font-size: 10px; margin-top: 3px;">Source: ${p.source || 'INCOIS PFZ Advisory'} · QC: ${p.qc_status || 'VALID'}</div>
        </div>
      `,
      style: { zIndex: '1000' },
    };
  }, []);

  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (info.picked && info.object?.public_id && onSelectCandidate) {
        onSelectCandidate(info.object.public_id);
      }
    },
    [onSelectCandidate],
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
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Fish size={14} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '12px', fontWeight: 700 }}>PFZ Advisory 3D Analysis</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>({validCandidates.length} Active Candidates)</span>
            </div>
            {loading && <span style={{ fontSize: '11px', color: '#38bdf8' }}>Loading telemetry...</span>}
          </div>
        }
        bottomOverlay={
          /* Scientific Legend HUD */
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
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span>High Conf</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }} />
              <span>Medium Conf</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              <span>Low Conf</span>
            </div>
            <div style={{ borderLeft: '1px solid #334155', paddingLeft: '8px', color: '#94a3b8', fontSize: '10px' }}>
              Column height: Chlorophyll-a density (mg/m³)
            </div>
          </div>
        }
      />
    </div>
  );
}
