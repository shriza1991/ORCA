import type {
  UserContext,
  Recommendation,
  RecommendationStatus,
  MapLayer,
  AgentCollaborationPayload,
  ThresholdComparison,
} from "./contracts";
import type { MissionState } from "./mission";

export interface TripAssessmentRequest {
  origin_harbor?: string;
  coordinates?: [number, number];
  craft_profile: string;
  vessel_size?: string;
  departure_time?: string;
  return_time?: string;
  destination_id?: string;
  language_preference: string;
  data_mode: string;
  parent_assessment_id?: string;
  mission_state?: MissionState;
}

export interface AssessmentSourceStatus {
  provider_name: string;
  status: string;
  error_message?: string;
}

export interface ObservationBundle {
  timestamp?: string;
  captured_at?: string;
  data_mode?: string;
  measurements?: Record<string, any>;
  source_metadata?: { provenance_mode?: "LIVE" | "SAVED" | "DEMO" | string };
  hourly_forecast?: Array<Record<string, any>>;
  marine?: {
    significant_wave_height_m?: number | null;
    swell_height_m?: number | null;
    swell_period_sec?: number | null;
    surface_current_knots?: number | null;
    sea_surface_temp_c?: number | null;
    sea_level_height_m?: number | null;
    tide_level_m?: number | null;
    tide_phase?: string | null;
    tide_is_estimated?: boolean;
    hourly_forecast?: Array<Record<string, any>>;
    observed_at?: string | null;
    valid_to?: string | null;
    source_name?: string;
  } | null;
  weather?: {
    wind_speed_knots?: number | null;
    wind_gust_knots?: number | null;
    wind_direction_deg?: number | null;
    visibility_km?: number | null;
    observed_at?: string | null;
    valid_to?: string | null;
    source_name?: string;
  } | null;
  hazard?: {
    severity?: string;
    headline?: string | null;
    cyclone_warning_active?: boolean;
    squall_alert?: boolean;
    [key: string]: any;
  } | null;
}

export interface Alert {
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  affects_trip: boolean;
  action: string;
}

export interface MissionBriefPayload {
  summary: string;
  recommended_action: string;
  positive_factors: string[];
  negative_factors: string[];
  confidence: string;
  confidence_reasons: string[];
  vessel_type?: string;
  vessel_size?: string;
  capability_notes?: string;
}

export interface DecisionBoundaryItem {
  metric_name: string;
  observed_value: number;
  threshold_value: number;
  operator: string;
  unit: string;
  margin: number;
  margin_percent: number;
  target_tier: string;
  is_nearest_boundary: boolean;
}

export interface DecisionStabilityPayload {
  level: "HIGH" | "MEDIUM" | "LOW" | string;
  headline: string;
  reason: string;
  nearest_boundary?: DecisionBoundaryItem | null;
  minimal_safe_adjustment?: string | null;
  sensitivity_ranking: string[];
}

export interface SafeMissionWindow {
  is_current_safe: boolean;
  recommended_window_start?: string | null;
  recommended_window_end?: string | null;
  earliest_safer_departure?: string | null;
  window_summary: string;
}

export interface CounterfactualFlipExplanation {
  baseline_decision: string;
  simulated_decision: string;
  decision_flipped: boolean;
  primary_cause_metric: string;
  observed_before: number | string;
  observed_after: number | string;
  threshold_crossed: number | string;
  explanation_text: string;
  minimal_adjustment_to_revert?: string | null;
}

export interface TripAssessmentResponse {
  assessment_id: string;
  assessed_at: string;
  trip_context: UserContext;
  decision: RecommendationStatus | Recommendation;
  conditions: ObservationBundle;
  alerts: Alert[];
  pfz_candidates: Record<string, any>[];
  route_candidates: Record<string, any>[];
  map_layers: { layers: MapLayer[] };
  evidence: (ThresholdComparison | Record<string, any>)[];
  source_status: AssessmentSourceStatus[];
  is_durable: boolean;
  mission_state?: MissionState;
  brief?: MissionBriefPayload;
  agent_collaboration?: AgentCollaborationPayload;
  stability?: DecisionStabilityPayload | null;
  safe_window?: SafeMissionWindow | null;
}
