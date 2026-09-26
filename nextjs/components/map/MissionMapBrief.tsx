import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Compass, Fish, Focus, MapPinned, Route, ShieldCheck, Zap } from 'lucide-react';
import type { MapLayer } from '../../types/contracts';
import type { OperationalMode } from '../../types/mission';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface MissionMapBriefProps {
  layers: MapLayer[];
  selectedMode?: OperationalMode;
  onModeChange?: (mode: OperationalMode) => void;
  language?: SupportedLanguage;
  onResetView?: () => void;
  layerAvailability?: {
    pfz?: 'AVAILABLE' | 'UNAVAILABLE' | 'EMPTY';
    routes?: 'AVAILABLE' | 'UNAVAILABLE' | 'EMPTY';
    hazards?: 'AVAILABLE' | 'UNAVAILABLE' | 'EMPTY';
  };
}

export interface RouteCandidateInfo {
  route_id: string;
  name: string;
  distance_km: number;
  max_wave_height_m: number;
  risk_rating: string;
  exposure_score: number;
  is_recommended: boolean;
  start_coordinates?: [number, number];
  end_coordinates?: [number, number];
  origin?: string;
  destination?: string;
}

const ALL_OPERATIONAL_MODES: Array<{
  id: OperationalMode;
  label: string;
  badge: string;
  icon: React.ReactNode;
  strategy: string;
}> = [
  {
    id: 'safest',
    label: 'Safest Corridor',
    badge: 'Min Risk',
    icon: <ShieldCheck size={13} />,
    strategy: 'Maximizes distance from squall advisory & naval firing buffers',
  },
  {
    id: 'balanced',
    label: 'Balanced Corridor',
    badge: 'Optimal',
    icon: <Compass size={13} />,
    strategy: 'Balanced transit time & wave height exposure along coast',
  },
  {
    id: 'direct',
    label: 'Direct Passage',
    badge: 'Fastest',
    icon: <Zap size={13} />,
    strategy: 'Direct bearing to target PFZ coordinate (highest weather sensitivity)',
  },
];

/** Extract all evaluated passage candidates from map layers */
export function extractRouteCandidates(layers: MapLayer[]): RouteCandidateInfo[] {
  const candidates: RouteCandidateInfo[] = [];
  const seen = new Set<string>();

  for (const layer of layers) {
    if (!layer.geojson) continue;
    const gj = layer.geojson as Record<string, any>;
    if (gj.type === 'Feature' && gj.properties && gj.properties.route_id) {
      const id = String(gj.properties.route_id);
      if (!seen.has(id)) {
        seen.add(id);
        const coords = gj.geometry && Array.isArray(gj.geometry.coordinates) ? gj.geometry.coordinates : undefined;
        const startCoord = coords && coords.length >= 2 ? (coords[0] as [number, number]) : undefined;
        const endCoord = coords && coords.length >= 2 ? (coords[coords.length - 1] as [number, number]) : undefined;

        candidates.push({
          route_id: id,
          name: gj.properties.name || id,
          distance_km: typeof gj.properties.distance_km === 'number' ? gj.properties.distance_km : 0,
          max_wave_height_m: typeof gj.properties.max_wave_height_m === 'number' ? gj.properties.max_wave_height_m : 0,
          risk_rating: gj.properties.risk_rating || 'LOW',
          exposure_score: typeof gj.properties.exposure_score === 'number' ? gj.properties.exposure_score : 0,
          is_recommended: Boolean(gj.properties.is_recommended),
          start_coordinates: startCoord,
          end_coordinates: endCoord,
          origin: gj.properties.origin,
          destination: gj.properties.destination,
        });
      }
    } else if (gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
      for (const feat of gj.features) {
        if (feat && feat.properties && feat.properties.route_id) {
          const id = String(feat.properties.route_id);
          if (!seen.has(id)) {
            seen.add(id);
            const coords = feat.geometry && Array.isArray(feat.geometry.coordinates) ? feat.geometry.coordinates : undefined;
            const startCoord = coords && coords.length >= 2 ? (coords[0] as [number, number]) : undefined;
            const endCoord = coords && coords.length >= 2 ? (coords[coords.length - 1] as [number, number]) : undefined;

            candidates.push({
              route_id: id,
              name: feat.properties.name || id,
              distance_km: typeof feat.properties.distance_km === 'number' ? feat.properties.distance_km : 0,
              max_wave_height_m: typeof feat.properties.max_wave_height_m === 'number' ? feat.properties.max_wave_height_m : 0,
              risk_rating: feat.properties.risk_rating || 'LOW',
              exposure_score: typeof feat.properties.exposure_score === 'number' ? feat.properties.exposure_score : 0,
              is_recommended: Boolean(feat.properties.is_recommended),
              start_coordinates: startCoord,
              end_coordinates: endCoord,
              origin: feat.properties.origin,
              destination: feat.properties.destination,
            });
          }
        }
      }
    }
  }
  return candidates;
}

