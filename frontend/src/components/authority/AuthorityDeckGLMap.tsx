import { useState, useMemo, useCallback, useEffect } from 'react';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, TextLayer, ColumnLayer, IconLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import {
  Ship,
  Navigation,
  Gauge,
  Compass,
  Clock,
  Shield,
} from 'lucide-react';
import DeckGLMapFoundation, { DEFAULT_VIEW_STATE } from '../map/DeckGLMapFoundation';
import type { MapLayer } from '../../types/contracts';
import {
  getDemoVesselReplay,
  type DemoSector,
  type DemoVessel,
  type SectorHazard,
  type VesselHazardAssociation,
  type VesselHazardOperationalAlert,
} from '../../api/client';
import type { SupportedLanguage } from '../../i18n/translations';

// Sleek, compact naval craft SVG icons with heading orientation
const VESSEL_ICON_GOLD = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <polygon points="16,2 22,10 20,27 16,24 12,27 10,10" fill="#f59e0b" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="16" cy="13" r="2.2" fill="#ffffff"/>
  <circle cx="16" cy="13" r="1.1" fill="#0f172a"/>
</svg>
`)}`;

const VESSEL_ICON_CYAN = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <polygon points="16,2 22,10 20,27 16,24 12,27 10,10" fill="#0ea5e9" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="16" cy="13" r="2.2" fill="#ffffff"/>
  <circle cx="16" cy="13" r="1.1" fill="#0f172a"/>
</svg>
`)}`;

export interface AuthorityDeckGLMapProps {
  activeSector: DemoSector;
  sectors?: DemoSector[];
  baseLayers?: MapLayer[];
  sectorHazards?: SectorHazard[];
  hazardAssociations?: VesselHazardAssociation[];
  selectedOperationalAlert?: VesselHazardOperationalAlert | null;
  vessels?: DemoVessel[];
  selectedVesselId?: string | null;
  onSelectVessel?: (vesselId: string) => void;
  replayLayer?: MapLayer | null;
  trajectoryLayer?: MapLayer | null;
  sectorRouteLayers?: MapLayer[];
  onSelectHazard?: (hazardId: string) => void;
  language?: SupportedLanguage;
  onResetView?: () => void;
}

