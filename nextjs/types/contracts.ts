/**
 * Canonical Shared Contracts for SAMUDRA Frontend
 *
 * Direct TypeScript translation of backend/app/contracts/chat.py
 * Owned by Dev 1 (Frontend Lead) & Dev 2 (Backend Platform).
 */

import type { DecisionObject, MissionState } from './mission';

export type RecommendationStatus = 'GO' | 'CAUTION' | 'NO_GO' | 'UNKNOWN' | 'INFORMATIONAL';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface UserContext {
  /** Canonical surveillance sector selected in the Authority Command Deck. */
  sector_id?: string;
  origin_harbor?: string;
  coordinates?: [number, number]; // [lon, lat]
  craft_profile?: 'traditional_non_motorized' | 'motorized_boat' | 'mechanized_trawler';
  departure_time?: string;
  return_time?: string;
  language_preference?: 'auto' | 'en' | 'hi' | 'mr' | 'ta';
  parent_assessment_id?: string;
}

export interface ChatRequest {
  conversation_id?: string;
  message: string;
  user_context?: UserContext;
}

export interface ThresholdComparison {
  metric_name: string;
  observed_value: any;
  threshold_value: any;
  operator: string;
  unit?: string;
  exceeded: boolean;
  impact: string;
  description: string;
}

export interface DataProvenance {
  provider_name: string;
  source_name: string;
  source_url?: string;
  observed_time?: string;
  valid_from?: string;
  valid_to?: string;
  data_mode?: string;
  is_stale?: boolean;
  quality_flags?: string[];
}

export interface Recommendation {
  status: RecommendationStatus;
  summary: string;
  decisive_factors: string[];
  non_decisive_factors?: string[];
  threshold_comparisons?: ThresholdComparison[];
  next_action: string;
  confidence?: Confidence;
  provenance?: DataProvenance[];
  evidence_ids?: string[];
  warnings?: string[];
}

export interface Confidence {
  level: ConfidenceLevel;
  reasons: string[];
}

export interface EvidenceItem {
  source_name: string;
  source_url?: string;
  observed_time?: string;
  valid_from?: string;
  valid_to?: string;
  retrieved_at: string;
  geometry?: {
    type: string;
    coordinates: any;
  };
  metric_name?: string;
  metric_value?: any;
  metric_unit?: string;
  quality_flags: string[];
}

export interface MapLayer {
  layer_id: string;
  name: string;
  layer_type: 'geojson';
  visible: boolean;
  style?: Record<string, any>;
  properties?: Record<string, any>;
  geojson: {
    type: 'Feature' | 'FeatureCollection';
    features?: any[];
    [key: string]: any;
  };
}

export interface AgentTraceItem {
  step: number;
  node: string;
  action: string;
  status: 'started' | 'completed' | 'failed' | string;
  timestamp: string;
  agent?: string;
  duration_ms?: number;
  evidence_ids?: string[];
  error?: string;
  tool_name?: string;
}

export interface ChatResponse {
  run_id: string;
  conversation_id: string;
  assessment_id?: string;
  language: string;
  intent: string;
  answer: string;
  recommendation: Recommendation;
  decision_object?: DecisionObject;
  confidence: Confidence;
  evidence: EvidenceItem[];
  map_layers: MapLayer[];
  trace: AgentTraceItem[];
  warnings: string[];
  suggested_followups: string[];
  agent_collaboration?: AgentCollaborationPayload;
  decision_delta?: any;
  mission_state?: MissionState;
  data_mode: 'LIVE' | 'CACHED_REAL' | 'DEMO' | 'MOCK' | 'FALLBACK' | 'UNAVAILABLE';
}

export type DataQualityRating = 'Verified' | 'Partial' | 'Snapshot Fallback' | 'Limited';

export interface AgentEvidenceSource {
  source_name: string;
  provider: string;
  last_updated?: string;
  valid_to?: string;
  coverage: string;
  quality_rating: DataQualityRating;
}

export interface IndividualAgentReasoning {
  agent_id: string;
  agent_name: string;
  role_description: string;
  status: 'RUNNING' | 'COMPLETE' | 'WARNING' | 'CONFLICT' | string;
  recommendation: RecommendationStatus;
  evidence_strength: ConfidenceLevel;
  data_quality: DataQualityRating;
  sources: AgentEvidenceSource[];
  observations: Record<string, any>;
  summary: string;
  key_findings: string[];
}

export interface ConflictArbitration {
  conflict_detected: boolean;
  conflict_type?: string;
  reason?: string;
  agent_positions: Record<string, string>;
  winning_agent: string;
  winning_decision: RecommendationStatus;
  winning_rule: string;
  accepted_reasons: string[];
  rejected_reasons: string[];
}

export interface CausalReasoningExplanation {
  facts: Array<{ metric: string; value: string; source?: string; [key: string]: any }>;
  inferences: string[];
  constraints: string[];
  decision: string;
  recommendation: string;
}

export interface ReasoningTimelineStep {
  step_number: number;
  agent_id: string;
  label: string;
  timestamp: string;
  duration_ms: number;
  status: string;
  detail: string;
}

export interface AgentCollaborationPayload {
  agents: IndividualAgentReasoning[];
  arbitration: ConflictArbitration;
  explanation: CausalReasoningExplanation;
  timeline: ReasoningTimelineStep[];
  stakeholder_perspectives: Record<string, any>;
}

export interface TranscribeResponse {
  transcript: string;
  language: string;
  normalized_language: string;
}

export interface VoiceChatResponse extends ChatResponse {
  transcript: string;
  detected_language: string;
  audio_base64?: string;
  audio_format?: string;
}
