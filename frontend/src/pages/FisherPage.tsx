import { useState, useMemo, useEffect } from 'react';
import MapView from '../components/map/MapView';
import GuidedTripSetup from '../components/fisher/GuidedTripSetup';
import FisherDecisionSurface from '../components/fisher/FisherDecisionSurface';
import WhatIfSimulator from '../components/mission/WhatIfSimulator';
import OceanDetails from '../components/fisher/OceanDetails';
import PFZDetails from '../components/fisher/PFZDetails';
import TripPlanDetails from '../components/fisher/TripPlanDetails';
import type { useChat } from '../hooks/useChat';
import type { MapLayer } from '../types/contracts';
import { getHarborCoordinates, fetchAndFormatBaseLayers } from '../utils/geo';
import { mergeFisherLayers, formatFishermanPopup } from '../utils/fisher-map';
import { useTripAssessment } from '../hooks/useTripAssessment';
import { useAlerts } from '../hooks/useAlerts';
import FisherAlertPanel from '../components/fisher/FisherAlertPanel';
import { useSpokenGuidance } from '../hooks/useSpokenGuidance';
import { useGeolocation } from '../hooks/useGeolocation';
import { useGeofence } from '../hooks/useGeofence';
import LocationWarningsOverlay from '../components/map/LocationWarningsOverlay';
import { RefreshCw } from 'lucide-react';
import { DEFAULT_MISSION_CONTEXT } from '../types/mission';

export interface FisherPageProps {
  chat: ReturnType<typeof useChat>;
  theme: 'light' | 'dark';
  mobileView: 'chat' | 'map';
  onStartCall: () => void;
  onOpenEvidence: () => void;
  onBack: () => void;
  onViewMap: () => void;
}

