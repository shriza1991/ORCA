import { useState, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, TextLayer, ColumnLayer, IconLayer } from '@deck.gl/layers';
import type { PickingInfo, MapViewState } from '@deck.gl/core';
import type { MapLayer } from '../../types/contracts';
import type { PFZCandidate, HazardBulletin, HarborData } from '../../api/researcher-client';
import type { EvaluatedRouteItem, VesselPosition } from '../../api/client';
import { buildPFZGeoJSON } from '../researcher/PFZSpatialMap';
import { buildHazardGeoJSON } from '../researcher/HazardSpatialMap';

const VESSEL_ICON_GOLD = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <polygon points="16,2 22,10 20,27 16,24 12,27 10,10" fill="#f59e0b" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="16" cy="13" r="2.2" fill="#ffffff"/>
  <circle cx="16" cy="13" r="1.1" fill="#0f172a"/>
</svg>
`)}`;

export interface DeckGLMarineMapProps {
  baseLayers?: MapLayer[];
  hazards?: HazardBulletin[];
  pfzCandidates?: PFZCandidate[];
  routes?: EvaluatedRouteItem[];
  selectedRouteId?: string | null;
  activeVesselPosition?: VesselPosition | null;
  vesselTrail?: [number, number][];
  selectedHarbor?: HarborData | null;
  enable3DExtrusion?: boolean;
  enablePulseAnimation?: boolean;
  visibleCategories?: {
    hazards: boolean;
    routes: boolean;
    pfz: boolean;
    vessel: boolean;
    boundaries: boolean;
  };
  onSelectFeature?: (featureInfo: { type: string; id: string; properties: any }) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  viewState?: MapViewState;
  onViewStateChange?: (vs: MapViewState) => void;
}

export const INITIAL_DECKGL_VIEW_STATE: MapViewState = {
  longitude: 73.15,
  latitude: 16.85,
  zoom: 8.6,
  pitch: 52,
  bearing: -18,
  maxZoom: 16,
  minZoom: 4,
};

