import { describe, expect, it } from 'vitest';
import type { TripAssessmentResponse } from '../types/assessment';
import { matchesMissionProposal } from './mission-proposal';

const baseline = {
  assessment_id: 'baseline', evidence_bundle_id: 'evidence',
  conditions: { data_mode: 'DEMO' }, mission_state: { mission_id: 'mission' },
  trip_context: { origin_harbor: 'Ratnagiri', coordinates: [73, 17], craft_profile: 'motorized_boat', vessel_size: 'medium' },
} as TripAssessmentResponse;
const proposed = {
  ...baseline, assessment_id: 'proposal',
  trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline', departure_time: '2026-10-04T06:00:00Z', return_time: '2026-10-04T18:00:00Z' },
} as TripAssessmentResponse;
const matches = (value: TripAssessmentResponse | undefined) => matchesMissionProposal(baseline, value, '2026-10-04T06:00:00Z', '2026-10-04T18:00:00Z');
describe('returned mission proposal validation', () => {
  it('accepts the exact server proposal', () => expect(matches(proposed)).toBe(true));
  it.each([
    { assessment_id: 'baseline' }, { evidence_bundle_id: 'other' },
    { mission_state: { mission_id: 'other' } }, { conditions: { data_mode: 'LIVE' } },
    { trip_context: { ...proposed.trip_context, parent_assessment_id: 'other' } },
    { trip_context: { ...proposed.trip_context, craft_profile: 'mechanized_trawler' } },
    { trip_context: { ...proposed.trip_context, return_time: '2026-10-05T18:00:00Z' } },
  ])('rejects unrelated or changed results: %j', edit => expect(matches({ ...proposed, ...edit } as TripAssessmentResponse)).toBe(false));
  it('rejects an empty response', () => expect(matches(undefined)).toBe(false));
});
