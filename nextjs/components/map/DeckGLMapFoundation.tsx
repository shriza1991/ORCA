import React, { useState, useCallback, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import maplibregl from 'maplibre-gl';
import {
  Compass,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Navigation,
} from 'lucide-react';

export type CameraPreset = 'tactical' | 'orbit' | 'flat';

export interface CameraPresetConfig {
  id: CameraPreset;
  label: string;
  pitch: number;
  bearing: number;
  zoomOffset?: number;
}

export const CAMERA_PRESETS: CameraPresetConfig[] = [
  { id: 'tactical', label: 'Tactical 3D', pitch: 52, bearing: -18 },
  { id: 'orbit', label: 'High Orbit', pitch: 20, bearing: 0 },
  { id: 'flat', label: '2D Flat', pitch: 0, bearing: 0 },
];

export const DEFAULT_VIEW_STATE: MapViewState = {
  longitude: 73.28,
  latitude: 16.99,
  zoom: 8.5,
  pitch: 52,
  bearing: -18,
  maxZoom: 16,
  minZoom: 4,
};

const BASEMAP_STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export interface DeckGLMapFoundationProps {
  layers: any[];
  viewState?: MapViewState;
  onViewStateChange?: (vs: MapViewState) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  initialPitch?: number;
  initialBearing?: number;
  getTooltip?: (info: PickingInfo) => any;
  onClick?: (info: PickingInfo) => void;
  topOverlay?: React.ReactNode;
  bottomOverlay?: React.ReactNode;
  showControls?: boolean;
  showCameraPresets?: boolean;
  enable3D?: boolean;
  activePreset?: CameraPreset;
  onPresetChange?: (preset: CameraPreset) => void;
  onResetView?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export default function DeckGLMapFoundation({
  layers,
  viewState: externalViewState,
  onViewStateChange: externalOnViewStateChange,
  initialCenter,
  initialZoom,
  initialPitch,
  initialBearing,
  getTooltip,
  onClick,
  topOverlay,
  bottomOverlay,
  showControls = true,
  showCameraPresets = true,
  activePreset: controlledPreset,
  onPresetChange,
  onResetView,
  className = '',
  style,
  children,
}: DeckGLMapFoundationProps) {
  const [internalViewState, setInternalViewState] = useState<MapViewState>(() => ({
    ...DEFAULT_VIEW_STATE,
    longitude: initialCenter ? initialCenter[0] : DEFAULT_VIEW_STATE.longitude,
    latitude: initialCenter ? initialCenter[1] : DEFAULT_VIEW_STATE.latitude,
    zoom: initialZoom ?? DEFAULT_VIEW_STATE.zoom,
    pitch: initialPitch ?? DEFAULT_VIEW_STATE.pitch,
    bearing: initialBearing ?? DEFAULT_VIEW_STATE.bearing,
  }));

  const [localPreset, setLocalPreset] = useState<CameraPreset>('tactical');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const maplibreContainerRef = useRef<HTMLDivElement>(null);
  const maplibreMapRef = useRef<maplibregl.Map | null>(null);

  const activeViewState = externalViewState || internalViewState;
  const currentPreset = controlledPreset || localPreset;

  // Initialize background MapLibre basemap instance
  useEffect(() => {
    if (!maplibreContainerRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: maplibreContainerRef.current,
        style: BASEMAP_STYLE_DARK,
        center: [activeViewState.longitude, activeViewState.latitude],
        zoom: activeViewState.zoom,
        pitch: activeViewState.pitch ?? 0,
        bearing: activeViewState.bearing ?? 0,
        interactive: false,
        attributionControl: false,
      });

      maplibreMapRef.current = map;

      return () => {
        map.remove();
        maplibreMapRef.current = null;
      };
    } catch {
      // Degrades gracefully to dark background if WebGL2 context or style is unreachable
    }
  }, []);

  // Synchronize background MapLibre camera with DeckGL viewState at 60 FPS
  useEffect(() => {
    const map = maplibreMapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      map.jumpTo({
        center: [activeViewState.longitude, activeViewState.latitude],
        zoom: activeViewState.zoom,
        pitch: activeViewState.pitch ?? 0,
        bearing: activeViewState.bearing ?? 0,
      });
    } catch {
      // Ignore transient camera sync errors during fast resizing
    }
  }, [
    activeViewState.longitude,
    activeViewState.latitude,
    activeViewState.zoom,
    activeViewState.pitch,
    activeViewState.bearing,
  ]);

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

  const setCameraPreset = useCallback(
    (preset: CameraPreset) => {
      const cfg = CAMERA_PRESETS.find((p) => p.id === preset);
      if (!cfg) return;

      const newVs: MapViewState = {
        ...activeViewState,
        pitch: cfg.pitch,
        bearing: cfg.bearing,
      };

      if (onPresetChange) {
        onPresetChange(preset);
      } else {
        setLocalPreset(preset);
      }

      if (externalOnViewStateChange) {
        externalOnViewStateChange(newVs);
      } else {
        setInternalViewState(newVs);
      }
    },
    [activeViewState, externalOnViewStateChange, onPresetChange],
  );

  const zoomIn = useCallback(() => {
    const newVs: MapViewState = {
      ...activeViewState,
      zoom: Math.min((activeViewState.maxZoom || 16), activeViewState.zoom + 0.5),
    };
    if (externalOnViewStateChange) externalOnViewStateChange(newVs);
    else setInternalViewState(newVs);
  }, [activeViewState, externalOnViewStateChange]);

  const zoomOut = useCallback(() => {
    const newVs: MapViewState = {
      ...activeViewState,
      zoom: Math.max((activeViewState.minZoom || 4), activeViewState.zoom - 0.5),
    };
    if (externalOnViewStateChange) externalOnViewStateChange(newVs);
    else setInternalViewState(newVs);
  }, [activeViewState, externalOnViewStateChange]);

  const rotateBearing = useCallback(
    (deltaDeg: number) => {
      const currentBearing = activeViewState.bearing ?? 0;
      const newVs: MapViewState = {
        ...activeViewState,
        bearing: ((currentBearing + deltaDeg + 180) % 360) - 180,
      };
      if (externalOnViewStateChange) externalOnViewStateChange(newVs);
      else setInternalViewState(newVs);
    },
    [activeViewState, externalOnViewStateChange],
  );

  const adjustPitch = useCallback(
    (deltaDeg: number) => {
      const currentPitch = activeViewState.pitch ?? 0;
      const newVs: MapViewState = {
        ...activeViewState,
        pitch: Math.min(60, Math.max(0, currentPitch + deltaDeg)),
      };
      if (externalOnViewStateChange) externalOnViewStateChange(newVs);
      else setInternalViewState(newVs);
    },
    [activeViewState, externalOnViewStateChange],
  );

  const resetView = useCallback(() => {
    if (onResetView) {
      onResetView();
      return;
    }
    const defaultVs: MapViewState = {
      ...DEFAULT_VIEW_STATE,
      longitude: initialCenter ? initialCenter[0] : DEFAULT_VIEW_STATE.longitude,
      latitude: initialCenter ? initialCenter[1] : DEFAULT_VIEW_STATE.latitude,
      zoom: initialZoom ?? DEFAULT_VIEW_STATE.zoom,
    };
    setCameraPreset('tactical');
    if (externalOnViewStateChange) externalOnViewStateChange(defaultVs);
    else setInternalViewState(defaultVs);
  }, [initialCenter, initialZoom, onResetView, externalOnViewStateChange, setCameraPreset]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`deckgl-foundation-container ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '380px',
        background: '#070b14',
        overflow: 'hidden',
        borderRadius: '8px',
        ...style,
      }}
    >
      {/* Underlying Synchronized CartoDB Dark Matter Basemap (Coastline, Indian Landmass & Bathymetry) */}
      <div
        ref={maplibreContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* 3D WebGL2 Canvas */}
      <DeckGL
        style={{ position: 'absolute', top: '0px', left: '0px', width: '100%', height: '100%', zIndex: '1' }}
        viewState={activeViewState}
        onViewStateChange={(params: any) => handleViewStateChange(params)}
        controller={{
          doubleClickZoom: true,
          dragPan: true,
          dragRotate: true,
          scrollZoom: true,
          touchRotate: true,
        }}
        layers={layers}
        getTooltip={getTooltip}
        onClick={onClick}
      />

      {/* Top HUD Overlay Slot */}
      {topOverlay && (
        <div
          className="deckgl-top-overlay"
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: showControls ? 116 : 10,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>{topOverlay}</div>
        </div>
      )}

      {/* Floating 3D Navigation & Camera Controls Toolbar */}
      {showControls && (
        <div
          className="deckgl-controls-bar"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            zIndex: 20,
            pointerEvents: 'auto',
          }}
        >
          {/* Camera Presets Selector */}
          {showCameraPresets && (
            <div
              className="deckgl-preset-group"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '6px',
                padding: '3px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {CAMERA_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCameraPreset(p.id)}
                  style={{
                    background: currentPreset === p.id ? 'rgba(14, 165, 233, 0.35)' : 'transparent',
                    color: currentPreset === p.id ? '#38bdf8' : '#94a3b8',
                    border: currentPreset === p.id ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid transparent',
                    borderRadius: '4px',
                    padding: '3px 7px',
                    fontSize: '11px',
                    fontWeight: currentPreset === p.id ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  title={`${p.label} (Pitch: ${p.pitch}°, Bearing: ${p.bearing}°)`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Quick Nav Tools */}
          <div
            className="deckgl-tool-buttons"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              borderRadius: '6px',
              padding: '3px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            <button
              type="button"
              onClick={zoomIn}
              style={controlBtnStyle}
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              style={controlBtnStyle}
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              onClick={() => adjustPitch(10)}
              style={controlBtnStyle}
              title="Tilt 3D Angle Up"
              aria-label="Tilt 3D Angle Up"
            >
              <Navigation size={14} style={{ transform: 'rotate(0deg)' }} />
            </button>
            <button
              type="button"
              onClick={() => rotateBearing(15)}
              style={controlBtnStyle}
              title="Rotate Compass Bearing"
              aria-label="Rotate Bearing"
            >
              <Compass size={14} />
            </button>
            <button
              type="button"
              onClick={resetView}
              style={controlBtnStyle}
              title="Reset View"
              aria-label="Reset View"
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              style={controlBtnStyle}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Bottom HUD Overlay Slot */}
      {bottomOverlay && (
        <div
          className="deckgl-bottom-overlay"
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            right: 10,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>{bottomOverlay}</div>
        </div>
      )}

      {/* Live 3D Viewport Telemetry Pill */}
      <div
        className="deckgl-view-telemetry"
        style={{
          position: 'absolute',
          bottom: 6,
          right: 10,
          fontSize: '10px',
          fontFamily: 'monospace',
          color: 'rgba(148, 163, 184, 0.7)',
          background: 'rgba(15, 23, 42, 0.65)',
          padding: '2px 6px',
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        Z:{activeViewState.zoom.toFixed(1)} | P:{(activeViewState.pitch ?? 0).toFixed(0)}° | B:{(activeViewState.bearing ?? 0).toFixed(0)}°
      </div>

      {children}
    </div>
  );
}

const controlBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#cbd5e1',
  padding: '5px',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s, color 0.15s',
};
