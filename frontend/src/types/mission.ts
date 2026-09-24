import type { UserContext } from './contracts';

/** UI-only presentation mode. It deliberately does not grant server permissions. */
export type OperationalRole = 'fisher' | 'authority';

/**
 * Context collected by the client and sent only through the canonical
 * ChatRequest.user_context shape. Route/time fields are intentionally absent
 * until their API contract is available.
 */
export type MissionContext = Pick<UserContext, 'origin_harbor' | 'craft_profile' | 'departure_time' | 'return_time' | 'target_pfz'>;

export const DEFAULT_MISSION_CONTEXT: MissionContext = {
  origin_harbor: 'Ratnagiri',
  craft_profile: 'motorized_boat',
  departure_time: 'today',
  return_time: 'tomorrow',
};

/** Counterfactual simulation parameters for Mission Twin */
export interface WhatIfParameters {
  timeOffsetHours: number;
  craftProfileOverride: MissionContext['craft_profile'];
  objective: 'pfz' | 'safety' | 'transit';
}

export const DEFAULT_WHAT_IF_PARAMS: WhatIfParameters = {
  timeOffsetHours: 4,
  craftProfileOverride: 'motorized_boat',
  objective: 'pfz',
};

/** Decision Diff comparing baseline response to counterfactual simulation */
export interface DecisionDiff {
  baselineStatus: string;
  simulatedStatus: string;
  summary: string;
  timeOffsetHours: number;
  craftProfile: MissionContext['craft_profile'];
  timestamp: string;
}

/** Operational corridor modes for multi-route evaluation */
export type OperationalMode = 'safest' | 'balanced' | 'direct';

// =============================================================================
// Canonical MissionState / Mission Twin Contracts (Matching backend/app/contracts/mission.py)
// =============================================================================

export interface MissionUser {
  identity?: string;
  locale: string;
  profile?: 'fisher' | 'authority' | 'researcher';
}

export interface MissionVessel {
  type: string;
  size_m?: number;
  speed_knots?: number;
  range_km?: number;
  capabilities?: string[];
  safety_constraints?: Record<string, any>;
}

export interface MissionLocation {
  name?: string;
  latitude?: number;
  longitude?: number;
}

export interface MissionTiming {
  departure?: string;
  operation_start?: string;
  operation_end?: string;
  return_deadline?: string;
  duration_hours: number;
}

export interface MissionConstraints {
  legal?: string[];
  safety?: string[];
  operational?: string[];
  vessel?: string[];
  user_preferences?: Record<string, any>;
}

export interface MissionPreferences {
  distance?: number;
  fuel?: number;
  time?: number;
  opportunity?: number;
  risk_tolerance?: 'cautious' | 'balanced' | 'opportunity';
}

export interface MissionRoute {
  corridor_name?: string;
  waypoints?: [number, number][];
  distance_km?: number;
  max_wave_height_m?: number;
  exposure_score?: number;
}

export interface MissionState {
  mission_id: string;
  conversation_id?: string;
  user: MissionUser;
  vessel: MissionVessel;
  objective: {
    type: 'fishing' | 'transit' | 'research' | 'emergency' | 'other';
    description?: string;
    target_species?: string;
  };
  origin: MissionLocation;
  destination?: MissionLocation;
  operation_area?: Record<string, any>;
  timing: MissionTiming;
  constraints?: MissionConstraints;
  preferences?: MissionPreferences;
  selected_area?: Record<string, any>;
  route?: MissionRoute;
  previous_decision?: {
    decision: string;
    confidence?: { level: string; reasons: string[] };
    decisive_factor?: string;
    evidence_ids?: string[];
    timestamp: string;
  };
  created_at: string;
  updated_at: string;
}

export interface DecisionObject {
  decision: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_reasons: string[];
  decisive_factor: string;
  supporting_factors: string[];
  non_decisive_factors: string[];
  constraints_applied: string[];
  evidence: any[];
  inferences: string[];
  provenance: any[];
  uncertainty: string[];
  alternatives: any[];
  recommended_action: string;
  timestamp: string;
}

export interface DecisionDeltaContract {
  original_decision: string;
  new_decision: string;
  decision_changed: boolean;
  confidence_change?: string;
  decisive_factor_change?: { original: string; new: string };
  added_factors: string[];
  removed_factors: string[];
  changed_factors: string[];
  temporal_changes: Record<string, any>;
  route_changes?: Record<string, any>;
  spatial_changes?: Record<string, any>;
  summary: string;
}