/** Map an operational mode to a candidate from the actual candidates list */
export function matchModeToCandidate(mode: OperationalMode, candidates: RouteCandidateInfo[]): RouteCandidateInfo | undefined {
  if (!candidates.length) return undefined;

  if (mode === 'safest') {
    return (
      candidates.find((c) => c.route_id === 'ROUTE-A-INSHORE') ||
      candidates.find((c) => c.name.toLowerCase().includes('inshore') || c.name.toLowerCase().includes('sheltered')) ||
      candidates.find((c) => c.risk_rating === 'LOW') ||
      candidates[0]
    );
  }
  if (mode === 'balanced') {
    return (
      candidates.find((c) => c.route_id === 'ROUTE-C-BALANCED') ||
      candidates.find((c) => c.name.toLowerCase().includes('balanced'))
    );
  }
  if (mode === 'direct') {
    return (
      candidates.find((c) => c.route_id === 'ROUTE-B-DIRECT') ||
      candidates.find((c) => c.name.toLowerCase().includes('direct') || c.name.toLowerCase().includes('deep')) ||
      candidates[candidates.length - 1]
    );
  }
  return undefined;
}

/** A response-driven map legend & operational corridor selector. */
export default function MissionMapBrief({
  layers,
  selectedMode: controlledMode,
  onModeChange,
  language = 'en',
  onResetView,
  layerAvailability,
}: MissionMapBriefProps) {
  const [internalMode, setInternalMode] = useState<OperationalMode>('safest');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeMode = controlledMode ?? internalMode;

  const handleModeSelect = (mode: OperationalMode) => {
    setInternalMode(mode);
    onModeChange?.(mode);
  };

  if (!layers.length) {
    return (
      <div className="mission-map-brief map-brief-empty" role="status">
        <MapPinned size={17} />
        <span>{translateText('Ask a mission question to view its PFZ, route, and safety layers here.', language)}</span>
      </div>
    );
  }

  const pfzLayers = layers.filter((layer) => includesAny(layer, ['pfz', 'fishing']));
  const routeLayers = layers.filter((layer) => includesAny(layer, ['route', 'corridor', 'passage']));
  const hazardLayers = layers.filter((layer) =>
    includesAny(layer, ['hazard', 'warning', 'geofence', 'restriction', 'boundary', 'safety'])
  );

  const routeCandidates = extractRouteCandidates(layers);
  const activeCandidate = matchModeToCandidate(activeMode, routeCandidates);

  // Filter available mode options to those backed by actual candidates (or default full set if general mode)
  const availableModes = ALL_OPERATIONAL_MODES.filter((m) => {
    if (routeCandidates.length === 0) return true;
    return matchModeToCandidate(m.id, routeCandidates) !== undefined;
  });

  const activeStrategy = ALL_OPERATIONAL_MODES.find((m) => m.id === activeMode)?.strategy ?? '';

  return (
    <aside className={`mission-map-brief ${isCollapsed ? 'collapsed' : ''}`} aria-label="Mission map summary and corridor selection">
      <div className="map-brief-heading">
        <div className="map-brief-heading-left">
          <MapPinned size={15} />
          <span>{translateText('Mission map & corridors', language)}</span>
        </div>
        <div className="map-brief-heading-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onResetView && (
            <button
              type="button"
              className="map-brief-reset-btn"
              onClick={onResetView}
              title={translateText('Fit / Reset Map View', language)}
              aria-label={translateText('Fit / Reset Map View', language)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3px 5px',
                borderRadius: '4px',
              }}
            >
              <Focus size={13} />
            </button>
          )}
          <button
            type="button"
            className="map-brief-toggle-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand mission brief' : 'Collapse mission brief'}
            aria-label={isCollapsed ? 'Expand mission brief' : 'Collapse mission brief'}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {isCollapsed ? (
        <div className="map-brief-collapsed-summary">
          <span>{hazardLayers.length} {translateText('Hazards', language)}</span>
          {routeLayers.length > 0 && <span> · {routeLayers.length} {translateText('Routes', language)}</span>}
          {pfzLayers.length > 0 && <span> · {pfzLayers.length} {translateText('PFZ', language)}</span>}
        </div>
      ) : (
        <>
          <div className="map-brief-stats">
            <BriefStat
              icon={<Fish size={14} />}
              label={translateText('PFZ', language)}
              count={pfzLayers.length}
              active={pfzLayers.length > 0}
              unavailable={layerAvailability?.pfz === 'UNAVAILABLE'}
            />
            <BriefStat
              icon={<Route size={14} />}
              label={translateText('Routes', language)}
              count={routeCandidates.length || routeLayers.length}
              active={routeLayers.length > 0}
              unavailable={layerAvailability?.routes === 'UNAVAILABLE'}
            />
            <BriefStat
              icon={<AlertTriangle size={14} />}
              label={translateText('Hazards', language)}
              count={hazardLayers.length}
              active={hazardLayers.length > 0}
              critical
              unavailable={layerAvailability?.hazards === 'UNAVAILABLE'}
            />
          </div>

          {/* Operational corridor strategy selector when routes or PFZ exist */}
          {(routeLayers.length > 0 || pfzLayers.length > 0 || routeCandidates.length > 0) && (
            <div className="map-corridor-section">
              <div className="map-corridor-label">{translateText('Operational Strategy:', language)}</div>
              <div className="map-corridor-modes" role="radiogroup" aria-label="Operational navigation mode">
                {availableModes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`map-corridor-chip ${activeMode === m.id ? 'active' : ''}`}
                    onClick={() => handleModeSelect(m.id)}
                    aria-pressed={activeMode === m.id}
                    title={translateText(m.strategy, language)}
                  >
                    {m.icon}
                    <span>{translateText(m.label, language)}</span>
                    <span className="corridor-badge">{translateText(m.badge, language)}</span>
                  </button>
                ))}
              </div>

              <div className="map-corridor-info">
                <small>{translateText(activeStrategy, language)}</small>
                {activeCandidate ? (
                  <>
                    <div className="map-route-metrics-bar" style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span className="map-route-metric">
                        {translateText('Est. Distance:', language)} <strong>{activeCandidate.distance_km} km</strong>
                      </span>
                      <span className="map-route-metric">
                        {translateText('Max Wave:', language)} <strong>{activeCandidate.max_wave_height_m}m</strong>
                      </span>
                      <span className="map-route-metric">
                        {translateText('Exposure:', language)} <strong>{activeCandidate.exposure_score}</strong>
                      </span>
                      <span className="map-route-metric">
                        {translateText('Risk:', language)} <strong>{activeCandidate.risk_rating}</strong>
                      </span>
                    </div>

                    {(activeCandidate.start_coordinates || activeCandidate.origin) && (
                      <div
                        className="map-route-terminals"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '6px',
                          paddingTop: '6px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                          fontSize: '11px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 4px #10b981' }} />
                          <strong style={{ color: '#e2e8f0' }}>{translateText('Start:', language)}</strong>{' '}
                          {activeCandidate.origin || (activeCandidate.start_coordinates ? `${activeCandidate.start_coordinates[1].toFixed(2)}°N, ${activeCandidate.start_coordinates[0].toFixed(2)}°E` : 'Departure')}
                        </span>
                        <span style={{ color: '#64748b' }}>➔</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#f59e0b', boxShadow: '0 0 4px #f59e0b' }} />
                          <strong style={{ color: '#e2e8f0' }}>{translateText('Destination:', language)}</strong>{' '}
                          {activeCandidate.destination || (activeCandidate.end_coordinates ? `${activeCandidate.end_coordinates[1].toFixed(2)}°N, ${activeCandidate.end_coordinates[0].toFixed(2)}°E` : 'Target Bank')}
                        </span>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function BriefStat({
  icon,
  label,
  count,
  active,
  critical = false,
  unavailable = false,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  critical?: boolean;
  unavailable?: boolean;
}) {
  return (
    <div
      className={`map-brief-stat ${active ? 'active' : ''} ${critical && active ? 'critical' : ''} ${
        unavailable ? 'unavailable' : ''
      }`}
      style={unavailable ? { opacity: 0.6, fontStyle: 'italic' } : undefined}
    >
      {icon}
      <strong>{unavailable ? '—' : count}</strong>
      <span>{label}</span>
    </div>
  );
}

function includesAny(layer: MapLayer, terms: string[]): boolean {
  const haystack = `${layer.layer_id} ${layer.name} ${layer.style?.layer_category ?? ''}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}
