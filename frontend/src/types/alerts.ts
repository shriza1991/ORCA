export interface ActionableAlertDto {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  recommended_action: string;
  status: string;
  is_acknowledged: boolean;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  is_session_only?: boolean;
  refreshed_assessment?: any;
}

export interface ActiveAlertsResponse {
  subscription_id: string;
  alerts: ActionableAlertDto[];
  monitoring_mode?: string;
}

export interface SavedTripRequest {
  origin_harbor: string;
  craft_profile: string;
  vessel_size?: string;
  departure_time?: string;
  return_time?: string;
  language: string;
  data_mode?: string;
}

export interface SavedTripResponse {
  subscription_id: string;
  origin_harbor: string;
  craft_profile: string;
  vessel_size?: string;
  data_mode?: string;
  monitoring_mode?: string;
  is_active: boolean;
  created_at: string;
}

export interface AcknowledgeResponse {
  success: boolean;
  alert_id: string;
  is_acknowledged: boolean;
}

