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
}

export interface ActiveAlertsResponse {
  subscription_id: string;
  alerts: ActionableAlertDto[];
}

export interface SavedTripRequest {
  origin_harbor: string;
  craft_profile: string;
  departure_time?: string;
  return_time?: string;
  language: string;
}

export interface SavedTripResponse {
  subscription_id: string;
  origin_harbor: string;
  craft_profile: string;
  is_active: boolean;
  created_at: string;
}

export interface AcknowledgeResponse {
  success: boolean;
  alert_id: string;
  is_acknowledged: boolean;
}
