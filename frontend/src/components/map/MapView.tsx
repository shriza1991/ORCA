import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import * as Popover from '@radix-ui/react-popover';
import type { MapLayer } from '../../types/contracts';
import type { OperationalMode } from '../../types/mission';
import LayerManager from './LayerManager';
import MissionMapBrief from './MissionMapBrief';
import { Layers } from 'lucide-react';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

/** Initial fallback center (Indian coastal waters) */
const INITIAL_CENTER: [number, number] = [73.28, 16.99];
const INITIAL_ZOOM = 7;

/** CartoDB Vector Basemap Styles */
const MAP_STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const MAP_STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface MapViewProps {
  layers: MapLayer[];
  theme?: 'light' | 'dark';
  center?: [number, number];
  zoom?: number;
  language?: SupportedLanguage;
  customPopupRenderer?: (feature: any, layer: MapLayer) => string | null;
  onResetView?: () => void;
  resetViewTrigger?: number;
  layerAvailability?: {
    pfz?: 'AVAILABLE' | 'UNAVAILABLE' | 'EMPTY';
    routes?: 'AVAILABLE' | 'UNAVAILABLE' | 'EMPTY';
    hazards?: 'AVAILABLE' | 'UNAVAILABLE' | 'EMPTY';
  };
  hideAdvancedControls?: boolean;
}

