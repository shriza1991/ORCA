import type { MapLayer } from '../types/contracts';
import type { PFZCandidate, HazardBulletin } from '../api/researcher-client';
import { buildPFZGeoJSON } from '../components/researcher/PFZSpatialMap';
import { buildHazardGeoJSON } from '../components/researcher/HazardSpatialMap';
import { createHarborLayer, filterLayersByRegion } from './geo';

/**
 * Creates a canonical MapLayer from PFZ candidates using the existing pure buildPFZGeoJSON transformer.
 * Preserves SST gradient without fabricating absolute SST temperatures.
 */
export function createPFZMapLayers(candidates: PFZCandidate[]): MapLayer[] {
  if (!candidates || candidates.length === 0) return [];

  const geojson = buildPFZGeoJSON(candidates);
  if (!geojson.features || geojson.features.length === 0) return [];

  return [
    {
      layer_id: 'layer_pfz_candidates',
      name: 'Potential Fishing Zones',
      layer_type: 'geojson',
      visible: true,
      style: {
        color: '#10b981',
        opacity: 0.9,
        circle_radius: 8,
        layer_category: 'pfz',
      },
      geojson,
    },
  ];
}

/**
 * Creates canonical MapLayers from Hazard bulletins using the existing pure buildHazardGeoJSON transformer.
 * Preserves backend active/expired status and severity styling.
 */
export function createHazardMapLayers(hazards: HazardBulletin[]): MapLayer[] {
  if (!hazards || hazards.length === 0) return [];

  const geojson = buildHazardGeoJSON(hazards);
  if (!geojson.features || geojson.features.length === 0) return [];

  return [
    {
      layer_id: 'layer_marine_hazards',
      name: 'Active Marine Hazards',
      layer_type: 'geojson',
      visible: true,
      style: {
        color: '#ef4444',
        opacity: 0.35,
        line_width: 2.5,
        layer_category: 'hazard',
      },
      geojson,
    },
  ];
}

export interface MergeFisherLayersParams {
  baseLayers: MapLayer[];
  harborCoords: [number, number];
  originHarbor: string;
  status: string;
  baselineRoutes?: MapLayer[];
  baselinePFZ?: MapLayer[];
  baselineHazards?: MapLayer[];
  chatLayers?: MapLayer[];
}

/**
 * Merges baseline and chat response layers with strict de-duplication:
 * - If chat response contains route layers, they take precedence over baseline routes.
 * - If chat response contains PFZ layers, they take precedence over baseline PFZ.
 * - If chat response contains hazard layers, they take precedence over baseline hazards.
 * - If chat response contains origin/harbor layer, it takes precedence over baseline harbor marker.
 * - Base geofences are scoped to the harbor region.
 */
export function mergeFisherLayers({
  baseLayers,
  harborCoords,
  originHarbor,
  status,
  baselineRoutes = [],
  baselinePFZ = [],
  baselineHazards = [],
  chatLayers = [],
}: MergeFisherLayersParams): MapLayer[] {
  // Scoped baseline boundaries around departure harbor
  const regionBaseLayers = filterLayersByRegion(baseLayers, harborCoords, 2.0);

  // Check what categories are present in the chat response layers
  const hasChatRoutes = chatLayers.some(
    (l) => l.layer_id === 'layer_recommended_route' || l.layer_id === 'layer_candidate_routes' || l.name.toLowerCase().includes('route')
  );

  const hasChatPFZ = chatLayers.some(
    (l) => l.layer_id.toLowerCase().includes('pfz') || (l.style?.layer_category || '').toLowerCase().includes('pfz') || l.name.toLowerCase().includes('fishing')
  );

  const hasChatHazards = chatLayers.some(
    (l) =>
      l.layer_id.toLowerCase().includes('hazard') ||
      l.layer_id.toLowerCase().includes('cyclone') ||
      l.layer_id.toLowerCase().includes('squall') ||
      (l.style?.layer_category || '').toLowerCase().includes('hazard') ||
      (l.style?.layer_category || '').toLowerCase().includes('safety_critical')
  );

  const hasChatOrigin = chatLayers.some(
    (l) =>
      l.layer_id.toLowerCase().includes('origin') ||
      l.layer_id.toLowerCase().includes('harbor') ||
      l.layer_id.toLowerCase().includes('vessel_position')
  );

  // Effective route layers
  const effectiveRouteLayers = hasChatRoutes ? [] : baselineRoutes;

  // Effective PFZ layers
  const effectivePFZLayers = hasChatPFZ ? [] : baselinePFZ;

  // Effective hazard layers
  const effectiveHazardLayers = hasChatHazards ? [] : baselineHazards;

  // Effective harbor layer
  const effectiveHarborLayers = hasChatOrigin ? [] : [createHarborLayer(originHarbor, status)];

  // Filter response layers geographically where appropriate (preserves national boundaries)
  const regionChatLayers = filterLayersByRegion(chatLayers, harborCoords, 2.5);

  return [
    ...regionBaseLayers,
    ...effectiveHarborLayers,
    ...effectiveRouteLayers,
    ...effectivePFZLayers,
    ...effectiveHazardLayers,
    ...regionChatLayers,
  ];
}

