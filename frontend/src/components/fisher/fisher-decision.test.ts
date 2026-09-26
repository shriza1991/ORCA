import { describe, it, expect } from 'vitest';
import {
  getFisherDecisionStatus,
  getFisherExplanation,
  extractFisherConditions,
} from './FisherDecisionSurface';
import type { TripAssessmentResponse } from '../../types/assessment';
import type { Recommendation } from '../../types/contracts';

describe('P0-22: Fisherman Decision Surface & Local Conditions', () => {
  const mockSafeResponse: TripAssessmentResponse = {
    assessment_id: 'assmnt_01',
    assessed_at: '2026-09-15T06:00:00Z',
    trip_context: {
      origin_harbor: 'Ratnagiri',
      coordinates: [73.28, 16.98],
      craft_profile: 'motorized_boat',
      departure_time: '2026-09-15T06:00:00Z',
      return_time: '2026-09-15T18:00:00Z'
    },
    decision: {
      status: 'GO',
      summary: 'Conditions are calm and safe for coastal voyage departure.',
      decisive_factors: ['Significant wave height 1.2m is calm (< 1.5m).', 'Sustained wind 10.0 kt is favorable.'],
      next_action: 'Proceed with planned voyage under standard safety protocols.',
    },
    conditions: {
      timestamp: '2026-09-15T06:00:00Z',
      measurements: {
        significant_wave_height: { value: 1.2, unit: 'm' },
        wind_speed: { value: 10.0, unit: 'kn' },
        visibility: { value: 12.0, unit: 'km' },
        is_forecast: false
      }
    },
    alerts: [],
    pfz_candidates: [],
    route_candidates: [],
    map_layers: { layers: [] },
    evidence: [],
    source_status: [],
    is_durable: false
  };

  const mockCautionResponse: TripAssessmentResponse = {
    ...mockSafeResponse,
    decision: {
      ...(mockSafeResponse.decision as Recommendation),
      status: 'CAUTION',
      summary: 'Moderate wave conditions (1.9m waves, 16 kt wind) require operational caution for motorized boat.',
      decisive_factors: ['Moderate wave height 1.9m requires caution.'],
    },
  };

  const mockNoGoResponse: TripAssessmentResponse = {
    ...mockSafeResponse,
    decision: {
      ...(mockSafeResponse.decision as Recommendation),
      status: 'NO_GO',
      summary: 'Departure advised against (NO-GO). Severe sea state with wave heights of 3.4m and active IMD squall alert.',
      decisive_factors: [
        'Significant wave height 3.4m exceeds safety ceiling (2.5m)',
        'Active IMD squall alert across coastal sector',
      ],
    },
    conditions: {
      timestamp: '2026-09-15T06:00:00Z',
      measurements: {
        significant_wave_height: { value: 3.4, unit: 'm' },
        wind_speed: { value: 25.0, unit: 'kn' },
        is_forecast: false
      }
    },
    alerts: [
      {
        title: 'Squall Alert',
        description: 'Active squall alert',
        severity: 'high',
        affects_trip: true,
        action: 'Do not depart.'
      }
    ]
  };

  const mockUnknownResponse: TripAssessmentResponse = {
    ...mockSafeResponse,
    decision: {
      ...(mockSafeResponse.decision as Recommendation),
      status: 'UNKNOWN',
      summary: 'Sensor telemetry is stale or missing. Safe departure evaluation cannot be completed.',
      decisive_factors: ['Missing critical sensor telemetry.'],
    },
    conditions: {
      timestamp: '2026-09-15T06:00:00Z',
      measurements: {}
    }
  };

  describe('Primary Decision State Resolution', () => {
    it('resolves UNKNOWN when no response exists (initial state)', () => {
      const status = getFisherDecisionStatus(null);
      expect(status).toBe('UNKNOWN');
      const explanation = getFisherExplanation(null, status, 'en');
      expect(explanation).toBe('No current safety assessment available.');
    });

    it('resolves SAFE_TO_GO when backend status is GO', () => {
      const status = getFisherDecisionStatus(mockSafeResponse);
      expect(status).toBe('SAFE_TO_GO');
      const explanation = getFisherExplanation(mockSafeResponse, status, 'en');
      expect(explanation).toContain('Conditions are calm and safe');
    });

    it('resolves CAUTION when backend status is CAUTION', () => {
      const status = getFisherDecisionStatus(mockCautionResponse);
      expect(status).toBe('CAUTION');
      const explanation = getFisherExplanation(mockCautionResponse, status, 'en');
      expect(explanation).toContain('Moderate wave conditions');
    });

    it('resolves DO_NOT_GO when backend status is NO_GO', () => {
      const status = getFisherDecisionStatus(mockNoGoResponse);
      expect(status).toBe('DO_NOT_GO');
      const explanation = getFisherExplanation(mockNoGoResponse, status, 'en');
      expect(explanation).toContain('Departure advised against (NO-GO)');
    });

    it('resolves UNKNOWN when backend reports UNKNOWN or degraded evidence', () => {
      const status = getFisherDecisionStatus(mockUnknownResponse);
      expect(status).toBe('UNKNOWN');
      const explanation = getFisherExplanation(mockUnknownResponse, status, 'en');
      expect(explanation).toContain('Sensor telemetry is stale or missing');
    });

    it('resolves UNKNOWN upon backend error and displays error message', () => {
      const status = getFisherDecisionStatus(null, 'Network connection failed');
      expect(status).toBe('UNKNOWN');
      const explanation = getFisherExplanation(null, status, 'en', 'Network connection failed');
      expect(explanation).toBe('Unable to obtain a current safety assessment.');
    });

    it('resolves explicit loading state without prematurely showing GO', () => {
      const status = getFisherDecisionStatus(null);
      expect(status).toBe('UNKNOWN');
      const explanation = getFisherExplanation(null, status, 'en', null, true);
      expect(explanation).toBe('Checking current marine conditions…');
    });
  });

  describe('Essential Local Conditions Extraction', () => {
    it('extracts waves, wind, visibility, and hazard from structured response', () => {
      const conds = extractFisherConditions(mockSafeResponse);
      expect(conds.waves).toBe('1.2 m');
      expect(conds.wind).toBe('10.0 kn');
      expect(conds.visibility).toBe('12.0 km');
      expect(conds.hazard).toBe('No Active Hazards');
    });

    it('extracts squall hazard correctly on severe conditions', () => {
      const conds = extractFisherConditions(mockNoGoResponse);
      expect(conds.waves).toBe('3.4 m');
      expect(conds.hazard).toBe('Squall Alert');
    });

    it('preserves missing values as "—" and never coerces to 0', () => {
      const conds = extractFisherConditions(mockUnknownResponse);
      expect(conds.waves).toBe('—');
      expect(conds.wind).toBe('—');
      expect(conds.visibility).toBe('—');
      expect(conds.waves).not.toBe('0 m');
      expect(conds.waves).not.toBe('0');
      expect(conds.wind).not.toBe('0 kn');
    });
  });
});