export default function MapView({
  layers,
  theme = 'light',
  center,
  zoom,
  language = 'en',
  customPopupRenderer,
  onResetView,
  resetViewTrigger,
  layerAvailability,
  hideAdvancedControls = false,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const activeLayersRef = useRef<{ layers: string[]; sources: string[] }>({ layers: [], sources: [] });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [selectedCorridorMode, setSelectedCorridorMode] = useState<OperationalMode>('safest');

  const activeStyle = theme === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
  const currentStyleRef = useRef(activeStyle);
  const customPopupRendererRef = useRef(customPopupRenderer);
  customPopupRendererRef.current = customPopupRenderer;

  // Dynamically compute effective render layers based on selected operational corridor
  const effectiveRenderLayers = useMemo(() => {
    const hasRouteLayers = layers.some(
      (l) => l.layer_id === 'layer_recommended_route' || l.layer_id === 'layer_candidate_routes'
    );
    if (!hasRouteLayers) return layers;

    const allRouteFeatures: any[] = [];
    const nonRouteLayers: MapLayer[] = [];

    for (const l of layers) {
      if (l.layer_id === 'layer_recommended_route') {
        if (l.geojson && (l.geojson as any).type === 'Feature') {
          allRouteFeatures.push(l.geojson);
        }
      } else if (l.layer_id === 'layer_candidate_routes') {
        if (l.geojson && (l.geojson as any).type === 'FeatureCollection' && Array.isArray((l.geojson as any).features)) {
          allRouteFeatures.push(...(l.geojson as any).features);
        }
      } else if (l.layer_id === 'layer_route_start_marker' || l.layer_id === 'layer_route_end_marker') {
        // Ignored here; cleanly re-generated below for the currently active corridor
      } else {
        nonRouteLayers.push(l);
      }
    }

    if (allRouteFeatures.length === 0) return layers;

    let selectedFeat = allRouteFeatures.find((f) => {
      const id = f.properties?.route_id || '';
      const name = (f.properties?.name || '').toLowerCase();
      if (selectedCorridorMode === 'safest') return id === 'ROUTE-A-INSHORE' || name.includes('inshore') || name.includes('sheltered');
      if (selectedCorridorMode === 'balanced') return id === 'ROUTE-C-BALANCED' || name.includes('balanced');
      if (selectedCorridorMode === 'direct') return id === 'ROUTE-B-DIRECT' || name.includes('direct') || name.includes('deep');
      return false;
    });

    if (!selectedFeat) {
      selectedFeat = allRouteFeatures[0];
    }

    // P0-8I: Render ONLY the single currently selected route on the map to prevent visual overload/clutter.
    // The candidate alternatives are represented and selectable via the Mission Map & Corridors controls.
    const dynamicRouteLayers: MapLayer[] = [
      {
        layer_id: 'layer_recommended_route',
        name: `Selected Corridor (${selectedFeat.properties?.name || selectedFeat.properties?.route_id || 'Route'})`,
        layer_type: 'geojson',
        visible: true,
        style: {
          color: '#06b6d4',
          opacity: 0.95,
          line_width: 4,
          layer_category: 'navigation',
        },
        geojson: {
          ...selectedFeat,
          properties: { ...selectedFeat.properties, is_recommended: true },
        },
      },
    ];

    // Surface accurate Start Point and Destination Point markers on the map
    const coords = (selectedFeat.geometry as any)?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const startCoord = coords[0];
      const endCoord = coords[coords.length - 1];
      const originName = selectedFeat.properties?.origin || 'Voyage Departure Point';
      const destName = selectedFeat.properties?.destination || 'Voyage Target / Destination';

      dynamicRouteLayers.push({
        layer_id: 'layer_route_start_marker',
        name: `Departure Start: ${originName}`,
        layer_type: 'geojson',
        visible: true,
        style: {
          color: '#10b981',
          opacity: 1.0,
          circle_radius: 9,
          layer_category: 'navigation_terminal',
        },
        geojson: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: startCoord,
          },
          properties: {
            point_type: 'Voyage Start Point',
            location: originName,
            coordinates: `${startCoord[1]?.toFixed(4)}°N, ${startCoord[0]?.toFixed(4)}°E`,
            corridor: selectedFeat.properties?.name || selectedFeat.properties?.route_id || 'Corridor',
          },
        },
      });

      dynamicRouteLayers.push({
        layer_id: 'layer_route_end_marker',
        name: `Destination: ${destName}`,
        layer_type: 'geojson',
        visible: true,
        style: {
          color: '#f59e0b',
          opacity: 1.0,
          circle_radius: 9,
          layer_category: 'navigation_terminal',
        },
        geojson: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: endCoord,
          },
          properties: {
            point_type: 'Voyage Destination Point',
            location: destName,
            coordinates: `${endCoord[1]?.toFixed(4)}°N, ${endCoord[0]?.toFixed(4)}°E`,
            corridor: selectedFeat.properties?.name || selectedFeat.properties?.route_id || 'Corridor',
          },
        },
      });
    }

    return [...nonRouteLayers, ...dynamicRouteLayers];
  }, [layers, selectedCorridorMode]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = center || INITIAL_CENTER;
    const initialZoom = zoom || INITIAL_ZOOM;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: activeStyle,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const attachedListenersRef = useRef<Set<string>>(new Set());
  const activeReplayVesselRef = useRef<string | null>(null);
  const activeReplayTriggerRef = useRef<number | undefined>(undefined);
  const lastFittedSignatureRef = useRef<string>('');
  const animFrameRef = useRef<number | null>(null);
  const animatedHazardLayersRef = useRef<Array<{ fillId: string; outlineId: string; baseOpacity: number; baseLineWidth: number }>>([]);
  const animatedVesselLayersRef = useRef<Array<{ pointId: string; baseRadius: number }>>([]);

  // Animate map when programmatic center or zoom changes (only if no active replay trajectory is being tracked)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;

    if (activeReplayVesselRef.current) return;

    const cur = map.getCenter();
    if (Math.abs(cur.lng - center[0]) > 0.001 || Math.abs(cur.lat - center[1]) > 0.001) {
      map.flyTo({
        center,
        zoom: zoom ?? 8.5,
        duration: 900,
        essential: true,
      });
    }
  }, [center?.[0], center?.[1], zoom]);

  // Update map style ONLY when theme actually changes after initial mount
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentStyleRef.current === activeStyle) return;

    currentStyleRef.current = activeStyle;
    // Disabling diff avoids MapLibre error when switching completely different styles
    map.setStyle(activeStyle, { diff: false });
  }, [activeStyle]);

  // Shared Animation Loop for Active Hazard Warning Pulse and Calm Live Vessel Tracking
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let isRunning = true;

    const animate = (timestamp: number) => {
      if (!isRunning || !mapRef.current) return;

      try {
        // Active warning pulse (approx 2.0s period)
        const hazardFactor = (Math.sin((timestamp / 2000) * 2 * Math.PI) + 1) / 2;
        // Calm vessel tracking telemetry pulse (approx 1.8s period)
        const vesselFactor = (Math.sin((timestamp / 1800) * 2 * Math.PI) + 1) / 2;

        // 1. Hazard active pulse (subtle red warning pulse on active hazards only)
        for (const h of animatedHazardLayersRef.current) {
          if (map.getLayer(h.fillId)) {
            map.setPaintProperty(h.fillId, 'fill-opacity', h.baseOpacity + hazardFactor * 0.18);
          }
          if (map.getLayer(h.outlineId)) {
            map.setPaintProperty(h.outlineId, 'line-opacity', 0.50 + hazardFactor * 0.45);
            map.setPaintProperty(h.outlineId, 'line-width', h.baseLineWidth + hazardFactor * 1.5);
          }
        }

        // 2. Vessel live tracking dot (gentle calm telemetry pulse)
        for (const v of animatedVesselLayersRef.current) {
          if (map.getLayer(v.pointId)) {
            map.setPaintProperty(v.pointId, 'circle-radius', v.baseRadius + vesselFactor * 3.5);
            map.setPaintProperty(v.pointId, 'circle-stroke-width', 2 + vesselFactor * 1.5);
          }
        }
      } catch {
        // Suppress errors during style reload or unmount transitions
      }

      if (isRunning) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [effectiveRenderLayers]);

  // Manage GeoJSON layers dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncLayers = () => {
      const vis: Record<string, boolean> = {};
      const newRegisteredLayers: string[] = [];
      const newRegisteredSources: string[] = [];
      const newAnimatedHazards: Array<{ fillId: string; outlineId: string; baseOpacity: number; baseLineWidth: number }> = [];
      const newAnimatedVessels: Array<{ pointId: string; baseRadius: number }> = [];

      for (const layer of effectiveRenderLayers) {
        const sourceId = `src-${layer.layer_id}`;
        const layerId = layer.layer_id;
        vis[layerId] = layer.visible;
        newRegisteredSources.push(sourceId);

        const geojson = layer.geojson;
        const existingSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;

        if (existingSource && typeof existingSource.setData === 'function') {
          existingSource.setData(geojson as GeoJSON.GeoJSON);
        } else if (!existingSource) {
          map.addSource(sourceId, { type: 'geojson', data: geojson as GeoJSON.GeoJSON });
        }

        const color = layer.style?.color || '#0284c7';
        const opacity = layer.style?.opacity ?? 0.6;
        const lineWidth = layer.style?.line_width ?? 2;
        const lineDasharray = layer.style?.line_dasharray;
        const circleRadius = layer.style?.circle_radius ?? 8;

        const geomType = getGeometryType(geojson);
        const hasPointFeature =
          geomType === 'Point' ||
          geomType === 'MultiPoint' ||
          (geojson.type === 'FeatureCollection' &&
            Array.isArray(geojson.features) &&
            geojson.features.some((f: any) => f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint'));

        const hasLineFeature =
          geomType === 'LineString' ||
          geomType === 'MultiLineString' ||
          (geojson.type === 'FeatureCollection' &&
            Array.isArray(geojson.features) &&
            geojson.features.some((f: any) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'));

        const hasPolygonFeature =
          geomType === 'Polygon' ||
          geomType === 'MultiPolygon' ||
          (geojson.type === 'FeatureCollection' &&
            Array.isArray(geojson.features) &&
            geojson.features.some((f: any) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'));

        // 1. Polygon fills & outlines
        if (hasPolygonFeature) {
          if (!map.getLayer(layerId)) {
            map.addLayer({
              id: layerId,
              type: 'fill',
              source: sourceId,
              filter: ['in', '$type', 'Polygon'],
              paint: {
                'fill-color': color,
                'fill-opacity': opacity,
              },
            });
          } else {
            map.setPaintProperty(layerId, 'fill-color', color);
            map.setPaintProperty(layerId, 'fill-opacity', opacity);
          }
          newRegisteredLayers.push(layerId);

          const outlineId = `${layerId}-outline`;
          if (!map.getLayer(outlineId)) {
            map.addLayer({
              id: outlineId,
              type: 'line',
              source: sourceId,
              filter: ['in', '$type', 'Polygon'],
              paint: {
                'line-color': color,
                'line-width': lineWidth,
                'line-opacity': Math.min(opacity + 0.35, 1),
              },
            });
          } else {
            map.setPaintProperty(outlineId, 'line-color', color);
            map.setPaintProperty(outlineId, 'line-width', lineWidth);
            map.setPaintProperty(outlineId, 'line-opacity', Math.min(opacity + 0.35, 1));
          }
          newRegisteredLayers.push(outlineId);

          // Register active hazards for warning pulse animation (inactive/expired hazards are excluded)
          const isHazard = layerId.startsWith('authority_hazard_') || layer.style?.layer_category === 'authority_hazard';
          const isActiveHazard = isHazard && (layer.properties?.is_active ?? true) && layer.properties?.status !== 'INACTIVE' && layer.properties?.status !== 'EXPIRED';
          if (isActiveHazard) {
            newAnimatedHazards.push({ fillId: layerId, outlineId, baseOpacity: opacity, baseLineWidth: lineWidth });
          }
        }

        // 2. LineString tracks & routes
        if (hasLineFeature) {
          const lineLayerId = hasPolygonFeature ? `${layerId}-line` : layerId;
          if (!map.getLayer(lineLayerId)) {
            map.addLayer({
              id: lineLayerId,
              type: 'line',
              source: sourceId,
              filter: ['in', '$type', 'LineString'],
              paint: {
                'line-color': color,
                'line-width': lineWidth,
                'line-opacity': opacity,
                ...(lineDasharray ? { 'line-dasharray': lineDasharray } : {}),
              },
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
              },
            });
            if (lineDasharray) {
              map.setPaintProperty(lineLayerId, 'line-dasharray', lineDasharray);
            }
          } else {
            map.setPaintProperty(lineLayerId, 'line-color', color);
            map.setPaintProperty(lineLayerId, 'line-width', lineWidth);
            map.setPaintProperty(lineLayerId, 'line-opacity', opacity);
            if (lineDasharray) {
              map.setPaintProperty(lineLayerId, 'line-dasharray', lineDasharray);
            } else {
              map.setPaintProperty(lineLayerId, 'line-dasharray', [1, 0]);
            }
          }
          newRegisteredLayers.push(lineLayerId);
        }

        // 3. Point positions & markers
        if (hasPointFeature) {
          const pointLayerId = (hasPolygonFeature || hasLineFeature) ? `${layerId}-circle` : layerId;
          if (!map.getLayer(pointLayerId)) {
            map.addLayer({
              id: pointLayerId,
              type: 'circle',
              source: sourceId,
              filter: ['in', '$type', 'Point'],
              paint: {
                'circle-radius': circleRadius,
                'circle-color': color,
                'circle-opacity': opacity,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              },
            });
          } else {
            map.setPaintProperty(pointLayerId, 'circle-radius', circleRadius);
            map.setPaintProperty(pointLayerId, 'circle-color', color);
            map.setPaintProperty(pointLayerId, 'circle-opacity', opacity);
          }
          newRegisteredLayers.push(pointLayerId);

          // Register active vessel marker for calm telemetry tracking pulse
          const isVesselPoint = layerId === 'layer_fleet_vessel_replay' || layer.style?.layer_category === 'fleet_replay' || layerId === 'layer_vessel_position';
          if (isVesselPoint) {
            newAnimatedVessels.push({ pointId: pointLayerId, baseRadius: circleRadius });
          }
        }

        // Interactive popups for non-background layers
        const isBackgroundZone = layerId.toLowerCase().includes('eez') || layer.style?.layer_category === 'background';
        const interactiveLayerId = hasPointFeature && (hasPolygonFeature || hasLineFeature)
          ? `${layerId}-circle`
          : layerId;

        if (!isBackgroundZone && !attachedListenersRef.current.has(interactiveLayerId)) {
          attachedListenersRef.current.add(interactiveLayerId);

          map.on('click', interactiveLayerId, (e) => {
            if (!e.features?.length) return;
            const feature = e.features[0];
            const props = feature.properties || {};

            activePopupRef.current?.remove();

            let html: string | null = null;
            if (customPopupRendererRef.current) {
              try {
                html = customPopupRendererRef.current(feature, layer);
              } catch {
                html = null;
              }
            }

            if (!html) {
              const ignoredKeys = new Set([
                'polygon_id', 'id', 'polygon_type', 'is_hard_restriction', 'objectid', 'object_id',
                'layer_id', 'layer_type', 'source', 'type', 'geometry_type', 'home_harbor_id'
              ]);

              const entries = Object.entries(props).filter(([k]) => !ignoredKeys.has(k.toLowerCase()));

              const content = entries.length > 0
                ? entries
                    .slice(0, 6)
                    .map(([k, v]) => `<div style="margin-bottom:2px"><strong>${k.replace(/_/g, ' ')}:</strong> ${formatPropValue(v)}</div>`)
                    .join('')
                : `<div><em>${layer.name}</em></div>`;

              html = `<div class="map-popup"><h5 style="margin:0 0 6px;color:#0284c7;font-size:12px;font-weight:700">${layer.name}</h5>${content}</div>`;
            }

            const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', offset: 10 })
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map);

            activePopupRef.current = popup;
          });

          map.on('mouseenter', interactiveLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', interactiveLayerId, () => { map.getCanvas().style.cursor = ''; });
        }
      }

      // Clean up removed layers (cleanly removes layers no longer present)
      for (const oldLayerId of activeLayersRef.current.layers) {
        if (!newRegisteredLayers.includes(oldLayerId)) {
          if (map.getLayer(oldLayerId)) map.removeLayer(oldLayerId);
          attachedListenersRef.current.delete(oldLayerId);
        }
      }

      // Clean up removed sources
      for (const oldSourceId of activeLayersRef.current.sources) {
        if (!newRegisteredSources.includes(oldSourceId)) {
          if (map.getSource(oldSourceId)) map.removeSource(oldSourceId);
        }
      }

      activeLayersRef.current = { layers: newRegisteredLayers, sources: newRegisteredSources };
      animatedHazardLayersRef.current = newAnimatedHazards;
      animatedVesselLayersRef.current = newAnimatedVessels;
      setLayerVisibility(vis);

      // Trajectory Replay Auto-Zoom Logic
      const replayLayer = layers.find(
        (l) => l.layer_id === 'layer_fleet_vessel_replay' || l.style?.layer_category === 'fleet_replay'
      );

      if (replayLayer) {
        const replayVesselId =
          (replayLayer as any).properties?.vessel_id ||
          (replayLayer.geojson as any)?.properties?.vessel_id ||
          (replayLayer.geojson as any)?.features?.[0]?.properties?.vessel_id ||
          replayLayer.name;
        const focusTrigger = (replayLayer as any).properties?.focus_trigger;

        const isNewVessel = replayVesselId !== activeReplayVesselRef.current;
        const isFocusRequested = focusTrigger !== undefined && focusTrigger !== activeReplayTriggerRef.current;

        if (isNewVessel || isFocusRequested) {
          activeReplayVesselRef.current = replayVesselId;
          activeReplayTriggerRef.current = focusTrigger;

          const replayBounds = new maplibregl.LngLatBounds();
          const bbox = (replayLayer as any).properties?.bbox || (replayLayer.geojson as any)?.bbox;
          if (Array.isArray(bbox) && bbox.length === 4) {
            replayBounds.extend([bbox[0], bbox[1]]);
            replayBounds.extend([bbox[2], bbox[3]]);
          } else {
            collectBounds(replayLayer.geojson, replayBounds, () => {});
          }

          if (!replayBounds.isEmpty()) {
            const sw = replayBounds.getSouthWest();
            const ne = replayBounds.getNorthEast();
            const isTightPoint = Math.abs(sw.lng - ne.lng) < 0.003 && Math.abs(sw.lat - ne.lat) < 0.003;

            if (isTightPoint) {
              map.flyTo({ center: [sw.lng, sw.lat], zoom: 12.5, duration: 900, essential: true });
            } else {
              try {
                map.fitBounds(replayBounds, {
                  padding: { top: 80, bottom: 80, left: 80, right: 80 },
                  maxZoom: 13.0,
                  duration: 900,
                  essential: true,
                });
              } catch {
                map.flyTo({
                  center: [(sw.lng + ne.lng) / 2, (sw.lat + ne.lat) / 2],
                  zoom: 12.0,
                  duration: 900,
                  essential: true,
                });
              }
            }
          }
        }
        // When advancing replay timeline for the same vessel, do NOT fitBounds — leave user camera completely uninterrupted!
      } else {
        // No replay layer active: clear replay state
        activeReplayVesselRef.current = null;
        activeReplayTriggerRef.current = undefined;

        // Auto-fit bounds ONLY for operational query response layers (e.g. PFZ polygons, hazard alerts), never base EEZ/sector polygons
        const operationalLayers = layers.filter(
          (l) =>
            l.visible &&
            !l.layer_id.startsWith('base_') &&
            !l.layer_id.startsWith('sector_') &&
            l.style?.layer_category !== 'base_geofence' &&
            l.style?.layer_category !== 'surveillance' &&
            l.style?.layer_category !== 'background' &&
            !l.layer_id.toLowerCase().includes('eez')
        );

        const currentSignature = operationalLayers
          .map((l) => l.layer_id)
          .sort()
          .join('|');

        // Spatially stable: only refit when the set of operational layers changes, not on corridor mode toggle
        if (operationalLayers.length > 0 && currentSignature !== lastFittedSignatureRef.current) {
          lastFittedSignatureRef.current = currentSignature;
          const bounds = new maplibregl.LngLatBounds();
          let hasOperationalCoords = false;
          for (const l of operationalLayers) {
            collectBounds(l.geojson, bounds, () => { hasOperationalCoords = true; });
          }
          if (hasOperationalCoords && !bounds.isEmpty()) {
            try {
              map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 1000 });
            } catch {
              // fallback gracefully
            }
          }
        }
      }
    };

    if (map.isStyleLoaded()) {
      syncLayers();
    } else {
      map.once('load', syncLayers);
      map.once('style.load', syncLayers);
    }
  }, [effectiveRenderLayers, activeStyle]);

  const toggleLayer = useCallback((layerId: string) => {
    const map = mapRef.current;
    if (!map) return;

    setLayerVisibility(prev => {
      const newVis = !prev[layerId];
      const visibility = newVis ? 'visible' : 'none';

      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
      if (map.getLayer(`${layerId}-outline`)) {
        map.setLayoutProperty(`${layerId}-outline`, 'visibility', visibility);
      }
      if (map.getLayer(`${layerId}-circle`)) {
        map.setLayoutProperty(`${layerId}-circle`, 'visibility', visibility);
      }

      return { ...prev, [layerId]: newVis };
    });
  }, []);

  const handleResetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const operationalLayers = effectiveRenderLayers.filter(
      (l) =>
        l.visible &&
        !l.layer_id.startsWith('base_') &&
        !l.layer_id.startsWith('sector_') &&
        l.style?.layer_category !== 'base_geofence' &&
        l.style?.layer_category !== 'surveillance' &&
        l.style?.layer_category !== 'background' &&
        !l.layer_id.toLowerCase().includes('eez')
    );

    const bounds = new maplibregl.LngLatBounds();
    let hasOperationalCoords = false;
    for (const l of operationalLayers) {
      collectBounds(l.geojson, bounds, () => {
        hasOperationalCoords = true;
      });
    }

    if (hasOperationalCoords && !bounds.isEmpty()) {
      try {
        map.fitBounds(bounds, { padding: 70, maxZoom: 12, duration: 900 });
      } catch {
        if (center) map.flyTo({ center, zoom: zoom ?? 9.5, duration: 900 });
      }
    } else if (center) {
      map.flyTo({ center, zoom: zoom ?? 9.5, duration: 900 });
    }
  }, [effectiveRenderLayers, center, zoom]);

  useEffect(() => {
    if (resetViewTrigger !== undefined) {
      handleResetView();
    }
  }, [resetViewTrigger, handleResetView]);

  return (
    <section className="map-view" aria-label="Geospatial map viewport">
      <div ref={containerRef} className="map-container" />

      {!hideAdvancedControls && (
        <MissionMapBrief
          layers={layers}
          selectedMode={selectedCorridorMode}
          onModeChange={setSelectedCorridorMode}
          language={language}
          onResetView={onResetView || handleResetView}
          layerAvailability={layerAvailability}
        />
      )}

      {hideAdvancedControls && (
        <div className="fisher-simple-map-controls" style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onResetView || handleResetView}
            style={{ padding: '16px', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'white', color: '#0f172a', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          >
            <Layers size={24} />
            {translateText('Show my trip', language) || 'Show my trip'}
          </button>
        </div>
      )}

      {layers.length > 0 && !hideAdvancedControls && (
        <Popover.Root open={showLayerPanel} onOpenChange={setShowLayerPanel}>
          <Popover.Trigger asChild>
            <button
              className="map-layer-toggle"
              aria-label="Toggle layer panel"
            >
              <Layers size={18} />
              <span>
                {layers.length}{' '}
                {language === 'hi' ? 'परतें' : language === 'mr' ? 'स्तर' : 'Layers'}
              </span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="layer-manager-popover"
              side="bottom"
              align="end"
              sideOffset={6}
              collisionPadding={12}
            >
              <LayerManager
                layers={layers}
                visibility={layerVisibility}
                onToggle={toggleLayer}
                onClose={() => setShowLayerPanel(false)}
                language={language}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </section>
  );
}

/** Recursively traverse GeoJSON and expand bounds */
function collectBounds(geojson: any, bounds: maplibregl.LngLatBounds, onCoord: () => void) {
  if (!geojson) return;

  const traverseCoords = (coords: any) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      bounds.extend([coords[0], coords[1]]);
      onCoord();
    } else {
      for (const item of coords) {
        traverseCoords(item);
      }
    }
  };

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (f.geometry?.coordinates) {
        traverseCoords(f.geometry.coordinates);
      }
    }
  } else if (geojson.type === 'Feature' && geojson.geometry?.coordinates) {
    traverseCoords(geojson.geometry.coordinates);
  } else if (geojson.coordinates) {
    traverseCoords(geojson.coordinates);
  }
}

/** Extract primary geometry type from GeoJSON */
function getGeometryType(geojson: MapLayer['geojson']): string {
  if (geojson.type === 'FeatureCollection' && geojson.features?.length) {
    return geojson.features[0].geometry?.type || 'Point';
  }
  if (geojson.type === 'Feature') {
    return (geojson as GeoJSON.Feature).geometry?.type || 'Point';
  }
  return (geojson as any)?.geometry?.type || 'Point';
}

function formatPropValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