export default function FisherPage({
  chat,
  theme,
  mobileView: _mobileView,
  onStartCall: _onStartCall,
  onOpenEvidence: _onOpenEvidence,
  onBack: _onBack,
  onViewMap,
}: FisherPageProps) {
  const originHarbor = chat.missionContext.origin_harbor || 'Ratnagiri';
  const harborCoords = useMemo(() => getHarborCoordinates(originHarbor), [originHarbor]);
  
  const [baseLayers, setBaseLayers] = useState<MapLayer[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'decision' | 'voyage'>('decision');

  const { data: assessment, isLoading, error, isOffline, isExpired, assessTrip } = useTripAssessment();
  const { alerts, registerTrip, acknowledgeAlert } = useAlerts(chat.language);
  const { speak } = useSpokenGuidance({ language: chat.language });

  const { status: geoStatus, location, isTracking, startTracking, stopTracking } = useGeolocation();
  const { alerts: geofenceAlerts } = useGeofence(location, geoStatus, baseLayers); // We can use effectiveLayers, but baseLayers have the hazards/restrictions

  const handleToggleLocation = () => {
    if (isTracking) stopTracking();
    else startTracking();
  };

  const handleResetTrip = () => {
    chat.clearChat();
    chat.setMissionContext(DEFAULT_MISSION_CONTEXT);
    setSidebarTab('voyage');
  };

  // 1. Fetch base geofences & boundaries
  useEffect(() => {
    fetchAndFormatBaseLayers()
      .then(setBaseLayers)
      .catch(() => setBaseLayers([]));
  }, []);

  // 2. Auto-assess trip when context changes
  useEffect(() => {
    assessTrip({
      origin_harbor: chat.missionContext.origin_harbor,
      craft_profile: chat.missionContext.craft_profile || 'motorized_boat',
      departure_time: chat.missionContext.departure_time,
      return_time: chat.missionContext.return_time,
      language_preference: chat.language,
      data_mode: 'HYBRID',
    });
    
    registerTrip({
      origin_harbor: chat.missionContext.origin_harbor || 'Ratnagiri',
      craft_profile: chat.missionContext.craft_profile || 'motorized_boat',
      departure_time: chat.missionContext.departure_time,
      return_time: chat.missionContext.return_time,
      language: chat.language,
    });
  }, [
    chat.missionContext.origin_harbor,
    chat.missionContext.craft_profile,
    chat.missionContext.departure_time,
    chat.missionContext.return_time,
    chat.language,
    assessTrip,
    registerTrip,
  ]);

  const effectiveLayers = useMemo(() => {
    const chatLayers = assessment?.map_layers?.layers || [];
    
    // Convert backend route_candidates to MapLayers
    const routeLayers: MapLayer[] = (assessment?.route_candidates || []).map((r, i) => ({
      layer_id: `route_${r.route_id || i}`,
      name: r.name || `Route ${i + 1}`,
      layer_type: 'geojson',
      visible: true,
      style: {
        layer_category: 'route',
        risk_rating: r.risk_rating,
        color: r.risk_rating === 'HIGH_RISK' ? '#ef4444' : r.risk_rating === 'MODERATE' ? '#eab308' : '#22c55e',
      },
      geojson: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: r.waypoints || []
          },
          properties: { ...r }
        }]
      }
    }));

    // Convert backend pfz_candidates to MapLayers
    const pfzLayers: MapLayer[] = (assessment?.pfz_candidates || []).map((p, i) => ({
      layer_id: `pfz_${p.candidate_id || i}`,
      name: `PFZ Rank ${p.rank || i + 1}`,
      layer_type: 'geojson',
      visible: true,
      style: {
        layer_category: 'pfz',
        color: '#10b981',
      },
      geojson: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [p.longitude, p.latitude]
          },
          properties: { ...p }
        }]
      }
    }));

    return mergeFisherLayers({
      baseLayers,
      harborCoords,
      originHarbor,
      status: assessment?.decision?.status || 'UNKNOWN',
      baselineRoutes: routeLayers,
      baselinePFZ: pfzLayers,
      baselineHazards: [],
      chatLayers: chatLayers,
    });
  }, [baseLayers, harborCoords, originHarbor, assessment]);

  const layerAvailability = {
    pfz: assessment?.pfz_candidates?.length ? 'AVAILABLE' : 'EMPTY',
    routes: assessment?.route_candidates?.length ? 'AVAILABLE' : 'EMPTY',
    hazards: assessment?.alerts?.length ? 'AVAILABLE' : 'EMPTY',
  } as const;

  return (
    <main className={`app-main fisher-page`} role="main">
      <div className="fisher-content-column">
        {sidebarTab === 'voyage' ? (
          <div className="fisher-voyage-pane" style={{ background: 'white', zIndex: 10, flex: 1, minHeight: '100%' }}>
            <GuidedTripSetup
              context={chat.missionContext}
              language={chat.language}
              onContextChange={chat.setMissionContext}
              onComplete={() => setSidebarTab('decision')}
              onCancel={() => setSidebarTab('decision')}
            />
          </div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '12px 16px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Trip Dashboard</h2>
              <button 
                onClick={handleResetTrip}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                <RefreshCw size={16} />
                Reset Trip
              </button>
            </div>

            <FisherAlertPanel 
              alerts={alerts} 
              language={chat.language} 
              onAcknowledge={acknowledgeAlert} 
              onReplay={(text) => speak(text)} 
            />

            <FisherDecisionSurface
              assessment={assessment}
              isLoading={isLoading}
              error={error}
              isOffline={isOffline}
              isExpired={isExpired}
              activeDiff={chat.activeDiff}
              missionContext={chat.missionContext}
              language={chat.language}
              onOpenVoyageSettings={() => setSidebarTab('voyage')}
              onViewMap={onViewMap}
            />

            <WhatIfSimulator
              currentContext={chat.missionContext}
              currentStatus={assessment?.decision?.status || 'UNKNOWN'}
              language={chat.language}
              isLoading={chat.isLoading}
              activeDiff={chat.activeDiff}
              onSimulate={(params, query) => chat.simulateWhatIf(params, query, assessment?.assessment_id)}
              onApplyContext={(newCtx) => chat.setMissionContext(newCtx)}
            />

            <PFZDetails assessment={assessment} language={chat.language} />
            <OceanDetails assessment={assessment} language={chat.language} />
            <TripPlanDetails assessment={assessment} language={chat.language} />
          </div>
        )}
      </div>

      <div className="fisher-map-column" style={{ position: 'relative' }}>
        <LocationWarningsOverlay 
          status={geoStatus} 
          alerts={geofenceAlerts} 
          language={chat.language} 
        />
        <MapView
          layers={effectiveLayers}
          theme={theme}
          center={harborCoords}
          zoom={9.5}
          language={chat.language}
          customPopupRenderer={formatFishermanPopup}
          layerAvailability={layerAvailability}
          hideAdvancedControls={true}
          liveLocation={location}
          liveLocationStatus={geoStatus}
          isTrackingLocation={isTracking}
          onToggleLocation={handleToggleLocation}
          craftProfile={chat.missionContext.craft_profile || 'motorized_boat'}
        />
      </div>
    </main>
  );
}
