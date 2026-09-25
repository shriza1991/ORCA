import { useState, useEffect, useRef } from 'react';
import {
  Ship,
  Play,
  Pause,
  RotateCcw,
  Bell,
  Gauge,
  Compass,
  AlertTriangle,
  Radio,
  MapPin,
  Crosshair,
  Navigation,
} from 'lucide-react';
import {
  getDemoVessels,
  getDemoVesselReplay,
  getDemoNotifications,
  getDemoSectorOperationalAlerts,
  getDemoEstimatedTrajectory,
  type DemoVessel,
  type VesselPosition,
  type DemoNotification,
  type VesselHazardOperationalAlert,
} from '../../api/client';
import type { MapLayer } from '../../types/contracts';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface FleetTrackingDeckProps {
  selectedSector?: string;
  onVesselSelect?: (vesselId: string | null) => void;
  onReplayUpdate?: (layer: MapLayer | null) => void;
  onAlertSelectionChange?: (alert: VesselHazardOperationalAlert | null) => void;
  onAlertWhy?: (alert: VesselHazardOperationalAlert) => void;
  onTrajectoryUpdate?: (layer: MapLayer | null) => void;
  language?: SupportedLanguage;
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '--:--';
  if (ts.includes('T')) {
    const timePart = ts.split('T')[1];
    return timePart ? timePart.slice(0, 5) : ts;
  }
  return ts;
}

function computeDeadReckoningTrajectory(
  lat: number,
  lon: number,
  speedKnots: number,
  headingDeg: number,
  horizonMinutes: number = 30,
  stepMinutes: number = 5,
): [number, number][] {
  const points: [number, number][] = [];
  const earthRadiusM = 6371000.0;
  for (let offset = 0; offset <= horizonMinutes; offset += stepMinutes) {
    const distanceM = (speedKnots * 1852.0 * offset) / 60.0;
    const bearing = (headingDeg * Math.PI) / 180.0;
    const lat1 = (lat * Math.PI) / 180.0;
    const lon1 = (lon * Math.PI) / 180.0;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distanceM / earthRadiusM) +
        Math.cos(lat1) * Math.sin(distanceM / earthRadiusM) * Math.cos(bearing)
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distanceM / earthRadiusM) * Math.cos(lat1),
        Math.cos(distanceM / earthRadiusM) - Math.sin(lat1) * Math.sin(lat2)
      );
    points.push([(lon2 * 180.0) / Math.PI, (lat2 * 180.0) / Math.PI]);
  }
  return points;
}

