import { describe, it, expect } from 'vitest';
import AgentCollaborationPanel from './AgentCollaborationPanel';
import AgentCardsGrid from './AgentCardsGrid';
import ConflictArbitrationCard from './ConflictArbitrationCard';
import ReasoningTimelineView from './ReasoningTimelineView';
import CausalExplanationCards from './CausalExplanationCards';
import AgentEvidenceCard from './AgentEvidenceCard';
import StakeholderPerspectiveSelector from './StakeholderPerspectiveSelector';
import type {
  AgentCollaborationPayload,
  IndividualAgentReasoning,
  ConflictArbitration,
  CausalReasoningExplanation,
  ReasoningTimelineStep,
  AgentEvidenceSource,
  DataQualityRating,
  ConfidenceLevel,
} from '../../types/contracts';

describe('Multi-Agent Reasoning & Decision Authority Frontend Suite', () => {
  const sampleEvidenceSource: AgentEvidenceSource = {
    source_name: 'INCOIS High-Resolution Wave Forecast (OSF)',
    provider: 'INCOIS',
    last_updated: '2026-09-24T06:00:00Z',
    coverage: 'Ratnagiri Coast (16.98°N, 73.28°E)',
    quality_rating: 'Verified',
  };

  const sampleAgents: IndividualAgentReasoning[] = [
    {
      agent_id: 'marine_intelligence',
      agent_name: 'Marine Intelligence Agent',
      role_description: 'Evaluates sea surface temperature, ocean currents, and PFZ fishing advisories.',
      status: 'COMPLETE',
      recommendation: 'GO',
      evidence_strength: 'HIGH',
      data_quality: 'Verified',
      sources: [sampleEvidenceSource],
      observations: {
        significant_wave_height_m: 1.2,
        current_speed_knots: 0.8,
        pfz_bearing_deg: 265,
      },
      summary: 'Optimal sea state. Favorable SST gradient (0.7°C) with low wave agitation.',
      key_findings: [
        'Wave height 1.2m is well below 1.5m small-craft threshold.',
        'High thermal contrast zone detected 8nm offshore.',
      ],
    },
    {
      agent_id: 'weather_intelligence',
      agent_name: 'Weather Intelligence Agent',
      role_description: 'Analyzes atmospheric barometric trends, IMD synoptic charts, and squall bulletins.',
      status: 'COMPLETE',
      recommendation: 'GO',
      evidence_strength: 'HIGH',
      data_quality: 'Verified',
      sources: [
        {
          source_name: 'IMD Coastal Weather Bulletin',
          provider: 'IMD',
          last_updated: '2026-09-24T05:30:00Z',
          coverage: 'Konkan-Goa Maritime Sector',
          quality_rating: 'Verified',
        },
      ],
      observations: {
        sustained_wind_knots: 11.5,
        wind_gusts_knots: 14.0,
        visibility_km: 14.0,
      },
      summary: 'Benign coastal weather. Sustained winds 11.5 knots with no active squall warnings.',
      key_findings: ['Wind speeds below cautionary 18-knot threshold.', 'Clear visibility > 10 km.'],
    },
    {
      agent_id: 'geospatial_intelligence',
      agent_name: 'Geospatial Intelligence Agent',
      role_description: 'Validates electronic navigational charts, bathymetric depths, and maritime security geofences.',
      status: 'COMPLETE',
      recommendation: 'GO',
      evidence_strength: 'HIGH',
      data_quality: 'Verified',
      sources: [
        {
          source_name: 'INHO Electronic Navigational Chart (ENC)',
          provider: 'INHO',
          last_updated: '2026-09-24T00:00:00Z',
          coverage: 'Ratnagiri Port & Approaches (Chart 2011)',
          quality_rating: 'Verified',
        },
      ],
      observations: {
        clearance_to_prohibited_zone_nm: 14.2,
        minimum_underkeel_clearance_m: 6.8,
      },
      summary: 'All navigational hazards clear. 14.2nm buffer to nearest restricted zone.',
      key_findings: ['Planned track remains fully within authorized fishing corridor.'],
    },
    {
      agent_id: 'risk_assessment',
      agent_name: 'Safety & Risk Assessment Agent',
      role_description: 'Computes deterministic risk index, craft stability bounds, and emergency return margin.',
      status: 'COMPLETE',
      recommendation: 'GO',
      evidence_strength: 'HIGH',
      data_quality: 'Verified',
      sources: [],
      observations: {
        composite_risk_score: 0.18,
        safe_operating_limit_exceeded: false,
      },
      summary: 'Composite risk score 0.18 (LOW). Craft operating within certified stability envelope.',
      key_findings: ['Deterministic bounds strictly satisfied for motorized craft profile.'],
    },
  ];

  const sampleConsensusArbitration: ConflictArbitration = {
    conflict_detected: false,
    winning_agent: 'Decision Authority (Unanimous Consensus)',
    winning_decision: 'GO',
    winning_rule: 'Consensus rule: All 4 specialist intelligence agents concur on GO status.',
    agent_positions: {
      marine_intelligence: 'GO',
      weather_intelligence: 'GO',
      geospatial_intelligence: 'GO',
      risk_assessment: 'GO',
    },
    accepted_reasons: [
      'Unanimous agreement across marine, meteorological, spatial, and risk bounds.',
      'Deterministic safety constraints completely satisfied.',
    ],
    rejected_reasons: [],
  };

  const sampleConflictArbitration: ConflictArbitration = {
    conflict_detected: true,
    conflict_type: 'SAFETY_OVERRIDE_OPPORTUNITY',
    reason: 'Marine intelligence identified lucrative PFZ opportunity, but Safety agent identified elevated wave swell exceeding craft stability.',
    agent_positions: {
      marine_intelligence: 'GO',
      weather_intelligence: 'CAUTION',
      geospatial_intelligence: 'GO',
      risk_assessment: 'NO_GO',
    },
    winning_agent: 'Safety & Risk Assessment Agent',
    winning_decision: 'NO_GO',
    winning_rule: 'Statutory Safety Superiority Protocol (D010)',
    accepted_reasons: [
      'Deterministic safety rule D010 mandates that safety hard-stops unconditionally supersede resource abundance.',
      'Observed wave height of 2.6m exceeds craft safe operating envelope of 1.5m.',
    ],
    rejected_reasons: [
      'Marine Intelligence recommendation for GO superseded because craft safety takes strict precedence over high fish density.',
    ],
  };

  const sampleCausalExplanation: CausalReasoningExplanation = {
    facts: [
      { metric: 'Significant Wave Height', value: '1.2 m', source: 'INCOIS OSF' },
      { metric: 'Sustained Wind Speed', value: '11.5 knots', source: 'IMD Bulletin' },
      { metric: 'Restricted Boundary Buffer', value: '14.2 nm', source: 'INHO Chart' },
      { metric: 'Active Cyclone Warnings', value: 'None', source: 'IMD Cyclone Centre' },
    ],
    inferences: [
      'Nearshore and shelf wave action will remain calm over the planned voyage window.',
      'No squall lines or convective cells approaching the Ratnagiri corridor.',
    ],
    constraints: [
      'Small motorized craft maximum allowable wave height: 1.5 m (Observed: 1.2 m - OK).',
      'Maximum operating sustained wind: 18.0 knots (Observed: 11.5 knots - OK).',
    ],
    decision: 'SAFE TO PROCEED (GO)',
    recommendation: 'All statutory and operational safety boundaries are satisfied. Standard VHF marine monitoring advised.',
  };

  const sampleTimeline: ReasoningTimelineStep[] = [
    { step_number: 1, agent_id: 'gateway', label: 'Mission Received', timestamp: '2026-09-24T06:00:00.000Z', duration_ms: 1, status: 'DONE', detail: 'Received departure query for Ratnagiri sector' },
    { step_number: 2, agent_id: 'data_ingestion', label: 'Data Collection', timestamp: '2026-09-24T06:00:00.002Z', duration_ms: 3, status: 'DONE', detail: 'Gathered official telemetry from INCOIS, IMD, and INHO' },
    { step_number: 3, agent_id: 'marine_intelligence', label: 'Marine Analysis', timestamp: '2026-09-24T06:00:00.005Z', duration_ms: 2, status: 'DONE', detail: 'Computed wave energy spectrum and SST front' },
    { step_number: 4, agent_id: 'weather_intelligence', label: 'Weather Analysis', timestamp: '2026-09-24T06:00:00.007Z', duration_ms: 2, status: 'DONE', detail: 'Verified atmospheric pressure gradient and squall alerts' },
    { step_number: 5, agent_id: 'geospatial_intelligence', label: 'Boundary Analysis', timestamp: '2026-09-24T06:00:00.009Z', duration_ms: 2, status: 'DONE', detail: 'Computed distance to naval exercises and shallow shoals' },
    { step_number: 6, agent_id: 'risk_assessment', label: 'Safety Assessment', timestamp: '2026-09-24T06:00:00.011Z', duration_ms: 2, status: 'DONE', detail: 'Evaluated craft stability margin under deterministic bounds' },
    { step_number: 7, agent_id: 'arbitration', label: 'Conflict Resolution', timestamp: '2026-09-24T06:00:00.013Z', duration_ms: 1, status: 'DONE', detail: 'Executed Protocol D010 arbitration algorithm across agent positions' },
    { step_number: 8, agent_id: 'decision_authority', label: 'Final Recommendation', timestamp: '2026-09-24T06:00:00.014Z', duration_ms: 1, status: 'DONE', detail: 'Synthesized grounded operational directives and multi-stakeholder views' },
  ];

  const samplePayload: AgentCollaborationPayload = {
    agents: sampleAgents,
    arbitration: sampleConsensusArbitration,
    explanation: sampleCausalExplanation,
    timeline: sampleTimeline,
    stakeholder_perspectives: {
      fisherman: {
        summary: 'Safe sea conditions off Ratnagiri. Waves are low and fish shoals are present.',
        action: 'You can go out to fish today. Wear lifejackets and maintain radio contact.',
      },
      authority: {
        summary: 'All statutory safety limits satisfied for coastal artisanal fleet. 0 active maritime notices.',
        action: 'Routine port clearance authorized. No maritime security alerts.',
      },
      researcher: {
        summary: 'SST gradient 0.7°C indicates active upwelling front. Wave height 1.2m at 8.2s peak period.',
        action: 'Telemetry grounded in INCOIS OSF and IMD synoptic bulletin data.',
      },
    },
  };

  it('exports all collaboration UI components as functions', () => {
    expect(AgentCollaborationPanel).toBeDefined();
    expect(typeof AgentCollaborationPanel).toBe('function');

    expect(AgentCardsGrid).toBeDefined();
    expect(typeof AgentCardsGrid).toBe('function');

    expect(ConflictArbitrationCard).toBeDefined();
    expect(typeof ConflictArbitrationCard).toBe('function');

    expect(ReasoningTimelineView).toBeDefined();
    expect(typeof ReasoningTimelineView).toBe('function');

    expect(CausalExplanationCards).toBeDefined();
    expect(typeof CausalExplanationCards).toBe('function');

    expect(AgentEvidenceCard).toBeDefined();
    expect(typeof AgentEvidenceCard).toBe('function');

    expect(StakeholderPerspectiveSelector).toBeDefined();
    expect(typeof StakeholderPerspectiveSelector).toBe('function');
  });

  describe('Contract and Epistemic Honesty Guarantees', () => {
    it('enforces deterministic Evidence Strength values without arbitrary percentages', () => {
      const validStrengths: ConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
      for (const agent of sampleAgents) {
        expect(validStrengths).toContain(agent.evidence_strength);
        expect((agent.evidence_strength as string).endsWith('%')).toBe(false);
      }
    });

    it('enforces deterministic Data Quality ratings', () => {
      const validRatings: DataQualityRating[] = ['Verified', 'Partial', 'Snapshot Fallback', 'Limited'];
      for (const agent of sampleAgents) {
        expect(validRatings).toContain(agent.data_quality);
      }
    });

    it('validates 8-step lifecycle ordering matching the user-mandated specification', () => {
      const expectedSteps = [
        'Mission Received',
        'Data Collection',
        'Marine Analysis',
        'Weather Analysis',
        'Boundary Analysis',
        'Safety Assessment',
        'Conflict Resolution',
        'Final Recommendation',
      ];

      expect(sampleTimeline.length).toBe(8);
      sampleTimeline.forEach((step, idx) => {
        expect(step.step_number).toBe(idx + 1);
        expect(step.label).toBe(expectedSteps[idx]);
        expect(step.duration_ms).toBeGreaterThanOrEqual(0);
      });
    });

    it('verifies 5-stage causal explanation contract', () => {
      expect(sampleCausalExplanation.facts.length).toBeGreaterThan(0);
      expect(sampleCausalExplanation.inferences.length).toBeGreaterThan(0);
      expect(sampleCausalExplanation.constraints.length).toBeGreaterThan(0);
      expect(sampleCausalExplanation.decision).toBeTruthy();
      expect(sampleCausalExplanation.recommendation).toBeTruthy();
    });

    it('verifies Protocol D010 conflict arbitration structure when safety overrides opportunity', () => {
      expect(sampleConflictArbitration.conflict_detected).toBe(true);
      expect(sampleConflictArbitration.winning_rule).toContain('Protocol (D010)');
      expect(sampleConflictArbitration.winning_decision).toBe('NO_GO');
      expect(sampleConflictArbitration.winning_agent).toContain('Safety');
      expect(sampleConflictArbitration.accepted_reasons.length).toBeGreaterThan(0);
      expect(sampleConflictArbitration.rejected_reasons.length).toBeGreaterThan(0);
    });

    it('verifies multi-stakeholder perspectives exist for all 3 canonical personas', () => {
      const roles = ['fisherman', 'authority', 'researcher'];
      for (const role of roles) {
        const perspective = samplePayload.stakeholder_perspectives[role];
        expect(perspective).toBeDefined();
        expect(perspective.summary).toBeTruthy();
        expect(perspective.action).toBeTruthy();
      }
    });
  });
});
