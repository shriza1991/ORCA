import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import maplibregl from "maplibre-gl";
import * as Popover from "@radix-ui/react-popover";
import * as turf from "@turf/turf";
import type { MapLayer } from "../../types/contracts";
import type { OperationalMode } from "../../types/mission";
import LayerManager from "./LayerManager";
import MissionMapBrief from "./MissionMapBrief";
import {
  Layers,
  Navigation,
  Play,
  Square,
  Ship,
  Sailboat,
  Clock,
  Waves,
  X,
  Bookmark,
  RefreshCw,
  Ruler,
  Wind,
} from "lucide-react";
import type { SupportedLanguage } from "../../i18n/translations";
import {
  executeSpatialQuery,
  type UnifiedSpatialQueryResponse,
} from "../../api/marinewatch-client";
import {
  NATIONAL_COASTAL_BOOKMARKS,
  haversineDistanceNm,
  initialBearingDeg,
  compassDirection,
  calculateTransitTime,
  generateWindVectorGrid,
} from "../../utils/geo";

const TIME_STEPS = [
  { label: "Now", hours: 0 },
  { label: "+3h", hours: 3 },
  { label: "+6h", hours: 6 },
  { label: "+12h", hours: 12 },
  { label: "+24h", hours: 24 },
  { label: "+48h", hours: 48 },
];

/** Initial fallback center (Indian coastal waters) */
const INITIAL_CENTER: [number, number] = [73.28, 16.99];
const INITIAL_ZOOM = 7;

/** CartoDB Vector Basemap Styles */
const MAP_STYLE_LIGHT =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const MAP_STYLE_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface MapViewProps {
  layers: MapLayer[];
  theme?: "light" | "dark";
  center?: [number, number];
  zoom?: number;
  language?: SupportedLanguage;
  customPopupRenderer?: (feature: any, layer: MapLayer) => string | null;
  onResetView?: () => void;
  resetViewTrigger?: number;
  layerAvailability?: {
    pfz?: "AVAILABLE" | "UNAVAILABLE" | "EMPTY";
    routes?: "AVAILABLE" | "UNAVAILABLE" | "EMPTY";
    hazards?: "AVAILABLE" | "UNAVAILABLE" | "EMPTY";
  };
  hideAdvancedControls?: boolean;
  liveLocation?: any;
  liveLocationStatus?: string;
  isTrackingLocation?: boolean;
  onToggleLocation?: () => void;
  craftProfile?: string;
  timeOffsetHours?: number;
  onTimeOffsetChange?: (hours: number) => void;
  /**
   * Canonical assessment conditions bundle from AssessmentService.
   * When provided and time offset is 0 ("Now"), the telemetry card uses
   * these values instead of a separate executeSpatialQuery fetch, ensuring
   * the Map and Brief/Agent Panel always display the same observation data.
   */
  canonicalConditions?: any;
  /** Canonical deterministic decision corresponding to canonicalConditions. */
  canonicalDecision?: string | { status?: string };
}

