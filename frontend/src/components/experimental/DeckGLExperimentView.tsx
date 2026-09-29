import { useState, useEffect, useMemo, useRef } from 'react';
import DeckGLMarineMap, { INITIAL_DECKGL_VIEW_STATE } from './DeckGLMarineMap';
import type { MapViewState } from '@deck.gl/core';
import type { MapLayer } from '../../types/contracts';
import type { PFZCandidate, HazardBulletin, HarborData } from '../../api/researcher-client';
import {
  fetchHarbors,
  fetchHazards,
  fetchPFZCandidates,
} from '../../api/researcher-client';
import type { EvaluatedRouteItem, VesselPosition } from '../../api/client';
import {
  getDemoRouteAlternatives,
} from '../../api/client';
import { fetchAndFormatBaseLayers, HARBOR_COORDINATES } from '../../utils/geo';
import {
  calculateDistanceKm,
  calculateBearingDeg,
  calculatePointToRouteDistanceKm,
  isPointInHazardPolygon,
  findRouteHazardIntersections,
} from '../../utils/spatial-analytics';
import {
  Compass,
  Layers,
  Navigation,
  Box,
  ArrowLeft,
  Activity,
  Info,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  Ship,
  MapPin,
} from 'lucide-react';
import { useTranslation } from "react-i18next";

interface DeckGLExperimentViewProps {
  onBackToPortal: () => void;
}

// Helper to synthesize smooth, sequential vessel GPS positions along a specific navigation route corridor
function generateTrajectoryFromRoute(
  waypoints: [number, number][],
  vesselId = 'vessel-01',
): VesselPosition[] {
  if (!waypoints || waypoints.length === 0) return [];
  if (waypoints.length === 1) {
    return [
      {
        public_id: 'vp-0',
        vessel_id: vesselId,
        trip_id: 'trip-rtn-01',
        timestamp: new Date().toISOString(),
        latitude: waypoints[0][1],
        longitude: waypoints[0][0],
        speed_knots: 4.5,
        heading_deg: 220,
      },
    ];
  }

  const positions: VesselPosition[] = [];
  const baseTime = Date.now() - 3600000 * 3;
  let pointIndex = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const bearing = calculateBearingDeg(start, end);
    // Subdivide each route leg into 3 smooth progression steps
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const frac = s / steps;
      const lng = start[0] + (end[0] - start[0]) * frac;
      const lat = start[1] + (end[1] - start[1]) * frac;
      positions.push({
        public_id: `vp-${pointIndex}`,
        vessel_id: vesselId,
        trip_id: 'trip-rtn-01',
        timestamp: new Date(baseTime + pointIndex * 600000).toISOString(),
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lng.toFixed(5)),
        speed_knots: Number((7.2 + Math.sin(pointIndex * 0.8) * 0.6).toFixed(1)),
        heading_deg: Math.round(bearing),
      });
      pointIndex++;
    }
  }

  // Final destination point
  const lastPoint = waypoints[waypoints.length - 1];
  const prevPoint = waypoints[waypoints.length - 2];
  positions.push({
    public_id: `vp-${pointIndex}`,
    vessel_id: vesselId,
    trip_id: 'trip-rtn-01',
    timestamp: new Date().toISOString(),
    latitude: Number(lastPoint[1].toFixed(5)),
    longitude: Number(lastPoint[0].toFixed(5)),
    speed_knots: 3.5,
    heading_deg: Math.round(calculateBearingDeg(prevPoint, lastPoint)),
  });

  return positions;
}

