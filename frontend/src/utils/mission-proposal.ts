import type { TripAssessmentResponse } from '../types/assessment';
/** A stale, unrelated, or malformed response must never become the active plan. */
export function matchesMissionProposal(baseline: TripAssessmentResponse, proposed: TripAssessmentResponse | undefined, departure: string, returnTime: string): boolean {
  if (!proposed?.trip_context || !proposed.conditions || !baseline.evidence_bundle_id || !baseline.mission_state) return false;
  const original = baseline.trip_context, next = proposed.trip_context;
  return !!proposed.assessment_id && proposed.assessment_id !== baseline.assessment_id &&
    proposed.evidence_bundle_id === baseline.evidence_bundle_id && next.parent_assessment_id === baseline.assessment_id &&
    proposed.mission_state?.mission_id === baseline.mission_state.mission_id && proposed.conditions.data_mode === baseline.conditions.data_mode &&
    next.origin_harbor === original.origin_harbor && JSON.stringify(next.coordinates ?? null) === JSON.stringify(original.coordinates ?? null) &&
    next.craft_profile === original.craft_profile && next.vessel_size === original.vessel_size && next.target_pfz === original.target_pfz &&
    Date.parse(next.departure_time || '') === Date.parse(departure) && Date.parse(next.return_time || '') === Date.parse(returnTime);
}
