import { useState, useMemo, useEffect, useRef } from "react";
import MapView from "../components/map/MapView";
import GuidedTripSetup from "../components/fisher/GuidedTripSetup";
import FisherDecisionSurface from "../components/fisher/FisherDecisionSurface";
import { getFisherDecisionStatus } from "../components/fisher/FisherDecisionSurface";
import RouteChoices from "../components/mission/RouteChoices";
import MissionChanges from "../components/mission/MissionChanges";
import { saveOfflineAssessment } from "../utils/offline-cache";
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
import { useGeolocation } from "../hooks/useGeolocation";
import { useGeofence } from "../hooks/useGeofence";
import LocationWarningsOverlay from "../components/map/LocationWarningsOverlay";
import { Home, MessageSquare, Navigation, Map as MapIcon, History, Bell, UserRound, ArrowUpRight, Bookmark, Mic } from "lucide-react";
import { speechCoordinator } from "../utils/speech-coordinator";
import { translateText } from "../i18n/translations";
import { type MissionContext, type DecisionDeltaContract } from "../types/mission";
import { assessmentRequest } from "../components/mission/AssessmentSimulator";

import {
  matchesMissionProposal,
  getMissionIdentityKey,
  validateChatProposedAssessment,
  isAssessmentApplicableToContext,
} from "../utils/mission-proposal";

export type MapProposalStatus = "pending" | "success" | "error";

export interface MapProposalState {
  status: MapProposalStatus;
  baselineAssessmentId: string;
  evidenceBundleId?: string;
  hours: number;
  missionContextKey: string;
  baseDeparture: string;
  proposedDeparture: string;
  proposedReturn?: string;
  proposedAssessment?: TripAssessmentResponse;
  delta?: DecisionDeltaContract;
  error?: string;
}

export function missionContextKey(c: MissionContext): string {
  return getMissionIdentityKey({
    origin_harbor: c.origin_harbor,
    craft_profile: c.craft_profile,
    vessel_size: c.vessel_size,
    departure_time: c.departure_time,
    return_time: c.return_time,
    target_pfz: c.target_pfz,
  });
}

export interface FisherPageProps {
  chat: ReturnType<typeof useChat>;
  voiceProposal?: TripAssessmentResponse | null;
  onVoiceProposalHandled?: () => void;
  theme: "light" | "dark";
  mobileView: "chat" | "map";
  onStartCall: () => void;
  onOpenEvidence: () => void;
  onBack: () => void;
  onViewMap: () => void;
}