export default function FleetTrackingDeck({
  selectedSector,
  onVesselSelect,
  onReplayUpdate,
  onAlertSelectionChange,
  onAlertWhy,
  onTrajectoryUpdate,
  language = 'en',
}: FleetTrackingDeckProps) {
  const [vessels, setVessels] = useState<DemoVessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [positions, setPositions] = useState<VesselPosition[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<DemoNotification[]>([]);
  const [operationalAlerts, setOperationalAlerts] = useState<VesselHazardOperationalAlert[]>([]);
  const [selectedOperationalAlertId, setSelectedOperationalAlertId] = useState<string | null>(null);
  const [operationalAlertsUnavailable, setOperationalAlertsUnavailable] = useState<boolean>(false);
  const [isBackendOffline, setIsBackendOffline] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReplayLoading, setIsReplayLoading] = useState<boolean>(false);
  const [isReplayUnavailable, setIsReplayUnavailable] = useState<boolean>(false);
  const [trajectoryStatus, setTrajectoryStatus] = useState<{ available: boolean; reason?: string } | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<number>(0);
  const endHoldCountRef = useRef<number>(0);
  const alertInspectionRef = useRef<boolean>(false);

  // Sector change effect: reload vessels & alerts, clear previous replay
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setIsBackendOffline(false);
    setIsPlaying(false);
    setCurrentIndex(0);
    setPositions([]);
    setIsReplayUnavailable(false);
    setIsReplayLoading(false);
    setOperationalAlerts([]);
    setOperationalAlertsUnavailable(false);
    setSelectedOperationalAlertId(null);
    onAlertSelectionChange?.(null);
    onReplayUpdate?.(null);
    onTrajectoryUpdate?.(null);
    setTrajectoryStatus(null);

    Promise.allSettled([
      getDemoVessels(selectedSector),
      getDemoNotifications(selectedSector),
      selectedSector ? getDemoSectorOperationalAlerts(selectedSector) : Promise.resolve({ alerts: [] }),
    ]).then(([vesselsRes, notifsRes, operationalAlertsRes]) => {
      if (isCancelled) return;

      if (vesselsRes.status === 'fulfilled') {
        const vesselList = vesselsRes.value;
        setVessels(vesselList);
        if (vesselList.length > 0) {
          // Preserve previously selected vessel if it belongs to the new sector; else select first vessel
          setSelectedVesselId((prev) => {
            const stillInSector = vesselList.some((v) => v.public_id === prev);
            return stillInSector ? prev : vesselList[0].public_id;
          });
        } else {
          // Zero vessels in sector: clear selection, telemetry, and map track
          setSelectedVesselId(null);
          setPositions([]);
          onReplayUpdate?.(null);
        }
      } else {
        // Backend offline or error: zero telemetry fabricated
        setIsBackendOffline(true);
        setVessels([]);
        setSelectedVesselId(null);
        setPositions([]);
        onReplayUpdate?.(null);
      }

      if (notifsRes.status === 'fulfilled') {
        setNotifications(notifsRes.value);
      } else {
        setNotifications([]);
      }

      if (operationalAlertsRes.status === 'fulfilled') {
        setOperationalAlerts(operationalAlertsRes.value.alerts);
      } else {
        setOperationalAlerts([]);
        setOperationalAlertsUnavailable(true);
      }

      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedSector]);

  // Reconcile local inspection state with the latest canonical alert result.
  // A vanished alert must not leave a phantom vessel/hazard highlight behind.
  useEffect(() => {
    if (
      selectedOperationalAlertId
      && !operationalAlerts.some((alert) => alert.alert_id === selectedOperationalAlertId)
    ) {
      setSelectedOperationalAlertId(null);
      onAlertSelectionChange?.(null);
    }
  }, [operationalAlerts, selectedOperationalAlertId, onAlertSelectionChange]);

  // Selected vessel change effect: fetch canonical replay trajectory
  useEffect(() => {
    let isCancelled = false;
    if (!selectedVesselId) {
      setPositions([]);
      setIsReplayUnavailable(false);
      setIsReplayLoading(false);
      onReplayUpdate?.(null);
      onTrajectoryUpdate?.(null);
      setTrajectoryStatus(null);
      return;
    }

    setIsReplayLoading(true);
    setIsReplayUnavailable(false);

    getDemoVesselReplay(selectedVesselId)
      .then((pos) => {
        if (isCancelled) return;
        setIsReplayLoading(false);
        if (Array.isArray(pos) && pos.length > 0) {
          setPositions(pos);
          endHoldCountRef.current = 0;
          if (alertInspectionRef.current) {
            alertInspectionRef.current = false;
            setCurrentIndex(pos.length - 1);
            setIsPlaying(false);
          } else {
            // Autoplay from departure
            setCurrentIndex(0);
            setIsPlaying(true);
          }
          setIsReplayUnavailable(false);
        } else {
          setPositions([]);
          setIsPlaying(false);
          setIsReplayUnavailable(true);
          onReplayUpdate?.(null);
        }
      })
      .catch(() => {
        if (isCancelled) return;
        setIsReplayLoading(false);
        setPositions([]);
        setIsPlaying(false);
        setIsReplayUnavailable(true);
        onReplayUpdate?.(null);
      });

    getDemoEstimatedTrajectory(selectedVesselId).then((trajectory) => {
      if (isCancelled || trajectory.status !== 'AVAILABLE' || !trajectory.points?.length) {
        if (!isCancelled) {
          setTrajectoryStatus({ available: false, reason: trajectory.reason });
        }
        return;
      }
      setTrajectoryStatus({ available: true });
    }).catch(() => {
      if (!isCancelled) {
        setTrajectoryStatus({ available: false });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedVesselId]);

  // Synchronize active selected vessel with parent deck
  useEffect(() => {
    onVesselSelect?.(selectedVesselId);
  }, [selectedVesselId, onVesselSelect]);

  // Autoplay ticker for trajectory scrubber: continuously advances along voyage track
  // and smoothly loops back to departure after a brief hold at destination
  useEffect(() => {
    if (!isPlaying || positions.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= positions.length - 1) {
          if (endHoldCountRef.current < 2) {
            endHoldCountRef.current += 1;
            return prev;
          }
          endHoldCountRef.current = 0;
          return 0;
        }
        endHoldCountRef.current = 0;
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, positions]);

  // Generate dynamic MapLayer for the vessel trajectory and current position
  useEffect(() => {
    if (!onReplayUpdate) return;
    if (positions.length === 0) {
      onReplayUpdate(null);
      onTrajectoryUpdate?.(null);
      return;
    }

    const currentPos = positions[currentIndex] || positions[0];
    const pastCoordinates = (
      positions.length >= 2 && currentIndex === 0
        ? positions.slice(0, 2)
        : positions.slice(0, currentIndex + 1)
    ).map((p) => [p.longitude, p.latitude]);

    // Compute bounding box encompassing the entire vessel voyage
    let minLng = positions[0].longitude;
    let maxLng = positions[0].longitude;
    let minLat = positions[0].latitude;
    let maxLat = positions[0].latitude;

    for (const p of positions) {
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
    }

    const replayFeatures: any[] = [
      // Trajectory path
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: pastCoordinates,
        },
        properties: {
          label: 'Historical Trajectory',
          vessel_id: currentPos.vessel_id,
        },
      },
      // Current vessel point
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [currentPos.longitude, currentPos.latitude],
        },
        properties: {
          label: `Vessel Position @ ${formatTimestamp(currentPos.timestamp)}`,
          speed_knots: currentPos.speed_knots,
          heading_deg: currentPos.heading_deg,
          vessel_id: currentPos.vessel_id,
        },
      },
    ];

    // Canonical heading indicator vector (when heading is valid and available)
    if (
      typeof currentPos.heading_deg === 'number' &&
      !isNaN(currentPos.heading_deg) &&
      currentPos.heading_deg >= 0 &&
      currentPos.heading_deg <= 360
    ) {
      const headingRad = (currentPos.heading_deg * Math.PI) / 180;
      const latRad = (currentPos.latitude * Math.PI) / 180;
      const vectorLengthDeg = 0.015;
      const targetLng = currentPos.longitude + (vectorLengthDeg * Math.sin(headingRad)) / Math.max(Math.cos(latRad), 0.1);
      const targetLat = currentPos.latitude + vectorLengthDeg * Math.cos(headingRad);

      replayFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [currentPos.longitude, currentPos.latitude],
            [targetLng, targetLat],
          ],
        },
        properties: {
          label: `Heading: ${currentPos.heading_deg}°`,
          vessel_id: currentPos.vessel_id,
          is_heading_indicator: true,
        },
      });
    }

    const replayLayer: MapLayer = {
      layer_id: 'layer_fleet_vessel_replay',
      name: `Vessel Replay (${currentPos.vessel_id})`,
      layer_type: 'geojson',
      visible: true,
      style: {
        color: '#06b6d4',
        opacity: 0.95,
        line_width: 3.5,
        circle_radius: 9,
        layer_category: 'fleet_replay',
      },
      properties: {
        vessel_id: currentPos.vessel_id,
        focus_trigger: focusTrigger,
        bbox: [minLng, minLat, maxLng, maxLat],
      },
      geojson: {
        type: 'FeatureCollection',
        bbox: [minLng, minLat, maxLng, maxLat],
        features: replayFeatures,
      },
    };

    onReplayUpdate(replayLayer);

    // Generate dynamic MapLayer for the vessel predicted path (yellow dotted line)
    if (onTrajectoryUpdate) {
      if (trajectoryStatus?.available === false) {
        onTrajectoryUpdate(null);
      } else {
        const trajectoryFeatures: any[] = [];

        // 1. Remaining planned voyage route to destination
        if (positions.length > currentIndex + 1) {
          const remainingCoordinates = positions.slice(currentIndex).map((p) => [p.longitude, p.latitude]);
          if (remainingCoordinates.length >= 2) {
            trajectoryFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: remainingCoordinates,
              },
              properties: {
                label: `Predicted Route to Destination (${formatTimestamp(positions[positions.length - 1]?.timestamp)})`,
                vessel_id: currentPos.vessel_id,
                trajectory_type: 'predicted_route',
              },
            });
          }
        }

        // 2. Dead-reckoning forward projection (30 min ahead based on speed and heading)
        if (
          typeof currentPos.speed_knots === 'number' &&
          typeof currentPos.heading_deg === 'number' &&
          !isNaN(currentPos.speed_knots) &&
          !isNaN(currentPos.heading_deg) &&
          currentPos.speed_knots > 0
        ) {
          const deadReckoningPoints = computeDeadReckoningTrajectory(
            currentPos.latitude,
            currentPos.longitude,
            currentPos.speed_knots,
            currentPos.heading_deg,
            30,
            5,
          );
          if (deadReckoningPoints.length >= 2) {
            trajectoryFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: deadReckoningPoints,
              },
              properties: {
                label: `Predicted Dead Reckoning (Next 30 min @ ${currentPos.speed_knots} kts)`,
                vessel_id: currentPos.vessel_id,
                trajectory_type: 'dead_reckoning',
              },
            });
          }
        }

        if (trajectoryFeatures.length > 0) {
          const trajectoryLayer: MapLayer = {
            layer_id: 'layer_fleet_estimated_trajectory',
            name: `Predicted Path — next 30 min (${currentPos.vessel_id})`,
            layer_type: 'geojson',
            visible: true,
            style: {
              color: '#facc15',
              opacity: 0.95,
              line_width: 3,
              line_dasharray: [0, 2],
              layer_category: 'estimated_trajectory',
            },
            properties: {
              vessel_id: currentPos.vessel_id,
            },
            geojson: {
              type: 'FeatureCollection',
              features: trajectoryFeatures,
            },
          };
          onTrajectoryUpdate(trajectoryLayer);
        } else {
          onTrajectoryUpdate(null);
        }
      }
    }
  }, [positions, currentIndex, focusTrigger, onReplayUpdate, onTrajectoryUpdate, trajectoryStatus]);

  const currentPos = positions[currentIndex] || positions[0];
  const selectedVessel = vessels.find((v) => v.public_id === selectedVesselId) || null;
  const selectedOperationalAlert = operationalAlerts.find(
    (alert) => alert.alert_id === selectedOperationalAlertId,
  ) || null;

  const inspectOperationalAlert = (alert: VesselHazardOperationalAlert) => {
    // IDs are canonical backend identifiers. Refuse an incomplete or stale
    // alert rather than deriving operational context from display text.
    if (
      alert.sector_id !== selectedSector
      || !alert.vessel_id
      || !alert.hazard_id
    ) {
      return;
    }

    if (alert.vessel_id !== selectedVesselId) {
      alertInspectionRef.current = true;
      setSelectedVesselId(alert.vessel_id);
    } else {
      setCurrentIndex(positions.length > 0 ? positions.length - 1 : 0);
      setIsPlaying(false);
      endHoldCountRef.current = 0;
    }
    setSelectedOperationalAlertId(alert.alert_id);
    // Existing replay focus maps the canonical latest replay position. It
    // remains the sole source for vessel coordinates.
    setFocusTrigger((count) => count + 1);
    onAlertSelectionChange?.(alert);
  };

  const clearOperationalAlertInspection = () => {
    setSelectedOperationalAlertId(null);
    onAlertSelectionChange?.(null);
  };

  return (
    <div className="fleet-tracking-deck" aria-label="Fleet Surveillance & Vessel Replay Deck">
      <div className="fleet-deck-header">
        <div>
          <h3>{translateText('Maritime Fleet Surveillance & Trajectory Replay', language)}</h3>
          <p className="fleet-deck-subtitle">
            {translateText('Auditing active coastal vessel positions, time-series GPS replay logs, and multi-agency broadcast alerts.', language)}
          </p>
        </div>
      </div>

      {isBackendOffline && (
        <div className="fleet-offline-banner" style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '10px 14px',
          margin: '0 0 14px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#ef4444',
          fontSize: '13px',
        }}>
          <AlertTriangle size={18} />
          <div>
            <strong>{translateText('BACKEND OFFLINE — SURVEILLANCE DATA UNAVAILABLE', language)}</strong>
            <p style={{ margin: '2px 0 0 0', opacity: 0.85, fontSize: '12px' }}>
              {translateText('Cannot connect to SAMUDRA backend API. Synthetic telemetry, GPS replay tracks, and broadcast alerts are suspended. Offline fallback preserves sector navigation only.', language)}
            </p>
          </div>
        </div>
      )}

      <div className="fleet-workspace-grid">
        {/* Left Column: Vessel Selection & Telemetry Scrubber */}
        <section className="fleet-vessel-pane">
          <div className="fleet-section-title">
            <Ship size={16} />
            <span>{translateText('Monitored Coastal Fleet', language)} ({vessels.length})</span>
          </div>

          {isLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              {translateText('Loading monitored sector fleet...', language)}
            </div>
          ) : vessels.length === 0 ? (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              margin: '8px 0',
            }}>
              <Ship size={28} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 600, fontSize: '13px' }}>
                {translateText('No Monitored Vessels in this Sector', language)}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                {translateText('No coastal vessels currently operating in this surveillance sector.', language)}
              </p>
            </div>
          ) : (
            <div className="fleet-vessel-list">
              {vessels.map((v) => {
                const isSelected = v.public_id === selectedVesselId;
                return (
                  <button
                    key={v.public_id}
                    type="button"
                    className={`fleet-vessel-card ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      if (selectedVesselId === v.public_id) {
                        setCurrentIndex(0);
                        endHoldCountRef.current = 0;
                        setIsPlaying(true);
                      } else {
                        setSelectedVesselId(v.public_id);
                      }
                    }}
                  >
                    <div className="vessel-card-top">
                      <strong className="vessel-name">{v.name}</strong>
                      <span className="vessel-type-badge">{v.vessel_type.replace('_', ' ')}</span>
                    </div>
                    <div className="vessel-specs">
                      <span>{translateText('Length:', language)} {v.length_m}m</span>
                      <span>{translateText('Home:', language)} {v.home_harbor_id}</span>
                      {v.metadata_json?.engine_hp && <span>{translateText('Engine:', language)} {v.metadata_json.engine_hp} HP</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Telemetry Replay Status / Unavailable State */}
          {selectedVessel && isReplayLoading && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              {translateText('Loading vessel replay telemetry...', language)}
            </div>
          )}

          {selectedVessel && !isReplayLoading && isReplayUnavailable && (
            <div className="fleet-replay-unavailable-card" style={{
              padding: '14px 16px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              margin: '12px 0',
              fontSize: '13px',
              color: '#f87171',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontWeight: 600 }}>
                <AlertTriangle size={15} />
                <span>{translateText('Surveillance Replay Unavailable', language)}</span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>
                {translateText(`GPS replay trajectory is unavailable for ${selectedVessel.name}. Operational coordinates will not be fabricated.`, language)}
              </p>
            </div>
          )}

          {/* Time-series GPS Scrubber */}
          {selectedVessel && !isReplayLoading && !isReplayUnavailable && currentPos && positions.length > 0 && (
            <div className="fleet-scrubber-card">
              <div className="scrubber-header">
                <div>
                  <span className="scrubber-eyebrow">{translateText('GPS Trajectory Replay', language)}</span>
                  <h4>{selectedVessel.name}</h4>
                </div>
                <div className="scrubber-controls">
                  <button
                    type="button"
                    className="scrubber-btn focus-btn"
                    onClick={() => setFocusTrigger((c) => c + 1)}
                    title={translateText('Auto zoom into trajectory', language)}
                  >
                    <Crosshair size={13} />
                    <span>{translateText('Focus', language)}</span>
                  </button>
                  <button
                    type="button"
                    className="scrubber-btn"
                    onClick={() => {
                      if (!isPlaying && currentIndex >= positions.length - 1) {
                        setCurrentIndex(0);
                        endHoldCountRef.current = 0;
                      }
                      setIsPlaying(!isPlaying);
                    }}
                    title={isPlaying ? translateText('Pause', language) : translateText('Play', language)}
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    <span>{isPlaying ? translateText('Pause', language) : translateText('Play', language)}</span>
                  </button>
                  <button
                    type="button"
                    className="scrubber-btn reset"
                    onClick={() => {
                      setCurrentIndex(0);
                      endHoldCountRef.current = 0;
                      setIsPlaying(true);
                    }}
                    title={translateText('Reset to departure', language)}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              {/* Slider timeline */}
              <div className="scrubber-slider-row">
                <input
                  type="range"
                  min="0"
                  max={Math.max(positions.length - 1, 0)}
                  value={currentIndex}
                  onChange={(e) => {
                    setCurrentIndex(Number(e.target.value));
                    endHoldCountRef.current = 0;
                    setIsPlaying(false);
                  }}
                  className="scrubber-slider"
                />
                <div className="scrubber-time-labels">
                  <span>{translateText('Start', language)} ({formatTimestamp(positions[0]?.timestamp)})</span>
                  <span className="current-time-pill">T = {formatTimestamp(currentPos.timestamp)}</span>
                  <span>{translateText('End', language)} ({formatTimestamp(positions[positions.length - 1]?.timestamp)})</span>
                </div>
              </div>

              {/* Real-time Telemetry Cards */}
              <div className="scrubber-telemetry-grid">
                <div className="telemetry-pill">
                  <Gauge size={14} />
                  <span>{translateText('Speed:', language)} <strong>{currentPos.speed_knots} kts</strong></span>
                </div>
                <div className="telemetry-pill">
                  <Compass size={14} />
                  <span>{translateText('Heading:', language)} <strong>{currentPos.heading_deg}°</strong></span>
                </div>
                <div className="telemetry-pill">
                  <MapPin size={14} />
                  <span>{translateText('Pos:', language)} <strong>{currentPos.latitude.toFixed(3)}°N, {currentPos.longitude.toFixed(3)}°E</strong></span>
                </div>
                <div className="telemetry-pill">
                  <Navigation size={14} style={{ color: '#10b981' }} />
                  <span>{translateText('Start:', language)} <strong>{selectedVessel?.home_harbor_id ? selectedVessel.home_harbor_id.replace('harbor-', '').replace(/^./, (c) => c.toUpperCase()) : `${positions[0].latitude.toFixed(2)}°N, ${positions[0].longitude.toFixed(2)}°E`}</strong></span>
                </div>
                <div className="telemetry-pill">
                  <MapPin size={14} style={{ color: '#f59e0b' }} />
                  <span>{translateText('Dest:', language)} <strong>{`${positions[positions.length - 1].latitude.toFixed(2)}°N, ${positions[positions.length - 1].longitude.toFixed(2)}°E`}</strong></span>
                </div>
              </div>
              <p className="scrubber-eyebrow" style={{ marginTop: '10px' }}>
                {trajectoryStatus?.available
                  ? translateText('Estimated trajectory — next 30 min', language)
                  : trajectoryStatus && translateText(`Estimated trajectory unavailable${trajectoryStatus.reason ? `: ${trajectoryStatus.reason}` : ''}`, language)}
              </p>
            </div>
          )}
        </section>

        {/* Right Column: Fleet Broadcast Alert Feed */}
        <section className="fleet-alerts-pane">
          <div className="fleet-section-title">
            <Radio size={16} />
            <span>{translateText('Operational Hazard Alerts', language)} ({operationalAlerts.length})</span>
          </div>

          {operationalAlertsUnavailable ? (
            <p style={{ color: '#f97316', fontSize: '13px', padding: '8px 0' }}>
              {translateText('Operational hazard alerts unavailable.', language)}
            </p>
          ) : operationalAlerts.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '13px', padding: '8px 0' }}>
              {translateText('No vessels currently in an active hazard area.', language)}
            </p>
          ) : operationalAlerts.map((alert) => (
            <button
              key={alert.alert_id}
              type="button"
              aria-pressed={selectedOperationalAlertId === alert.alert_id}
              className={`fleet-alert-card ${alert.severity === 'WARNING' ? 'warning' : 'info'} ${selectedOperationalAlertId === alert.alert_id ? 'active' : ''}`}
              onClick={() => inspectOperationalAlert(alert)}
            >
              <div className="alert-card-top">
                <div className="alert-title-group"><AlertTriangle size={15} className="alert-icon" /><strong>{translateText('Vessel in Active Hazard Area', language)}</strong></div>
                <span className="alert-severity-pill">{alert.severity}</span>
              </div>
              <p className="alert-message">{alert.summary}</p>
              <div className="alert-card-footer"><span>{alert.vessel_id} · {alert.hazard_id}</span><span>{new Date(alert.observed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
            </button>
          ))}

          {selectedOperationalAlert && (
            <section className="fleet-alert-inspection" aria-label="Operational alert inspection" style={{ marginTop: '12px', padding: '12px', border: '1px solid rgba(250, 204, 21, 0.5)', borderRadius: '8px' }}>
              <div className="fleet-section-title">
                <Crosshair size={16} />
                <span>{translateText('Alert Inspection', language)}</span>
              </div>
              <p className="alert-message">{translateText('Vessel in Active Hazard Area', language)}</p>
              <div className="alert-card-footer"><span>{translateText('Vessel:', language)} {selectedOperationalAlert.vessel_id}</span><span>{translateText('Hazard:', language)} {selectedOperationalAlert.hazard_id}</span></div>
              <div className="alert-card-footer"><span>{translateText('Sector:', language)} {selectedOperationalAlert.sector_id}</span><span>{translateText('Severity:', language)} {selectedOperationalAlert.severity}</span></div>
              <div className="alert-card-footer"><span>{translateText('Observed:', language)} {new Date(selectedOperationalAlert.observed_at).toLocaleString()}</span><span>{translateText('Association:', language)} IN_HAZARD_AREA</span></div>
              <button type="button" className="scrubber-btn" onClick={clearOperationalAlertInspection}>
                {translateText('Return to Surveillance', language)}
              </button>
              <button type="button" className="scrubber-btn focus-btn" onClick={() => onAlertWhy?.(selectedOperationalAlert)}>
                {translateText('Why? Evidence & Audit', language)}
              </button>
            </section>
          )}

          <div className="fleet-section-title" style={{ marginTop: '14px' }}>
            <Bell size={16} />
            <span>{translateText('Maritime Broadcast Alerts', language)} ({notifications.length})</span>
          </div>
          <div className="fleet-alerts-list">
            {notifications.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
                {translateText('No active maritime broadcast alerts in this sector.', language)}
              </p>
            ) : (
              notifications.map((notif) => {
                const isWarning = notif.severity === 'WARNING';
                const isCritical = notif.severity === 'CRITICAL';

                return (
                  <article
                    key={notif.public_id}
                    className={`fleet-alert-card ${isCritical ? 'critical' : isWarning ? 'warning' : 'info'}`}
                  >
                    <div className="alert-card-top">
                      <div className="alert-title-group">
                        {isCritical || isWarning ? (
                          <AlertTriangle size={15} className="alert-icon" />
                        ) : (
                          <Bell size={15} className="alert-icon" />
                        )}
                        <strong>{translateText(notif.title, language)}</strong>
                      </div>
                      <span className="alert-severity-pill">{notif.severity}</span>
                    </div>
                    <p className="alert-message">{translateText(notif.message, language)}</p>
                    <div className="alert-card-footer">
                      <span>{translateText('Role:', language)} {notif.recipient_role}</span>
                      <span>{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
