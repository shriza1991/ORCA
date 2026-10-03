import type { TripAssessmentResponse } from '../types/assessment';
import type { MissionContext } from '../types/mission';

export interface DecisionMissionIdentityInputs {
  origin_harbor?: string | null;
  coordinates?: [number, number] | null;
  craft_profile?: string | null;
  vessel_size?: string | null;
  departure_time?: string | null;
  return_time?: string | null;
  target_pfz?: string | null;
  destination_id?: string | null;
  data_mode?: string | null;
}

/**
 * Deterministic mission identity key capturing all decision-relevant inputs.
 * Normalizes coordinates, timestamps, and casing.
 */
export function getMissionIdentityKey(inputs: DecisionMissionIdentityInputs): string {
  const harbor = (inputs.origin_harbor || '').trim();
  const coords = inputs.coordinates
    ? [Number(inputs.coordinates[0].toFixed(4)), Number(inputs.coordinates[1].toFixed(4))]
    : null;
  const craft = inputs.craft_profile || 'motorized_boat';
  const size = inputs.vessel_size || 'medium';
  const depTime = inputs.departure_time
    ? (isNaN(Date.parse(inputs.departure_time)) ? inputs.departure_time : new Date(Date.parse(inputs.departure_time)).toISOString())
    : '';
  const retTime = inputs.return_time
    ? (isNaN(Date.parse(inputs.return_time)) ? inputs.return_time : new Date(Date.parse(inputs.return_time)).toISOString())
    : '';
  const target = inputs.target_pfz || inputs.destination_id || '';
  const mode = (inputs.data_mode || 'DEMO').toUpperCase();

  return JSON.stringify([harbor, coords, craft, size, depTime, retTime, target, mode]);
}

/**
 * Checks whether an assessment applies to the current active mission context.
 */
/** Compare requested inputs without treating absent stored evidence as a match. */
export function assessmentMatchesInputs(
  assessment: TripAssessmentResponse | null | undefined,
  expected: DecisionMissionIdentityInputs,
): boolean {
  if (!assessment?.trip_context) return false;
  const actual = assessment.trip_context;
  const size = assessment.mission_state?.vessel?.size_category || actual.vessel_size;
  for (const [wanted, stored] of [
    [expected.origin_harbor, actual.origin_harbor],
    [expected.craft_profile, actual.craft_profile],
    [expected.vessel_size, size],
  ]) {
    if (wanted && wanted !== stored) return false;
  }
  for (const [wanted, stored] of [
    [expected.departure_time, actual.departure_time],
    [expected.return_time, actual.return_time],
  ]) {
    if (wanted && (!stored || !Number.isFinite(Date.parse(wanted)) || Date.parse(wanted) !== Date.parse(stored))) return false;
  }
  if ((expected.target_pfz || expected.destination_id || '') !== (actual.target_pfz || '')) return false;
  if (expected.coordinates && (!actual.coordinates ||
    expected.coordinates.some((value, i) => !Number.isFinite(value) || value.toFixed(4) !== actual.coordinates![i]?.toFixed(4)))) return false;
  if (expected.data_mode && expected.data_mode.toUpperCase() !== assessment.conditions?.data_mode?.toUpperCase()) return false;
  return true;
}

export function isAssessmentApplicableToContext(
  assessment: TripAssessmentResponse | null | undefined,
  context: MissionContext & DecisionMissionIdentityInputs,
  isExpired = false,
  isLoading = false,
): boolean {
  return !isExpired && !isLoading && assessmentMatchesInputs(assessment, context);
}

/** Complete plan comparison for operations that must preserve every mission input. */
function sameAssessmentPlan(a: TripAssessmentResponse, b: TripAssessmentResponse): boolean {
  const identity = (record: TripAssessmentResponse) => getMissionIdentityKey({
    ...record.trip_context,
    vessel_size: record.mission_state?.vessel?.size_category || record.trip_context.vessel_size,
    data_mode: record.conditions?.data_mode,
  });
  return identity(a) === identity(b);
}

/** A stale, unrelated, or malformed response must never become the active plan (delay-only map proposal). */
export function matchesMissionProposal(
  baseline: TripAssessmentResponse,
  proposed: TripAssessmentResponse | undefined,
  departure: string,
  returnTime: string,
): boolean {
  if (!proposed?.trip_context || !proposed.conditions || !baseline.evidence_bundle_id || !baseline.mission_state) return false;
  const original = baseline.trip_context;
  const next = proposed.trip_context;
  return (
    !!proposed.assessment_id &&
    proposed.assessment_id !== baseline.assessment_id &&
    proposed.evidence_bundle_id === baseline.evidence_bundle_id &&
    next.parent_assessment_id === baseline.assessment_id &&
    proposed.mission_state?.mission_id === baseline.mission_state.mission_id &&
    proposed.conditions.data_mode === baseline.conditions.data_mode &&
    next.origin_harbor === original.origin_harbor &&
    JSON.stringify(next.coordinates ?? null) === JSON.stringify(original.coordinates ?? null) &&
    next.craft_profile === original.craft_profile &&
    next.vessel_size === original.vessel_size &&
    next.target_pfz === original.target_pfz &&
    Date.parse(next.departure_time || '') === Date.parse(departure) &&
    Date.parse(next.return_time || '') === Date.parse(returnTime)
  );
}