export default function FisherPage({
  chat,
  voiceProposal,
  onVoiceProposalHandled,
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
    import.meta.env.VITE_DATA_MODE || "DEMO"
  ).toUpperCase();

  const {
    data: retainedAssessment,
    adoptAssessment: setAssessment,
    isLoading,
    error,
    isOffline,
    isExpired,
    assessTrip,
  } = useTripAssessment();

  const [mapProposal, setMapProposal] = useState<MapProposalState | null>(null);
  const proposalAbortRef = useRef<AbortController | null>(null);

  const currentContextKey = getMissionIdentityKey({
    origin_harbor: chat.missionContext.origin_harbor,
    coordinates: harborCoords,
    craft_profile: chat.missionContext.craft_profile,
    vessel_size: chat.missionContext.vessel_size,
    departure_time: chat.missionContext.departure_time,
    return_time: chat.missionContext.return_time,
    target_pfz: chat.missionContext.target_pfz,
    data_mode: fisherDataMode,
  });

  const applicableContext = { ...chat.missionContext, coordinates: harborCoords, data_mode: fisherDataMode };
  const contextMatches = isAssessmentApplicableToContext(retainedAssessment, applicableContext);
  // Retained records are history while a different plan is pending; expired records remain visibly UNKNOWN.
  const assessment = !isLoading && contextMatches ? retainedAssessment : null;
  const baselineUsable = Boolean(assessment && !isExpired && !error);
  const activeBaselineRef = useRef({ assessment, currentContextKey, baselineUsable });
  activeBaselineRef.current = { assessment, currentContextKey, baselineUsable };

  const isProposalApplicable = Boolean(
    mapProposal &&
    mapProposal.status === "success" &&
    mapProposal.proposedAssessment &&
    mapProposal.delta &&
    assessment &&
    !isExpired &&
    !isLoading &&
    mapProposal.baselineAssessmentId === assessment.assessment_id &&
    (mapProposal.evidenceBundleId === undefined || mapProposal.evidenceBundleId === assessment.evidence_bundle_id) &&
    mapProposal.hours === mapTimeOffset &&
    mapProposal.missionContextKey === currentContextKey &&
    matchesMissionProposal(assessment, mapProposal.proposedAssessment, mapProposal.proposedDeparture, mapProposal.proposedReturn || "")
  );

  const handleTimeOffsetChange = (hours: number) => {
    setMapTimeOffset(hours);
    proposalAbortRef.current?.abort();

    if (hours === 0) {
      setMapProposal(null);
      return;
    }

    const baseDeparture = assessment?.trip_context.departure_time;
    if (!baseDeparture || !assessment) {
      setMapProposal(null);
      return;
    }

    const depParsed = Date.parse(baseDeparture);
    if (isNaN(depParsed)) {
      setMapProposal(null);
      return;
    }

    // Calculate proposed departure strictly from retained mission departure (not current clock)
    const proposedDeparture = new Date(depParsed + hours * 3600000).toISOString();

    // Strictly preserve the original trip duration
    const baseReturn = assessment.trip_context.return_time;
    let proposedReturn: string | undefined;
    if (baseReturn) {
      const retParsed = Date.parse(baseReturn);
      if (!isNaN(retParsed)) {
        const duration = retParsed - depParsed;
        proposedReturn = new Date(depParsed + hours * 3600000 + duration).toISOString();
      }
    }

    const currentBaselineId = assessment.assessment_id;
    const currentEvidenceBundleId = assessment.evidence_bundle_id;

    setMapProposal({
      status: "pending",
      baselineAssessmentId: currentBaselineId,
      evidenceBundleId: currentEvidenceBundleId,
      hours,
      missionContextKey: currentContextKey,
      baseDeparture,
      proposedDeparture,
      proposedReturn,
    });

    const abort = new AbortController();
    proposalAbortRef.current = abort;

    const API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
    const baseline = assessmentRequest(assessment);
    const simulated = {
      ...baseline,
      mission_state: undefined,
      departure_time: proposedDeparture,
      return_time: proposedReturn,
      parent_assessment_id: assessment.assessment_id,
    };

    fetch(`${API}/trip-assessments/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline,
        simulated,
        baseline_assessment_id: assessment.assessment_id,
      }),
      signal: abort.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error('Simulation failed');
        return res.json();
      })
      .then(data => {
        if (!abort.signal.aborted) {
          if (!data.delta || !matchesMissionProposal(assessment, data.simulated, proposedDeparture, proposedReturn || "")) {
            throw new Error("Comparison result does not match the requested mission. Reset and retry.");
          }
          setMapProposal({
            status: "success",
            baselineAssessmentId: currentBaselineId,
            evidenceBundleId: currentEvidenceBundleId,
            hours,
            missionContextKey: currentContextKey,
            baseDeparture,
            proposedDeparture,
            proposedReturn,
            proposedAssessment: data.simulated,
            delta: data.delta,
          });
        }
      })
      .catch(err => {
        if (!abort.signal.aborted) {
          setMapProposal(prev => prev ? {
            ...prev,
            status: "error",
            error: err.message || 'Simulation failed',
          } : null);
        }
      });
  };

  const handleApplyMapProposal = () => {
    if (!isProposalApplicable || !mapProposal?.proposedAssessment) return;
    applyAssessment(mapProposal.proposedAssessment);
    setMapTimeOffset(0);
    setMapProposal(null);
  };

  // Invalidate proposals immediately when relevant mission inputs change, including before replacement assessment finishes
  useEffect(() => {
    proposalAbortRef.current?.abort();
    setMapProposal(null);
    setMapTimeOffset(0);
  }, [
    chat.missionContext.origin_harbor,
    chat.missionContext.craft_profile,
    chat.missionContext.vessel_size,
    chat.missionContext.departure_time,
    chat.missionContext.return_time,
    chat.missionContext.target_pfz,
  ]);

  useEffect(() => {
    proposalAbortRef.current?.abort();
    setMapProposal(null);
    setMapTimeOffset(0);
    return () => proposalAbortRef.current?.abort();
  }, [assessment?.assessment_id]);

  const {
    alerts,
    monitoringMode,
    isMonitoringEnabled,
    setIsMonitoringEnabled,
    registerTrip,
    acknowledgeAlert,
    applyRefreshedAlert,
    actionError,
  } = useAlerts(chat.language, {
    applicableAssessment: assessment,
    isApplicable: Boolean(assessment && !isExpired && !isLoading),
    isExpired,
    isLoading,
    dataMode: fisherDataMode,
    onApplyRefreshed: applyAssessment,
  });

  const {
    status: geoStatus,
    location,
    isTracking,
    startTracking,
    stopTracking,
  } = useGeolocation();
  const {
    alerts: geofenceAlerts,
    evaluationState: geoEvaluationState,
    evaluationResult: geoEvaluationResult,
  } = useGeofence(
    location,
    geoStatus,
    baseLayers,
  );

  // Boundary warning speech coordination: announce INSIDE (priority: high) and APPROACHING (priority: normal)
  const prevGeoStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (geoEvaluationState === 'INSIDE') {
      const insideAlerts = geofenceAlerts.filter(a => a.isInside);
      const zoneNames = insideAlerts.map(a => a.name).join(', ') || 'Restricted Zone';
      const text = `${translateText('Inside Restricted Area', chat.language)}: ${zoneNames}`;
      speechCoordinator.speak(text, {
        priority: 'high',
        dedupeKey: `${currentContextKey}:boundary:inside:${zoneNames}`,
        language: chat.language,
      });
    } else if (geoEvaluationState === 'APPROACHING') {
      const approachAlerts = geofenceAlerts.filter(a => !a.isInside);
      const zoneNames = approachAlerts.map(a => a.name).join(', ') || 'Restricted Zone';
      const text = `${translateText('Approaching Restricted Area', chat.language)}: ${zoneNames}`;
      speechCoordinator.speak(text, {
        priority: 'normal',
        dedupeKey: `${currentContextKey}:boundary:approaching:${zoneNames}`,
        language: chat.language,
      });
    } else if (geoEvaluationState === 'CLEAR' || geoEvaluationState === 'UNKNOWN') {
      speechCoordinator.cancelScope(`${currentContextKey}:boundary:`);
      // If returning to clear from an approach or inside state, reset boundary deduplication
      if (prevGeoStateRef.current === 'INSIDE' || prevGeoStateRef.current === 'APPROACHING') {
        speechCoordinator.resetDeduplication(`${currentContextKey}:boundary`);
      }
    }
    prevGeoStateRef.current = geoEvaluationState;
  }, [geoEvaluationState, geofenceAlerts, currentContextKey, chat.language]);

  useEffect(() => () => {
    speechCoordinator.cancelScope(`${currentContextKey}:boundary:`);
  }, [currentContextKey]);

  const handleToggleLocation = () => {
    if (isTracking) stopTracking();
    else startTracking();
  };

  const handleCompletePlan = (confirmedContext?: MissionContext) => {
    appliedContext.current = null;
    if (confirmedContext) {
      chat.setMissionContext(confirmedContext);
      chat.setMissionAssessment(null);
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

  const appliedContext = useRef<string | null>(null);
  const requestedContext = useRef<string | null>(null);

  // 2. Assess trip when context changes (inhibited while wizard is active to prevent premature network calls)
  useEffect(() => {
    if (sidebarTab === "voyage") {
      return;
    }

    const requestKey = `${currentContextKey}:${lastPlanTime}`;
    if (appliedContext.current === currentContextKey) {
      requestedContext.current = requestKey;
      return;
    }
    if (requestedContext.current === requestKey) return;
    requestedContext.current = requestKey;
    appliedContext.current = null;
    assessTrip({
      origin_harbor: chat.missionContext.origin_harbor,
      coordinates: harborCoords,
      craft_profile: chat.missionContext.craft_profile || "motorized_boat",
      vessel_size: chat.missionContext.vessel_size || "medium",
      departure_time: chat.missionContext.departure_time,
      return_time: chat.missionContext.return_time,
      destination_id: chat.missionContext.target_pfz,
      language_preference: chat.language,
      // The Fisher demo must remain usable offline. Defaults to SNAPSHOT mode.
      data_mode: fisherDataMode,
    });


  }, [
    currentContextKey,
    fisherDataMode,
    lastPlanTime,
    sidebarTab,
  ]);

  // Register the assessed plan, including its mode and canonical destination, not an unassessed edit.
  useEffect(() => {
    if (!baselineUsable || !assessment || fisherDataMode === 'DEMO' || !isMonitoringEnabled) return;
    void registerTrip({
      origin_harbor: assessment.trip_context.origin_harbor || originHarbor,
      craft_profile: assessment.trip_context.craft_profile || 'motorized_boat',
      vessel_size: assessment.trip_context.vessel_size || chat.missionContext.vessel_size,
      coordinates: assessment.trip_context.coordinates,
      destination_id: assessment.trip_context.target_pfz,
      departure_time: assessment.trip_context.departure_time,
      return_time: assessment.trip_context.return_time,
      language: chat.language, data_mode: assessment.conditions.data_mode,
      mission_state: assessment.mission_state || undefined,
    });
  }, [assessment?.assessment_id, baselineUsable, currentContextKey, fisherDataMode, isMonitoringEnabled, chat.language]);

  // Synchronize canonical mission_state across assessment -> chat (M1.1)
  useEffect(() => {
    chat.setMissionAssessment(retainedAssessment, {
      isLoading: isLoading || !contextMatches, isExpired,
      coordinates: harborCoords, dataMode: fisherDataMode,
    });
    chat.setMissionState(baselineUsable ? assessment?.mission_state || null : null);
  }, [retainedAssessment, isLoading, isExpired, currentContextKey, contextMatches]);

  const effectiveDecisionStatus = isLoading
    ? "UNKNOWN"
    : assessment?.decision
    ? typeof assessment.decision === "string"
      ? assessment.decision
      : assessment.decision.status
    : "UNKNOWN";

  const canonicalMapDecision = (() => {
    if (isLoading) return "UNKNOWN" as const;
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

  const mapLayersTarget = (mapTimeOffset > 0 && isProposalApplicable && mapProposal?.proposedAssessment)
    ? mapProposal.proposedAssessment
    : (mapTimeOffset > 0 ? null : assessment);

  const mapDisplayAssessment = mapLayersTarget;
  const mapDisplayDecision = mapTimeOffset > 0
    ? (isProposalApplicable && mapProposal?.proposedAssessment ? assessmentStatus(mapProposal.proposedAssessment) : "UNKNOWN")
    : canonicalMapDecision;

  const effectiveLayers = useMemo(() => {
    const target = mapLayersTarget;
    const chatLayers = target?.map_layers?.layers || [];

    const routes = target?.route_candidates || [];
    const routeLayers: MapLayer[] = routes.map((route, i) => ({
      layer_id: `route_${route.route_id || i}`, name: route.name || "Evaluated corridor",
      layer_type: "geojson", visible: true,
      style: { layer_category: "route", risk_rating: route.risk_rating,
        color: !route.departure_supported || route.risk_rating === "HIGH_RISK" ? "#ef4444" : route.risk_rating === "MODERATE" ? "#eab308" : "#22c55e" },
      geojson: { type: "FeatureCollection", features: [{ type: "Feature",
        geometry: { type: "LineString", coordinates: route.geometry?.coordinates || route.waypoints || [] },
        properties: { ...route, target_label: route.destination || chat.missionContext.target_pfz || "Selected fishing target",
          is_recommended: Boolean(route.is_recommended && route.departure_supported) }
      }] }
    }));

    // Convert backend pfz_candidates to MapLayers
    const pfzLayers: MapLayer[] = (target?.pfz_candidates || []).map(
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
      status: mapDisplayDecision,
      baselineRoutes: sidebarTab === "voyage" ? [] : routeLayers,
      baselinePFZ: sidebarTab === "voyage" ? [] : pfzLayers,
      baselineHazards: [],
      chatLayers: chatLayers,
    });
  }, [
    baseLayers,
    harborCoords,
    originHarbor,
    mapLayersTarget,
    sidebarTab,
    mapDisplayDecision,
  ]);

  const layerAvailability = {
    pfz: mapLayersTarget?.pfz_candidates?.length ? "AVAILABLE" : "EMPTY",
    routes: mapLayersTarget?.route_candidates?.length ? "AVAILABLE" : "EMPTY",
    hazards: mapLayersTarget?.alerts?.length ? "AVAILABLE" : "EMPTY",
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
    if (!activeBaselineRef.current.baselineUsable ||
        activeBaselineRef.current.currentContextKey !== currentContextKey ||
        activeBaselineRef.current.assessment?.assessment_id !== assessment?.assessment_id ||
        !baselineUsable || isLoading || !assessment ||
        next.assessment_id === assessment.assessment_id ||
        next.trip_context.parent_assessment_id !== assessment.assessment_id ||
        next.conditions.data_mode !== assessment.conditions.data_mode ||
        next.trip_context.origin_harbor !== assessment.trip_context.origin_harbor ||
        JSON.stringify(next.trip_context.coordinates ?? null) !== JSON.stringify(assessment.trip_context.coordinates ?? null) ||
        (assessment.mission_state && next.mission_state?.mission_id !== assessment.mission_state.mission_id)) {
      console.warn("Cannot apply proposal: active mission baseline is unavailable or mismatched.");
      return;
    }
    if (next.trip_context.parent_assessment_id) {
      if (!assessment || assessment.assessment_id !== next.trip_context.parent_assessment_id) {
        console.warn("Cannot apply proposal: parent baseline mismatch.");
        return;
      }
    }
    const context: MissionContext = {
      ...chat.missionContext,
      origin_harbor: next.trip_context.origin_harbor || chat.missionContext.origin_harbor,
      craft_profile: next.trip_context.craft_profile || chat.missionContext.craft_profile,
      vessel_size: (next.mission_state?.vessel.size_category || next.trip_context.vessel_size || chat.missionContext.vessel_size || "medium") as any,
      departure_time: next.trip_context.departure_time || chat.missionContext.departure_time,
      return_time: next.trip_context.return_time || chat.missionContext.return_time,
      target_pfz: next.trip_context.target_pfz ?? chat.missionContext.target_pfz,
    };
    const newContextKey = getMissionIdentityKey({
      origin_harbor: context.origin_harbor,
      coordinates: next.trip_context.coordinates || harborCoords,
      craft_profile: context.craft_profile,
      vessel_size: context.vessel_size,
      departure_time: context.departure_time,
      return_time: context.return_time,
      target_pfz: context.target_pfz,
      data_mode: next.conditions.data_mode || fisherDataMode,
    });
    appliedContext.current = newContextKey;
    setAssessment(next);
    chat.setMissionAssessment(next, { coordinates: next.trip_context.coordinates || harborCoords, dataMode: next.conditions.data_mode });
    chat.setMissionState(next.mission_state || null);
    chat.setMissionContext(context);
    void saveOfflineAssessment(
      context.origin_harbor || "Ratnagiri",
      next,
      context.craft_profile || "motorized_boat",
      context.departure_time || "default",
      context.return_time,
      context.vessel_size,
      context.target_pfz,
      next.trip_context.coordinates,
      next.conditions.data_mode,
    );
    setMapProposal(null);
    setMapTimeOffset(0);
    setSidebarTab('decision');
  }

  useEffect(() => {
    if (!voiceProposal) return;
    if (baselineUsable && validateChatProposedAssessment(assessment, voiceProposal, isExpired).valid) applyAssessment(voiceProposal);
    onVoiceProposalHandled?.();
  }, [voiceProposal]);

  const chatProposal = chat.activeResponse?.proposed_assessment;
  const isChatProposalApplicable = Boolean(
    chatProposal &&
    assessment &&
    !isExpired &&
    !isLoading &&
    validateChatProposedAssessment(assessment, chatProposal, isExpired).valid,
  );

  const tripWindow = chat.missionContext.departure_time ? new Date(chat.missionContext.departure_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Choose departure';
  const nav = [ ['home', Home, 'Home'], ['voyage', Navigation, 'Plan'], ['chat', MessageSquare, 'Ask ORCA'], ['map', MapIcon, 'Map'], ['trips', History, 'Trips'], ['alerts', Bell, 'Alerts'], ['profile', UserRound, 'Profile'] ] as const;
  const zones = assessment?.pfz_candidates || [];
  const summary = <MissionSummary assessment={assessment} loading={isLoading} error={error} onPlan={() => setSidebarTab('voyage')} onMap={() => setSidebarTab('map')} />;

  return <main className={`fisher-workspace workspace-${sidebarTab}`}>
    <nav className="fisher-navigation" aria-label="Fisher workspace">{nav.map(([id, Icon, label]) => <button key={id} className={sidebarTab === id || (id === 'voyage' && sidebarTab === 'decision') ? 'active' : ''} onClick={() => setSidebarTab(id)} aria-current={sidebarTab === id ? 'page' : undefined}><Icon size={19} /><span>{label}</span>{id === 'alerts' && alerts.some(a => !a.is_acknowledged && a.status === 'ACTIVE') && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', marginLeft: '4px' }} title="Active alert" />}</button>)}</nav>
    <div className="fisher-workspace-body">
      <div className="fisher-main-pane">
        <div className="workspace-heading"><div><span className="eyebrow">{originHarbor} / FISHER WORKSPACE</span><h1>{sidebarTab === 'home' ? (name ? `Welcome back, ${name}` : 'Your marine assistant') : sidebarTab === 'chat' ? 'Ask ORCA' : sidebarTab === 'voyage' ? 'Plan your trip' : sidebarTab === 'decision' ? 'Your mission' : sidebarTab === 'profile' ? 'Your profile' : sidebarTab === 'trips' ? 'Recent decisions' : sidebarTab === 'alerts' ? 'Trip alerts' : 'Your mission map'}</h1></div><span className="scenario-label">{fisherDataMode === 'DEMO' ? 'DEMO · Controlled marine scenario' : fisherDataMode}</span></div>
        {isOffline && <p className="product-notice">Saved {assessment?.assessed_at ? new Date(assessment.assessed_at).toLocaleString() : 'assessment'} · {isExpired ? 'Expired. Reconnect before making a departure decision.' : 'Offline. Reconnect to reassess.'}</p>}
        {sidebarTab !== 'alerts' && alerts.some(a => !a.is_acknowledged && a.status === 'ACTIVE') && (
          <div style={{ margin: '8px 0' }}>
            <FisherAlertPanel
              actionError={actionError}
              alerts={alerts}
              language={chat.language}
              monitoringMode={monitoringMode}
              isMonitoringEnabled={isMonitoringEnabled}
              onToggleMonitoring={setIsMonitoringEnabled}
              onAcknowledge={acknowledgeAlert}
              onApplyRefreshed={applyRefreshedAlert}
              onReplay={text => speechCoordinator.replay(text, chat.language)}
            />
          </div>
        )}
        {sidebarTab === 'home' && <>
          <div className="vessel-context"><Navigation size={20} /><span><strong>{(chat.missionContext.craft_profile || 'motorized_boat').replace(/_/g, ' ')}</strong><small>{chat.missionContext.vessel_size || 'medium'} vessel · {tripWindow}</small></span><button onClick={() => setSidebarTab('profile')}>Edit profile</button></div>
          <div className="home-actions"><button className="product-primary" onClick={() => setSidebarTab('voyage')}><Navigation size={20} /><span>Plan a trip<small>Vessel, time and fishing area</small></span><ArrowUpRight size={20} /></button><button onClick={() => setSidebarTab('chat')}><MessageSquare size={20} /><span>Ask ORCA<small>Start with a question</small></span><ArrowUpRight size={20} /></button></div>
          {summary}
          <section className="product-section"><div className="section-heading"><h3>Fishing areas</h3><span className="muted">{zones.length} evaluated candidates</span></div>{zones.length ? zones.slice(0, 3).map(p => <div className="zone-row" key={p.candidate_id}><button onClick={() => { chat.setMissionContext({ ...chat.missionContext, target_pfz: p.candidate_id }); setSidebarTab('map'); }}><strong>{p.candidate_id}</strong><small>{Number(p.distance_nautical_miles).toFixed(1)} nm · bearing {Number(p.bearing_degrees).toFixed(0)}°</small></button><button aria-label={`Save ${p.candidate_id}`} aria-pressed={savedZones.includes(p.candidate_id)} onClick={() => saveZone(p.candidate_id)}><Bookmark size={18} fill={savedZones.includes(p.candidate_id) ? 'currentColor' : 'none'} /></button></div>) : <p className="muted">No valid fishing areas in this mission window. Try a different departure.</p>}<p className="muted">{savedZones.length} saved on this device</p></section>
          <section className="product-section"><div className="section-heading"><h3>Latest alerts</h3><button onClick={() => setSidebarTab('alerts')}>View all</button></div><p>{assessment?.conditions.hazard?.headline || 'Your trip advisories will appear after assessment.'}</p></section>
        </>}
        {sidebarTab === 'voyage' && <GuidedTripSetup context={chat.missionContext} language={chat.language} onContextChange={chat.setMissionContext} onComplete={handleCompletePlan} onCancel={() => setSidebarTab('home')} />}
        {sidebarTab === 'decision' && <>{summary}{baselineUsable && assessment && <RouteChoices assessment={assessment} onApply={applyAssessment} />}{baselineUsable && <WhatIfSimulator assessment={assessment} onApplyAssessment={applyAssessment} currentContext={chat.missionContext} currentStatus={effectiveDecisionStatus} language={chat.language} onSimulate={(params, query) => chat.simulateWhatIf(params, query, assessment?.assessment_id)} onApplyContext={chat.setMissionContext} />}<details className="product-details evidence-details"><summary>Inspect evidence, routes and detailed reasoning</summary><FisherDecisionSurface assessment={assessment} isLoading={isLoading} error={error} isOffline={isOffline} isExpired={isExpired} missionContext={chat.missionContext} language={chat.language} collaboration={null} onOpenVoyageSettings={() => setSidebarTab('voyage')} onViewMap={() => setSidebarTab('map')} /></details></>}
        {sidebarTab === 'chat' && <div className="product-chat"><div className="mission-context-bar"><p>Current mission (correct harbor and time before asking): <strong>{originHarbor}</strong> · {tripWindow} · {(chat.missionContext.craft_profile || '').replace(/_/g, ' ')}</p><button onClick={() => setSidebarTab('voyage')}>Correct mission</button><label>Response language<select aria-label="Response language" value={chat.language} onChange={e => chat.setLanguage(e.target.value as 'en' | 'hi' | 'mr')}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label></div>{chatProposal && <div className="product-notice"><p>Proposed mission: {new Date(chatProposal.trip_context.departure_time || '').toLocaleString()} → {assessmentStatus(chatProposal)}{!isChatProposalApplicable && <span className="muted" style={{ display: 'block', fontSize: '12px', marginTop: '2px' }}>Proposal no longer applies to the active mission baseline.</span>}</p><button disabled={!isChatProposalApplicable} onClick={() => isChatProposalApplicable && applyAssessment(chatProposal)}>Use this exact proposed plan</button></div>}<div className="question-shortcuts">{['Can I go fishing tomorrow?', 'Where is the nearest PFZ?', 'What are the nearest hazards?', 'Why this decision?', 'Compare the routes.'].map(q => <button key={q} disabled={chat.isLoading} onClick={() => chat.send(q)}>{q}</button>)}</div><ChatPanel language={chat.language} messages={chat.messages} activeResponse={chat.activeResponse} isLoading={chat.isLoading} onSend={chat.send} onStartCall={onStartCall} onBack={() => setSidebarTab('home')} onReset={chat.clearChat} onEvidenceClick={onOpenEvidence} /></div>}
        {sidebarTab === 'trips' && <section className="product-section"><p className="muted">Assessments saved on this device. Open a trip to plan from its context; conditions will be checked again.</p>{recent.length ? recent.map(a => <button className="trip-history-row" key={a.assessment_id} onClick={() => { chat.setMissionContext({ ...chat.missionContext, ...a.trip_context }); setSidebarTab('voyage'); }}><span><strong>{a.trip_context.origin_harbor}</strong><small>{new Date(a.assessed_at).toLocaleString()}</small></span><span className={`decision-label status-${assessmentStatus(a)}`}>{assessmentStatus(a)}</span></button>) : <p>No assessments yet. Plan your first trip to start a history.</p>}</section>}
        {sidebarTab === 'alerts' && <section className="product-section">{baselineUsable && assessment && <MissionChanges assessment={assessment} onApply={applyAssessment} />}<h3>Current mission advisories</h3><p>{assessment?.conditions.hazard?.headline || 'No assessment available yet.'}</p>{assessment?.alerts.map((a, i) => <p className="product-notice" key={i}>{(a as any).message || a.title}</p>)}<FisherAlertPanel actionError={actionError} alerts={alerts} language={chat.language} monitoringMode={monitoringMode} isMonitoringEnabled={isMonitoringEnabled} onToggleMonitoring={setIsMonitoringEnabled} onAcknowledge={acknowledgeAlert} onApplyRefreshed={applyRefreshedAlert} onReplay={text => speechCoordinator.replay(text, chat.language)} /></section>}
        {sidebarTab === 'profile' && <section className="product-section profile-form"><h3>Profile on this device</h3><p className="muted">Your name is a local preference. This prototype has no account sign-in.</p><label>Your name<input value={name} onChange={e => { setName(e.target.value); try { localStorage.setItem('orca.name', e.target.value); } catch {} }} placeholder="Add your name" /></label><label>Vessel<select value={chat.missionContext.craft_profile} onChange={e => chat.setMissionContext({ ...chat.missionContext, craft_profile: e.target.value as any })}><option value="traditional_non_motorized">Traditional craft</option><option value="motorized_boat">Motorized boat</option><option value="mechanized_trawler">Mechanized trawler</option></select></label><label>Size<select value={chat.missionContext.vessel_size} onChange={e => chat.setMissionContext({ ...chat.missionContext, vessel_size: e.target.value as any })}>{['small', 'medium', 'large'].map(size => <option key={size}>{size}</option>)}</select></label><button onClick={onStartCall}><Mic size={18} /> Talk to ORCA</button><h3>Saved fishing areas</h3>{savedZones.length ? savedZones.map(id => <div className="zone-row" key={id}><span>{id}</span><button onClick={() => saveZone(id)}>Remove</button></div>) : <p className="muted">Save an area from Home to keep it here.</p>}</section>}
        {sidebarTab === 'map' && <div className="map-context-strip"><strong>{originHarbor}</strong><span>{zones.length} fishing areas · {assessment?.route_candidates.length || 0} routes</span><button onClick={() => setSidebarTab('decision')}>View decision</button></div>}
      </div>
      <section className="fisher-map-pane" aria-label="Marine mission map">
        <LocationWarningsOverlay
          status={geoStatus}
          alerts={geofenceAlerts}
          evaluationState={geoEvaluationState}
          unknownReason={geoEvaluationResult?.unknown_reason}
          language={chat.language}
        />
        {mapTimeOffset > 0 && mapProposal && (
          <div className="product-notice map-proposal-strip" style={{ margin: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <strong>Forecast Timeline &amp; Departure Proposal (+{mapTimeOffset}h) [PREVIEW]</strong>
              <div style={{ fontSize: '13px', marginTop: '2px' }}>
                Proposed: {new Date(mapProposal.proposedDeparture).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                <span className="muted" style={{ marginLeft: '4px' }}>
                  (Relative to baseline {new Date(mapProposal.baseDeparture).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                </span>
                {mapProposal.proposedReturn && (
                  <span> · Duration: {((Date.parse(mapProposal.proposedReturn) - Date.parse(mapProposal.proposedDeparture)) / 3600000).toFixed(1)}h</span>
                )}
                {mapProposal.status === 'pending' ? (
                  <span> · <em>Evaluating proposal...</em></span>
                ) : mapProposal.status === 'error' ? (
                  <span style={{ color: 'var(--color-danger, #e53935)' }}> · <strong>Simulation error:</strong> {mapProposal.error || 'Failed to simulate alternative departure.'}</span>
                ) : mapProposal.delta && mapProposal.proposedAssessment ? (
                  <span> · Result: <strong>{assessmentStatus(mapProposal.proposedAssessment)}</strong> ({mapProposal.delta.summary})</span>
                ) : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="product-primary"
                disabled={!isProposalApplicable}
                onClick={handleApplyMapProposal}
              >
                Apply Proposal to Mission
              </button>
              <button onClick={() => handleTimeOffsetChange(0)}>
                Reset to Mission
              </button>
            </div>
          </div>
        )}
        <MapView layers={effectiveLayers} theme={theme} center={harborCoords} zoom={9.5} resetViewTrigger={lastPlanTime || undefined} language={chat.language} customPopupRenderer={formatFishermanPopup} layerAvailability={layerAvailability} hideAdvancedControls={false} liveLocation={location} liveLocationStatus={geoStatus} isTrackingLocation={isTracking} onToggleLocation={handleToggleLocation} craftProfile={chat.missionContext.craft_profile} timeOffsetHours={mapTimeOffset} onTimeOffsetChange={handleTimeOffsetChange} assessment={mapDisplayAssessment} canonicalConditions={mapDisplayAssessment?.conditions} canonicalDecision={mapDisplayDecision} /><div className="map-caption">Select a route, fishing area or restriction to inspect its details.</div></section>
    </div>
  </main>;
}
