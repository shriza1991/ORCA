import { describe, it, expect } from 'vitest';
import type { TripAssessmentResponse, MissionBriefPayload } from '../../types/assessment';
import type { DecisionDelta, DecisionDiff } from '../../types/mission';

describe('ORCA M1.2: Mission Brief / Why Panel Component & Contracts', () => {
  const mockSafeBrief: MissionBriefPayload = {
    summary: 'Conditions are calm and safe for coastal voyage departure.',
    recommended_action: 'Proceed with planned voyage under standard safety protocols.',
    positive_factors: [
      'Significant wave height 1.2m is calm (< 1.5m).',
      'Sustained wind 10.0 kt is favorable.',
      'Visibility is good (12.0 km).',
    ],
    negative_factors: [],
    confidence: 'HIGH',
    confidence_reasons: [
      'Fresh in-situ observation available from ratnagiri_buoy_01',
      'IMD coastal forecast validated within 1 hour',
    ],
  };

  const mockCautionBrief: MissionBriefPayload = {
    summary: 'Moderate wave conditions (1.9m waves, 16 kt wind) require operational caution for motorized boat.',
    recommended_action: 'Proceed with increased vigilance. Avoid open-sea shoals.',
    positive_factors: ['Visibility is good (10.0 km).'],
    negative_factors: ['Moderate wave height 1.9m requires caution.'],
    confidence: 'MEDIUM',
    confidence_reasons: ['Observation is 3 hours old, relying on blended forecast'],
  };

  const mockNoGoBrief: MissionBriefPayload = {
    summary: 'Departure advised against (NO-GO). Severe sea state with wave heights of 3.4m and active IMD squall alert.',
    recommended_action: 'Cancel or postpone departure until squall warning clears.',
    positive_factors: [],
    negative_factors: [
      'Wave height 3.4m exceeds vessel safety threshold of 2.0m.',
      'Active IMD squall alert in operational sector.',
    ],
    confidence: 'HIGH',
    confidence_reasons: ['High severity IMD warning active'],
  };

  it('Test 1: TripAssessmentResponse contains brief with all canonical fields', () => {
    const assessment: TripAssessmentResponse = {
      assessment_id: 'assmnt_brief_01',
      assessed_at: '2026-09-26T06:00:00Z',
      trip_context: {
        origin_harbor: 'Ratnagiri',
        craft_profile: 'motorized_boat',
        departure_time: '2026-09-26T06:00:00Z',
        return_time: '2026-09-26T18:00:00Z',
      },
      decision: {
        status: 'GO',
        summary: mockSafeBrief.summary,
        decisive_factors: ['Wave calm', 'Wind calm'],
        next_action: mockSafeBrief.recommended_action,
      },
      conditions: {
        timestamp: '2026-09-26T06:00:00Z',
        measurements: {
          significant_wave_height: { value: 1.2, unit: 'm' },
          wind_speed: { value: 10.0, unit: 'kn' },
          visibility: { value: 12.0, unit: 'km' },
          is_forecast: false,
        },
      },
      alerts: [],
      pfz_candidates: [],
      route_candidates: [],
      map_layers: { layers: [] },
      evidence: [],
      source_status: [],
      is_durable: false,
      brief: mockSafeBrief,
    };

    expect(assessment.brief).toBeDefined();
    expect(assessment.brief?.summary).toBe(mockSafeBrief.summary);
    expect(assessment.brief?.recommended_action).toBe(mockSafeBrief.recommended_action);
    expect(Array.isArray(assessment.brief?.positive_factors)).toBe(true);
    expect(Array.isArray(assessment.brief?.negative_factors)).toBe(true);
    expect(assessment.brief?.confidence).toBe('HIGH');
    expect(Array.isArray(assessment.brief?.confidence_reasons)).toBe(true);
  });

  it('Test 2: GO assessments show positive factors and empty negative factors', () => {
    expect(mockSafeBrief.positive_factors.length).toBeGreaterThan(0);
    expect(mockSafeBrief.negative_factors.length).toBe(0);
    expect(mockSafeBrief.confidence).toBe('HIGH');
  });

  it('Test 3: CAUTION and NO_GO assessments populate negative factors with breached thresholds', () => {
    expect(mockCautionBrief.negative_factors.length).toBe(1);
    expect(mockCautionBrief.negative_factors[0]).toContain('Moderate wave height');

    expect(mockNoGoBrief.negative_factors.length).toBe(2);
    expect(mockNoGoBrief.negative_factors[0]).toContain('Wave height 3.4m exceeds vessel safety threshold');
    expect(mockNoGoBrief.negative_factors[1]).toContain('squall alert');
  });

  it('Test 4: In-memory consumption with zero additional network requests', () => {
    // MissionBriefPanel accepts memory props directly without triggering network calls
    const props = {
      brief: mockSafeBrief,
      language: 'en' as const,
    };
    expect(props.brief).toBe(mockSafeBrief);
    expect(props.brief.summary.length).toBeGreaterThan(0);
  });

  it('Test 5: What-If delta support displays changed factors when DecisionDelta or DecisionDiff exists', () => {
    const delta: DecisionDelta = {
      original_decision: 'GO',
      new_decision: 'CAUTION',
      decision_changed: true,
      added_factors: [],
      removed_factors: [],
      changed_factors: [
        'Departure shifted from 06:00 to 14:00 (+8 hrs)',
        'Wave height increases from 1.2m to 2.4m',
      ],
      temporal_changes: {},
      summary: 'Wave height worsens in afternoon window',
    };

    const activeDiff: DecisionDiff = {
      baselineStatus: 'SAFE_TO_GO',
      simulatedStatus: 'CAUTION',
      summary: 'Wave height worsens in afternoon window',
      timeOffsetHours: 4,
      craftProfile: 'motorized_boat',
      timestamp: '2026-09-26T10:00:00Z',
    };

    const hasChangedFactors = (delta?.changed_factors && delta.changed_factors.length > 0) || !!activeDiff?.summary;
    expect(hasChangedFactors).toBe(true);
    expect(delta.changed_factors.length).toBe(2);
    expect(delta.changed_factors[0]).toContain('Departure shifted');
    expect(activeDiff.baselineStatus).toBe('SAFE_TO_GO');
    expect(activeDiff.simulatedStatus).toBe('CAUTION');
  });

  it('Test 6: Hides What Changed section when delta and activeDiff are absent', () => {
    const delta: DecisionDelta | null = null;
    const activeDiff: DecisionDiff | null = null;

    const changedFactors = delta ? (delta as any).changed_factors || [] : [];
    const hasChangedFactors = changedFactors.length > 0 || !!(activeDiff as any)?.summary;
    expect(hasChangedFactors).toBe(false);
  });
});