/**
 * Formats a clean, simple, mariner-focused HTML popup card for MapView.
 * Excludes researcher-style QC/provenance/diagnostics.
 */
export function formatFishermanPopup(feature: any, layer: MapLayer): string | null {
  if (!feature || !feature.properties) return null;
  const props = feature.properties;
  const layerId = (layer.layer_id || '').toLowerCase();
  const layerCategory = (layer.style?.layer_category || '').toLowerCase();

  // 1. Departure Station / Harbor Point
  if (props.type === 'Departure Harbor Station' || layerId.includes('harbor') || layerCategory === 'navigation_terminal') {
    const harborName = props.harbor || props.location || layer.name;
    const status = props.operational_status || 'UNKNOWN';
    const coords = props.coordinates || '';
    const corridor = props.corridor ? `<div style="margin-top:4px;color:#94a3b8;font-size:11px;">Corridor: ${props.corridor}</div>` : '';

    const statusBadge =
      status === 'GO'
        ? '<span style="background:#065f46;color:#34d399;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">SAFE TO GO</span>'
        : status === 'CAUTION'
        ? '<span style="background:#78350f;color:#fde047;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">CAUTION</span>'
        : status === 'NO_GO'
        ? '<span style="background:#7f1d1d;color:#f87171;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">DO NOT GO</span>'
        : '<span style="background:#334155;color:#94a3b8;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">UNKNOWN</span>';

    return `
      <div class="map-popup-fisher">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <strong style="color:#f8fafc;font-size:13px;">${harborName}</strong>
          ${statusBadge}
        </div>
        ${coords ? `<div style="color:#94a3b8;font-size:11px;font-family:monospace;margin-bottom:4px;">${coords}</div>` : ''}
        ${corridor}
      </div>
    `;
  }

  // 2. PFZ Advisory Candidates
  if (layerId.includes('pfz') || layerCategory.includes('pfz') || props.sst_gradient !== undefined) {
    const rank = props.rank ? `#${props.rank}` : '';
    const confidence = props.confidence || 'UNKNOWN';
    const sstGrad = props.sst_gradient !== null && props.sst_gradient !== undefined ? Number(props.sst_gradient).toFixed(2) : '—';
    const dist = props.distance_km !== undefined && props.distance_km !== null ? `${Number(props.distance_km).toFixed(1)} km` : '—';
    const bearing = props.bearing_deg !== undefined && props.bearing_deg !== null ? `${props.bearing_deg}°` : '—';
    const depth = props.depth_m !== undefined && props.depth_m !== null ? `${Number(props.depth_m).toFixed(0)} m` : '—';

    const confBadge =
      confidence === 'HIGH'
        ? '<span style="background:#065f46;color:#34d399;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">HIGH CONFIDENCE</span>'
        : confidence === 'MEDIUM'
        ? '<span style="background:#0e7490;color:#67e8f9;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">MEDIUM CONFIDENCE</span>'
        : '<span style="background:#78350f;color:#fde047;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">ADVISORY</span>';

    return `
      <div class="map-popup-fisher">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <strong style="color:#10b981;font-size:13px;">PFZ Candidate ${rank}</strong>
          ${confBadge}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;">
          <div><span style="color:#64748b;">SST Gradient:</span> <strong style="color:#e2e8f0;font-family:monospace;">${sstGrad}</strong></div>
          <div><span style="color:#64748b;">Depth:</span> <strong style="color:#e2e8f0;font-family:monospace;">${depth}</strong></div>
          <div><span style="color:#64748b;">Distance:</span> <strong style="color:#e2e8f0;font-family:monospace;">${dist}</strong></div>
          <div><span style="color:#64748b;">Bearing:</span> <strong style="color:#e2e8f0;font-family:monospace;">${bearing}</strong></div>
        </div>
        <div style="margin-top:6px;font-size:10px;color:#64748b;">Potential zone indicator — check local weather before transit</div>
      </div>
    `;
  }

  // 3. Marine Hazards
  if (layerId.includes('hazard') || layerCategory.includes('hazard') || props.severity !== undefined) {
    const headline = props.headline || props.description || 'Marine Hazard Alert';
    const severity = props.severity || 'WARNING';
    const status = props.status || 'ACTIVE';
    const affectedArea = props.affected_area || 'Coastal Area';

    const sevBadge =
      severity === 'WARNING'
        ? '<span style="background:#7f1d1d;color:#f87171;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">WARNING</span>'
        : severity === 'ALERT'
        ? '<span style="background:#7c2d12;color:#fb923c;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">ALERT</span>'
        : '<span style="background:#78350f;color:#fde047;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">ADVISORY</span>';

    return `
      <div class="map-popup-fisher">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <strong style="color:#ef4444;font-size:13px;">Hazard Alert</strong>
          <div style="display:flex;gap:4px;">
            ${sevBadge}
            <span style="background:rgba(255,255,255,0.08);color:#94a3b8;padding:2px 5px;border-radius:4px;font-size:10px;">${status}</span>
          </div>
        </div>
        <div style="font-size:12px;font-weight:600;color:#f1f5f9;margin-bottom:4px;">${headline}</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;"><strong>Area:</strong> ${affectedArea}</div>
        ${props.description && props.description !== headline ? `<div style="font-size:11px;color:#cbd5e1;margin-top:4px;line-height:1.3;">${props.description}</div>` : ''}
      </div>
    `;
  }

  // 4. Passage Routes
  if (layerId.includes('route') || layerCategory.includes('navigation') || props.route_id !== undefined) {
    const name = props.name || props.route_id || 'Recommended Passage';
    const dist = props.distance_km !== undefined ? `${Number(props.distance_km).toFixed(1)} km` : '—';
    const wave = props.max_wave_height_m !== undefined ? `${Number(props.max_wave_height_m).toFixed(1)} m` : '—';
    const risk = props.risk_rating || 'LOW';
    const exposure = props.exposure_score !== undefined ? `${Number(props.exposure_score).toFixed(1)}` : '—';

    return `
      <div class="map-popup-fisher">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <strong style="color:#06b6d4;font-size:13px;">${name}</strong>
          <span style="background:#0e7490;color:#67e8f9;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">${risk} RISK</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;">
          <div><span style="color:#64748b;">Distance:</span> <strong style="color:#e2e8f0;font-family:monospace;">${dist}</strong></div>
          <div><span style="color:#64748b;">Max Wave:</span> <strong style="color:#e2e8f0;font-family:monospace;">${wave}</strong></div>
          <div><span style="color:#64748b;">Exposure:</span> <strong style="color:#e2e8f0;font-family:monospace;">${exposure}</strong></div>
          <div><span style="color:#64748b;">Risk:</span> <strong style="color:#e2e8f0;font-family:monospace;">${risk}</strong></div>
        </div>
      </div>
    `;
  }

  return null;
}
