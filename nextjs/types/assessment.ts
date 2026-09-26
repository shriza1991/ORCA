import type { UserContext, Recommendation, MapLayer, AgentCollaborationPayload } from './contracts';

export interface TripAssessmentRequest {
  origin_harbor?: string;
  coordinates?: [number, number];
  craft_profile: string;
  departure_time?: string;
  return_time?: string;
  destination_id?: string;
  language_preference: string;
  data_mode: string;
  parent_assessment_id?: string;
}

export interface AssessmentSourceStatus {
  provider_name: string;
  status: string;
  error_message?: string;
}

export interface ObservationBundle {
  timestamp: string;
  measurements: Record<string, any>;
}

export interface Alert {
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  affects_trip: boolean;
  action: string;
}

export interface TripAssessmentResponse {
  assessment_id: string;
  assessed_at: string;
  trip_context: UserContext;
  decision: Recommendation;
  conditions: ObservationBundle;
  alerts: Alert[];
  pfz_candidates: Record<string, any>[];
  route_candidates: Record<string, any>[];
  map_layers: { layers: MapLayer[] };
  evidence: Record<string, any>[];
  source_status: AssessmentSourceStatus[];
  is_durable: boolean;
  agent_collaboration?: AgentCollaborationPayload;
}