export interface SimulationValidationEdits {
  departure?: string;
  returnTime?: string;
  craftProfile?: string;
  vesselSize?: string;
}

/**
 * Validates a simulation proposal against the captured baseline and requested edits.
 * Accepts intentional craft and size changes while strictly rejecting unexpected edits.
 */
export function validateSimulationProposal(
  baseline: TripAssessmentResponse | null | undefined,
  proposed: TripAssessmentResponse | null | undefined,
  edits: SimulationValidationEdits,
): { valid: boolean; reason?: string } {
  if (!baseline || !proposed) return { valid: false, reason: 'Missing baseline or proposed assessment.' };
  if (!proposed.assessment_id || proposed.assessment_id === baseline.assessment_id) {
    return { valid: false, reason: 'Simulation must produce a distinct assessment ID.' };
  }
  if (!baseline.evidence_bundle_id || proposed.evidence_bundle_id !== baseline.evidence_bundle_id) {
    return { valid: false, reason: 'Simulation must reuse the retained evidence bundle.' };
  }
  if (proposed.trip_context?.parent_assessment_id !== baseline.assessment_id) {
    return { valid: false, reason: 'Proposed parent_assessment_id must match the active baseline.' };
  }
  if (baseline.mission_state && proposed.mission_state?.mission_id !== baseline.mission_state.mission_id) {
    return { valid: false, reason: 'Mission identity linkage was lost in simulation.' };
  }
  if (proposed.conditions?.data_mode !== baseline.conditions?.data_mode) {
    return { valid: false, reason: 'Data mode must match baseline.' };
  }
  if (proposed.trip_context?.origin_harbor !== baseline.trip_context?.origin_harbor) {
    return { valid: false, reason: 'Origin harbor was unexpectedly modified.' };
  }
  if (JSON.stringify(proposed.trip_context?.coordinates ?? null) !== JSON.stringify(baseline.trip_context?.coordinates ?? null)) {
    return { valid: false, reason: 'Coordinates were unexpectedly modified.' };
  }
  if (proposed.trip_context?.target_pfz !== baseline.trip_context?.target_pfz) {
    return { valid: false, reason: 'Target fishing area was unexpectedly modified.' };
  }

  const expectedCraft = edits.craftProfile || baseline.trip_context?.craft_profile;
  if (expectedCraft && proposed.trip_context?.craft_profile !== expectedCraft) {
    return { valid: false, reason: `Craft profile does not match requested ${expectedCraft}.` };
  }

  const expectedSize = edits.vesselSize || baseline.mission_state?.vessel?.size_category || baseline.trip_context?.vessel_size;
  const actualSize = proposed.mission_state?.vessel?.size_category || proposed.trip_context?.vessel_size;
  if (expectedSize && actualSize !== expectedSize) {
    return { valid: false, reason: `Vessel size does not match requested ${expectedSize}.` };
  }

  const expectedDeparture = edits.departure || baseline.trip_context?.departure_time;
  const expectedReturn = edits.returnTime || baseline.trip_context?.return_time;
  if (expectedDeparture) {
    if (Date.parse(proposed.trip_context?.departure_time || '') !== Date.parse(expectedDeparture)) {
      return { valid: false, reason: 'Departure time does not match requested proposal.' };
    }
  }
  if (expectedReturn) {
    if (Date.parse(proposed.trip_context?.return_time || '') !== Date.parse(expectedReturn)) {
      return { valid: false, reason: 'Return time does not match requested proposal.' };
    }
  }

  return { valid: true };
}

/**
 * Validates a corridor selection assessment against the captured baseline.
 */
