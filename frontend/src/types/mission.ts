import type { UserContext } from './contracts';

/** UI-only presentation mode. It deliberately does not grant server permissions. */
export type OperationalRole = 'fisher' | 'authority';

/**
 * Context collected by the client and sent only through the canonical
 * ChatRequest.user_context shape. Route/time fields are intentionally absent
 * until their API contract is available.
 */
export type MissionContext = Pick<UserContext, 'origin_harbor' | 'craft_profile' | 'departure_time' | 'return_time'>;

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