export default function MapView({
  layers,
  theme = "light",
  center,
  zoom,
  language = "en",
  customPopupRenderer,
  onResetView,
  resetViewTrigger,
  layerAvailability,
  hideAdvancedControls = false,
  liveLocation,
  liveLocationStatus,
  isTrackingLocation,
  onToggleLocation,
  craftProfile = "motorized_boat",
  timeOffsetHours,
  onTimeOffsetChange,
  canonicalConditions,
  canonicalDecision,
}: MapViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const activeLayersRef = useRef<{ layers: string[]; sources: string[] }>({
    layers: [],
    sources: [],
  });
  const domMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<
    Record<string, boolean>
  >({});
  const [isSimulating, setIsSimulating] = useState(false);
  const simulationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const simulationRootRef = useRef<Root | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [selectedCorridorMode, setSelectedCorridorMode] =
    useState<OperationalMode>("safest");
  const [selectedTimeStep, setSelectedTimeStep] = useState<number>(
    timeOffsetHours ?? 0,
  );
  const selectedTimeStepRef = useRef(selectedTimeStep);
  selectedTimeStepRef.current = selectedTimeStep;

  useEffect(() => {
    if (timeOffsetHours !== undefined && timeOffsetHours !== selectedTimeStep) {
      setSelectedTimeStep(timeOffsetHours);
    }
  }, [timeOffsetHours]);

  const [mapForecast, setMapForecast] = useState<{
    loading: boolean;
    wave_height_m: number;
    wind_speed_kn: number;
    wind_direction_deg: number;
    swell_height_m: number;
    swell_period_s: number;
    sst_c: number;
    tide_height_m: number;
    tide_phase: string;
    status: "GO" | "CAUTION" | "NO_GO";
  } | null>(null);

  const [inspectedPoint, setInspectedPoint] = useState<{
    lat: number;
    lon: number;
    data: UnifiedSpatialQueryResponse | null;
    loading: boolean;
  } | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Canonical Decision Snapshot: seed telemetry card from assessment conditions when at t=0.
  // This ensures the Map always shows the same wave/wind values as the Brief and Agent Panel,
  // which also read from the same assessment bundle. The spatial query still runs for time offsets
  // (future forecast scrubbing) and for point inspection clicks.
  useEffect(() => {
    if (!canonicalConditions || selectedTimeStep !== 0) return;
    const marine = canonicalConditions.marine;
    const weather = canonicalConditions.weather;
    if (!marine && !weather) return;

    const waveM: number = marine?.significant_wave_height_m ?? 0;
    const windKn: number = weather?.wind_speed_knots ?? marine?.wind_speed_knots ?? 0;
    const windDir: number = weather?.wind_direction_deg ?? marine?.wind_direction_deg ?? 0;
    const swellM: number = marine?.swell_wave_height_m ?? marine?.swell_height_m ?? 0;
    const swellP: number = marine?.swell_period_seconds ?? marine?.wave_period_seconds ?? 0;
    const sstC: number = marine?.sea_surface_temp_c ?? marine?.sea_surface_temperature_c ?? 0;

    const craftUpper = (craftProfile || 'motorized_boat').toUpperCase();
    let limit = 2.2;
    if (craftUpper.includes('NON_MOTORIZED') || craftUpper.includes('CANOE')) limit = 1.4;
    else if (craftUpper.includes('MECHANIZED') || craftUpper.includes('TRAWLER')) limit = 3.5;
    let canonStatus: 'GO' | 'CAUTION' | 'NO_GO' = 'GO';
    const decisionStatus = typeof canonicalDecision === 'string'
      ? canonicalDecision
      : canonicalDecision?.status;
    if (decisionStatus === 'NO_GO') canonStatus = 'NO_GO';
    else if (decisionStatus === 'CAUTION') canonStatus = 'CAUTION';
    else if (decisionStatus === 'GO') canonStatus = 'GO';
    else if (waveM > limit) canonStatus = 'NO_GO';
    else if (waveM > limit * 0.8) canonStatus = 'CAUTION';

    setMapForecast({
      loading: false,
      wave_height_m: waveM,
      wind_speed_kn: windKn,
      wind_direction_deg: windDir,
      swell_height_m: swellM,
      swell_period_s: swellP,
      sst_c: sstC,
      tide_height_m: marine?.tide_level_m ?? 0,
      tide_phase: marine?.tide_phase ?? '—',
      status: canonStatus,
    });
  }, [canonicalConditions, canonicalDecision, selectedTimeStep, craftProfile]);

  // Nautical Measure Tool State
  const [isRulerActive, setIsRulerActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<[number, number][]>([]);
  const isRulerActiveRef = useRef(isRulerActive);
  isRulerActiveRef.current = isRulerActive;

  // Wind and Currents vector layer toggle
  const [showWindVectors, setShowWindVectors] = useState(true);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = isRulerActive ? 'crosshair' : '';
  }, [isRulerActive]);

  // ESC key cancels ruler mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRulerActive) {
        setIsRulerActive(false);
        setRulerPoints([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRulerActive]);

  const rulerStats = useMemo(() => {
    if (rulerPoints.length < 2) return null;
    let totalDistNm = 0;
    let lastBearing = 0;
    for (let i = 0; i < rulerPoints.length - 1; i++) {
      totalDistNm += haversineDistanceNm(rulerPoints[i], rulerPoints[i + 1]);
      if (i === rulerPoints.length - 2) {
        lastBearing = initialBearingDeg(rulerPoints[i], rulerPoints[i + 1]);
      }
    }
    const totalDistKm = totalDistNm * 1.852;
    const transit = calculateTransitTime(totalDistNm, 8.5);
    const compass = compassDirection(lastBearing);
    return {
      distNm: totalDistNm.toFixed(1),
      distKm: totalDistKm.toFixed(1),
      bearing: Math.round(lastBearing),
      compass,
      transit: transit.text,
      waypoints: rulerPoints.length,
    };
  }, [rulerPoints]);

  useEffect(() => {
    let isCancelled = false;
    const targetLat = inspectedPoint
      ? inspectedPoint.lat
      : center
        ? center[1]
        : 16.99;
    const targetLon = inspectedPoint
      ? inspectedPoint.lon
      : center
        ? center[0]
        : 73.28;

    // Skip the spatial query for "Now" (offset=0) if canonical conditions are already seeded.
    // Still run it if the user has scrolled to a future time step or clicked an inspection point.
    if (selectedTimeStep === 0 && canonicalConditions && !inspectedPoint) {
      return;
    }

    setMapForecast((prev) => (prev ? { ...prev, loading: true } : null));

    executeSpatialQuery(targetLat, targetLon, 50, selectedTimeStep)
      .then((res) => {
        if (isCancelled) return;
        const wave = res.ocean_state.wave_height_m;
        const craftUpper = (craftProfile || "motorized_boat").toUpperCase();
        let limit = 2.2;
        if (
          craftUpper.includes("NON_MOTORIZED") ||
          craftUpper.includes("CANOE")
        )
          limit = 1.4;
        else if (
          craftUpper.includes("MECHANIZED") ||
          craftUpper.includes("TRAWLER")
        )
          limit = 3.5;

        let status: "GO" | "CAUTION" | "NO_GO" = "GO";
        if (wave > limit) status = "NO_GO";
        else if (wave > limit * 0.8) status = "CAUTION";

        setMapForecast({
          loading: false,
          wave_height_m: res.ocean_state.wave_height_m,
          wind_speed_kn: res.ocean_state.wind_speed_kn,
          wind_direction_deg: res.ocean_state.wind_direction_deg,
          swell_height_m: res.ocean_state.swell_height_m,
          swell_period_s: res.ocean_state.swell_period_s,
          sst_c: res.ocean_state.sst_c,
          tide_height_m: res.astronomical_tide.current_height_m,
          tide_phase: res.astronomical_tide.phase,
          status,
        });

        if (inspectedPoint) {
          setInspectedPoint((curr) =>
            curr ? { ...curr, data: res, loading: false } : null,
          );
        }
      })
      .catch((err) => {
        console.error("Failed to update forecast for time step:", err);
        if (!isCancelled) {
          setMapForecast((prev) => (prev ? { ...prev, loading: false } : null));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedTimeStep, center?.[0], center?.[1], craftProfile, canonicalConditions]);

  const activeStyle = theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
  const currentStyleRef = useRef(activeStyle);
  const customPopupRendererRef = useRef(customPopupRenderer);
  customPopupRendererRef.current = customPopupRenderer;

  // Dynamically compute effective render layers based on selected operational corridor
  const effectiveRenderLayers = useMemo(() => {
    const hasRouteLayers = layers.some(
      (l) =>
        l.layer_id === "layer_recommended_route" ||
        l.layer_id === "layer_candidate_routes",
    );
    if (!hasRouteLayers) return layers;

    const allRouteFeatures: any[] = [];
    const nonRouteLayers: MapLayer[] = [];

    for (const l of layers) {
      if (l.layer_id === "layer_recommended_route") {
        if (l.geojson && (l.geojson as any).type === "Feature") {
          allRouteFeatures.push(l.geojson);
        }
      } else if (l.layer_id === "layer_candidate_routes") {
        if (
          l.geojson &&
          (l.geojson as any).type === "FeatureCollection" &&
          Array.isArray((l.geojson as any).features)
        ) {
          allRouteFeatures.push(...(l.geojson as any).features);
        }
      } else if (
        l.layer_id === "layer_route_start_marker" ||
        l.layer_id === "layer_route_end_marker"
      ) {
        // Ignored here; cleanly re-generated below for the currently active corridor
      } else {
        nonRouteLayers.push(l);
      }
    }

    if (allRouteFeatures.length === 0) return layers;

    let selectedFeat = allRouteFeatures.find((f) => {
      const id = f.properties?.route_id || "";
      const name = (f.properties?.name || "").toLowerCase();
      if (selectedCorridorMode === "safest")
        return (
          id === "ROUTE-A-INSHORE" ||
          name.includes("inshore") ||
          name.includes("sheltered")
        );
      if (selectedCorridorMode === "balanced")
        return id === "ROUTE-C-BALANCED" || name.includes("balanced");
      if (selectedCorridorMode === "direct")
        return (
          id === "ROUTE-B-DIRECT" ||
          name.includes("direct") ||
          name.includes("deep")
        );
      return false;
    });

    if (!selectedFeat) {
      selectedFeat = allRouteFeatures[0];
    }

    // Dynamic Route Exposure & Temporal Forecast Color
    const isForecastElevated = selectedTimeStep > 0 && mapForecast;
    let routeColor = '#06b6d4';
    let routeWidth = 4;
    let forecastTag = '';

    if (isForecastElevated) {
      if (mapForecast.status === 'NO_GO' || mapForecast.wave_height_m >= 2.4) {
        routeColor = '#ef4444';
        routeWidth = 5;
        forecastTag = `(+${selectedTimeStep}h Forecast: DANGER - Wave ${mapForecast.wave_height_m}m)`;
      } else if (mapForecast.status === 'CAUTION' || mapForecast.wave_height_m >= 1.8) {
        routeColor = '#f59e0b';
        routeWidth = 4.5;
        forecastTag = `(+${selectedTimeStep}h Forecast: CAUTION - Wave ${mapForecast.wave_height_m}m)`;
      } else {
        routeColor = '#10b981';
        forecastTag = `(+${selectedTimeStep}h Forecast: SAFE - Wave ${mapForecast.wave_height_m}m)`;
      }
    }

    const dynamicRouteLayers: MapLayer[] = [
      {
        layer_id: "layer_recommended_route",
        name: `Selected Corridor (${selectedFeat.properties?.name || selectedFeat.properties?.route_id || "Route"})${forecastTag ? " " + forecastTag : ""}`.trim(),
        layer_type: "geojson",
        visible: true,
        style: {
          color: routeColor,
          opacity: 0.95,
          line_width: routeWidth,
          layer_category: "navigation",
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
      const originName =
        selectedFeat.properties?.origin || "Voyage Departure Point";
      const destName =
        selectedFeat.properties?.destination || "Voyage Target / Destination";

      dynamicRouteLayers.push({
        layer_id: "layer_route_start_marker",
        name: `Departure Start: ${originName}`,
        layer_type: "geojson",
        visible: true,
        style: {
          color: "#10b981",
          opacity: 1.0,
          circle_radius: 9,
          layer_category: "navigation_terminal",
        },
        geojson: {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: startCoord,
          },
          properties: {
            point_type: "Voyage Start Point",
            location: originName,
            coordinates: `${startCoord[1]?.toFixed(4)}°N, ${startCoord[0]?.toFixed(4)}°E`,
            corridor:
              selectedFeat.properties?.name ||
              selectedFeat.properties?.route_id ||
              "Corridor",
          },
        },
      });

      dynamicRouteLayers.push({
        layer_id: "layer_route_end_marker",
        name: `Destination: ${destName}`,
        layer_type: "geojson",
        visible: true,
        style: {
          color: "#f59e0b",
          opacity: 1.0,
          circle_radius: 9,
          layer_category: "navigation_terminal",
        },
        geojson: {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: endCoord,
          },
          properties: {
            point_type: "Voyage Destination Point",
            location: destName,
            coordinates: `${endCoord[1]?.toFixed(4)}°N, ${endCoord[0]?.toFixed(4)}°E`,
            corridor:
              selectedFeat.properties?.name ||
              selectedFeat.properties?.route_id ||
              "Corridor",
          },
        },
      });
    }

    if (
      liveLocation &&
      (liveLocationStatus === "accurate" || liveLocationStatus === "stale")
    ) {
      dynamicRouteLayers.push({
        layer_id: "layer_live_location",
        name: "My Location",
        layer_type: "geojson",
        visible: true,
        style: {
          color: liveLocationStatus === "stale" ? "#94a3b8" : "#2563eb", // Gray if stale, blue if accurate
          opacity: 1.0,
          circle_radius: 8,
          layer_category: "navigation",
        },
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [liveLocation.longitude, liveLocation.latitude],
              },
              properties: {
                point_type: "My Location",
                status: liveLocationStatus,
                accuracy: liveLocation.accuracy,
                speed: liveLocation.speed,
                heading: liveLocation.heading,
                // Turf circle approximation for accuracy radius can be done natively via circle-radius or adding a polygon
              },
            },
          ],
        },
      });
    }

    return [...nonRouteLayers, ...dynamicRouteLayers];
  }, [layers, selectedCorridorMode, liveLocation, liveLocationStatus, selectedTimeStep, mapForecast]);

  // Pan to user's location when tracking is enabled and location updates
  useEffect(() => {
    if (isTrackingLocation && liveLocation && mapRef.current) {
      mapRef.current.flyTo({
        center: [liveLocation.longitude, liveLocation.latitude],
        zoom: 14,
        essential: true,
        duration: 800,
      });
    }
  }, [liveLocation, isTrackingLocation]);

  const stopSimulation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (simulationMarkerRef.current) {
      simulationMarkerRef.current.remove();
      simulationMarkerRef.current = null;
    }
    if (simulationRootRef.current) {
      simulationRootRef.current.unmount();
      simulationRootRef.current = null;
    }
    setIsSimulating(false);
  }, []);

  const startSimulation = useCallback(() => {
    if (!mapRef.current) return;

    // Find the primary route
    const routeLayer = effectiveRenderLayers.find(
      (l) => l.style?.layer_category === "route",
    );
    if (
      !routeLayer ||
      !routeLayer.geojson ||
      routeLayer.geojson.type !== "FeatureCollection"
    )
      return;

    const routeFeature = routeLayer.geojson.features?.[0];
    if (!routeFeature || routeFeature.geometry.type !== "LineString") return;

    const line = routeFeature as GeoJSON.Feature<GeoJSON.LineString>;
    const routeLength = turf.length(line, { units: "kilometers" });
    if (routeLength === 0) return;

    setIsSimulating(true);

    // Create custom DOM element for the boat marker
    const el = document.createElement("div");
    el.className = "simulation-marker";
    el.style.width = "40px";
    el.style.height = "40px";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.background = "white";
    el.style.border = "2px solid #2563eb";
    el.style.borderRadius = "50%";
    el.style.boxShadow =
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";

    const root = createRoot(el);
    simulationRootRef.current = root;

    let Icon = Ship;
    let iconColor = "#2563eb";
    let bgColor = "white";

    if (craftProfile === "traditional_non_motorized") {
      Icon = Sailboat;
      iconColor = "#16a34a";
      el.style.borderColor = "#16a34a";
    } else if (craftProfile === "mechanized_trawler") {
      Icon = Ship;
      bgColor = "#bfdbfe";
      iconColor = "#1e3a8a";
      el.style.borderColor = "#1e3a8a";
    }

    // Lucide icons generally point UP or RIGHT. Ship and Sailboat might need rotation.
    // Wrap the icon in a div that corrects its default orientation to face UP (0 degrees).
    root.render(
      <div style={{ transform: "rotate(-90deg)", display: "flex" }}>
        <Icon size={22} color={iconColor} fill={bgColor} />
      </div>,
    );

    const marker = new maplibregl.Marker({
      element: el,
      pitchAlignment: "map",
      rotationAlignment: "map",
    })
      .setLngLat(line.geometry.coordinates[0] as [number, number])
      .addTo(mapRef.current);

    simulationMarkerRef.current = marker;

    const animationDuration = 10000; // 10 seconds to complete route
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = (timestamp - startTime) / animationDuration;

      if (progress < 1) {
        const distance = progress * routeLength;
        const currentPoint = turf.along(line, distance, {
          units: "kilometers",
        });

        // Calculate bearing to next point slightly ahead for smooth rotation
        const nextPoint = turf.along(
          line,
          Math.min(distance + 0.05, routeLength),
          { units: "kilometers" },
        );
        const bearing = turf.bearing(currentPoint, nextPoint);

        marker.setLngLat(currentPoint.geometry.coordinates as [number, number]);
        marker.setRotation(bearing);

        // Keep map centered on boat during simulation
        mapRef.current?.panTo(
          currentPoint.geometry.coordinates as [number, number],
          { duration: 0 },
        );

        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Animation finished
        stopSimulation();
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [effectiveRenderLayers, craftProfile, stopSimulation]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      stopSimulation();
    };
  }, [stopSimulation]);

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

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("style.load", () => {
      if (!map.hasImage("icon-anchor")) {
        const createEmojiImg = (char: string) => {
          const c = document.createElement("canvas");
          c.width = 40;
          c.height = 40;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.font = "28px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(char, 20, 22);
            return ctx.getImageData(0, 0, 40, 40);
          }
          return null;
        };
        const anchorImg = createEmojiImg("⚓");
        if (anchorImg) map.addImage("icon-anchor", anchorImg);
        const fishImg = createEmojiImg("🐟");
        if (fishImg) map.addImage("icon-fish", fishImg);

        // Register directional nautical wind flow arrow
        const createWindArrowImg = () => {
          const c = document.createElement("canvas");
          c.width = 28;
          c.height = 28;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.strokeStyle = "#0284c7";
            ctx.fillStyle = "#0284c7";
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(14, 4);
            ctx.lineTo(14, 24);
            ctx.moveTo(8, 12);
            ctx.lineTo(14, 4);
            ctx.lineTo(20, 12);
            ctx.stroke();
            return ctx.getImageData(0, 0, 28, 28);
          }
          return null;
        };
        const windImg = createWindArrowImg();
        if (windImg) map.addImage("icon-wind-arrow", windImg);
      }
    });

    map.on("click", async (e) => {
      // If nautical ruler is active, capture waypoint instead of opening spatial inspection popup
      if (isRulerActiveRef.current) {
        const pt: [number, number] = [
          parseFloat(e.lngLat.lng.toFixed(5)),
          parseFloat(e.lngLat.lat.toFixed(5)),
        ];
        setRulerPoints((prev) => [...prev, pt]);
        return;
      }
      const lat = parseFloat(e.lngLat.lat.toFixed(4));
      const lon = parseFloat(e.lngLat.lng.toFixed(4));
      setInspectedPoint({ lat, lon, data: null, loading: true });
      try {
        const queryRes = await executeSpatialQuery(
          lat,
          lon,
          50,
          selectedTimeStepRef.current,
        );
        setInspectedPoint({ lat, lon, data: queryRes, loading: false });
      } catch (err) {
        console.error("Failed to inspect ocean point:", err);
        setInspectedPoint(null);
      }
    });

    const updateZoomTier = () => {
      if (!containerRef.current) return;
      const z = map.getZoom();
      const tier = z < 7 ? "overview" : z < 10 ? "regional" : "detail";
      containerRef.current.setAttribute("data-zoom-tier", tier);
    };
    map.on("zoom", updateZoomTier);
    updateZoomTier();
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;

    return () => {
      map.off("zoom", updateZoomTier);
      resizeObserver.disconnect();
      domMarkersRef.current.forEach((m) => m.remove());
      domMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const attachedListenersRef = useRef<Set<string>>(new Set());
  const activeReplayVesselRef = useRef<string | null>(null);
  const activeReplayTriggerRef = useRef<number | undefined>(undefined);
  const lastFittedSignatureRef = useRef<string>("");
  const animFrameRef = useRef<number | null>(null);
  const animatedHazardLayersRef = useRef<
    Array<{
      fillId: string;
      outlineId: string;
      baseOpacity: number;
      baseLineWidth: number;
    }>
  >([]);
  const animatedVesselLayersRef = useRef<
    Array<{ pointId: string; baseRadius: number }>
  >([]);

  // Animate map when programmatic center or zoom changes (only if no active replay trajectory is being tracked)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;

    if (activeReplayVesselRef.current) return;

    const cur = map.getCenter();
    if (
      Math.abs(cur.lng - center[0]) > 0.001 ||
      Math.abs(cur.lat - center[1]) > 0.001
    ) {
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
        const hazardFactor =
          (Math.sin((timestamp / 2000) * 2 * Math.PI) + 1) / 2;
        // Calm vessel tracking telemetry pulse (approx 1.8s period)
        const vesselFactor =
          (Math.sin((timestamp / 1800) * 2 * Math.PI) + 1) / 2;

        // 1. Hazard active pulse (subtle red warning pulse on active hazards only)
        for (const h of animatedHazardLayersRef.current) {
          if (map.getLayer(h.fillId)) {
            map.setPaintProperty(
              h.fillId,
              "fill-opacity",
              h.baseOpacity + hazardFactor * 0.18,
            );
          }
          if (map.getLayer(h.outlineId)) {
            map.setPaintProperty(
              h.outlineId,
              "line-opacity",
              0.5 + hazardFactor * 0.45,
            );
            map.setPaintProperty(
              h.outlineId,
              "line-width",
              h.baseLineWidth + hazardFactor * 1.5,
            );
          }
        }

        // 2. Vessel live tracking dot (gentle calm telemetry pulse)
        for (const v of animatedVesselLayersRef.current) {
          if (map.getLayer(v.pointId)) {
            map.setPaintProperty(
              v.pointId,
              "circle-radius",
              v.baseRadius + vesselFactor * 3.5,
            );
            map.setPaintProperty(
              v.pointId,
              "circle-stroke-width",
              2 + vesselFactor * 1.5,
            );
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
      domMarkersRef.current.forEach((m) => m.remove());
      domMarkersRef.current = [];

      const vis: Record<string, boolean> = {};
      const newRegisteredLayers: string[] = [];
      const newRegisteredSources: string[] = [];
      const newAnimatedHazards: Array<{
        fillId: string;
        outlineId: string;
        baseOpacity: number;
        baseLineWidth: number;
      }> = [];
      const newAnimatedVessels: Array<{ pointId: string; baseRadius: number }> =
        [];

      for (const layer of effectiveRenderLayers) {
        const sourceId = `src-${layer.layer_id}`;
        const layerId = layer.layer_id;
        vis[layerId] = layer.visible;
        newRegisteredSources.push(sourceId);

        const geojson = layer.geojson;
        const existingSource = map.getSource(sourceId) as
          | maplibregl.GeoJSONSource
          | undefined;

        if (existingSource && typeof existingSource.setData === "function") {
          existingSource.setData(geojson as GeoJSON.GeoJSON);
        } else if (!existingSource) {
          map.addSource(sourceId, {
            type: "geojson",
            data: geojson as GeoJSON.GeoJSON,
          });
        }

        const color = layer.style?.color || "#0284c7";
        const opacity = layer.style?.opacity ?? 0.6;
        const lineWidth = layer.style?.line_width ?? 2;
        const lineDasharray = layer.style?.line_dasharray;
        const circleRadius = layer.style?.circle_radius ?? 8;

        const geomType = getGeometryType(geojson);
        const hasPointFeature =
          geomType === "Point" ||
          geomType === "MultiPoint" ||
          (geojson.type === "FeatureCollection" &&
            Array.isArray(geojson.features) &&
            geojson.features.some(
              (f: any) =>
                f.geometry?.type === "Point" ||
                f.geometry?.type === "MultiPoint",
            ));

        const hasLineFeature =
          geomType === "LineString" ||
          geomType === "MultiLineString" ||
          (geojson.type === "FeatureCollection" &&
            Array.isArray(geojson.features) &&
            geojson.features.some(
              (f: any) =>
                f.geometry?.type === "LineString" ||
                f.geometry?.type === "MultiLineString",
            ));

        const hasPolygonFeature =
          geomType === "Polygon" ||
          geomType === "MultiPolygon" ||
          (geojson.type === "FeatureCollection" &&
            Array.isArray(geojson.features) &&
            geojson.features.some(
              (f: any) =>
                f.geometry?.type === "Polygon" ||
                f.geometry?.type === "MultiPolygon",
            ));

        // 1. Polygon fills & outlines
        if (hasPolygonFeature) {
          if (!map.getLayer(layerId)) {
            map.addLayer({
              id: layerId,
              type: "fill",
              source: sourceId,
              filter: ["in", "$type", "Polygon"],
              paint: {
                "fill-color": color,
                "fill-opacity": opacity,
              },
            });
          } else {
            map.setPaintProperty(layerId, "fill-color", color);
            map.setPaintProperty(layerId, "fill-opacity", opacity);
          }
          newRegisteredLayers.push(layerId);

          const outlineId = `${layerId}-outline`;
          if (!map.getLayer(outlineId)) {
            map.addLayer({
              id: outlineId,
              type: "line",
              source: sourceId,
              filter: ["in", "$type", "Polygon"],
              paint: {
                "line-color": color,
                "line-width": lineWidth,
                "line-opacity": Math.min(opacity + 0.35, 1),
              },
            });
          } else {
            map.setPaintProperty(outlineId, "line-color", color);
            map.setPaintProperty(outlineId, "line-width", lineWidth);
            map.setPaintProperty(
              outlineId,
              "line-opacity",
              Math.min(opacity + 0.35, 1),
            );
          }
          newRegisteredLayers.push(outlineId);

          // Register active hazards for warning pulse animation (inactive/expired hazards are excluded)
          const isHazard =
            layerId.startsWith("authority_hazard_") ||
            layer.style?.layer_category === "authority_hazard";
          const isActiveHazard =
            isHazard &&
            (layer.properties?.is_active ?? true) &&
            layer.properties?.status !== "INACTIVE" &&
            layer.properties?.status !== "EXPIRED";
          if (isActiveHazard) {
            newAnimatedHazards.push({
              fillId: layerId,
              outlineId,
              baseOpacity: opacity,
              baseLineWidth: lineWidth,
            });
          }
        }

        // 2. LineString tracks & routes
        if (hasLineFeature) {
          const lineLayerId = hasPolygonFeature ? `${layerId}-line` : layerId;
          if (!map.getLayer(lineLayerId)) {
            map.addLayer({
              id: lineLayerId,
              type: "line",
              source: sourceId,
              filter: ["in", "$type", "LineString"],
              paint: {
                "line-color": color,
                "line-width": lineWidth,
                "line-opacity": opacity,
                ...(lineDasharray ? { "line-dasharray": lineDasharray } : {}),
              },
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
            });
            if (lineDasharray) {
              map.setPaintProperty(
                lineLayerId,
                "line-dasharray",
                lineDasharray,
              );
            }
          } else {
            map.setPaintProperty(lineLayerId, "line-color", color);
            map.setPaintProperty(lineLayerId, "line-width", lineWidth);
            map.setPaintProperty(lineLayerId, "line-opacity", opacity);
            if (lineDasharray) {
              map.setPaintProperty(
                lineLayerId,
                "line-dasharray",
                lineDasharray,
              );
            } else {
              map.setPaintProperty(lineLayerId, "line-dasharray", [1, 0]);
            }
          }
          newRegisteredLayers.push(lineLayerId);
        }

        // 3. Point positions & markers (DOM icon markers with suppressed canvas dots)
        if (hasPointFeature) {
          const pointLayerId =
            hasPolygonFeature || hasLineFeature ? `${layerId}-circle` : layerId;
          if (!map.getLayer(pointLayerId)) {
            map.addLayer({
              id: pointLayerId,
              type: "circle",
              source: sourceId,
              filter: ["in", "$type", "Point"],
              paint: {
                "circle-radius": 0, // Suppress canvas dot in favor of custom DOM icon markers
                "circle-color": color,
                "circle-opacity": 0,
                "circle-stroke-width": 0,
                "circle-stroke-color": "#ffffff",
              },
            });
          } else {
            map.setPaintProperty(pointLayerId, "circle-radius", 0);
            map.setPaintProperty(pointLayerId, "circle-color", color);
            map.setPaintProperty(pointLayerId, "circle-opacity", 0);
          }
          newRegisteredLayers.push(pointLayerId);

          // Build custom interactive DOM icon markers
          if (layer.visible !== false) {
            const pointFeatures: any[] = [];
            if (
              geojson.type === "Feature" &&
              (geojson.geometry?.type === "Point" ||
                geojson.geometry?.type === "MultiPoint")
            ) {
              pointFeatures.push(geojson);
            } else if (
              geojson.type === "FeatureCollection" &&
              Array.isArray(geojson.features)
            ) {
              for (const f of geojson.features) {
                if (
                  f &&
                  f.geometry &&
                  (f.geometry.type === "Point" ||
                    f.geometry.type === "MultiPoint")
                ) {
                  pointFeatures.push(f);
                }
              }
            }

            for (const f of pointFeatures) {
              const rawCoords = f.geometry.coordinates;
              const coordsList: [number, number][] =
                f.geometry.type === "Point"
                  ? [rawCoords]
                  : Array.isArray(rawCoords)
                    ? rawCoords
                    : [];

              for (const pt of coordsList) {
                if (!Array.isArray(pt) || pt.length < 2) continue;
                const [lng, lat] = pt;
                if (
                  typeof lng !== "number" ||
                  typeof lat !== "number" ||
                  isNaN(lng) ||
                  isNaN(lat)
                )
                  continue;

                const cfg = getPointMarkerConfig(f, layer);
                const el = document.createElement("div");
                el.className = "marinewatch-custom-marker";
                const inner = document.createElement("div");
                inner.className = `marinewatch-marker-inner ${cfg.className}`;
                inner.innerHTML = `<span class="marker-emoji" style="filter: drop-shadow(0 0 3px ${cfg.color});">${cfg.emoji}</span>`;
                el.appendChild(inner);
                el.title = cfg.title;

                el.onclick = (e) => {
                  e.stopPropagation();
                  activePopupRef.current?.remove();

                  let html: string | null = null;
                  if (customPopupRendererRef.current) {
                    try {
                      html = customPopupRendererRef.current(f, layer);
                    } catch {
                      html = null;
                    }
                  }

                  if (!html) {
                    const ignoredKeys = new Set([
                      "polygon_id",
                      "id",
                      "polygon_type",
                      "is_hard_restriction",
                      "objectid",
                      "object_id",
                      "layer_id",
                      "layer_type",
                      "source",
                      "type",
                      "geometry_type",
                      "home_harbor_id",
                    ]);
                    const fProps = f.properties || {};
                    const entries = Object.entries(fProps).filter(
                      ([k]) => !ignoredKeys.has(k.toLowerCase()),
                    );

                    const content =
                      entries.length > 0
                        ? entries
                            .slice(0, 6)
                            .map(
                              ([k, v]) =>
                                `<div style="margin-bottom:2px"><strong>${k.replace(/_/g, " ")}:</strong> ${formatPropValue(v)}</div>`,
                            )
                            .join("")
                        : `<div><em>${layer.name}</em></div>`;

                    html = `<div class="map-popup"><h5 style="margin:0 0 6px;color:${cfg.color};font-size:12px;font-weight:700">${layer.name}</h5>${content}</div>`;
                  }

                  const popup = new maplibregl.Popup({
                    closeButton: true,
                    maxWidth: "300px",
                    offset: 12,
                    className: "fisher-map-popup",
                  })
                    .setLngLat([lng, lat])
                    .setHTML(html)
                    .addTo(map);

                  activePopupRef.current = popup;
                };

                const marker = new maplibregl.Marker({
                  element: el,
                  anchor: "center",
                })
                  .setLngLat([lng, lat])
                  .addTo(map);
                domMarkersRef.current.push(marker);
              }
            }
          }

          // Register active vessel marker for calm telemetry tracking pulse
          const isVesselPoint =
            layerId === "layer_fleet_vessel_replay" ||
            layer.style?.layer_category === "fleet_replay" ||
            layerId === "layer_vessel_position";
          if (isVesselPoint) {
            newAnimatedVessels.push({
              pointId: pointLayerId,
              baseRadius: circleRadius,
            });
          }
        }

        // Interactive popups for non-background layers
        const isBackgroundZone =
          layerId.toLowerCase().includes("eez") ||
          layer.style?.layer_category === "background";
        const interactiveLayerId =
          hasPointFeature && (hasPolygonFeature || hasLineFeature)
            ? `${layerId}-circle`
            : layerId;

        if (
          !isBackgroundZone &&
          !attachedListenersRef.current.has(interactiveLayerId)
        ) {
          attachedListenersRef.current.add(interactiveLayerId);

          map.on("click", interactiveLayerId, (e) => {
            if (isRulerActiveRef.current) return;
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
                "polygon_id",
                "id",
                "polygon_type",
                "is_hard_restriction",
                "objectid",
                "object_id",
                "layer_id",
                "layer_type",
                "source",
                "type",
                "geometry_type",
                "home_harbor_id",
              ]);

              const entries = Object.entries(props).filter(
                ([k]) => !ignoredKeys.has(k.toLowerCase()),
              );

              const content =
                entries.length > 0
                  ? entries
                      .slice(0, 6)
                      .map(
                        ([k, v]) =>
                          `<div style="margin-bottom:2px"><strong>${k.replace(/_/g, " ")}:</strong> ${formatPropValue(v)}</div>`,
                      )
                      .join("")
                  : `<div><em>${layer.name}</em></div>`;

              html = `<div class="map-popup"><h5 style="margin:0 0 6px;color:#0284c7;font-size:12px;font-weight:700">${layer.name}</h5>${content}</div>`;
            }

            const isFisherDark = html.includes("map-popup-fisher");
            const popup = new maplibregl.Popup({
              closeButton: true,
              maxWidth: "280px",
              offset: 10,
              className: isFisherDark ? "dark-theme-popup" : "",
            })
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map);

            activePopupRef.current = popup;
          });

          map.on("mouseenter", interactiveLayerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", interactiveLayerId, () => {
            map.getCanvas().style.cursor = "";
          });
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

      activeLayersRef.current = {
        layers: newRegisteredLayers,
        sources: newRegisteredSources,
      };
      animatedHazardLayersRef.current = newAnimatedHazards;
      animatedVesselLayersRef.current = newAnimatedVessels;
      setLayerVisibility(vis);

      // Trajectory Replay Auto-Zoom Logic
      const replayLayer = layers.find(
        (l) =>
          l.layer_id === "layer_fleet_vessel_replay" ||
          l.style?.layer_category === "fleet_replay",
      );

      if (replayLayer) {
        const replayVesselId =
          (replayLayer as any).properties?.vessel_id ||
          (replayLayer.geojson as any)?.properties?.vessel_id ||
          (replayLayer.geojson as any)?.features?.[0]?.properties?.vessel_id ||
          replayLayer.name;
        const focusTrigger = (replayLayer as any).properties?.focus_trigger;

        const isNewVessel = replayVesselId !== activeReplayVesselRef.current;
        const isFocusRequested =
          focusTrigger !== undefined &&
          focusTrigger !== activeReplayTriggerRef.current;

        if (isNewVessel || isFocusRequested) {
          activeReplayVesselRef.current = replayVesselId;
          activeReplayTriggerRef.current = focusTrigger;

          const replayBounds = new maplibregl.LngLatBounds();
          const bbox =
            (replayLayer as any).properties?.bbox ||
            (replayLayer.geojson as any)?.bbox;
          if (Array.isArray(bbox) && bbox.length === 4) {
            replayBounds.extend([bbox[0], bbox[1]]);
            replayBounds.extend([bbox[2], bbox[3]]);
          } else {
            collectBounds(replayLayer.geojson, replayBounds, () => {});
          }

          if (!replayBounds.isEmpty()) {
            const sw = replayBounds.getSouthWest();
            const ne = replayBounds.getNorthEast();
            const isTightPoint =
              Math.abs(sw.lng - ne.lng) < 0.003 &&
              Math.abs(sw.lat - ne.lat) < 0.003;

            if (isTightPoint) {
              map.flyTo({
                center: [sw.lng, sw.lat],
                zoom: 12.5,
                duration: 900,
                essential: true,
              });
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
            !l.layer_id.startsWith("base_") &&
            !l.layer_id.startsWith("sector_") &&
            l.style?.layer_category !== "base_geofence" &&
            l.style?.layer_category !== "surveillance" &&
            l.style?.layer_category !== "background" &&
            !l.layer_id.toLowerCase().includes("eez"),
        );

        const currentSignature = operationalLayers
          .map((l) => l.layer_id)
          .sort()
          .join("|");

        // Spatially stable: only refit when the set of operational layers changes, not on corridor mode toggle
        if (
          operationalLayers.length > 0 &&
          currentSignature !== lastFittedSignatureRef.current
        ) {
          lastFittedSignatureRef.current = currentSignature;
          const bounds = new maplibregl.LngLatBounds();
          let hasOperationalCoords = false;
          const hasRoute = operationalLayers.some(
            (l) => l.style?.layer_category === "route",
          );
          const layersToFit = hasRoute
            ? operationalLayers.filter(
                (l) => l.style?.layer_category === "route",
              )
            : operationalLayers;
          for (const l of layersToFit) {
            collectBounds(l.geojson, bounds, () => {
              hasOperationalCoords = true;
            });
          }
          if (hasOperationalCoords && !bounds.isEmpty()) {
            try {
              map.fitBounds(bounds, {
                padding: hasRoute ? 44 : 60,
                maxZoom: hasRoute ? 13 : 12,
                duration: 1000,
              });
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
      map.once("load", syncLayers);
      map.once("style.load", syncLayers);
    }
  }, [effectiveRenderLayers, activeStyle]);

  const toggleLayer = useCallback((layerId: string) => {
    const map = mapRef.current;
    if (!map) return;

    setLayerVisibility((prev) => {
      const newVis = !prev[layerId];
      const visibility = newVis ? "visible" : "none";

      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
      if (map.getLayer(`${layerId}-outline`)) {
        map.setLayoutProperty(`${layerId}-outline`, "visibility", visibility);
      }
      if (map.getLayer(`${layerId}-circle`)) {
        map.setLayoutProperty(`${layerId}-circle`, "visibility", visibility);
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
        !l.layer_id.startsWith("base_") &&
        !l.layer_id.startsWith("sector_") &&
        l.style?.layer_category !== "base_geofence" &&
        l.style?.layer_category !== "surveillance" &&
        l.style?.layer_category !== "background" &&
        !l.layer_id.toLowerCase().includes("eez"),
    );

    const bounds = new maplibregl.LngLatBounds();
    let hasOperationalCoords = false;
    const hasRoute = operationalLayers.some(
      (l) => l.style?.layer_category === "route",
    );
    const layersToFit = hasRoute
      ? operationalLayers.filter((l) => l.style?.layer_category === "route")
      : operationalLayers;
    for (const l of layersToFit) {
      collectBounds(l.geojson, bounds, () => {
        hasOperationalCoords = true;
      });
    }

    if (hasOperationalCoords && !bounds.isEmpty()) {
      try {
        map.fitBounds(bounds, {
          padding: hasRoute ? 44 : 70,
          maxZoom: hasRoute ? 13 : 12,
          duration: 900,
        });
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

  // Synchronize Nautical Measure Tool (Ruler) layers on MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = 'samudra-nautical-ruler-source';
    const lineLayerId = 'samudra-nautical-ruler-line';
    const pointsLayerId = 'samudra-nautical-ruler-points';

    if (rulerPoints.length === 0) {
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getLayer(pointsLayerId)) map.removeLayer(pointsLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const lineFeature = rulerPoints.length >= 2 ? {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: rulerPoints,
      },
      properties: {},
    } : null;

    const pointFeatures = rulerPoints.map((pt, idx) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: pt,
      },
      properties: {
        index: idx + 1,
        label: `WP ${idx + 1}`,
      },
    }));

    const features = lineFeature ? [lineFeature, ...pointFeatures] : pointFeatures;
    const geojsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    const existingSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existingSource && typeof existingSource.setData === 'function') {
      existingSource.setData(geojsonData);
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geojsonData });
    }

    if (!map.getLayer(lineLayerId)) {
      map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#06b6d4',
          'line-width': 3.5,
          'line-dasharray': [2, 1.5],
        },
      });
    }

    if (!map.getLayer(pointsLayerId)) {
      map.addLayer({
        id: pointsLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#06b6d4',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });
    }
  }, [rulerPoints]);

  // Synchronize Wind & Current Vector Grid layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = 'samudra-wind-vectors-source';
    const layerId = 'samudra-wind-vectors-layer';

    if (!showWindVectors || !mapForecast) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const cLon = center ? center[0] : 73.28;
    const cLat = center ? center[1] : 16.99;
    const vectors = generateWindVectorGrid(
      cLon,
      cLat,
      mapForecast.wind_direction_deg,
      mapForecast.wind_speed_kn,
      0.8,
      0.18,
    );

    const geojsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: vectors.map((v) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: v.position,
        },
        properties: {
          bearing: v.bearing,
          speed: v.speed,
          color: v.color,
        },
      })),
    };

    const existingSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existingSource && typeof existingSource.setData === 'function') {
      existingSource.setData(geojsonData);
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geojsonData });
    }

    if (!map.getLayer(layerId) && map.hasImage('icon-wind-arrow')) {
      map.addLayer({
        id: layerId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'icon-image': 'icon-wind-arrow',
          'icon-size': 0.85,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
        },
        paint: {
          'icon-opacity': 0.8,
        },
      });
    }
  }, [showWindVectors, mapForecast, center?.[0], center?.[1]]);


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
        <div
          className="fisher-simple-map-controls"
          style={{
            position: "absolute",
            top: "16px",
            left: "16px",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {onToggleLocation && (
            <button
              onClick={onToggleLocation}
              style={{
                padding: "16px",
                fontSize: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: isTrackingLocation ? "#eff6ff" : "white",
                color: isTrackingLocation ? "#2563eb" : "#0f172a",
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontWeight: isTrackingLocation ? "bold" : "normal",
              }}
            >
              <Navigation
                size={24}
                fill={isTrackingLocation ? "#2563eb" : "none"}
              />
              {t("MapView.my_location", "My Location")}
            </button>
          )}
          <button
            onClick={onResetView || handleResetView}
            style={{
              padding: "16px",
              fontSize: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "white",
              color: "#0f172a",
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          >
            <Layers size={24} />
            {t("MapView.fit_trip", "Fit Trip")}
          </button>
          {layerAvailability?.routes === "AVAILABLE" && (
            <button
              onClick={isSimulating ? stopSimulation : startSimulation}
              style={{
                padding: "16px",
                fontSize: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: isSimulating ? "#fee2e2" : "white",
                color: isSimulating ? "#dc2626" : "#2563eb",
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontWeight: "bold",
              }}
            >
              {isSimulating ? (
                <Square size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" />
              )}
              {isSimulating
                ? t("MapView.stop", "Stop")
                : t("MapView.simulate", "Simulate")}
            </button>
          )}
          <button
            onClick={() => {
              setIsRulerActive(!isRulerActive);
              if (isRulerActive) setRulerPoints([]);
            }}
            style={{
              padding: '16px',
              fontSize: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isRulerActive ? '#eff6ff' : 'white',
              color: isRulerActive ? '#2563eb' : '#0f172a',
              borderRadius: '8px',
              border: 'none',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              fontWeight: isRulerActive ? 'bold' : 'normal',
              cursor: 'pointer',
            }}
            title="Measure nautical distance & transit time"
          >
            <Ruler size={24} />
            {isRulerActive ? 'Measuring…' : 'Measure (nm)'}
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
                {layers.length}{" "}
                {language === "hi"
                  ? "परतें"
                  : language === "mr"
                    ? "स्तर"
                    : "Layers"}
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

      {/* Quick Jump Coastal Bookmarks & Wind Toggle */}
      <div
        className="map-coastal-bookmarks"
        style={{
          position: "absolute",
          top: "16px",
          left: hideAdvancedControls ? "180px" : "16px",
          zIndex: 10,
          display: 'flex',
          gap: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setShowBookmarks(!showBookmarks)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 600,
            background:
              theme === "dark"
                ? "rgba(15, 23, 42, 0.88)"
                : "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--border, #334155)",
            borderRadius: "8px",
            color: "var(--foreground, #0f172a)",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
          }}
          aria-label="Toggle coastal landmarks"
        >
          <Bookmark size={14} style={{ color: "#0ea5e9" }} />
          <span>Coastal Bookmarks</span>
        </button>

        <button
          type="button"
          onClick={() => setShowWindVectors(!showWindVectors)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 600,
            background: showWindVectors
              ? (theme === 'dark' ? 'rgba(30, 58, 138, 0.85)' : 'rgba(219, 234, 254, 0.92)')
              : (theme === 'dark' ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)'),
            backdropFilter: 'blur(8px)',
            border: showWindVectors ? '1px solid #3b82f6' : '1px solid var(--border, #334155)',
            borderRadius: '8px',
            color: showWindVectors ? (theme === 'dark' ? '#93c5fd' : '#1d4ed8') : 'var(--foreground, #0f172a)',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
          }}
          title="Toggle dynamic wind & sea surface vectors"
        >
          <Wind size={14} style={{ color: showWindVectors ? '#2563eb' : '#64748b' }} />
          <span>Wind Flow: {showWindVectors ? 'ON' : 'OFF'}</span>
        </button>

        {!hideAdvancedControls && (
          <button
            type="button"
            onClick={() => {
              setIsRulerActive(!isRulerActive);
              if (isRulerActive) setRulerPoints([]);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              background: isRulerActive
                ? (theme === 'dark' ? 'rgba(30, 58, 138, 0.85)' : 'rgba(219, 234, 254, 0.92)')
                : (theme === 'dark' ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)'),
              backdropFilter: 'blur(8px)',
              border: isRulerActive ? '1px solid #3b82f6' : '1px solid var(--border, #334155)',
              borderRadius: '8px',
              color: isRulerActive ? (theme === 'dark' ? '#93c5fd' : '#1d4ed8') : 'var(--foreground, #0f172a)',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
            }}
            title="Measure distance, heading & voyage duration"
          >
            <Ruler size={14} style={{ color: isRulerActive ? '#2563eb' : '#64748b' }} />
            <span>{isRulerActive ? 'Measuring…' : 'Measure (nm)'}</span>
          </button>
        )}

        {showBookmarks && (
          <div
            style={{
              position: "absolute",
              top: "42px",
              left: 0,
              background:
                theme === "dark"
                  ? "rgba(15, 23, 42, 0.96)"
                  : "rgba(255, 255, 255, 0.98)",
              border: "1px solid var(--border, #334155)",
              borderRadius: "8px",
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              maxHeight: "260px",
              overflowY: "auto",
              width: "210px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
              zIndex: 30,
            }}
          >
            {NATIONAL_COASTAL_BOOKMARKS.map((b) => (
              <button
                type="button"
                key={b.name}
                onClick={() => {
                  mapRef.current?.flyTo({
                    center: [b.lon, b.lat],
                    zoom: b.zoom,
                    duration: 900,
                  });
                  setShowBookmarks(false);
                }}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "var(--foreground, #0f172a)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 600 }}>{b.name}</span>
                <span
                  style={{
                    color: "var(--muted-foreground, #94a3b8)",
                    fontSize: "10px",
                  }}
                >
                  {b.state?.slice(0, 6)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Active Forecast Telemetry Card (Anchored above Time Scrubber) */}
      <div
        className="map-forecast-telemetry"
        style={{
          position: "absolute",
          bottom: "66px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background:
            theme === "dark"
              ? "rgba(15, 23, 42, 0.94)"
              : "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(10px)",
          border: "1px solid var(--border, #334155)",
          borderRadius: "16px",
          padding: "5px 14px",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
          fontSize: "11px",
          whiteSpace: "nowrap",
          color: "var(--foreground, #0f172a)",
        }}
      >
        {mapForecast?.loading ? (
          <span
            style={{
              color: "var(--muted-foreground, #94a3b8)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={12} className="spin" /> Updating forecast (+
            {selectedTimeStep}h)…
          </span>
        ) : mapForecast ? (
          <>
            <span
              style={{
                padding: "2px 7px",
                borderRadius: "9999px",
                fontWeight: 700,
                fontSize: "10px",
                background:
                  mapForecast.status === "GO"
                    ? "#dcfce7"
                    : mapForecast.status === "CAUTION"
                      ? "#fef3c7"
                      : "#fee2e2",
                color:
                  mapForecast.status === "GO"
                    ? "#166534"
                    : mapForecast.status === "CAUTION"
                      ? "#92400e"
                      : "#991b1b",
              }}
            >
              {mapForecast.status}
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontWeight: 600,
              }}
            >
              🌊 {mapForecast.wave_height_m}m{" "}
              <span
                style={{
                  color: "var(--muted-foreground, #94a3b8)",
                  fontWeight: 400,
                }}
              >
                Wave
              </span>
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontWeight: 600,
              }}
            >
              💨 {mapForecast.wind_speed_kn}kn{" "}
              <span
                style={{
                  color: "var(--muted-foreground, #94a3b8)",
                  fontWeight: 400,
                }}
              >
                ({mapForecast.wind_direction_deg}°)
              </span>
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontWeight: 600,
              }}
            >
              🌊 {mapForecast.tide_height_m}m{" "}
              <span
                style={{
                  color: "var(--muted-foreground, #94a3b8)",
                  fontWeight: 400,
                }}
              >
                ({mapForecast.tide_phase})
              </span>
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
                fontWeight: 600,
              }}
            >
              🌡️ {mapForecast.sst_c}°C
            </span>
          </>
        ) : (
          <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
            Forecast ready
          </span>
        )}
      </div>

      {/* Floating Time Scrubber (+0h to +48h) */}
      <div
        className="map-time-scrubber"
        style={{
          position: "absolute",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background:
            theme === "dark"
              ? "rgba(15, 23, 42, 0.90)"
              : "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--border, #334155)",
          borderRadius: "24px",
          padding: "4px 10px",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--muted-foreground, #94a3b8)",
            marginRight: "4px",
          }}
        >
          <Clock size={13} />
          <span>Forecast:</span>
        </span>
        {TIME_STEPS.map((step) => (
          <button
            type="button"
            key={step.hours}
            onClick={() => {
              setSelectedTimeStep(step.hours);
              onTimeOffsetChange?.(step.hours);
            }}
            style={{
              padding: "3px 9px",
              fontSize: "11px",
              fontWeight: selectedTimeStep === step.hours ? 700 : 500,
              borderRadius: "16px",
              border: "none",
              background:
                selectedTimeStep === step.hours ? "#2563eb" : "transparent",
              color:
                selectedTimeStep === step.hours
                  ? "#ffffff"
                  : "var(--foreground, #0f172a)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {step.label}
          </button>
        ))}
      </div>

      {/* Floating Point Depth & Ocean Telemetry Inspector HUD */}
      {inspectedPoint && (
        <div
          className="map-point-inspector"
          style={{
            position: "absolute",
            bottom: "72px",
            right: "16px",
            zIndex: 15,
            width: "290px",
            background:
              theme === "dark"
                ? "rgba(15, 23, 42, 0.95)"
                : "rgba(255, 255, 255, 0.97)",
            backdropFilter: "blur(10px)",
            border: "1px solid var(--border, #334155)",
            borderRadius: "10px",
            padding: "12px",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.22)",
            fontSize: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              paddingBottom: "6px",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#0ea5e9",
              }}
            >
              <Waves size={15} />
              Ocean Depth & Tide Telemetry
            </span>
            <button
              type="button"
              onClick={() => setInspectedPoint(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted-foreground, #94a3b8)",
                padding: "2px",
              }}
              aria-label="Close telemetry HUD"
            >
              <X size={14} />
            </button>
          </div>

          <div
            style={{
              color: "var(--muted-foreground, #94a3b8)",
              fontFamily: "monospace",
              fontSize: "11px",
              marginBottom: "8px",
            }}
          >
            📍 {inspectedPoint.lat.toFixed(4)}°N,{" "}
            {inspectedPoint.lon.toFixed(4)}°E
          </div>

          {inspectedPoint.loading ? (
            <div
              style={{
                padding: "12px 0",
                textAlign: "center",
                color: "#94a3b8",
              }}
            >
              Querying bathymetry & tides…
            </div>
          ) : inspectedPoint.data ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                  Seabed Depth:
                </span>
                <strong style={{ color: "#38bdf8" }}>
                  {inspectedPoint.data.bathymetry_and_shelf.bathymetry_depth_m}{" "}
                  m
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                  Shelf Zone:
                </span>
                <span style={{ fontWeight: 600 }}>
                  {inspectedPoint.data.bathymetry_and_shelf.shelf_zone}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                  Distance to Shore:
                </span>
                <span style={{ fontWeight: 600 }}>
                  {
                    inspectedPoint.data.bathymetry_and_shelf
                      .distance_to_shore_km
                  }{" "}
                  km
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                  Predicted Tide:
                </span>
                <strong style={{ color: "#10b981" }}>
                  {inspectedPoint.data.astronomical_tide.current_height_m} m CD
                  ({inspectedPoint.data.astronomical_tide.phase})
                </strong>
              </div>
              {inspectedPoint.data.ocean_state && (
                <>
                  <div
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      paddingTop: "6px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                      Wave Height:
                    </span>
                    <strong
                      style={{
                        color:
                          inspectedPoint.data.ocean_state.wave_height_m > 2.0
                            ? "#ef4444"
                            : "#10b981",
                      }}
                    >
                      {inspectedPoint.data.ocean_state.wave_height_m} m (Swell{" "}
                      {inspectedPoint.data.ocean_state.swell_height_m}m @{" "}
                      {inspectedPoint.data.ocean_state.swell_period_s}s)
                    </strong>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                      Wind Speed:
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {inspectedPoint.data.ocean_state.wind_speed_kn} kn (
                      {inspectedPoint.data.ocean_state.wind_direction_deg}°)
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                      Sea Surface Temp:
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {inspectedPoint.data.ocean_state.sst_c} °C
                    </span>
                  </div>
                </>
              )}
              {inspectedPoint.data.nearby_lighthouses?.[0] && (
                <div
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    paddingTop: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: "var(--muted-foreground, #94a3b8)" }}>
                    Nearest Light:
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {inspectedPoint.data.nearby_lighthouses[0].name} (
                    {inspectedPoint.data.nearby_lighthouses[0].range_nm} nm
                    range)
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Floating Nautical Measure & Voyage Transit HUD */}
      {isRulerActive && (
        <div
          className="map-ruler-hud"
          style={{
            position: 'absolute',
            top: '70px',
            left: hideAdvancedControls ? '200px' : '16px',
            zIndex: 25,
            width: '310px',
            background: theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border, #334155)',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
            fontSize: '12px',
            color: 'var(--foreground, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))', paddingBottom: '6px' }}>
            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb' }}>
              <Ruler size={16} />
              Nautical Measure Tool
            </span>
            <button
              type="button"
              onClick={() => {
                setIsRulerActive(false);
                setRulerPoints([]);
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground, #94a3b8)', padding: '2px' }}
              aria-label="Close ruler tool"
            >
              <X size={15} />
            </button>
          </div>

          {rulerPoints.length === 0 && (
            <p style={{ color: 'var(--muted-foreground, #94a3b8)', fontSize: '11px', lineHeight: 1.4, margin: '4px 0' }}>
              Click anywhere on the coastal waters to place your starting waypoint. Click additional points to measure route legs.
            </p>
          )}

          {rulerPoints.length === 1 && (
            <div>
              <p style={{ color: '#2563eb', fontWeight: 600, fontSize: '11px', marginBottom: '6px' }}>
                📍 Point 1 set ({rulerPoints[0][1].toFixed(3)}°N, {rulerPoints[0][0].toFixed(3)}°E)
              </p>
              <p style={{ color: 'var(--muted-foreground, #94a3b8)', fontSize: '11px', lineHeight: 1.4, margin: 0 }}>
                Click a destination or second waypoint on the water to calculate nautical distance, true heading, and voyage time.
              </p>
            </div>
          )}

          {rulerStats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--muted-foreground, #94a3b8)' }}>Total Distance:</span>
                <div>
                  <strong style={{ fontSize: '16px', color: '#2563eb' }}>{rulerStats.distNm} NM</strong>{' '}
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground, #94a3b8)' }}>({rulerStats.distKm} km)</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground, #94a3b8)' }}>True Bearing / Heading:</span>
                <strong style={{ color: '#0ea5e9' }}>
                  {rulerStats.bearing}° ({rulerStats.compass})
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-foreground, #94a3b8)' }}>Est. Transit (@8.5 kn):</span>
                <strong style={{ color: '#10b981' }}>{rulerStats.transit}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted-foreground, #94a3b8)' }}>
                <span>Waypoints: {rulerStats.waypoints}</span>
                <span>Press ESC to exit</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border, rgba(255,255,255,0.1))' }}>
                <button
                  type="button"
                  onClick={() => setRulerPoints([])}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid var(--border, #cbd5e1)',
                    background: 'transparent',
                    color: 'var(--foreground, #0f172a)',
                    cursor: 'pointer',
                  }}
                >
                  Clear Points
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRulerActive(false);
                    setRulerPoints([]);
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Recursively traverse GeoJSON and expand bounds */
function collectBounds(
  geojson: any,
  bounds: maplibregl.LngLatBounds,
  onCoord: () => void,
) {
  if (!geojson) return;

  const traverseCoords = (coords: any) => {
    if (!Array.isArray(coords)) return;
    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      bounds.extend([coords[0], coords[1]]);
      onCoord();
    } else {
      for (const item of coords) {
        traverseCoords(item);
      }
    }
  };

  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (f.geometry?.coordinates) {
        traverseCoords(f.geometry.coordinates);
      }
    }
  } else if (geojson.type === "Feature" && geojson.geometry?.coordinates) {
    traverseCoords(geojson.geometry.coordinates);
  } else if (geojson.coordinates) {
    traverseCoords(geojson.coordinates);
  }
}

/** Extract primary geometry type from GeoJSON */
function getGeometryType(geojson: MapLayer["geojson"]): string {
  if (geojson.type === "FeatureCollection" && geojson.features?.length) {
    return geojson.features[0].geometry?.type || "Point";
  }
  if (geojson.type === "Feature") {
    return (geojson as GeoJSON.Feature).geometry?.type || "Point";
  }
  return (geojson as any)?.geometry?.type || "Point";
}

/**
 * Maps point features to MarineWatch-style DOM icon markers:
 * ⚓ Landing Harbour / Departure Station
 * 🎯 Voyage Target / Destination Point
 * 🗼 DGLL Coastal Lighthouse
 * 🐟 Potential Fishing Zone (PFZ)
 * 🦐 CAA Aquaculture Farm
 * ⚠️ Marine Hazard Alert
 * ⛵ Live Vessel / Monitored Craft
 */
function getPointMarkerConfig(
  feature: any,
  layer: MapLayer,
): { emoji: string; className: string; color: string; title: string } {
  const props = feature.properties || {};
  const layerId = (layer.layer_id || "").toLowerCase();
  const layerCategory = (layer.style?.layer_category || "").toLowerCase();
  const pointType = (props.point_type || props.type || "").toLowerCase();
  const name = props.name || props.harbor || props.location || layer.name || "";

  // 1. Departure Station / Port / Landing Harbour
  if (
    pointType.includes("departure") ||
    pointType.includes("harbor") ||
    layerId.includes("harbor") ||
    layerId.includes("port") ||
    layerCategory === "navigation_terminal" ||
    layerId === "layer_route_start_marker"
  ) {
    return {
      emoji: "⚓",
      className: "port-marker",
      color: "#0284c7",
      title: `${name} (Departure Station / Landing Centre)`,
    };
  }

  // 2. Destination / Target
  if (
    pointType.includes("destination") ||
    layerId === "layer_route_end_marker" ||
    pointType.includes("target") ||
    name.toLowerCase().includes("target")
  ) {
    return {
      emoji: "🎯",
      className: "destination-marker",
      color: "#f59e0b",
      title: `${name} (Voyage Target / Destination)`,
    };
  }

  // 3. DGLL Navigational Lighthouse
  if (
    pointType.includes("lighthouse") ||
    layerId.includes("lighthouse") ||
    layerCategory === "navigation_aid"
  ) {
    const range = props.optical_range_nm || props.range_nm || 15;
    return {
      emoji: "🗼",
      className: "lighthouse-marker",
      color: "#eab308",
      title: `${name} (DGLL Coastal Lighthouse · ${range}nm)`,
    };
  }

  // 4. Potential Fishing Zone (PFZ)
  if (
    layerId.includes("pfz") ||
    layerCategory === "pfz" ||
    props.candidate_id ||
    (props.public_id && String(props.public_id).startsWith("pfz"))
  ) {
    const rank = props.rank ? ` #${props.rank}` : "";
    const dist = props.distance_km
      ? ` · ${props.distance_km.toFixed(1)} km`
      : "";
    return {
      emoji: "🐟",
      className: "pfz-marker",
      color: "#10b981",
      title: `PFZ Candidate${rank}${dist}`,
    };
  }

  // 5. CAA Aquaculture Farm
  if (
    layerId.includes("aqua") ||
    layerCategory === "aquaculture" ||
    props.farm_name ||
    props.farm_code
  ) {
    return {
      emoji: "🦐",
      className: "aqua-marker",
      color: "#f97316",
      title: `${props.farm_name || name} (CAA Aquaculture)`,
    };
  }

  // 6. Point Hazard / Warning
  if (
    layerId.includes("hazard") ||
    layerCategory === "hazard" ||
    props.severity ||
    props.headline
  ) {
    return {
      emoji: "⚠️",
      className: "hazard-marker",
      color: "#ef4444",
      title: `${props.headline || name || "Hazard Alert"}`,
    };
  }

  // 7. Live Vessel / Monitored Craft
  if (
    pointType.includes("location") ||
    pointType.includes("vessel") ||
    layerId.includes("vessel") ||
    layerId === "layer_live_location" ||
    layerId === "layer_fleet_vessel_replay"
  ) {
    return {
      emoji: "⛵",
      className: "vessel-marker",
      color: "#2563eb",
      title: `${name || "Monitored Vessel"}`,
    };
  }

  // Default fallback icon
  return {
    emoji: "📍",
    className: "port-marker",
    color: layer.style?.color || "#0284c7",
    title: name || layer.name,
  };
}

function formatPropValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}
