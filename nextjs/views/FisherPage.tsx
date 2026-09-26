'use client';

import { useState, useMemo, useEffect } from 'react';
import DynamicMapView from '../components/map/DynamicMapView';
import GuidedTripSetup from '../components/fisher/GuidedTripSetup';
import FisherDecisionSurface from '../components/fisher/FisherDecisionSurface';
import WhatIfSimulator from '../components/mission/WhatIfSimulator';
import OceanDetails from '../components/fisher/OceanDetails';
import PFZDetails from '../components/fisher/PFZDetails';
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
  const [mapTimeOffset, setMapTimeOffset] = useState<number>(0);

  const handleTimeOffsetChange = (hours: number) => {
    setMapTimeOffset(hours);
    const departureDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    const returnDate = new Date(departureDate.getTime() + 12 * 60 * 60 * 1000);
    chat.setMissionContext({
      ...chat.missionContext,
      departure_time: departureDate.toISOString(),
      return_time: returnDate.toISOString(),
    });
  };

  const { data: assessment, isLoading, error, isOffline, isExpired, assessTrip } = useTripAssessment();
  const { alerts, registerTrip, acknowledgeAlert } = useAlerts(chat.language);
  const { speak } = useSpokenGuidance({ language: chat.language });

  const { status: geoStatus, location, isTracking, startTracking, stopTracking } = useGeolocation();
  const { alerts: geofenceAlerts } = useGeofence(location, geoStatus, baseLayers); // We can use effectiveLayers, but baseLayers have the hazards/restrictions

  const handleToggleLocation = () => {
    if (isTracking) stopTracking();
    else startTracking();
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
    return mergeFisherLayers({
      baseLayers,
      harborCoords,
      originHarbor,
      status: assessment?.decision?.status || 'UNKNOWN',
      baselineRoutes: [],
      baselinePFZ: [],
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
              collaboration={chat.activeResponse?.agent_collaboration || (assessment as any)?.agent_collaboration}
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
          </div>
        )}
      </div>

      <div className="fisher-map-column" style={{ position: 'relative' }}>
        <LocationWarningsOverlay 
          status={geoStatus} 
          alerts={geofenceAlerts} 
          language={chat.language} 
        />
        <DynamicMapView
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
          timeOffsetHours={mapTimeOffset}
          onTimeOffsetChange={handleTimeOffsetChange}
        />
      </div>
    </main>
  );
}