export function validateRouteChoiceProposal(
  baseline: TripAssessmentResponse | null | undefined,
  proposed: TripAssessmentResponse | null | undefined,
  expectedRouteId: string,
): { valid: boolean; reason?: string } {
  if (!baseline || !proposed) return { valid: false, reason: 'Missing baseline or proposed assessment.' };
  if (!proposed.assessment_id || proposed.assessment_id === baseline.assessment_id) {
    return { valid: false, reason: 'Route selection must produce a distinct assessment ID.' };
  }
  if (!baseline.evidence_bundle_id || proposed.evidence_bundle_id !== baseline.evidence_bundle_id) {
    return { valid: false, reason: 'Route selection must reuse the retained evidence bundle.' };
  }
  if (proposed.trip_context?.parent_assessment_id !== baseline.assessment_id) {
    return { valid: false, reason: 'Proposed parent_assessment_id must match the active baseline.' };
  }
  if (proposed.conditions?.data_mode !== baseline.conditions?.data_mode) {
    return { valid: false, reason: 'Data mode must match baseline.' };
  }
  if (
    proposed.trip_context?.origin_harbor !== baseline.trip_context?.origin_harbor ||
    proposed.trip_context?.craft_profile !== baseline.trip_context?.craft_profile ||
    Date.parse(proposed.trip_context?.departure_time || '') !== Date.parse(baseline.trip_context?.departure_time || '') ||
    Date.parse(proposed.trip_context?.return_time || '') !== Date.parse(baseline.trip_context?.return_time || '')
  ) {
    return { valid: false, reason: 'Route selection changed core mission parameters unexpectedly.' };
  }
  if (!sameAssessmentPlan(baseline, proposed) ||
      (baseline.mission_state && proposed.mission_state?.mission_id !== baseline.mission_state.mission_id)) {
    return { valid: false, reason: 'Route selection changed mission identity or plan inputs.' };
  }
  const hasRoute = (proposed.route_candidates || []).some(
    r => r.route_id === expectedRouteId && r.is_recommended && r.departure_supported,
  );
  if (!hasRoute) {
    return { valid: false, reason: `Requested route ${expectedRouteId} is not in returned candidates.` };
  }

  return { valid: true };
}

/**
 * Validates an evidence-refreshed assessment against the active baseline.
 * Permitted to differ in evidence bundle, but must preserve mission parameters and baseline parentage.
 */
export function validateRefreshedAssessment(
  baseline: TripAssessmentResponse | null | undefined,
  refreshed: TripAssessmentResponse | null | undefined,
): { valid: boolean; reason?: string } {
  if (!baseline || !refreshed) return { valid: false, reason: 'Missing baseline or refreshed assessment.' };
  if (!refreshed.assessment_id || refreshed.assessment_id === baseline.assessment_id) {
    return { valid: false, reason: 'Refresh must return a distinct assessment record.' };
  }
  if (refreshed.trip_context?.parent_assessment_id !== baseline.assessment_id) {
    return { valid: false, reason: 'Refreshed parent_assessment_id must link to the current baseline.' };
  }
  if (baseline.mission_state && refreshed.mission_state?.mission_id !== baseline.mission_state.mission_id) {
    return { valid: false, reason: 'Refreshed assessment lost mission linkage.' };
  }
  if (
    refreshed.trip_context?.origin_harbor !== baseline.trip_context?.origin_harbor ||
    refreshed.trip_context?.craft_profile !== baseline.trip_context?.craft_profile ||
    Date.parse(refreshed.trip_context?.departure_time || '') !== Date.parse(baseline.trip_context?.departure_time || '') ||
    Date.parse(refreshed.trip_context?.return_time || '') !== Date.parse(baseline.trip_context?.return_time || '')
  ) {
    return { valid: false, reason: 'Refreshed assessment does not match the active mission parameters.' };
  }
  if (!sameAssessmentPlan(baseline, refreshed)) {
    return { valid: false, reason: 'Refreshed assessment changed mission coordinates, vessel, destination, or data mode.' };
  }
  return { valid: true };
}

/**
 * Validates a chat proposed assessment against the active baseline.
 */
export function validateChatProposedAssessment(
  baseline: TripAssessmentResponse | null | undefined,
  proposed: TripAssessmentResponse | null | undefined,
  isExpired?: boolean,
): { valid: boolean; reason?: string } {
  if (!baseline || !proposed) return { valid: false, reason: 'Missing baseline or proposed assessment.' };
  if (isExpired) return { valid: false, reason: 'Active baseline assessment has expired.' };
  if (!proposed.assessment_id || proposed.assessment_id === baseline.assessment_id) {
    return { valid: false, reason: 'Proposed assessment ID must differ from baseline.' };
  }
  if (proposed.trip_context?.parent_assessment_id !== baseline.assessment_id) {
    return { valid: false, reason: 'Proposal was evaluated against a different baseline assessment.' };
  }
  if (baseline.evidence_bundle_id && proposed.evidence_bundle_id !== baseline.evidence_bundle_id) {
    return { valid: false, reason: 'Proposal was evaluated against a different evidence bundle.' };
  }
  if (proposed.trip_context?.origin_harbor !== baseline.trip_context?.origin_harbor) {
    return { valid: false, reason: 'Proposal does not match the current mission origin.' };
  }
  if (proposed.conditions?.data_mode !== baseline.conditions?.data_mode ||
      JSON.stringify(proposed.trip_context?.coordinates ?? null) !== JSON.stringify(baseline.trip_context?.coordinates ?? null) ||
      (baseline.mission_state && proposed.mission_state?.mission_id !== baseline.mission_state.mission_id)) {
    return { valid: false, reason: 'Proposal changed evidence context or lost mission linkage.' };
  }
  return { valid: true };
}