export default function DeckGLMarineMap({
  baseLayers = [],
  hazards = [],
  pfzCandidates = [],
  routes = [],
  selectedRouteId,
  activeVesselPosition,
  vesselTrail = [],
  selectedHarbor,
  enable3DExtrusion = true,
  enablePulseAnimation: _enablePulseAnimation = true,
  visibleCategories = {
    hazards: true,
    routes: true,
    pfz: true,
    vessel: true,
    boundaries: true,
  },
  onSelectFeature,
  initialCenter,
  initialZoom,
  viewState: externalViewState,
  onViewStateChange: externalOnViewStateChange,
}: DeckGLMarineMapProps) {
  const [internalViewState, setInternalViewState] = useState<MapViewState>(() => ({
    ...INITIAL_DECKGL_VIEW_STATE,
    longitude: initialCenter ? initialCenter[0] : INITIAL_DECKGL_VIEW_STATE.longitude,
    latitude: initialCenter ? initialCenter[1] : INITIAL_DECKGL_VIEW_STATE.latitude,
    zoom: initialZoom ?? INITIAL_DECKGL_VIEW_STATE.zoom,
  }));

  const activeViewState = externalViewState || internalViewState;
  const handleViewStateChange = useCallback(
    (params: { viewState: MapViewState }) => {
      if (externalOnViewStateChange) {
        externalOnViewStateChange(params.viewState);
      } else {
        setInternalViewState(params.viewState);
      }
    },
    [externalOnViewStateChange],
  );

  // Transform genuine SAMUDRA data into GeoJSON (memoized)
  const hazardGeoJSON = useMemo(() => buildHazardGeoJSON(hazards), [hazards]);
  const pfzGeoJSON = useMemo(() => buildPFZGeoJSON(pfzCandidates), [pfzCandidates]);

  // Memoize base boundary features to avoid re-flattening on every render
  const boundaryFeatures = useMemo(() => {
    return baseLayers.flatMap((l) => {
      if (!l.geojson) return [];
      if (l.geojson.type === 'FeatureCollection' && Array.isArray(l.geojson.features)) {
        return l.geojson.features;
      }
      if (l.geojson.type === 'Feature') {
        return [l.geojson];
      }
      return [];
    });
  }, [baseLayers]);

  // Selected Route vs Candidates
  const effectiveSelectedRouteId = selectedRouteId || routes[0]?.route_id;
  const recommendedRoute = useMemo(
    () => routes.find((r) => r.route_id === effectiveSelectedRouteId) || routes[0],
    [routes, effectiveSelectedRouteId],
  );
  const candidateRoutes = useMemo(
    () => routes.filter((r) => r.route_id !== effectiveSelectedRouteId),
    [routes, effectiveSelectedRouteId],
  );

  // Deck.gl Layers Definition (GPU-accelerated and strictly memoized)
  const deckLayers = useMemo(() => {
    const layers: any[] = [];

    // 1. National Maritime Boundaries & Base Geofences (EEZ, Territorial Waters, MPAs)
    if (visibleCategories.boundaries && boundaryFeatures.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: 'base-maritime-boundaries',
          data: { type: 'FeatureCollection', features: boundaryFeatures },
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1.5,
            getLineColor: (f: any) => {
              const polyType = (f.properties?.polygon_type || '').toUpperCase();
              if (polyType === 'EEZ_BOUNDARY') return [56, 189, 248, 140]; // Sky blue
              if (polyType === 'TERRITORIAL_WATERS') return [14, 165, 233, 180]; // Cyan
              return [100, 116, 139, 120]; // Slate
            },
            getFillColor: (f: any) => {
              const polyType = (f.properties?.polygon_type || '').toUpperCase();
              if (polyType === 'EEZ_BOUNDARY') return [56, 189, 248, 10];
              if (polyType === 'TERRITORIAL_WATERS') return [14, 165, 233, 18];
              return [100, 116, 139, 15];
            },
            getLineWidth: 2,
          }),
        );
      }

    // 2. Active Marine Hazards & Restriction Polygons
    if (visibleCategories.hazards && hazardGeoJSON.features.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: 'marine-hazards-polygons',
          data: hazardGeoJSON,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: enable3DExtrusion,
          wireframe: enable3DExtrusion,
          lineWidthMinPixels: 2.5,
          getElevation: (f: any) => {
            const sev = (f.properties?.severity || '').toUpperCase();
            if (sev === 'WARNING' || sev === 'CRITICAL') return 2500;
            if (sev === 'ALERT') return 1800;
            if (sev === 'WATCH') return 1200;
            return 800;
          },
          getFillColor: (f: any) => {
            const sev = (f.properties?.severity || '').toUpperCase();
            if (sev === 'WARNING' || sev === 'CRITICAL') return [239, 68, 68, 32]; // Soft Crimson
            if (sev === 'ALERT') return [249, 115, 22, 28]; // Soft Orange
            if (sev === 'WATCH') return [234, 179, 8, 25]; // Soft Amber
            if (sev === 'ADVISORY') return [56, 189, 248, 20]; // Soft Sky
            return [148, 163, 184, 18]; // Translucent Slate
          },
          getLineColor: (f: any) => {
            const sev = (f.properties?.severity || '').toUpperCase();
            if (sev === 'WARNING' || sev === 'CRITICAL') return [239, 68, 68, 180];
            if (sev === 'ALERT') return [249, 115, 22, 170];
            if (sev === 'WATCH') return [234, 179, 8, 160];
            if (sev === 'ADVISORY') return [56, 189, 248, 150];
            return [148, 163, 184, 120];
          },
          getLineWidth: 2,
        }),
      );
    }

    // 3. Alternative Navigation Route Corridors (Subdued paths)
    if (visibleCategories.routes && candidateRoutes.length > 0) {
      const candidatePaths = candidateRoutes.map((r) => ({
        path: r.waypoints,
        name: r.name,
        route_id: r.route_id,
        distance_km: r.distance_km,
        risk_rating: r.risk_rating,
        exposure_score: r.exposure_score,
      }));

      layers.push(
        new PathLayer({
          id: 'candidate-routes-paths',
          data: candidatePaths,
          pickable: true,
          widthMinPixels: 2.5,
          getPath: (d: any) => d.path,
          getColor: [56, 189, 248, 130], // Sky blue translucent
          getWidth: 3,
        }),
      );
    }

    // 4. Primary Recommended Navigation Corridor (High-visibility Cyan with 3D elevation)
    if (visibleCategories.routes && recommendedRoute) {
      const zElev = enable3DExtrusion ? 350 : 0;
      const elevatedPath = recommendedRoute.waypoints.map((wp) => (enable3DExtrusion ? [wp[0], wp[1], zElev] : wp));

      layers.push(
        new PathLayer({
          id: 'recommended-route-primary',
          data: [
            {
              path: elevatedPath,
              name: recommendedRoute.name,
              route_id: recommendedRoute.route_id,
              distance_km: recommendedRoute.distance_km,
              risk_rating: recommendedRoute.risk_rating,
              exposure_score: recommendedRoute.exposure_score,
              max_wave_height_m: recommendedRoute.max_wave_height_m,
            },
          ],
          pickable: true,
          widthMinPixels: 4.5,
          getPath: (d: any) => d.path,
          getColor: [6, 182, 212, 255], // High-contrast solid Cyan
          getWidth: 5,
        }),
      );
    }

    // 5. Potential Fishing Zone (PFZ) Candidates
    if (visibleCategories.pfz && pfzGeoJSON.features.length > 0) {
      const pfzData = pfzGeoJSON.features.map((f: any) => ({
        position: f.geometry.coordinates,
        properties: f.properties,
      }));

      // 3D Volumetric Columns for PFZ (when 3D extrusion enabled)
      if (enable3DExtrusion) {
        layers.push(
          new ColumnLayer({
            id: 'pfz-3d-volumetric-columns',
            data: pfzData,
            diskResolution: 24,
            radius: 1100,
            extruded: true,
            wireframe: true,
            getPosition: (d: any) => d.position,
            getElevation: (d: any) => 1600 + ((d.properties.rank === 1 ? 1400 : 700)),
            getFillColor: [16, 185, 129, 130],
            getLineColor: [52, 211, 153, 230],
            lineWidthMinPixels: 1.5,
          }),
        );
      }

      // Outer glowing halo ring
      layers.push(
        new ScatterplotLayer({
          id: 'pfz-pulse-rings',
          data: pfzData,
          pickable: false,
          getPosition: (d: any) => d.position,
          getRadius: () => 1600,
          getFillColor: [16, 185, 129, 45],
          radiusMinPixels: 12,
          radiusMaxPixels: 28,
        }),
      );

      // Core PFZ Scatterplot marker
      layers.push(
        new ScatterplotLayer({
          id: 'pfz-points-core',
          data: pfzData,
          pickable: true,
          getPosition: (d: any) => d.position,
          getRadius: () => 800,
          getFillColor: [16, 185, 129, 230], // Emerald
          getLineColor: [255, 255, 255, 240],
          stroked: true,
          lineWidthMinPixels: 2,
          radiusMinPixels: 6,
          radiusMaxPixels: 16,
        }),
      );

      // PFZ Rank labels (#1, #2)
      layers.push(
        new TextLayer({
          id: 'pfz-labels',
          data: pfzData,
          pickable: false,
          getPosition: (d: any) => (enable3DExtrusion ? [d.position[0], d.position[1], 1800 + (d.properties.rank === 1 ? 1400 : 700) + 150] : d.position),
          getText: (d: any) => `#${d.properties.rank || 1} PFZ`,
          getSize: 12,
          getColor: [255, 255, 255, 255],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
        }),
      );
    }

    // 6. Monitored Vessel Craft Position & Dynamic Voyage Trail
    if (visibleCategories.vessel && vesselTrail && vesselTrail.length >= 2) {
      const zElev = enable3DExtrusion ? 200 : 0;
      const elevatedTrail = vesselTrail.map((p) => (enable3DExtrusion ? [p[0], p[1], zElev] : p));
      layers.push(
        new PathLayer({
          id: 'vessel-historical-wake-trail',
          data: [{ path: elevatedTrail }],
          getPath: (d: any) => d.path,
          getColor: [245, 158, 11, 210], // Amber glowing trail
          getWidth: 4,
          widthMinPixels: 2.5,
          capRounded: true,
          jointRounded: true,
        }),
      );
    }

    if (visibleCategories.vessel && activeVesselPosition) {
      const vesselCoord = [activeVesselPosition.longitude, activeVesselPosition.latitude];
      const vesselData = [
        {
          position: vesselCoord,
          vessel_id: activeVesselPosition.vessel_id,
          speed_knots: activeVesselPosition.speed_knots,
          heading_deg: activeVesselPosition.heading_deg,
          timestamp: activeVesselPosition.timestamp,
        },
      ];

      // 3D Vessel Searchlight / Beacon Column
      if (enable3DExtrusion) {
        layers.push(
          new ColumnLayer({
            id: 'vessel-3d-beacon-column',
            data: vesselData,
            diskResolution: 18,
            radius: 500,
            extruded: true,
            wireframe: true,
            getPosition: (d: any) => d.position,
            getElevation: 3000,
            getFillColor: [245, 158, 11, 85],
            getLineColor: [251, 191, 36, 220],
            lineWidthMinPixels: 1.5,
          }),
        );
      }

      // Vessel glowing aura (Restrained & Sleek)
      layers.push(
        new ScatterplotLayer({
          id: 'vessel-pulse-aura',
          data: vesselData,
          pickable: false,
          getPosition: (d: any) => d.position,
          getRadius: () => 1000,
          getFillColor: [245, 158, 11, 45],
          radiusMinPixels: 10,
          radiusMaxPixels: 22,
        }),
      );

      // Sleek & Compact Nautical Vessel Craft Marker (IconLayer)
      layers.push(
        new IconLayer({
          id: 'vessel-core-point',
          data: vesselData,
          pickable: true,
          getPosition: (d: any) => (enable3DExtrusion ? [d.position[0], d.position[1], 200] : d.position),
          getIcon: () => ({
            url: VESSEL_ICON_GOLD,
            width: 32,
            height: 32,
            anchorX: 16,
            anchorY: 16,
          }),
          getSize: () => 22,
          sizeUnits: 'pixels',
          sizeMinPixels: 12,
          sizeMaxPixels: 24,
          getAngle: (d: any) => 360 - (d.heading_deg || 0),
        }),
      );

      // Vessel telemetry label
      layers.push(
        new TextLayer({
          id: 'vessel-telemetry-label',
          data: vesselData,
          pickable: false,
          getPosition: (d: any) => (enable3DExtrusion ? [d.position[0], d.position[1], 3200] : [d.position[0], d.position[1]]),
          getText: (d: any) => `🚢 ${d.vessel_id} (${d.speed_knots} kn · ${d.heading_deg}°)`,
          getSize: 12,
          getColor: [254, 240, 138, 255],
          pixelOffset: [0, -18],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
        }),
      );
    }

    // 7. Departure Harbor Station Marker
    if (selectedHarbor && typeof selectedHarbor.longitude === 'number') {
      const harborData = [
        {
          position: [selectedHarbor.longitude, selectedHarbor.latitude],
          name: selectedHarbor.name,
          state: selectedHarbor.state,
        },
      ];

      layers.push(
        new ScatterplotLayer({
          id: 'departure-harbor-station',
          data: harborData,
          pickable: true,
          getPosition: (d: any) => d.position,
          getRadius: 900,
          getFillColor: [14, 165, 233, 230], // Cyan/Sky
          getLineColor: [255, 255, 255, 255],
          stroked: true,
          lineWidthMinPixels: 2,
          radiusMinPixels: 7,
          radiusMaxPixels: 16,
        }),
      );

      layers.push(
        new TextLayer({
          id: 'departure-harbor-label',
          data: harborData,
          pickable: false,
          getPosition: (d: any) => d.position,
          getText: (d: any) => `⚓ ${d.name} Station`,
          getSize: 12,
          getColor: [56, 189, 248, 255],
          pixelOffset: [0, 18],
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'top',
        }),
      );
    }

    return layers;
  }, [
    boundaryFeatures,
    hazardGeoJSON,
    pfzGeoJSON,
    candidateRoutes,
    recommendedRoute,
    activeVesselPosition,
    vesselTrail,
    selectedHarbor,
    enable3DExtrusion,
    visibleCategories,
  ]);

  // High-contrast HUD tooltip formatting
  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.picked || !info.object) return null;

    const layerId = info.layer?.id || '';
    const obj = info.object;

    if (layerId.includes('marine-hazards')) {
      const p = obj.properties || {};
      return {
        html: `
          <div style="padding: 6px 10px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.95); border: 1px solid #ef4444; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: 700; color: #ef4444; text-transform: uppercase; margin-bottom: 2px;">⚠️ ${p.event_type || 'Marine Hazard'}</div>
            <div style="font-weight: 600; color: #fff;">${p.headline || 'Active Hazard Bulletin'}</div>
            <div style="color: #cbd5e1; margin-top: 4px;">Severity: <strong style="color: #facc15;">${p.severity || 'UNKNOWN'}</strong> · Status: <strong>${p.status || 'ACTIVE'}</strong></div>
            <div style="color: #94a3b8; font-size: 11px; margin-top: 2px;">Source: ${p.source || 'IMD / INCOIS'}</div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    if (layerId.includes('pfz')) {
      const p = obj.properties || {};
      return {
        html: `
          <div style="padding: 6px 10px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.95); border: 1px solid #10b981; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: 700; color: #10b981; margin-bottom: 2px;">🐟 Potential Fishing Zone #${p.rank || 1}</div>
            <div style="color: #cbd5e1;">Confidence: <strong style="color: #34d399;">${p.confidence || 'HIGH'}</strong></div>
            <div style="color: #cbd5e1;">SST Gradient: <strong>${p.sst_gradient ?? '—'}</strong> · Chl-a: <strong>${p.chlorophyll_a_mg_m3 ? `${p.chlorophyll_a_mg_m3} mg/m³` : '—'}</strong></div>
            <div style="color: #cbd5e1;">Distance: <strong>${p.distance_km ?? '—'} km</strong> · Bearing: <strong>${p.bearing_deg ?? '—'}°</strong></div>
            <div style="color: #94a3b8; font-size: 11px; margin-top: 2px;">Source: ${p.source || 'INCOIS PFZ Advisory'}</div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    if (layerId.includes('route')) {
      return {
        html: `
          <div style="padding: 6px 10px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.95); border: 1px solid #06b6d4; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: 700; color: #06b6d4; margin-bottom: 2px;">🧭 Navigation Corridor</div>
            <div style="font-weight: 600; color: #fff;">${obj.name || obj.route_id}</div>
            <div style="color: #cbd5e1; margin-top: 4px;">Distance: <strong>${obj.distance_km} km</strong> · Exposure: <strong>${obj.exposure_score}</strong></div>
            <div style="color: #cbd5e1;">Risk Rating: <strong style="color: #38bdf8;">${obj.risk_rating || 'LOW'}</strong></div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    if (layerId.includes('vessel')) {
      return {
        html: `
          <div style="padding: 6px 10px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.95); border: 1px solid #f59e0b; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: 700; color: #f59e0b; margin-bottom: 2px;">🚢 Monitored Vessel</div>
            <div style="font-weight: 600; color: #fff;">ID: ${obj.vessel_id}</div>
            <div style="color: #cbd5e1; margin-top: 4px;">Speed: <strong>${obj.speed_knots} kn</strong> · Heading: <strong>${obj.heading_deg}°</strong></div>
            <div style="color: #94a3b8; font-size: 11px; margin-top: 2px;">Telemetry: ${obj.timestamp ? new Date(obj.timestamp).toLocaleTimeString() : 'Current'}</div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    if (layerId.includes('harbor')) {
      return {
        html: `
          <div style="padding: 6px 10px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.95); border: 1px solid #0ea5e9; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4;">
            <div style="font-weight: 700; color: #0ea5e9;">⚓ Departure Station</div>
            <div style="font-weight: 600; color: #fff;">${obj.name} (${obj.state})</div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    if (layerId.includes('boundaries')) {
      const p = obj.properties || {};
      return {
        html: `
          <div style="padding: 6px 10px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.95); border: 1px solid #64748b; border-radius: 6px; color: #f8fafc; font-size: 12px;">
            <div style="font-weight: 600; color: #38bdf8;">${p.name || 'Maritime Boundary'}</div>
            <div style="color: #94a3b8; font-size: 11px;">Type: ${p.polygon_type || 'Geofence'}</div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    return null;
  }, []);

  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (info.picked && info.object && onSelectFeature) {
        const layerId = info.layer?.id || '';
        onSelectFeature({
          type: layerId,
          id: info.object.properties?.public_id || info.object.route_id || info.object.vessel_id || layerId,
          properties: info.object.properties || info.object,
        });
      }
    },
    [onSelectFeature],
  );

  return (
    <div className="deckgl-marine-container" style={{ position: 'relative', width: '100%', height: '100%', background: '#090d16', overflow: 'hidden' }}>
      <DeckGL
        viewState={activeViewState}
        onViewStateChange={(params: any) => handleViewStateChange(params)}
        controller={{
          doubleClickZoom: true,
          dragPan: true,
          dragRotate: true,
          scrollZoom: true,
          touchRotate: true,
        }}
        layers={deckLayers}
        getTooltip={getTooltip}
        onClick={handleClick}
      />
    </div>
  );
}