export default function DeckGLExperimentView({ onBackToPortal }: DeckGLExperimentViewProps) {
    const { t } = useTranslation();
  const [baseLayers, setBaseLayers] = useState<MapLayer[]>([]);
  const [hazards, setHazards] = useState<HazardBulletin[]>([]);
  const [pfzCandidates, setPfzCandidates] = useState<PFZCandidate[]>([]);
  const [routes, setRoutes] = useState<EvaluatedRouteItem[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [vesselIndex, setVesselIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [selectedHarbor, setSelectedHarbor] = useState<HarborData | null>(null);
  const [loading, setLoading] = useState(true);
  const holdCountRef = useRef(0);

  // Layer Visibility & Visualization Toggles
  const [visibleCategories, setVisibleCategories] = useState({
    hazards: true,
    routes: true,
    pfz: true,
    vessel: true,
    boundaries: true,
  });
  const [enable3D, setEnable3D] = useState(true);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_DECKGL_VIEW_STATE);
  const [selectedFeature, setSelectedFeature] = useState<{ type: string; id: string; properties: any } | null>(null);

  // Load Authentic ORCA Data
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [loadedBase, loadedHazards, loadedPFZ, loadedRoutes, loadedHarbors] = await Promise.all([
          fetchAndFormatBaseLayers().catch(() => []),
          fetchHazards().catch(() => []),
          fetchPFZCandidates().catch(() => []),
          getDemoRouteAlternatives({ origin_harbor: 'Ratnagiri' }).catch(() => null),
          fetchHarbors().catch(() => []),
        ]);

        setBaseLayers(loadedBase || []);

        // Keep only the 2 primary active hazards to maintain clean, high-contrast visual clarity
        const primaryHazards = (loadedHazards || [])
          .filter((h) => h.geometry_geojson && (h.status === 'ACTIVE' || !h.status))
          .sort((a, b) => {
            const sevOrder: Record<string, number> = { CRITICAL: 4, WARNING: 3, ALERT: 2, WATCH: 1, ADVISORY: 0 };
            return (sevOrder[b.severity?.toUpperCase()] || 0) - (sevOrder[a.severity?.toUpperCase()] || 0);
          })
          .slice(0, 2);
        setHazards(primaryHazards.length > 0 ? primaryHazards : (loadedHazards || []).slice(0, 2));

        setPfzCandidates(loadedPFZ || []);
        setRoutes(loadedRoutes?.routes || []);
        if (loadedRoutes?.recommended_route_id) {
          setSelectedRouteId(loadedRoutes.recommended_route_id);
        } else if (loadedRoutes?.routes?.[0]) {
          setSelectedRouteId(loadedRoutes.routes[0].route_id);
        }

        const ratnagiriHarbor = loadedHarbors?.find((h) => h.name.toLowerCase().includes('ratnagiri')) || {
          public_id: 'harbor-ratnagiri',
          name: 'Ratnagiri',
          latitude: HARBOR_COORDINATES.Ratnagiri[1],
          longitude: HARBOR_COORDINATES.Ratnagiri[0],
          state: 'Maharashtra',
        };
        setSelectedHarbor(ratnagiriHarbor);
      } catch (err) {
        console.error('Failed to load real ORCA data for deck.gl experiment:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Currently selected active route corridor
  const recommendedRoute = useMemo(() => {
    return routes.find((r) => r.route_id === selectedRouteId) || routes[0] || null;
  }, [routes, selectedRouteId]);

  // Vessel positions dynamically follow the selected route corridor waypoints
  const vesselPositions = useMemo(() => {
    if (recommendedRoute?.waypoints && recommendedRoute.waypoints.length > 0) {
      return generateTrajectoryFromRoute(recommendedRoute.waypoints, 'vessel-01');
    }
    return [];
  }, [recommendedRoute]);

  // Reset vessel playback position whenever the active route corridor is switched
  useEffect(() => {
    setVesselIndex(0);
    holdCountRef.current = 0;
  }, [selectedRouteId]);

  // Autoplay ticker for vessel voyage replay (slower, nautical pace: ~2.5s base per step at 1x)
  useEffect(() => {
    if (!isPlaying || vesselPositions.length === 0) return;

    const intervalMs = Math.round(2500 / playbackSpeed);
    const timer = setInterval(() => {
      setVesselIndex((prev) => {
        if (prev >= vesselPositions.length - 1) {
          if (holdCountRef.current < 2) {
            holdCountRef.current += 1;
            return prev;
          }
          holdCountRef.current = 0;
          return 0;
        }
        holdCountRef.current = 0;
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, vesselPositions, playbackSpeed]);

  const activeVesselPosition = useMemo(() => {
    if (!vesselPositions || vesselPositions.length === 0) return null;
    return vesselPositions[Math.min(vesselIndex, vesselPositions.length - 1)];
  }, [vesselPositions, vesselIndex]);

  const vesselTrail = useMemo(() => {
    if (!vesselPositions || vesselPositions.length === 0) return [];
    return vesselPositions.slice(0, vesselIndex + 1).map((p) => [p.longitude, p.latitude] as [number, number]);
  }, [vesselPositions, vesselIndex]);

  const nearestPFZ = useMemo(() => {
    return pfzCandidates[0] || null;
  }, [pfzCandidates]);

  // Turf.js Real Spatial Calculations Readout
  const spatialMetrics = useMemo(() => {
    const ratnagiriCoord = HARBOR_COORDINATES.Ratnagiri;
    let distToPFZ = 0;
    let bearingToPFZ = 0;
    let vesselCrossTrackKm = 0;
    let vesselInHazard = false;
    let routeIntersectionsCount = 0;

    if (nearestPFZ) {
      distToPFZ = calculateDistanceKm(ratnagiriCoord, [nearestPFZ.longitude, nearestPFZ.latitude]);
      bearingToPFZ = calculateBearingDeg(ratnagiriCoord, [nearestPFZ.longitude, nearestPFZ.latitude]);
    }

    if (activeVesselPosition && recommendedRoute?.waypoints) {
      vesselCrossTrackKm = calculatePointToRouteDistanceKm(
        [activeVesselPosition.longitude, activeVesselPosition.latitude],
        recommendedRoute.waypoints,
      );
    }

    if (activeVesselPosition && hazards.length > 0) {
      for (const h of hazards) {
        if (h.geometry_geojson?.coordinates) {
          const coords = h.geometry_geojson.type === 'Polygon' ? h.geometry_geojson.coordinates : h.geometry_geojson.coordinates[0];
          if (isPointInHazardPolygon([activeVesselPosition.longitude, activeVesselPosition.latitude], coords)) {
            vesselInHazard = true;
            break;
          }
        }
      }
    }

    if (recommendedRoute?.waypoints && hazards.length > 0) {
      for (const h of hazards) {
        if (h.geometry_geojson?.coordinates) {
          const coords = h.geometry_geojson.type === 'Polygon' ? h.geometry_geojson.coordinates : h.geometry_geojson.coordinates[0];
          const inter = findRouteHazardIntersections(recommendedRoute.waypoints, coords);
          routeIntersectionsCount += inter.intersectionCount;
        }
      }
    }

    return {
      distToPFZ,
      bearingToPFZ,
      vesselCrossTrackKm,
      vesselInHazard,
      routeIntersectionsCount,
    };
  }, [nearestPFZ, activeVesselPosition, recommendedRoute, hazards]);

  return (
    <div className="deckgl-experiment-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#020617', color: '#f8fafc', overflow: 'hidden' }}>
      {/* Top Header Command Bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: '#0f172a', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            onClick={onBackToPortal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
          >
            <ArrowLeft size={16} />
            <span>Return to Portal</span>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '0.02em', color: '#38bdf8' }}>
                DECK.GL VISUAL EXPERIMENT
              </h1>
              <span style={{ fontSize: '11px', background: '#0369a1', color: '#e0f2fe', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                WebGL2 Accelerated
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
              Isolated marine evaluation deck · Production MapLibre remains untouched · Real ORCA Data & Turf.js
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', padding: '4px 10px', borderRadius: '6px', border: '1px solid #334155', fontSize: '12px' }}>
            <Activity size={14} color="#10b981" />
            <span style={{ color: '#94a3b8' }}>Data Mode:</span>
            <strong style={{ color: '#38bdf8' }}>CANONICAL SNAPSHOT</strong>
          </div>
        </div>
      </header>

      {/* Main Workspace Body: Map + Tactical Telemetry HUD */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Central Deck.GL Map Canvas */}
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#090d16', color: '#38bdf8', fontSize: '15px' }}>
              <span>Loading real ORCA marine layers & spatial vectors…</span>
            </div>
          ) : (
            <DeckGLMarineMap
              baseLayers={baseLayers}
              hazards={hazards}
              pfzCandidates={pfzCandidates}
              routes={routes}
              selectedRouteId={selectedRouteId}
              activeVesselPosition={activeVesselPosition}
              vesselTrail={vesselTrail}
              selectedHarbor={selectedHarbor}
              enable3DExtrusion={enable3D}
              viewState={viewState}
              onViewStateChange={setViewState}
              visibleCategories={visibleCategories}
              onSelectFeature={(feat) => setSelectedFeature(feat)}
            />
          )}

          {/* Floating HUD: Layer & 3D Controls */}
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, background: 'rgba(15, 23, 42, 0.94)', backdropFilter: 'blur(10px)', border: '1px solid #334155', borderRadius: '10px', padding: '14px', width: '290px', boxShadow: '0 10px 30px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={16} color="#38bdf8" />
                <strong style={{ fontSize: '13px', color: '#f8fafc' }}>Deck.gl 3D Controls</strong>
              </div>
              <span style={{ fontSize: '10px', background: enable3D ? '#0369a1' : '#334155', color: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                {enable3D ? '3D VOLUMETRIC' : '2D FLAT'}
              </span>
            </div>

            {/* Quick 3D Camera Angles */}
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                Camera View Angle:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                <button
                  type="button"
                  onClick={() => setViewState((vs) => ({ ...vs, pitch: 55, bearing: -22, zoom: 8.8 }))}
                  style={{
                    padding: '5px 4px',
                    background: (viewState.pitch ?? 0) > 40 && (viewState.pitch ?? 0) < 65 ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="55° Isometric perspective"
                >
                  Tactical 3D
                </button>
                <button
                  type="button"
                  onClick={() => setViewState((vs) => ({ ...vs, pitch: 68, bearing: 35, zoom: 9.2 }))}
                  style={{
                    padding: '5px 4px',
                    background: (viewState.pitch ?? 0) >= 65 ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="68° Orbit perspective"
                >
                  High Orbit
                </button>
                <button
                  type="button"
                  onClick={() => setViewState((vs) => ({ ...vs, pitch: 0, bearing: 0, zoom: 8.5 }))}
                  style={{
                    padding: '5px 4px',
                    background: (viewState.pitch ?? 0) === 0 ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="0° Top-Down 2D view"
                >
                  2D Flat
                </button>
              </div>
            </div>

            {/* Layer Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visibleCategories.hazards}
                  onChange={(e) => setVisibleCategories({ ...visibleCategories, hazards: e.target.checked })}
                />
                <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ Marine Hazards ({hazards.length})</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visibleCategories.routes}
                  onChange={(e) => setVisibleCategories({ ...visibleCategories, routes: e.target.checked })}
                />
                <span style={{ color: '#06b6d4', fontWeight: 600 }}>🧭 Route Corridors ({routes.length})</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visibleCategories.pfz}
                  onChange={(e) => setVisibleCategories({ ...visibleCategories, pfz: e.target.checked })}
                />
                <span style={{ color: '#10b981', fontWeight: 600 }}>🐟 PFZ 3D Columns ({pfzCandidates.length})</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visibleCategories.vessel}
                  onChange={(e) => setVisibleCategories({ ...visibleCategories, vessel: e.target.checked })}
                />
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>🚢 Vessel & 3D Beacon</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visibleCategories.boundaries}
                  onChange={(e) => setVisibleCategories({ ...visibleCategories, boundaries: e.target.checked })}
                />
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>🌐 UNCLOS EEZ & Territorial</span>
              </label>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #334155' }}>
              <button
                type="button"
                onClick={() => setEnable3D(!enable3D)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '6px 10px',
                  background: enable3D ? '#0284c7' : '#1e293b',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <Box size={14} />
                <span>{enable3D ? '3D Volumetric Extrusion: ON' : 'Enable 3D Extrusion'}</span>
              </button>
              <div style={{ marginTop: '6px', fontSize: '10.5px', color: '#94a3b8', textAlign: 'center' }}>
                💡 Right-Click + Drag or Ctrl + Drag to orbit
              </div>
            </div>
          </div>

          {/* Autoplay & GPS Scrubber Bar for Monitored Vessel */}
          {vesselPositions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                right: 340,
                zIndex: 20,
                background: 'rgba(15, 23, 42, 0.94)',
                backdropFilter: 'blur(12px)',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '12px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.7)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                {/* Playback Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPlaying && vesselIndex >= vesselPositions.length - 1) {
                        setVesselIndex(0);
                        holdCountRef.current = 0;
                      }
                      setIsPlaying(!isPlaying);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      background: isPlaying ? '#0284c7' : '#22c55e',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      transition: 'all 0.15s ease',
                    }}
                    title={isPlaying ? 'Pause Replay' : 'Play Replay'}
                  >
                    {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                    <span>{isPlaying ? 'Pause' : 'Autoplay'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVesselIndex(0);
                      holdCountRef.current = 0;
                      setIsPlaying(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                    title="Reset to departure"
                  >
                    <RotateCcw size={14} />
                    <span>Reset</span>
                  </button>

                  {/* Speed Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
                    {([0.5, 1, 2] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setPlaybackSpeed(spd)}
                        style={{
                          padding: '4px 8px',
                          background: playbackSpeed === spd ? '#0284c7' : 'transparent',
                          color: playbackSpeed === spd ? '#fff' : '#94a3b8',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Telemetry Pill Readout */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#cbd5e1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Ship size={14} color="#f59e0b" />
                    <strong>{activeVesselPosition?.vessel_id || 'vessel-01'}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Gauge size={14} color="#38bdf8" />
                    <span>{t('DeckGLExperimentView.valkn', { val: activeVesselPosition?.speed_knots || 0 })}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Compass size={14} color="#10b981" />
                    <span>{activeVesselPosition?.heading_deg || 0}°</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <MapPin size={14} color="#f43f5e" />
                    <span>{activeVesselPosition?.latitude.toFixed(3)}°N, {activeVesselPosition?.longitude.toFixed(3)}°E</span>
                  </div>
                </div>
              </div>

              {/* Range Scrubber Timeline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Departure</span>
                <input
                  type="range"
                  min={0}
                  max={vesselPositions.length - 1}
                  value={vesselIndex}
                  onChange={(e) => {
                    setVesselIndex(Number(e.target.value));
                    holdCountRef.current = 0;
                    setIsPlaying(false);
                  }}
                  style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  Waypoint {vesselIndex + 1}/{vesselPositions.length}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Tactical Telemetry & Comparison Panel */}
        <aside style={{ width: '320px', background: '#0f172a', borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '16px', gap: '16px', flexShrink: 0 }}>
          {/* Turf.js Live Spatial Analytics Readout */}
          <section style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#38bdf8' }}>
              <Compass size={16} />
              <strong style={{ fontSize: '13px' }}>Turf.js Spatial Analytics</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Harbor → Nearest PFZ:</span>
                <strong style={{ color: '#10b981' }}>{spatialMetrics.distToPFZ} km ({spatialMetrics.bearingToPFZ}°)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Vessel Cross-Track:</span>
                <strong style={{ color: '#38bdf8' }}>{spatialMetrics.vesselCrossTrackKm} km off line</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Point-in-Hazard:</span>
                <strong style={{ color: spatialMetrics.vesselInHazard ? '#ef4444' : '#10b981' }}>
                  {spatialMetrics.vesselInHazard ? 'INSIDE HAZARD' : 'CLEAR'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Route Hazard Crossings:</span>
                <strong style={{ color: spatialMetrics.routeIntersectionsCount > 0 ? '#f59e0b' : '#10b981' }}>
                  {spatialMetrics.routeIntersectionsCount} intersection(s)
                </strong>
              </div>
            </div>
          </section>

          {/* Route Corridor Switcher */}
          {routes.length > 0 && (
            <section style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#06b6d4' }}>
                <Navigation size={16} />
                <strong style={{ fontSize: '13px' }}>Evaluated Corridors</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {routes.map((r) => {
                  const isSelected = r.route_id === selectedRouteId;
                  return (
                    <button
                      key={r.route_id}
                      type="button"
                      onClick={() => setSelectedRouteId(r.route_id)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        background: isSelected ? 'rgba(6, 182, 212, 0.15)' : '#0f172a',
                        border: isSelected ? '1px solid #06b6d4' : '1px solid #334155',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: isSelected ? '#06b6d4' : '#e2e8f0' }}>{r.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginTop: '2px', fontSize: '11px' }}>
                        <span>Dist: {r.distance_km} km</span>
                        <span>{t('DeckGLExperimentView.exposureval', { val: r.exposure_score })}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Feature Inspection Card */}
          {selectedFeature && (
            <section style={{ background: '#1e293b', border: '1px solid #38bdf8', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#38bdf8' }}>
                <Info size={15} />
                <strong style={{ fontSize: '13px' }}>Selected Feature</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', wordBreak: 'break-word' }}>
                <div><strong>Layer:</strong> {selectedFeature.type}</div>
                <div><strong>ID:</strong> {selectedFeature.id}</div>
                <pre style={{ marginTop: '6px', padding: '6px', background: '#0f172a', borderRadius: '4px', fontSize: '11px', overflowX: 'auto', maxHeight: '140px', color: '#94a3b8' }}>
                  {JSON.stringify(selectedFeature.properties, null, 2)}
                </pre>
              </div>
            </section>
          )}

          {/* Comparative Architectural Findings */}
          <section style={{ background: 'rgba(2, 132, 199, 0.1)', border: '1px solid #0284c7', borderRadius: '8px', padding: '12px', marginTop: 'auto' }}>
            <strong style={{ fontSize: '12px', color: '#38bdf8', display: 'block', marginBottom: '4px' }}>
              Deck.gl vs. MapLibre Evaluation
            </strong>
            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
              Deck.gl excels at 3D extruded hazard volumes and custom WebGL shader pulse animations. MapLibre GL excels at low-overhead vector tile basemaps, text rendering, and lightweight DOM popups.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
