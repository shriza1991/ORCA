"use client";
import { useState, useMemo, useEffect } from "react";
import MapView from "../components/map/DynamicMapView";
import GuidedTripSetup from "../components/fisher/GuidedTripSetup";
import FisherDecisionSurface from "../components/fisher/FisherDecisionSurface";
import { getFisherDecisionStatus } from "../components/fisher/FisherDecisionSurface";
import WhatIfSimulator from "../components/mission/WhatIfSimulator";
import MissionSummary, { assessmentStatus } from "../components/fisher/MissionSummary";
import type { TripAssessmentResponse } from "../types/assessment";
import ChatPanel from "../components/chat/ChatPanel";
import type { useChat } from "../hooks/useChat";
import type { MapLayer } from "../types/contracts";
import { getHarborCoordinates, fetchAndFormatBaseLayers } from "../utils/geo";
import { mergeFisherLayers, formatFishermanPopup } from "../utils/fisher-map";
import { useTripAssessment } from "../hooks/useTripAssessment";
import { useAlerts } from "../hooks/useAlerts";
import FisherAlertPanel from "../components/fisher/FisherAlertPanel";
import { useSpokenGuidance } from "../hooks/useSpokenGuidance";
import { useGeolocation } from "../hooks/useGeolocation";
import { useGeofence } from "../hooks/useGeofence";
import LocationWarningsOverlay from "../components/map/LocationWarningsOverlay";
import { Home, MessageSquare, Navigation, Map as MapIcon, History, Bell, UserRound, ArrowUpRight, Bookmark, Mic } from "lucide-react";
import { type MissionContext } from "../types/mission";

export interface FisherPageProps {
  chat: ReturnType<typeof useChat>;
  theme: "light" | "dark";
  mobileView: "chat" | "map";
  onStartCall: () => void;
  onOpenEvidence: () => void;
  onBack: () => void;
  onViewMap: () => void;
}

