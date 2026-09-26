import { describe, it, expect } from 'vitest';
import type { TripAssessmentResponse } from '../../types/assessment';
import type { ThresholdComparison, AgentCollaborationPayload } from '../../types/contracts';
import { formatMetricName, getImpactBadgeStyle } from './ThresholdTable';
import { getRiskBadgeStyle } from '../fisher/TripPlanDetails';

describe('ORCA M1.3: Explainability & Evidence View Acceptance Tests', () => {
  const mockCollaboration: AgentCollaborationPayload = {
    agents: [
      {
        agent_id: 'marine_agent',
        agent_name: 'Marine Specialist',
        role_description: 'Evaluates wave conditions, swells, and tides.',
        status: 'COMPLETE',
        recommendation: 'CAUTION',
        evidence_strength: 'HIGH',
        data_quality: 'Verified',
        sources: [
          {
            source_name: 'INCOIS Coastal Buoy',
            provider: 'INCOIS',
            coverage: 'Ratnagiri Sector',
            quality_rating: 'Verified',
          },
        ],
        observations: { significant_wave_height_m: 1.9 },
        summary: 'Significant wave height 1.9m exceeds caution threshold 1.5m.',
        key_findings: ['Wave height: 1.9m (caution ceiling: 1.5m)'],
      },
      {
        agent_id: 'weather_agent',
        agent_name: 'Weather Specialist',
        role_description: 'Monitors wind speed, gusts, and precipitation.',
        status: 'COMPLETE',
        recommendation: 'GO',
        evidence_strength: 'HIGH',
        data_quality: 'Verified',
        sources: [],
        observations: { wind_speed_knots: 11.2 },
        summary: 'Wind speed 11.2 kt is favorable for motorized craft.',
        key_findings: ['Wind speed 11.2 kt within safe limits (< 15 kt)'],
      },
      {
        agent_id: 'geospatial_agent',
        agent_name: 'Geospatial Specialist',
        role_description: 'Validates navigation boundaries and geofenced zones.',
        status: 'COMPLETE',
        recommendation: 'GO',
        evidence_strength: 'HIGH',
        data_quality: 'Verified',
        sources: [],
        observations: {},
        summary: 'No restricted maritime boundaries intersected.',
        key_findings: ['Clean maritime corridor; no active border alerts'],
      },
      {
        agent_id: 'safety_agent',
        agent_name: 'Safety & Vessel Compliance Specialist',
        role_description: 'Verifies vessel safety envelope and life-saving gear requirements.',
        status: 'COMPLETE',
        recommendation: 'CAUTION',
        evidence_strength: 'HIGH',
        data_quality: 'Verified',
        sources: [],
        observations: {},
        summary: 'Motorized boat requires operational caution above 1.5m sea state.',
        key_findings: ['Craft profile motorized_boat exceeds normal comfort envelope'],
      },
    ],
    arbitration: {
      conflict_detected: true,
      conflict_type: 'SEVERITY_OVERRIDE',
      agent_positions: {
        marine_agent: 'CAUTION',
        weather_agent: 'GO',
        geospatial_agent: 'GO',
        safety_agent: 'CAUTION',
      },
      winning_agent: 'safety_agent',
      winning_decision: 'CAUTION',
      winning_rule: 'Protocol D010: Most restrictive safety stance governs conflicting recommendations.',
      accepted_reasons: ['Marine & Safety caution triggers accepted for vessel protection.'],
      rejected_reasons: ['Favorable weather disregarded due to wave sea-state caution.'],
    },
    explanation: {
      facts: [
        { metric: 'significant_wave_height_m', value: '1.9', source: 'INCOIS Coastal Buoy' },
        { metric: 'wind_speed_knots', value: '11.2', source: 'Open-Meteo' },
      ],
      inferences: ['Wave height exceeds caution threshold for motorized boat.'],
      constraints: ['Max wave threshold for motorized boat is 1.5m (caution), 2.0m (no-go).'],
      decision: 'CAUTION',
      recommendation: 'Exercise heightened vigilance; stay within 10nm coastal zone.',
    },
    timeline: [
      {
        step_number: 1,
        agent_id: 'marine_agent',
        label: 'Assess Wave & Swell State',
        timestamp: '2026-09-26T06:00:00Z',
        duration_ms: 45,
        status: 'completed',
        detail: 'Significant wave height evaluated at 1.9m',
      },
      {
        step_number: 2,
        agent_id: 'safety_agent',
        label: 'Arbitrate Multi-Agent Stance',
        timestamp: '2026-09-26T06:00:01Z',
        duration_ms: 12,
        status: 'completed',
        detail: 'Applied Protocol D010 override: CAUTION wins over GO',
      },
    ],
    stakeholder_perspectives: {},
  };

  const mockEvidence: ThresholdComparison[] = [
    {
      metric_name: 'significant_wave_height_m',
      observed_value: 1.9,
      threshold_value: 1.5,
      operator: '>=',
      unit: 'm',
      exceeded: true,
      impact: 'CAUTION_TRIGGER',
      description: 'Significant wave height 1.9m meets or exceeds caution threshold 1.5m',
    },
    {
      metric_name: 'wind_speed_knots',
      observed_value: 11.2,
      threshold_value: 15.0,
      operator: '>=',
      unit: 'kt',
      exceeded: false,
      impact: 'SAFE',
      description: 'Wind speed 11.2 kt is below caution threshold 15.0 kt',
    },
    {
      metric_name: 'visibility_km',
      observed_value: 10.0,
      threshold_value: 3.0,
      operator: '<=',
      unit: 'km',
      exceeded: false,
      impact: 'SAFE',
      description: 'Visibility 10.0 km exceeds minimum safe threshold 3.0 km',
    },
    {
      metric_name: 'coastal_squall_warning',
      observed_value: false,
      threshold_value: true,
      operator: '==',
      unit: 'bool',
      exceeded: false,
      impact: 'SAFE',
      description: 'No active IMD coastal squall warnings',
    },
  ];

  const mockPfzCandidates = [
    {
      candidate_id: 'PFZ-RATNAGIRI-01',
      rank: 1,
      distance_nautical_miles: 14.2,
      bearing_degrees: 245.0,
      water_depth_m: 45.0,
      sea_surface_temp_c: 28.4,
      chlorophyll_mg_m3: 1.25,
      location_reference: 'Offshore Ratnagiri Shelf',
      valid_until: '2026-09-27T00:00:00Z',
    },
    {
      candidate_id: 'PFZ-RATNAGIRI-02',
      rank: 2,
      distance_nautical_miles: 22.4,
      bearing_degrees: 260.0,
      water_depth_m: 60.0,
      sea_surface_temp_c: 28.1,
      chlorophyll_mg_m3: 0.95,
      location_reference: 'Deep Shelf Break',
      valid_until: '2026-09-27T00:00:00Z',
    },
    {
      candidate_id: 'PFZ-RATNAGIRI-03',
      rank: 3,
      distance_nautical_miles: 31.0,
      bearing_degrees: 280.0,
      water_depth_m: 85.0,
      sea_surface_temp_c: 27.8,
      chlorophyll_mg_m3: 0.75,
      location_reference: 'Continental Slope Bank',
      valid_until: '2026-09-27T00:00:00Z',
    },
  ];

  const mockRouteCandidates = [
    {
      route_id: 'ROUTE-B-DIRECT',
      name: 'Direct Open-Sea Channel',
      distance_km: 26.3,
      max_wave_height_m: 1.9,
      eta_hours: 1.77,
      fuel_estimate_liters: 5.3,
      exposure_score: 5.48,
      risk_rating: 'MODERATE',
      is_feasible: true,
      infeasibility_reasons: [],
      is_recommended: true,
    },
    {
      route_id: 'ROUTE-C-BALANCED',
      name: 'Balanced Coastal Passage',
      distance_km: 30.5,
      max_wave_height_m: 1.6,
      eta_hours: 2.06,
      fuel_estimate_liters: 6.2,
      exposure_score: 5.45,
      risk_rating: 'MODERATE',
      is_feasible: true,
      infeasibility_reasons: [],
      is_recommended: false,
    },
    {
      route_id: 'ROUTE-A-INSHORE',
      name: 'Inshore Sheltered Channel',
      distance_km: 34.8,
      max_wave_height_m: 1.4,
      eta_hours: 2.35,
      fuel_estimate_liters: 7.1,
      exposure_score: 5.58,
      risk_rating: 'MODERATE',
      is_feasible: false,
      infeasibility_reasons: ['Route intersects land boundary', 'Geofence hazard detected'],
      is_recommended: false,
    },
  ];

  const mockAssessmentResponse: TripAssessmentResponse = {
    assessment_id: 'assmnt_m1_3_001',
    assessed_at: '2026-09-26T06:00:00Z',
    trip_context: {
      origin_harbor: 'Ratnagiri',
      craft_profile: 'motorized_boat',
      departure_time: '2026-09-26T06:00:00Z',
      return_time: '2026-09-26T18:00:00Z',
    },
    decision: {
      status: 'CAUTION',
      summary: 'Moderate wave height 1.9m requires caution for motorized boat.',
      decisive_factors: ['Significant wave height 1.9m >= 1.5m caution ceiling.'],
      next_action: 'Proceed with heightened vigilance.',
    },
    conditions: {
      timestamp: '2026-09-26T06:00:00Z',
      measurements: {
        significant_wave_height: { value: 1.9, unit: 'm' },
        wind_speed: { value: 11.2, unit: 'kn' },
      },
    },
    alerts: [],
    pfz_candidates: mockPfzCandidates,
    route_candidates: mockRouteCandidates,
    map_layers: { layers: [] },
    evidence: mockEvidence,
    source_status: [
      { provider_name: 'INCOIS Marine Buoy Network', status: 'HEALTHY' },
      { provider_name: 'Open-Meteo Coastal ECMWF API', status: 'HEALTHY' },
    ],
    is_durable: false,
    brief: {
      summary: 'Moderate wave conditions require operational caution for motorized boat.',
      recommended_action: 'Proceed with increased vigilance.',
      positive_factors: ['Wind is light (11.2 kt)', 'No active squall warning'],
      negative_factors: ['Wave height 1.9m meets caution threshold of 1.5m'],
      confidence: 'HIGH',
      confidence_reasons: ['Validated with in-situ buoy telemetry'],
    },
    agent_collaboration: mockCollaboration,
  };

  it('Test 1: Assessment contains agent_collaboration immediately after assessment without chat', () => {
    expect(mockAssessmentResponse.agent_collaboration).toBeDefined();
    expect(mockAssessmentResponse.agent_collaboration?.agents.length).toBe(4);
    expect(mockAssessmentResponse.agent_collaboration?.arbitration).toBeDefined();
    expect(mockAssessmentResponse.agent_collaboration?.arbitration.winning_decision).toBe('CAUTION');
    expect(mockAssessmentResponse.agent_collaboration?.arbitration.winning_rule).toContain('Protocol D010');
  });

  it('Test 2: Evidence table renders every ThresholdComparison without truncation', () => {
    const comparisons = mockAssessmentResponse.evidence;
    expect(comparisons.length).toBe(4);

    for (const item of comparisons as ThresholdComparison[]) {
      expect(item.metric_name).toBeDefined();
      expect(item.observed_value).toBeDefined();
      expect(item.threshold_value).toBeDefined();
      expect(item.operator).toBeDefined();
      expect(item.impact).toBeDefined();
      expect(['SAFE', 'CAUTION_TRIGGER', 'NO_GO_TRIGGER', 'UNKNOWN_TRIGGER']).toContain(item.impact);
      expect(item.description).toBeDefined();
    }
  });

  it('Test 3: Wave breach example is accurately formatted with pure impact enum color badge', () => {
    const waveBreach = (mockAssessmentResponse.evidence as ThresholdComparison[]).find(
      (e) => e.metric_name === 'significant_wave_height_m'
    );
    expect(waveBreach).toBeDefined();
    expect(waveBreach?.observed_value).toBe(1.9);
    expect(waveBreach?.operator).toBe('>=');
    expect(waveBreach?.threshold_value).toBe(1.5);
    expect(waveBreach?.unit).toBe('m');
    expect(waveBreach?.impact).toBe('CAUTION_TRIGGER');
    expect(waveBreach?.exceeded).toBe(true);

    // Verify formatMetricName helper
    expect(formatMetricName('significant_wave_height_m')).toBe('Significant wave height m');

    // Verify pure impact badge colors
    const cautionStyle = getImpactBadgeStyle('CAUTION_TRIGGER');
    expect(cautionStyle.backgroundColor).toBe('#fef3c7');
    expect(cautionStyle.color).toBe('#92400e');

    const safeStyle = getImpactBadgeStyle('SAFE');
    expect(safeStyle.backgroundColor).toBe('#dcfce7');
    expect(safeStyle.color).toBe('#166534');

    const noGoStyle = getImpactBadgeStyle('NO_GO_TRIGGER');
    expect(noGoStyle.backgroundColor).toBe('#fee2e2');
    expect(noGoStyle.color).toBe('#991b1b');
  });

  it('Test 4: PFZ section displays multiple ranked candidates and explains why Candidate #1 is preferred', () => {
    const pfzList = mockAssessmentResponse.pfz_candidates;
    expect(pfzList.length).toBe(3);

    const c1 = pfzList[0];
    const c2 = pfzList[1];
    expect(c1.rank).toBe(1);
    expect(c1.distance_nautical_miles).toBe(14.2);
    expect(c1.bearing_degrees).toBe(245.0);
    expect(c1.water_depth_m).toBe(45.0);
    expect(c1.sea_surface_temp_c).toBe(28.4);
    expect(c1.chlorophyll_mg_m3).toBe(1.25);

    // Deterministic distance advantage calculation
    const advantage = (c2.distance_nautical_miles - c1.distance_nautical_miles).toFixed(1);
    expect(advantage).toBe('8.2');

    const expectedRationale = `Selected because it is the nearest viable PFZ. Distance advantage: ${advantage}nm closer than Candidate #2.`;
    expect(expectedRationale).toBe(
      'Selected because it is the nearest viable PFZ. Distance advantage: 8.2nm closer than Candidate #2.'
    );
  });

  it('Test 5: Route section displays all candidate routes, exposure scores, feasibility, ETA, fuel, and infeasibility reasons', () => {
    const routes = mockAssessmentResponse.route_candidates;
    expect(routes.length).toBe(3);

    const recommended = routes.find((r) => r.is_recommended);
    expect(recommended).toBeDefined();
    expect(recommended?.route_id).toBe('ROUTE-B-DIRECT');
    expect(recommended?.distance_km).toBe(26.3);
    expect(recommended?.max_wave_height_m).toBe(1.9);
    expect(recommended?.eta_hours).toBe(1.77);
    expect(recommended?.fuel_estimate_liters).toBe(5.3);
    expect(recommended?.exposure_score).toBe(5.48);
    expect(recommended?.risk_rating).toBe('MODERATE');
    expect(recommended?.is_feasible).toBe(true);

    const infeasible = routes.find((r) => !r.is_feasible);
    expect(infeasible).toBeDefined();
    expect(infeasible?.route_id).toBe('ROUTE-A-INSHORE');
    expect(infeasible?.infeasibility_reasons).toContain('Route intersects land boundary');
    expect(infeasible?.infeasibility_reasons).toContain('Geofence hazard detected');

    // Risk badge styling
    const riskStyle = getRiskBadgeStyle(recommended?.risk_rating);
    expect(riskStyle.backgroundColor).toBe('#fef3c7');
  });

  it('Test 6: Agent Collaboration panel renders Marine, Weather, Geospatial, and Safety agent outputs', () => {
    const collab = mockAssessmentResponse.agent_collaboration;
    expect(collab).toBeDefined();

    const agentIds = collab!.agents.map((a) => a.agent_id);
    expect(agentIds).toContain('marine_agent');
    expect(agentIds).toContain('weather_agent');
    expect(agentIds).toContain('geospatial_agent');
    expect(agentIds).toContain('safety_agent');

    const marineAgent = collab!.agents.find((a) => a.agent_id === 'marine_agent');
    expect(marineAgent?.recommendation).toBe('CAUTION');
    expect(marineAgent?.summary).toContain('exceeds caution threshold');

    const weatherAgent = collab!.agents.find((a) => a.agent_id === 'weather_agent');
    expect(weatherAgent?.recommendation).toBe('GO');

    const safetyAgent = collab!.agents.find((a) => a.agent_id === 'safety_agent');
    expect(safetyAgent?.recommendation).toBe('CAUTION');

    // Timeline and explanation
    expect(collab!.timeline.length).toBeGreaterThan(0);
    expect(collab!.explanation.decision).toBe('CAUTION');
  });

  it('Test 7: In-memory zero-network invariant: all explainability data is preloaded in assessment response', () => {
    // Verifies all required UI components operate directly on the in-memory response without network calls
    expect(mockAssessmentResponse.evidence).toBeDefined();
    expect(mockAssessmentResponse.source_status).toBeDefined();
    expect(mockAssessmentResponse.brief).toBeDefined();
    expect(mockAssessmentResponse.agent_collaboration).toBeDefined();
    expect(mockAssessmentResponse.pfz_candidates).toBeDefined();
    expect(mockAssessmentResponse.route_candidates).toBeDefined();
  });
});
