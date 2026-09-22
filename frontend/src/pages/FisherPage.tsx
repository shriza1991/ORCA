import { useState, useMemo, useEffect } from 'react';
import MapView from '../components/map/MapView';
import GuidedTripSetup from '../components/fisher/GuidedTripSetup';
import FisherDecisionSurface from '../components/fisher/FisherDecisionSurface';
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

  const { data: assessment, isLoading, error, assessTrip } = useTripAssessment();
  const { alerts, registerTrip, acknowledgeAlert } = useAlerts(chat.language);
  const { speak } = useSpokenGuidance({ language: chat.language });

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
              language={chat.language}
              onOpenVoyageSettings={() => setSidebarTab('voyage')}
              onViewMap={onViewMap}
            />

            <PFZDetails assessment={assessment} language={chat.language} />
            <OceanDetails assessment={assessment} language={chat.language} />
          </div>
        )}
      </div>

      <div className="fisher-map-column">
        <MapView
          layers={effectiveLayers}
          theme={theme}
          center={harborCoords}
          zoom={9.5}
          language={chat.language}
          customPopupRenderer={formatFishermanPopup}
          layerAvailability={layerAvailability}
          hideAdvancedControls={true}
        />
      </div>
    </main>
  );
}