export default function FisherPage({
  chat,
  theme,
  mobileView: _mobileView,
  onStartCall,
  onOpenEvidence,
  onViewMap: _onViewMap,
}: FisherPageProps) {
  const originHarbor = chat.missionContext.origin_harbor || "Ratnagiri";
  const harborCoords = useMemo(
    () => getHarborCoordinates(originHarbor),
    [originHarbor],
  );

  const [baseLayers, setBaseLayers] = useState<MapLayer[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"home" | "decision" | "voyage" | "chat" | "map" | "trips" | "alerts" | "profile">("home");
  const [lastPlanTime, setLastPlanTime] = useState<number>(0);
  const [mapTimeOffset, setMapTimeOffset] = useState<number>(0);
  const fisherDataMode = (
    process.env.NEXT_PUBLIC_DATA_MODE || "DEMO"
  ).toUpperCase();

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

  const {
    data: assessment,
    setData: setAssessment,
    isLoading,
    error,
    isOffline,
    isExpired,
    assessTrip,
  } = useTripAssessment();
  const { alerts, registerTrip, acknowledgeAlert } = useAlerts(chat.language);
  const { speak } = useSpokenGuidance({ language: chat.language });

  const {
    status: geoStatus,
    location,
    isTracking,
    startTracking,
    stopTracking,
  } = useGeolocation();
  const { alerts: geofenceAlerts } = useGeofence(
    location,
    geoStatus,
    baseLayers,
  ); // We can use effectiveLayers, but baseLayers have the hazards/restrictions

  const handleToggleLocation = () => {
    if (isTracking) stopTracking();
    else startTracking();
  };

  const handleCompletePlan = (confirmedContext?: MissionContext) => {
    if (confirmedContext) {
      chat.setMissionContext(confirmedContext);
    }
    setSidebarTab("decision");
    setLastPlanTime(Date.now());
  };

  // 1. Fetch base geofences & boundaries
  useEffect(() => {
    fetchAndFormatBaseLayers()
      .then(setBaseLayers)
      .catch(() => setBaseLayers([]));
  }, []);

  // 2. Assess trip when context changes (inhibited while wizard is active to prevent premature network calls)
  useEffect(() => {
    if (sidebarTab === "voyage") {
      return;
    }

    assessTrip({
      origin_harbor: chat.missionContext.origin_harbor,
      craft_profile: chat.missionContext.craft_profile || "motorized_boat",
      vessel_size: chat.missionContext.vessel_size || "medium",
      departure_time: chat.missionContext.departure_time,
      return_time: chat.missionContext.return_time,
      destination_id: chat.missionContext.target_pfz,
      language_preference: chat.language,
      // The Fisher demo must remain usable offline. Defaults to SNAPSHOT mode.
      data_mode: fisherDataMode,
    });

    if (fisherDataMode !== "DEMO") registerTrip({
      origin_harbor: chat.missionContext.origin_harbor || "Ratnagiri",
      craft_profile: chat.missionContext.craft_profile || "motorized_boat",
      vessel_size: chat.missionContext.vessel_size || "medium",
      departure_time: chat.missionContext.departure_time,
      return_time: chat.missionContext.return_time,
      language: chat.language,
    });
  }, [
    chat.missionContext.origin_harbor,
    chat.missionContext.craft_profile,
    chat.missionContext.vessel_size,
    chat.missionContext.departure_time,
    chat.missionContext.return_time,
    chat.missionContext.target_pfz,
    chat.language,
    fisherDataMode,
    lastPlanTime,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // Synchronize canonical mission_state across assessment -> chat (M1.1)
  useEffect(() => {
    if (assessment?.mission_state) {
      chat.setMissionState(assessment.mission_state);
    }
  }, [assessment?.mission_state]);

  const effectiveDecisionStatus = assessment?.decision
    ? typeof assessment.decision === "string"
      ? assessment.decision
      : assessment.decision.status
    : "UNKNOWN";
  const canonicalMapDecision = (() => {
    switch (getFisherDecisionStatus(assessment, error)) {
      case "SAFE_TO_GO":
        return "GO" as const;
      case "CAUTION":
        return "CAUTION" as const;
      case "DO_NOT_GO":
        return "NO_GO" as const;
      default:
        return "UNKNOWN" as const;
    }
  })();

  const effectiveLayers = useMemo(() => {
    const chatLayers = assessment?.map_layers?.layers || [];

    // Show only the backend-recommended route in the primary Fisher map.
    const routes = assessment?.route_candidates || [];
    const recommendedRoute =
      routes.find((r) => r.is_recommended && r.is_feasible !== false) ||
      routes.find((r) => r.is_feasible !== false);
    const routeCoordinates =
      recommendedRoute?.geometry?.type === "LineString" &&
      Array.isArray(recommendedRoute.geometry.coordinates)
        ? recommendedRoute.geometry.coordinates
        : recommendedRoute?.waypoints || [];
    const routeLayers: MapLayer[] = recommendedRoute
      ? [
          {
            layer_id: `route_${recommendedRoute.route_id || 0}`,
            name: recommendedRoute.name || "Recommended Route",
            layer_type: "geojson",
            visible: true,
            style: {
              layer_category: "route",
              risk_rating: recommendedRoute.risk_rating,
              color:
                recommendedRoute.risk_rating === "HIGH_RISK"
                  ? "#ef4444"
                  : recommendedRoute.risk_rating === "MODERATE"
                    ? "#eab308"
                    : "#22c55e",
            },
            geojson: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: {
                    type: "LineString",
                    coordinates: routeCoordinates,
                  },
                  properties: {
                    ...recommendedRoute,
                    target_label:
                      recommendedRoute.destination ||
                      chat.missionContext.target_pfz ||
                      "Selected fishing target",
                    is_recommended: true,
                  },
                },
              ],
            },
          },
        ]
      : [];

    // Convert backend pfz_candidates to MapLayers
    const pfzLayers: MapLayer[] = (assessment?.pfz_candidates || []).map(
      (p, i) => ({
        layer_id: `pfz_${p.candidate_id || i}`,
        name: `PFZ Rank ${p.rank || i + 1}`,
        layer_type: "geojson",
        visible: true,
        style: {
          layer_category: "pfz",
          color: "#10b981",
        },
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [p.longitude, p.latitude],
              },
              properties: { ...p },
            },
          ],
        },
      }),
    );

    return mergeFisherLayers({
      baseLayers,
      harborCoords,
      originHarbor,
      status: effectiveDecisionStatus,
      baselineRoutes: sidebarTab === "voyage" ? [] : routeLayers,
      baselinePFZ: sidebarTab === "voyage" ? [] : pfzLayers,
      baselineHazards: [],
      chatLayers: chatLayers,
    });
  }, [
    baseLayers,
    harborCoords,
    originHarbor,
    assessment,
    sidebarTab,
    effectiveDecisionStatus,
  ]);

  const layerAvailability = {
    pfz: assessment?.pfz_candidates?.length ? "AVAILABLE" : "EMPTY",
    routes: assessment?.route_candidates?.length ? "AVAILABLE" : "EMPTY",
    hazards: assessment?.alerts?.length ? "AVAILABLE" : "EMPTY",
  } as const;


  const [recent, setRecent] = useState<TripAssessmentResponse[]>(() => {
    try { return JSON.parse(localStorage.getItem('orca.trips') || '[]'); } catch { return []; }
  });
  const [savedZones, setSavedZones] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('orca.zones') || '[]'); } catch { return []; }
  });
  const [name, setName] = useState(() => { try { return localStorage.getItem('orca.name') || ''; } catch { return ''; } });
  useEffect(() => {
    if (!assessment || isLoading || isOffline) return;
    setRecent(previous => {
      const updated = [assessment, ...previous.filter(a => a.assessment_id !== assessment.assessment_id)].slice(0, 8);
      try { localStorage.setItem('orca.trips', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [assessment?.assessment_id]);
  function saveZone(id: string) {
    setSavedZones(previous => {
      const next = previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id];
      try { localStorage.setItem('orca.zones', JSON.stringify(next)); } catch {}
      return next;
    });
  }
  function applyAssessment(next: TripAssessmentResponse) {
    setAssessment(next);
    if (next.mission_state) chat.setMissionState(next.mission_state);
    chat.setMissionContext({ ...chat.missionContext, ...next.trip_context, vessel_size: (next.mission_state?.vessel.size_category || 'medium') as any });
    setSidebarTab('decision');
  }
  const tripWindow = chat.missionContext.departure_time ? new Date(chat.missionContext.departure_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Choose departure';
  const nav = [ ['home', Home, 'Home'], ['voyage', Navigation, 'Plan'], ['chat', MessageSquare, 'Ask ORCA'], ['map', MapIcon, 'Map'], ['trips', History, 'Trips'], ['alerts', Bell, 'Alerts'], ['profile', UserRound, 'Profile'] ] as const;
  const zones = assessment?.pfz_candidates || [];
  const summary = <MissionSummary assessment={assessment} loading={isLoading} error={error} onPlan={() => setSidebarTab('voyage')} onMap={() => setSidebarTab('map')} />;
  return <main className={`fisher-workspace workspace-${sidebarTab}`}>
    <nav className="fisher-navigation" aria-label="Fisher workspace">{nav.map(([id, Icon, label]) => <button key={id} className={sidebarTab === id || (id === 'voyage' && sidebarTab === 'decision') ? 'active' : ''} onClick={() => setSidebarTab(id)} aria-current={sidebarTab === id ? 'page' : undefined}><Icon size={19} /><span>{label}</span></button>)}</nav>
    <div className="fisher-workspace-body">
      <div className="fisher-main-pane">
        <div className="workspace-heading"><div><span className="eyebrow">{originHarbor} / FISHER WORKSPACE</span><h1>{sidebarTab === 'home' ? (name ? `Welcome back, ${name}` : 'Your marine assistant') : sidebarTab === 'chat' ? 'Ask ORCA' : sidebarTab === 'voyage' ? 'Plan your trip' : sidebarTab === 'decision' ? 'Your mission' : sidebarTab === 'profile' ? 'Your profile' : sidebarTab === 'trips' ? 'Recent decisions' : sidebarTab === 'alerts' ? 'Trip alerts' : 'Your mission map'}</h1></div><span className="scenario-label">{fisherDataMode === 'DEMO' ? 'DEMO ? Controlled marine scenario' : fisherDataMode}</span></div>
        {isOffline && <p className="product-notice">Saved assessment ? {isExpired ? 'Expired. Reconnect before making a departure decision.' : 'Offline. Reconnect to reassess.'}</p>}
        {sidebarTab === 'home' && <>
          <div className="vessel-context"><Navigation size={20} /><span><strong>{(chat.missionContext.craft_profile || 'motorized_boat').replace(/_/g, ' ')}</strong><small>{chat.missionContext.vessel_size || 'medium'} vessel ? {tripWindow}</small></span><button onClick={() => setSidebarTab('profile')}>Edit profile</button></div>
          <div className="home-actions"><button className="product-primary" onClick={() => setSidebarTab('voyage')}><Navigation size={20} /><span>Plan a trip<small>Vessel, time and fishing area</small></span><ArrowUpRight size={20} /></button><button onClick={() => setSidebarTab('chat')}><MessageSquare size={20} /><span>Ask ORCA<small>Start with a question</small></span><ArrowUpRight size={20} /></button></div>
          {summary}
          <section className="product-section"><div className="section-heading"><h3>Fishing areas</h3><span className="muted">{zones.length} evaluated candidates</span></div>{zones.length ? zones.slice(0, 3).map(p => <div className="zone-row" key={p.candidate_id}><button onClick={() => { chat.setMissionContext({ ...chat.missionContext, target_pfz: p.candidate_id }); setSidebarTab('map'); }}><strong>{p.candidate_id}</strong><small>{Number(p.distance_nautical_miles).toFixed(1)} nm ? bearing {Number(p.bearing_degrees).toFixed(0)}?</small></button><button aria-label={`Save ${p.candidate_id}`} aria-pressed={savedZones.includes(p.candidate_id)} onClick={() => saveZone(p.candidate_id)}><Bookmark size={18} fill={savedZones.includes(p.candidate_id) ? 'currentColor' : 'none'} /></button></div>) : <p className="muted">No valid fishing areas in this mission window. Try a different departure.</p>}<p className="muted">{savedZones.length} saved on this device</p></section>
          <section className="product-section"><div className="section-heading"><h3>Latest alerts</h3><button onClick={() => setSidebarTab('alerts')}>View all</button></div><p>{assessment?.conditions.hazard?.headline || 'Your trip advisories will appear after assessment.'}</p></section>
        </>}
        {sidebarTab === 'voyage' && <GuidedTripSetup context={chat.missionContext} language={chat.language} onContextChange={chat.setMissionContext} onComplete={handleCompletePlan} onCancel={() => setSidebarTab('home')} />}
        {sidebarTab === 'decision' && <>{summary}<WhatIfSimulator assessment={assessment} onApplyAssessment={applyAssessment} currentContext={chat.missionContext} currentStatus={effectiveDecisionStatus} language={chat.language} onSimulate={(params, query) => chat.simulateWhatIf(params, query, assessment?.assessment_id)} onApplyContext={chat.setMissionContext} /><details className="product-details evidence-details"><summary>Inspect evidence, routes and detailed reasoning</summary><FisherDecisionSurface assessment={assessment} isLoading={isLoading} error={error} isOffline={isOffline} isExpired={isExpired} missionContext={chat.missionContext} language={chat.language} collaboration={assessment?.agent_collaboration} onOpenVoyageSettings={() => setSidebarTab('voyage')} onViewMap={() => setSidebarTab('map')} /></details></>}
        {sidebarTab === 'chat' && <div className="product-chat"><div className="question-shortcuts">{['Can I go fishing tomorrow?', 'Where is the nearest PFZ?', 'What are the nearest hazards?', 'Why this decision?', 'Compare the routes.'].map(q => <button key={q} disabled={chat.isLoading} onClick={() => chat.send(q)}>{q}</button>)}</div><ChatPanel language={chat.language} messages={chat.messages} activeResponse={chat.activeResponse} isLoading={chat.isLoading} onSend={chat.send} onStartCall={onStartCall} onBack={() => setSidebarTab('home')} onReset={chat.clearChat} onEvidenceClick={onOpenEvidence} /></div>}
        {sidebarTab === 'trips' && <section className="product-section"><p className="muted">Assessments saved on this device. Open a trip to plan from its context; conditions will be checked again.</p>{recent.length ? recent.map(a => <button className="trip-history-row" key={a.assessment_id} onClick={() => { chat.setMissionContext({ ...chat.missionContext, ...a.trip_context }); setSidebarTab('voyage'); }}><span><strong>{a.trip_context.origin_harbor}</strong><small>{new Date(a.assessed_at).toLocaleString()}</small></span><span className={`decision-label status-${assessmentStatus(a)}`}>{assessmentStatus(a)}</span></button>) : <p>No assessments yet. Plan your first trip to start a history.</p>}</section>}
        {sidebarTab === 'alerts' && <section className="product-section"><h3>Current mission advisories</h3><p>{assessment?.conditions.hazard?.headline || 'No assessment available yet.'}</p>{assessment?.alerts.map((a, i) => <p className="product-notice" key={i}>{(a as any).message || a.title}</p>)}<FisherAlertPanel alerts={alerts} language={chat.language} onAcknowledge={acknowledgeAlert} onReplay={text => speak(text)} /></section>}
        {sidebarTab === 'profile' && <section className="product-section profile-form"><h3>Profile on this device</h3><p className="muted">Your name is a local preference. This prototype has no account sign-in.</p><label>Your name<input value={name} onChange={e => { setName(e.target.value); try { localStorage.setItem('orca.name', e.target.value); } catch {} }} placeholder="Add your name" /></label><label>Vessel<select value={chat.missionContext.craft_profile} onChange={e => chat.setMissionContext({ ...chat.missionContext, craft_profile: e.target.value as any })}><option value="traditional_non_motorized">Traditional craft</option><option value="motorized_boat">Motorized boat</option><option value="mechanized_trawler">Mechanized trawler</option></select></label><label>Size<select value={chat.missionContext.vessel_size} onChange={e => chat.setMissionContext({ ...chat.missionContext, vessel_size: e.target.value as any })}>{['small', 'medium', 'large'].map(size => <option key={size}>{size}</option>)}</select></label><button onClick={onStartCall}><Mic size={18} /> Talk to ORCA</button><h3>Saved fishing areas</h3>{savedZones.length ? savedZones.map(id => <div className="zone-row" key={id}><span>{id}</span><button onClick={() => saveZone(id)}>Remove</button></div>) : <p className="muted">Save an area from Home to keep it here.</p>}</section>}
        {sidebarTab === 'map' && <div className="map-context-strip"><strong>{originHarbor}</strong><span>{zones.length} fishing areas ? {assessment?.route_candidates.length || 0} routes</span><button onClick={() => setSidebarTab('decision')}>View decision</button></div>}
      </div>
      <section className="fisher-map-pane" aria-label="Marine mission map"><LocationWarningsOverlay status={geoStatus} alerts={geofenceAlerts} language={chat.language} /><MapView layers={effectiveLayers} theme={theme} center={harborCoords} zoom={9.5} resetViewTrigger={lastPlanTime || undefined} language={chat.language} customPopupRenderer={formatFishermanPopup} layerAvailability={layerAvailability} hideAdvancedControls={false} liveLocation={location} liveLocationStatus={geoStatus} isTrackingLocation={isTracking} onToggleLocation={handleToggleLocation} craftProfile={chat.missionContext.craft_profile} timeOffsetHours={mapTimeOffset} onTimeOffsetChange={handleTimeOffsetChange} assessment={assessment} canonicalConditions={assessment?.conditions} canonicalDecision={canonicalMapDecision} /><div className="map-caption">Select a route, fishing area or restriction to inspect its details.</div></section>
    </div>
  </main>;
}