export default function AuthorityDeckGLMap({
  activeSector,
  sectors: _sectors = [],
  baseLayers = [],
  sectorHazards = [],
  hazardAssociations = [],
  selectedOperationalAlert,
  vessels = [],
  selectedVesselId,
  onSelectVessel,
  replayLayer,
  trajectoryLayer,
  sectorRouteLayers = [],
  onSelectHazard,
  language: _language = 'en',
  onResetView,
}: AuthorityDeckGLMapProps) {
  const [viewState, setViewState] = useState<MapViewState>(() => ({
    ...DEFAULT_VIEW_STATE,
    longitude: activeSector.center[0],
    latitude: activeSector.center[1],
    zoom: activeSector.zoom || 8.8,
    pitch: 52,
    bearing: -18,
  }));

  const [vesselPositionsMap, setVesselPositionsMap] = useState<
    Record<string, { longitude: number; latitude: number; speed_knots?: number; heading_deg?: number; timestamp?: string }>
  >({});

  // Lightweight pulse ticker for blinking active hazard and vessel searchlight aura
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseTick((t) => (t + 1) % 120);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Smooth cinematic camera swoop zoom-out and zoom-in on active sector/region change
  useEffect(() => {
    setViewState((prev) => ({
      ...prev,
      longitude: activeSector.center[0],
      latitude: activeSector.center[1],
      zoom: activeSector.zoom || 8.8,
      pitch: 52,
      bearing: -18,
      transitionDuration: 1400,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, [activeSector]);

  // Fetch verified canonical positions for all active vessels in the sector
  useEffect(() => {
    let isCancelled = false;
    if (!vessels || vessels.length === 0) {
      setVesselPositionsMap({});
      return;
    }

    Promise.allSettled(
      vessels.map(async (v) => {
        try {
          const replay = await getDemoVesselReplay(v.public_id);
          if (Array.isArray(replay) && replay.length > 0) {
            const latest = replay[replay.length - 1];
            if (
              typeof latest.latitude === 'number' &&
              typeof latest.longitude === 'number' &&
              !isNaN(latest.latitude) &&
              !isNaN(latest.longitude) &&
              (latest.latitude !== 0 || latest.longitude !== 0)
            ) {
              return {
                vesselId: v.public_id,
                position: {
                  longitude: latest.longitude,
                  latitude: latest.latitude,
                  speed_knots: latest.speed_knots,
                  heading_deg: latest.heading_deg,
                  timestamp: latest.timestamp,
                },
              };
            }
          }
        } catch {
          // Zero coordinate fabrication on error
        }
        return null;
      }),
    ).then((results) => {
      if (isCancelled) return;
      const nextMap: Record<
        string,
        { longitude: number; latitude: number; speed_knots?: number; heading_deg?: number; timestamp?: string }
      > = {};
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          nextMap[res.value.vesselId] = res.value.position;
        }
      }
      setVesselPositionsMap(nextMap);
    });

    return () => {
      isCancelled = true;
    };
  }, [vessels]);

  // Extract selected vessel current telemetry
  const selectedVessel = useMemo(() => {
    return vessels.find((v) => v.public_id === selectedVesselId) || null;
  }, [vessels, selectedVesselId]);

  // Extract replay current coordinate and past coordinates from replayLayer
  const activeReplayInfo = useMemo(() => {
    if (!replayLayer || !replayLayer.geojson) return null;
    const fc = replayLayer.geojson;
    const features = fc.type === 'FeatureCollection' && Array.isArray(fc.features) ? fc.features : [fc];

    let currentPos: { longitude: number; latitude: number; speed_knots?: number; heading_deg?: number; timestamp?: string } | null = null;
    let trackCoords: [number, number][] = [];

    for (const f of features) {
      if (f.geometry?.type === 'Point' && !f.properties?.is_heading_indicator) {
        const coords = f.geometry.coordinates;
        currentPos = {
          longitude: coords[0],
          latitude: coords[1],
          speed_knots: f.properties?.speed_knots,
          heading_deg: f.properties?.heading_deg,
          timestamp: f.properties?.timestamp,
        };
      } else if (f.geometry?.type === 'LineString' && !f.properties?.is_heading_indicator) {
        trackCoords = f.geometry.coordinates;
      }
    }

    return { currentPos, trackCoords };
  }, [replayLayer]);

  // Extract projected trajectory line from trajectoryLayer
  const activeTrajectoryCoords = useMemo(() => {
    if (!trajectoryLayer || !trajectoryLayer.geojson) return [];
    const fc = trajectoryLayer.geojson;
    const features = fc.type === 'FeatureCollection' && Array.isArray(fc.features) ? fc.features : [fc];
    for (const f of features) {
      if (f.geometry?.type === 'LineString') {
        return f.geometry.coordinates as [number, number][];
      }
    }
    return [];
  }, [trajectoryLayer]);

  // Auto-focus camera on vessel selection fitting its position & sector context
  useEffect(() => {
    if (!selectedVesselId) return;

    const coordsToFit: [number, number][] = [];

    // 1. Current selected position
    if (activeReplayInfo?.currentPos) {
      coordsToFit.push([activeReplayInfo.currentPos.longitude, activeReplayInfo.currentPos.latitude]);
    } else if (vesselPositionsMap[selectedVesselId]) {
      const p = vesselPositionsMap[selectedVesselId];
      coordsToFit.push([p.longitude, p.latitude]);
    }

    // 2. Historical track coords
    if (activeReplayInfo?.trackCoords && activeReplayInfo.trackCoords.length > 0) {
      coordsToFit.push(...activeReplayInfo.trackCoords);
    }

    // 3. Projected trajectory coords
    if (activeTrajectoryCoords && activeTrajectoryCoords.length > 0) {
      coordsToFit.push(...activeTrajectoryCoords);
    }

    if (coordsToFit.length === 0) return;

    let minLng = coordsToFit[0][0];
    let maxLng = coordsToFit[0][0];
    let minLat = coordsToFit[0][1];
    let maxLat = coordsToFit[0][1];

    for (const [lng, lat] of coordsToFit) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const spanLng = Math.max(0.03, maxLng - minLng);
    const spanLat = Math.max(0.03, maxLat - minLat);
    const maxSpan = Math.max(spanLng, spanLat);

    let zoom = 10.6;
    if (maxSpan > 0.4) zoom = 9.4;
    else if (maxSpan > 0.2) zoom = 10.0;
    else if (maxSpan > 0.08) zoom = 10.8;
    else zoom = 11.2;

    setViewState((prev) => ({
      ...prev,
      longitude: centerLng,
      latitude: centerLat,
      zoom,
      transitionDuration: 800,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, [selectedVesselId]);

  // Active hazard IDs associated with selected vessel or selected operational alert
  const activeHazardIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedOperationalAlert?.hazard_id) {
      ids.add(selectedOperationalAlert.hazard_id);
    }
    if (selectedVesselId && hazardAssociations.length > 0) {
      for (const ha of hazardAssociations) {
        if (ha.vessel_id === selectedVesselId) {
          ids.add(ha.hazard_id);
        }
      }
    }
    return ids;
  }, [selectedOperationalAlert, selectedVesselId, hazardAssociations]);

  // Calculate deterministic ETA or report unavailable
  const voyageStats = useMemo(() => {
    if (!selectedVessel) return null;

    const speed = activeReplayInfo?.currentPos?.speed_knots;
    const heading = activeReplayInfo?.currentPos?.heading_deg;
    const currentCoords = activeReplayInfo?.currentPos
      ? [activeReplayInfo.currentPos.longitude, activeReplayInfo.currentPos.latitude] as [number, number]
      : activeSector.center;

    let etaDisplay = 'ETA unavailable';
    let remainingDistanceKm: number | null = null;

    // Check if route distance exists in sectorRouteLayers
    if (sectorRouteLayers.length > 0) {
      for (const r of sectorRouteLayers) {
        if (r.properties?.distance_km && typeof r.properties.distance_km === 'number') {
          remainingDistanceKm = r.properties.distance_km;
          break;
        }
      }
    }

    // Deterministic calculation ONLY if speed > 0 and distance is available
    if (typeof speed === 'number' && speed > 0 && typeof remainingDistanceKm === 'number' && remainingDistanceKm > 0) {
      const speedKmh = speed * 1.852;
      const hours = remainingDistanceKm / speedKmh;
      const totalMinutes = Math.round(hours * 60);
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      etaDisplay = hrs > 0 ? `~${hrs}h ${mins}m` : `~${mins} min`;
    }

    return {
      vesselId: selectedVessel.public_id,
      name: selectedVessel.name,
      status: selectedVessel.status,
      speed: typeof speed === 'number' ? `${speed.toFixed(1)} kts` : '—',
      heading: typeof heading === 'number' ? `${heading}°` : '—',
      coordinates: currentCoords ? `${currentCoords[1].toFixed(2)}°N, ${currentCoords[0].toFixed(2)}°E` : '—',
      eta: etaDisplay,
      remainingDistance: remainingDistanceKm ? `${remainingDistanceKm.toFixed(1)} km` : null,
    };
  }, [selectedVessel, activeReplayInfo, sectorRouteLayers]);

  // Build Deck.gl Layers
  const deckLayers = useMemo(() => {
    const layers: any[] = [];

    // 1. Maritime National Boundaries & Base Geofences (Decluttered: transparent fill)
    if (baseLayers.length > 0) {
      const boundaryFeatures = baseLayers.flatMap((l) => {
        if (!l.geojson) return [];
        if (l.geojson.type === 'FeatureCollection' && Array.isArray(l.geojson.features)) return l.geojson.features;
        if (l.geojson.type === 'Feature') return [l.geojson];
        return [];
      });

      if (boundaryFeatures.length > 0) {
        layers.push(
          new GeoJsonLayer({
            id: 'authority-base-boundaries',
            data: { type: 'FeatureCollection', features: boundaryFeatures },
            pickable: true,
            stroked: true,
            filled: false,
            lineWidthMinPixels: 1,
            getLineColor: (f: any) => {
              const polyType = (f.properties?.polygon_type || '').toUpperCase();
              if (polyType === 'EEZ_BOUNDARY') return [56, 189, 248, 80];
              if (polyType === 'TERRITORIAL_WATERS') return [14, 165, 233, 100];
              return [100, 116, 139, 60];
            },
            getLineWidth: 1,
          }),
        );
      }
    }

    // 2. Active Sector Boundary & Radar Station (Transparent fill so ocean/map stays visible)
    if (activeSector && activeSector.polygon) {
      layers.push(
        new GeoJsonLayer({
          id: 'authority-active-sector-polygon',
          data: {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [activeSector.polygon] },
            properties: { sector: activeSector.name, type: 'Active Surveillance Sector' },
          },
          pickable: false,
          stroked: true,
          filled: false,
          extruded: false,
          lineWidthMinPixels: 1.5,
          getLineColor: [168, 85, 247, 160], // Subtle purple border line
          getLineWidth: 1.5,
        }),
      );

      // Radar Station Node
      layers.push(
        new ScatterplotLayer({
          id: 'authority-sector-station',
          data: [{ position: activeSector.center, name: activeSector.station_name }],
          pickable: true,
          getPosition: (d: any) => d.position,
          getRadius: 1000,
          getFillColor: [192, 132, 252, 240],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 7,
          radiusMaxPixels: 16,
        }),
      );
    }

    // 3. Operational Hazard Polygons: ONLY significantly blink the active hazard area where the vessel is located
    if (sectorHazards.length > 0) {
      const activeHazards = sectorHazards.filter(
        (h) => h.status !== 'INACTIVE' && h.status !== 'EXPIRED',
      );

      const hazardFeatures = activeHazards.map((h) => {
        const isAlertSelected = activeHazardIds.has(h.hazard_id);
        return {
          type: 'Feature' as const,
          geometry: h.geometry,
          properties: {
            ...h,
            is_alert_selected: isAlertSelected,
          },
        };
      });

      // Smooth blink alpha for the active hazard where the vessel is
      const blinkFillAlpha = Math.round(35 + 25 * Math.sin(pulseTick * 0.15));
      const blinkLineAlpha = Math.round(180 + 75 * Math.sin(pulseTick * 0.15));

      layers.push(
        new GeoJsonLayer({
          id: 'authority-sector-hazards',
          data: { type: 'FeatureCollection', features: hazardFeatures },
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1.5,
          getLineColor: (f: any) => {
            if (f.properties?.is_alert_selected) {
              return [250, 204, 21, blinkLineAlpha]; // Glowing blinking gold
            }
            if (f.properties?.severity === 'WARNING') return [239, 68, 68, 60];
            if (f.properties?.severity === 'ALERT') return [249, 115, 22, 50];
            return [234, 179, 8, 40];
          },
          getFillColor: (f: any) => {
            if (f.properties?.is_alert_selected) {
              return [250, 204, 21, blinkFillAlpha]; // Dynamic blinking fill only for active hazard
            }
            return [0, 0, 0, 0]; // Zero fill for non-active hazards
          },
          getLineWidth: (f: any) => (f.properties?.is_alert_selected ? 4 : 1.5),
        }),
      );
    }

    // 4. Sector Operational Route Corridors (Recommended & Candidates)
    if (sectorRouteLayers.length > 0) {
      const routeFeatures = sectorRouteLayers.flatMap((l) => {
        if (!l.geojson) return [];
        if (l.geojson.type === 'FeatureCollection' && Array.isArray(l.geojson.features)) return l.geojson.features;
        if (l.geojson.type === 'Feature') return [l.geojson];
        return [];
      });

      const lineRoutes = routeFeatures.filter((f) => f.geometry?.type === 'LineString');
      if (lineRoutes.length > 0) {
        layers.push(
          new GeoJsonLayer({
            id: 'authority-operational-routes',
            data: { type: 'FeatureCollection', features: lineRoutes },
            pickable: true,
            stroked: true,
            filled: false,
            lineWidthMinPixels: 2.5,
            getLineColor: (f: any) => {
              const isRec = f.properties?.is_recommended || f.properties?.route_id?.includes('RECOMMENDED');
              return isRec ? [16, 185, 129, 230] : [100, 116, 139, 150]; // Emerald vs Slate
            },
            getLineWidth: (f: any) => {
              const isRec = f.properties?.is_recommended || f.properties?.route_id?.includes('RECOMMENDED');
              return isRec ? 4 : 2;
            },
          }),
        );
      }
    }

    // 5. Selected Vessel Historical Wake Trail (Glowing Amber Trail matching experiment)
    if (activeReplayInfo?.trackCoords && activeReplayInfo.trackCoords.length >= 2) {
      const elevatedTrail = activeReplayInfo.trackCoords.map((p) => [p[0], p[1], 200]);
      layers.push(
        new PathLayer({
          id: 'authority-vessel-historical-wake-trail',
          data: [
            {
              path: elevatedTrail,
              name: `Historical Track (${selectedVesselId})`,
            },
          ],
          getPath: (d: any) => d.path,
          getColor: [245, 158, 11, 220], // Amber glowing trail
          getWidth: 4,
          widthMinPixels: 3,
          widthMaxPixels: 6,
          capRounded: true,
          jointRounded: true,
        }),
      );

      // Track Waypoint Breadcrumbs
      layers.push(
        new ScatterplotLayer({
          id: 'authority-vessel-track-breadcrumbs',
          data: activeReplayInfo.trackCoords.map((coord, idx) => ({
            position: coord,
            index: idx,
          })),
          pickable: false,
          getPosition: (d: any) => d.position,
          getRadius: 200,
          getFillColor: [245, 158, 11, 160],
          radiusMinPixels: 3,
          radiusMaxPixels: 6,
        }),
      );
    }

    // 6. Selected Vessel Projected Trajectory (Cyan Forward Projection)
    if (activeTrajectoryCoords && activeTrajectoryCoords.length >= 2) {
      layers.push(
        new PathLayer({
          id: 'authority-vessel-projected-trajectory',
          data: [
            {
              path: activeTrajectoryCoords,
              name: `Estimated Trajectory (${selectedVesselId})`,
            },
          ],
          getPath: (d: any) => d.path,
          getColor: [6, 182, 212, 230], // Cyan
          getWidth: 3,
          widthMinPixels: 2.5,
          widthMaxPixels: 5,
          capRounded: true,
          jointRounded: true,
        }),
      );
    }

    // 7. Active Monitored Vessels & 3D Searchlight Beacon (Matching experiment)
    if (vessels.length > 0) {
      const vesselData: Array<{
        public_id: string;
        name: string;
        vessel_type?: string;
        status: string;
        position: [number, number];
        speed?: number;
        heading: number;
        isSelected: boolean;
      }> = [];

      for (const v of vessels) {
        const isSelected = v.public_id === selectedVesselId;
        const pos =
          isSelected && activeReplayInfo?.currentPos
            ? activeReplayInfo.currentPos
            : vesselPositionsMap[v.public_id];

        // Exclude invalid, missing, or zero coordinates strictly
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

        vesselData.push({
          public_id: v.public_id,
          name: v.name,
          vessel_type: v.vessel_type,
          status: v.status || 'UNDERWAY',
          position: [pos.longitude, pos.latitude],
          speed: pos.speed_knots,
          heading: typeof pos.heading_deg === 'number' && !isNaN(pos.heading_deg) ? pos.heading_deg : 0,
          isSelected,
        });
      }

      if (vesselData.length > 0) {
        const selectedVessels = vesselData.filter((v) => v.isSelected);

        // 3D Searchlight / Beacon Column for Selected Vessel (Streamlined)
        if (selectedVessels.length > 0) {
          layers.push(
            new ColumnLayer({
              id: 'authority-vessel-3d-beacon',
              data: selectedVessels,
              diskResolution: 18,
              radius: 350,
              extruded: true,
              wireframe: true,
              getPosition: (d: any) => d.position,
              getElevation: 2500,
              getFillColor: [245, 158, 11, 80],
              getLineColor: [251, 191, 36, 210],
              lineWidthMinPixels: 1.5,
            }),
          );

          // Vessel Glowing Pulse Aura (Restrained & Sleek)
          const auraRadius = 900 + 300 * Math.sin(pulseTick * 0.15);
          layers.push(
            new ScatterplotLayer({
              id: 'authority-vessel-pulse-aura',
              data: selectedVessels,
              pickable: false,
              getPosition: (d: any) => d.position,
              getRadius: () => auraRadius,
              getFillColor: [245, 158, 11, 45],
              radiusMinPixels: 10,
              radiusMaxPixels: 22,
            }),
          );
        }

        // Nautical Vessel Heading Chevrons / Vectors
        const vesselVectorPaths = vesselData.map((v) => {
          const rad = (v.heading * Math.PI) / 180;
          const lenDeg = 0.012;
          const latRad = (v.position[1] * Math.PI) / 180;
          const tipLng = v.position[0] + (lenDeg * Math.sin(rad)) / Math.max(Math.cos(latRad), 0.1);
          const tipLat = v.position[1] + lenDeg * Math.cos(rad);
          return {
            path: [v.position, [tipLng, tipLat]],
            isSelected: v.isSelected,
          };
        });

        layers.push(
          new PathLayer({
            id: 'authority-vessel-heading-vectors',
            data: vesselVectorPaths,
            getPath: (d: any) => d.path,
            getColor: (d: any) => (d.isSelected ? [250, 204, 21, 230] : [56, 189, 248, 160]),
            getWidth: (d: any) => (d.isSelected ? 2.5 : 1.5),
            widthMinPixels: 1.5,
            widthMaxPixels: 4,
          }),
        );

        // Sleek & Compact Nautical Vessel Craft Markers (IconLayer)
        layers.push(
          new IconLayer({
            id: 'authority-vessels-craft-icons',
            data: vesselData,
            pickable: true,
            getPosition: (d: any) => [d.position[0], d.position[1], d.isSelected ? 200 : 0],
            getIcon: (d: any) => ({
              url: d.isSelected ? VESSEL_ICON_GOLD : VESSEL_ICON_CYAN,
              width: 32,
              height: 32,
              anchorX: 16,
              anchorY: 16,
            }),
            getSize: (d: any) => (d.isSelected ? 22 : 16),
            sizeUnits: 'pixels',
            sizeMinPixels: 12,
            sizeMaxPixels: 24,
            getAngle: (d: any) => 360 - d.heading,
          }),
        );

        // Floating 3D Telemetry Label for Selected Vessel
        if (selectedVessels.length > 0) {
          layers.push(
            new TextLayer({
              id: 'authority-vessel-3d-telemetry-label',
              data: selectedVessels,
              pickable: false,
              getPosition: (d: any) => [d.position[0], d.position[1], 3200],
              getText: (d: any) => `${d.name || d.public_id} · ${d.speed != null ? `${d.speed.toFixed(1)} kn` : '—'}`,
              getSize: 12,
              getColor: [255, 255, 255, 255],
              fontFamily: 'ui-sans-serif, system-ui, -apple-system',
              fontWeight: 'bold',
              outlineWidth: 3,
              outlineColor: [15, 23, 42, 230],
              getTextAnchor: 'middle',
              getAlignmentBaseline: 'bottom',
            }),
          );
        }

        // Vessel Identity Labels for unselected vessels
        const unselectedVessels = vesselData.filter((v) => !v.isSelected);
        if (unselectedVessels.length > 0) {
          layers.push(
            new TextLayer({
              id: 'authority-vessels-labels',
              data: unselectedVessels,
              pickable: false,
              getPosition: (d: any) => d.position,
              getText: (d: any) => `${d.name || d.public_id} (${d.speed != null ? `${d.speed.toFixed(1)} kn` : '—'})`,
              getSize: 12,
              getColor: [203, 213, 225, 220],
              getAngle: 0,
              getTextAnchor: 'start',
              getAlignmentBaseline: 'center',
              getPixelOffset: [14, 0],
              fontFamily: 'ui-sans-serif, system-ui, -apple-system',
              fontWeight: 'bold',
              outlineWidth: 3,
              outlineColor: [15, 23, 42, 240],
            }),
          );
        }
      }
    }

    return layers;
  }, [
    baseLayers,
    activeSector,
    sectorHazards,
    activeHazardIds,
    sectorRouteLayers,
    activeReplayInfo,
    activeTrajectoryCoords,
    vessels,
    selectedVesselId,
    vesselPositionsMap,
    pulseTick,
  ]);

  // HUD Tooltip
  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.picked || !info.object) return null;
    const layerId = info.layer?.id || '';
    const obj = info.object;

    if (layerId.includes('vessels') || obj.public_id?.startsWith('vessel-') || obj.vessel_id) {
      const vid = obj.public_id || obj.vessel_id;
      const speed = obj.speed ?? obj.speed_knots;
      const heading = obj.heading ?? obj.heading_deg;
      return {
        html: `
          <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.96); border: 1px solid #f59e0b; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
            <div style="font-weight: 700; color: #f59e0b; display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
              🚢 ${obj.name || vid}
            </div>
            <div style="color: #cbd5e1; font-size: 11px;">Status: <strong style="color: #34d399;">${obj.status || 'UNDERWAY'}</strong></div>
            <div style="color: #cbd5e1; font-size: 11px; margin-top: 2px;">Speed: <strong>${speed != null ? `${speed} kn` : '—'}</strong> · Heading: <strong>${heading != null ? `${heading}°` : '—'}</strong></div>
            <div style="color: #94a3b8; font-size: 10px; margin-top: 4px; font-family: monospace;">ID: ${vid}</div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    if (layerId.includes('hazards')) {
      const p = obj.properties || obj;
      return {
        html: `
          <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.96); border: 1px solid #ef4444; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
            <div style="font-weight: 700; color: #ef4444; margin-bottom: 2px;">⚠️ ${p.hazard_type || p.event_type || 'Active Hazard'}</div>
            <div style="font-weight: 600; color: #fff; font-size: 11px;">${p.headline || 'Marine Safety Bulletin'}</div>
            <div style="color: #cbd5e1; font-size: 11px; margin-top: 3px;">Severity: <strong style="color: #facc15;">${p.severity || 'UNKNOWN'}</strong> · Status: <strong>${p.status || 'ACTIVE'}</strong></div>
            <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">Valid: ${p.valid_from || '—'} → ${p.valid_to || '—'}</div>
          </div>
        `,
        style: { zIndex: '1000' },
      };
    }

    return null;
  }, []);

  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (!info.picked || !info.object) return;
      const layerId = info.layer?.id || '';
      const obj = info.object;

      if (layerId.includes('vessel') || obj.public_id?.startsWith('vessel-') || obj.vessel_id) {
        const vid = obj.public_id || obj.vessel_id;
        if (vid && onSelectVessel) {
          onSelectVessel(vid);
        }
      } else if (layerId.includes('hazard') && onSelectHazard) {
        const hid = obj.properties?.hazard_id || obj.hazard_id;
        if (hid) onSelectHazard(hid);
      }
    },
    [onSelectVessel, onSelectHazard],
  );

  return (
    <DeckGLMapFoundation
      layers={deckLayers}
      viewState={viewState}
      onViewStateChange={setViewState}
      getTooltip={getTooltip}
      onClick={handleClick}
      onResetView={() => {
        setViewState({
          ...DEFAULT_VIEW_STATE,
          longitude: activeSector.center[0],
          latitude: activeSector.center[1],
          zoom: activeSector.zoom || 8.8,
        });
        onResetView?.();
      }}
      topOverlay={
        /* Sector Command Header Strip */
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '6px',
            padding: '6px 12px',
            color: '#f8fafc',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={14} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em' }}>
              {activeSector.name}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                background: 'rgba(168, 85, 247, 0.2)',
                color: '#c084fc',
                padding: '2px 5px',
                borderRadius: '4px',
              }}
            >
              {activeSector.code}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
            <span style={{ color: '#94a3b8' }}>
              Vessels: <strong style={{ color: '#38bdf8' }}>{vessels.length}</strong>
            </span>
            <span style={{ color: '#94a3b8' }}>
              Hazards: <strong style={{ color: sectorHazards.length > 0 ? '#ef4444' : '#10b981' }}>{sectorHazards.length}</strong>
            </span>
          </div>
        </div>
      }
      bottomOverlay={
        /* Compact Vessel Voyage & ETA Telemetry HUD */
        voyageStats ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '6px',
              padding: '7px 12px',
              color: '#f8fafc',
              fontSize: '11px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
              maxWidth: '650px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Ship size={14} style={{ color: '#f59e0b' }} />
              <strong style={{ color: '#facc15' }}>{voyageStats.name}</strong>
              <span style={{ color: '#94a3b8', fontSize: '10px', fontFamily: 'monospace' }}>({voyageStats.vesselId})</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Gauge size={12} style={{ color: '#38bdf8' }} />
              <span>Speed: <strong>{voyageStats.speed}</strong></span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Compass size={12} style={{ color: '#38bdf8' }} />
              <span>Heading: <strong>{voyageStats.heading}</strong></span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} style={{ color: voyageStats.eta.includes('~') ? '#34d399' : '#94a3b8' }} />
              <span>ETA: <strong style={{ color: voyageStats.eta.includes('~') ? '#34d399' : '#cbd5e1' }}>{voyageStats.eta}</strong></span>
            </div>

            {voyageStats.remainingDistance && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Navigation size={12} style={{ color: '#a855f7' }} />
                <span>Dist: <strong>{voyageStats.remainingDistance}</strong></span>
              </div>
            )}
          </div>
        ) : null
      }
    />
  );
}
