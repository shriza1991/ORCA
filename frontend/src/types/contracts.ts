/**
 * Canonical Shared Contracts for SAMUDRA Frontend
 *
 * Direct TypeScript translation of backend/app/contracts/chat.py
 * Owned by Dev 1 (Frontend Lead) & Dev 2 (Backend Platform).
 */

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
  target_pfz?: string;
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
  confidence: Confidence;
  evidence: EvidenceItem[];
  map_layers: MapLayer[];
  trace: AgentTraceItem[];
  warnings: string[];
  suggested_followups: string[];
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
