import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: any) => (open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null),
  Portal: ({ children }: any) => React.createElement('div', { 'data-testid': 'dialog-portal' }, children),
  Overlay: (props: any) => React.createElement('div', props),
  Content: (props: any) => React.createElement('div', props),
  Title: (props: any) => React.createElement('h2', props),
  Close: ({ children }: any) => children,
}));

import DecisionStabilityCard from './DecisionStabilityCard';
import DecisionDeltaPanel from './DecisionDeltaPanel';
import EvidenceDrawer from '../evidence/EvidenceDrawer';
import ThresholdTable from '../evidence/ThresholdTable';
import FisherDecisionSurface from './FisherDecisionSurface';
import { deriveCounterfactualFlip } from '../../utils/counterfactual';
import type { DecisionStabilityPayload, SafeMissionWindow, TripAssessmentResponse } from '../../types/assessment';
import type { DecisionDiff } from '../../types/mission';
import type { ThresholdComparison } from '../../types/contracts';

describe('M1.4 Decision Delta & Counterfactual Intelligence', () => {
  const mockStability: DecisionStabilityPayload = {
    level: 'HIGH',
    headline: 'High Decision Stability — Robust Margins',
    reason: 'All environmental margins exceed 25% safety buffer with no active hazard bulletins.',
    nearest_boundary: {
      metric_name: 'significant_wave_height_m',
      observed_value: 1.2,
      threshold_value: 1.5,
      operator: '>=',
      unit: 'm',
      margin: 0.3,
      margin_percent: 20.0,
      target_tier: 'CAUTION',
      is_nearest_boundary: true,
    },
    minimal_safe_adjustment: 'Reduce wave height by 0.4m to reach GO threshold.',
    sensitivity_ranking: [
      'Cyclone warnings (Active IMD cyclone bulletin)',
      'Wave Height (+26.7% breach: 1.9m vs 1.5m limit)',
      'Wind Speed (33.3% safe margin: 12.0kt vs 18.0kt limit)',
    ],
  };

  const mockSafeWindow: SafeMissionWindow = {
    is_current_safe: true,
    recommended_window_start: '2026-09-12T06:00:00Z',
    recommended_window_end: '2026-09-12T11:00:00Z',
    earliest_safer_departure: '2026-09-12T06:00:00Z',
    window_summary: 'Current departure window is safe until 16:30 IST.',
  };

  it('Test 1: DecisionStabilityCard renders stability badge, headline, nearest boundary, and minimal safe adjustment', () => {
    const html = renderToStaticMarkup(React.createElement(DecisionStabilityCard, { stability: mockStability }));

    expect(html).toContain('data-testid="decision-stability-card"');
    expect(html).toContain('data-testid="stability-level-badge"');
    expect(html).toContain('HIGH STABILITY');
    expect(html).toContain('data-testid="stability-headline"');
    expect(html).toContain('High Decision Stability — Robust Margins');
    expect(html).toContain('data-testid="stability-reason"');
    expect(html).toContain('All environmental margins exceed 25%');

    // Nearest boundary
    expect(html).toContain('data-testid="nearest-boundary-info"');
    expect(html).toContain('Significant Wave Height');
    expect(html).toContain('1.2m / 1.5m');
    expect(html).toContain('+20.0% buffer');

    // Minimal adjustment
    expect(html).toContain('data-testid="minimal-safe-adjustment"');
    expect(html).toContain('Reduce wave height by 0.4m to reach GO threshold.');
  });

  it('Test 2: DecisionDeltaPanel renders status flip, primary cause, observed shift, and revert adjustment', () => {
    const mockDiff: DecisionDiff = {
      baselineStatus: 'GO',
      simulatedStatus: 'CAUTION',
      summary: 'Significant wave height crosses caution ceiling.',
      timeOffsetHours: 4,
      craftProfile: 'motorized_boat',
      timestamp: new Date().toISOString(),
      flip_explanation: {
        baseline_decision: 'GO',
        simulated_decision: 'CAUTION',
        decision_flipped: true,
        primary_cause_metric: 'Significant Wave Height',
        observed_before: '1.2m',
        observed_after: '1.9m',
        threshold_crossed: '1.5m CAUTION',
        explanation_text: 'Decision flipped GO → CAUTION.\n\nPrimary Cause:\nSignificant Wave Height\n\n1.2m → 1.9m\n\nCrossed:\n1.5m CAUTION threshold.',
        minimal_adjustment_to_revert: 'Reduce significant wave height by 0.4m to revert to GO.',
      },
    };

    const html = renderToStaticMarkup(React.createElement(DecisionDeltaPanel, { diff: mockDiff }));

    expect(html).toContain('data-testid="decision-delta-panel"');
    expect(html).toContain('data-testid="delta-old-decision"');
    expect(html).toContain('>GO<');
    expect(html).toContain('data-testid="delta-new-decision"');
    expect(html).toContain('>CAUTION<');
    expect(html).toContain('data-testid="delta-primary-cause"');
    expect(html).toContain('Significant Wave Height');
    expect(html).toContain('data-testid="delta-shift-values"');
    expect(html).toContain('1.2m → 1.9m');
    expect(html).toContain('data-testid="delta-threshold-crossed"');
    expect(html).toContain('1.5m CAUTION');
    expect(html).toContain('data-testid="delta-revert-adjustment"');
    expect(html).toContain('Reduce significant wave height by 0.4m to revert to GO.');
  });

  it('Test 3: ThresholdTable displays Margin and Margin % columns', () => {
    const mockEvidence: ThresholdComparison[] = [
      {
        metric_name: 'significant_wave_height_m',
        observed_value: 1.2,
        threshold_value: 1.5,
        operator: '>=',
        unit: 'meters',
        exceeded: false,
        impact: 'SAFE',
        description: 'Safe wave height',
      },
    ];

    const html = renderToStaticMarkup(React.createElement(ThresholdTable, { evidence: mockEvidence }));

    expect(html).toContain('Margin');
    expect(html).toContain('Margin %');
    expect(html).toContain('data-testid="threshold-margin-0"');
    expect(html).toContain('+0.30');
    expect(html).toContain('data-testid="threshold-margin-pct-0"');
    expect(html).toContain('+20.0%');
  });

  it('Test 4: EvidenceDrawer includes Decision Boundaries and Sensitivity Ranking tabs without network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const mockEvidence: ThresholdComparison[] = [
      {
        metric_name: 'significant_wave_height_m',
        observed_value: 1.2,
        threshold_value: 1.5,
        operator: '>=',
        unit: 'm',
        exceeded: false,
        impact: 'SAFE',
        description: 'Safe wave height',
      },
      {
        metric_name: 'wind_speed_knots',
        observed_value: 12.0,
        threshold_value: 18.0,
        operator: '>=',
        unit: 'kt',
        exceeded: false,
        impact: 'SAFE',
        description: 'Safe wind',
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(EvidenceDrawer, {
        isOpen: true,
        onClose: vi.fn(),
        evidence: mockEvidence,
        stability: mockStability,
      })
    );

    // Tab buttons exist
    expect(html).toContain('data-testid="tab-boundaries"');
    expect(html).toContain('data-testid="tab-sensitivity"');
    expect(html).toContain('Decision Boundaries');
    expect(html).toContain('Sensitivity Ranking');

    // Zero network invariant: opening or rendering drawer never calls fetch
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('Test 5: FisherDecisionSurface integrates Safe Window Summary and displays window text', () => {
    const mockAssessment: TripAssessmentResponse = {
      assessment_id: 'test-assessment-m1-4',
      assessed_at: '2026-09-12T06:00:00Z',
      trip_context: {
        origin_harbor: 'Ratnagiri',
        coordinates: [73.28, 16.98],
        craft_profile: 'motorized_boat',
        departure_time: '2026-09-12T06:00:00Z',
        return_time: '2026-09-12T12:00:00Z',
      },
      decision: {
        status: 'GO',
        summary: 'Conditions are safe.',
        decisive_factors: [],
        next_action: 'Proceed',
      },
      conditions: {
        timestamp: '2026-09-12T06:00:00Z',
        measurements: {},
      },
      alerts: [],
      pfz_candidates: [],
      route_candidates: [],
      map_layers: { layers: [] },
      evidence: [],
      source_status: [],
      is_durable: false,
      stability: mockStability,
      safe_window: mockSafeWindow,
      brief: {
        summary: 'All conditions calm and safe for departure.',
        recommended_action: 'Proceed with voyage.',
        positive_factors: ['Calm sea state'],
        negative_factors: [],
        confidence: 'HIGH',
        confidence_reasons: ['Full sensor coverage'],
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(FisherDecisionSurface, {
        assessment: mockAssessment,
      })
    );

    // Safe Window Summary is displayed
    expect(html).toContain('data-testid="safe-window-summary"');
    expect(html).toContain('Current departure window is safe until 16:30 IST.');
  });

  it('Test 6: deriveCounterfactualFlip correctly attributes primary cause and generates revert guidance', () => {
    const baselineEvidence: ThresholdComparison[] = [
      {
        metric_name: 'significant_wave_height_m',
        observed_value: 1.2,
        threshold_value: 1.5,
        operator: '>=',
        unit: 'm',
        exceeded: false,
        impact: 'SAFE',
        description: 'Safe',
      },
    ];

    const simulatedEvidence: ThresholdComparison[] = [
      {
        metric_name: 'significant_wave_height_m',
        observed_value: 1.9,
        threshold_value: 1.5,
        operator: '>=',
        unit: 'm',
        exceeded: true,
        impact: 'CAUTION_TRIGGER',
        description: 'Caution',
      },
    ];

    const flip = deriveCounterfactualFlip(
      'GO',
      'CAUTION',
      baselineEvidence,
      simulatedEvidence
    );

    expect(flip).toBeDefined();
    expect(flip?.decision_flipped).toBe(true);
    expect(flip?.primary_cause_metric).toBe('Significant Wave Height');
    expect(flip?.observed_before).toBe('1.2m');
    expect(flip?.observed_after).toBe('1.9m');
    expect(flip?.threshold_crossed).toContain('1.5m');
    expect(flip?.minimal_adjustment_to_revert).toBe('Reduce significant wave height by 0.4m to revert to GO.');
    expect(flip?.explanation_text).toContain('Decision flipped GO → CAUTION');
  });
});

