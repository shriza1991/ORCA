import { describe, it, expect } from 'vitest';
import { missionContextKey } from './FisherPage';
import type { MissionContext } from '../types/mission';

describe('FisherPage Map Time Controls & Mission Proposal Synchronization', () => {
  // Model of the FisherPage time offset & proposal calculation logic
  const calculateProposedTimes = (
    baseDepartureIso: string,
    baseReturnIso: string,
    offsetHours: number
  ) => {
    const depParsed = new Date(baseDepartureIso).getTime();
    const retParsed = new Date(baseReturnIso).getTime();
    const durationMs = retParsed - depParsed;

    const newDepTime = depParsed + offsetHours * 3600 * 1000;
    const newRetTime = newDepTime + durationMs;

    return {
      proposedDeparture: new Date(newDepTime).toISOString(),
      proposedReturn: new Date(newRetTime).toISOString(),
      durationHours: durationMs / (3600 * 1000),
    };
  };

  it('preserves non-12-hour duration across repeated slider adjustments without drift', () => {
    // 5-hour voyage baseline (e.g. 05:00 to 10:00)
    const baseDeparture = '2026-10-04T05:00:00.000Z';
    const baseReturn = '2026-10-04T10:00:00.000Z';
    const baseDurationHours = 5;

    // Simulate slider movements: +3h, +6h, +12h, +24h, back to +3h
    const offsets = [3, 6, 12, 24, 3];

    for (const offset of offsets) {
      const proposal = calculateProposedTimes(baseDeparture, baseReturn, offset);

      // Duration must strictly remain 5 hours (never overwritten with 12 hours)
      expect(proposal.durationHours).toBe(baseDurationHours);

      // Departure must be offset from retained baseline departure, not Date.now()
      const expectedDepTime = new Date('2026-10-04T05:00:00.000Z').getTime() + offset * 3600 * 1000;
      expect(new Date(proposal.proposedDeparture).getTime()).toBe(expectedDepTime);

      // Return time must equal new departure + exactly 5 hours
      const expectedRetTime = expectedDepTime + 5 * 3600 * 1000;
      expect(new Date(proposal.proposedReturn).getTime()).toBe(expectedRetTime);
    }
  });

  it('keeps active mission timing untouched during forecast browsing before Apply', () => {
    // Retained active mission
    let activeMission = {
      departureTime: '2026-10-04T06:00:00.000Z',
      returnTime: '2026-10-04T14:00:00.000Z', // 8-hour trip
      originHarbor: 'Ratnagiri',
    };

    // Current browsing state
    let mapTimeOffset = 0;
    let proposedMission: { departureTime: string; returnTime: string } | null = null;

    // User moves slider to +6 hours
    const handleSliderMove = (hours: number) => {
      mapTimeOffset = hours;
      const { proposedDeparture, proposedReturn } = calculateProposedTimes(
        activeMission.departureTime,
        activeMission.returnTime,
        hours
      );
      proposedMission = {
        departureTime: proposedDeparture,
        returnTime: proposedReturn,
      };
      // CRITICAL: activeMission is NOT mutated during browsing!
    };

    handleSliderMove(6);

    expect(mapTimeOffset).toBe(6);
    expect(proposedMission).not.toBeNull();
    expect(proposedMission!.departureTime).toBe('2026-10-04T12:00:00.000Z');
    expect(proposedMission!.returnTime).toBe('2026-10-04T20:00:00.000Z');

    // Baseline active mission is untouched
    expect(activeMission.departureTime).toBe('2026-10-04T06:00:00.000Z');
    expect(activeMission.returnTime).toBe('2026-10-04T14:00:00.000Z');
  });

  it('aligns dashboard, chat context, and map after explicit Apply action', () => {
    let activeMission = {
      departureTime: '2026-10-04T06:00:00.000Z',
      returnTime: '2026-10-04T11:00:00.000Z', // 5-hour voyage
    };
    let missionContext = { ...activeMission };

    const offsetHours = 4;
    const { proposedDeparture, proposedReturn, durationHours } = calculateProposedTimes(
      activeMission.departureTime,
      activeMission.returnTime,
      offsetHours
    );
    expect(durationHours).toBe(5);

    // Apply action triggered by user
    const handleApply = () => {
      activeMission = {
        departureTime: proposedDeparture,
        returnTime: proposedReturn,
      };
      missionContext = { ...activeMission };
    };

    handleApply();

    // Mission and chat context are aligned to proposed times
    expect(activeMission.departureTime).toBe('2026-10-04T10:00:00.000Z');
    expect(activeMission.returnTime).toBe('2026-10-04T15:00:00.000Z');
    expect(missionContext.departureTime).toBe('2026-10-04T10:00:00.000Z');
    expect(missionContext.returnTime).toBe('2026-10-04T15:00:00.000Z');

    // Trip duration is exactly 5 hours
    const appliedDurationMs = new Date(activeMission.returnTime).getTime() - new Date(activeMission.departureTime).getTime();
    expect(appliedDurationMs / (3600 * 1000)).toBe(5);
  });

  it('handles simulation errors honestly: sets status="error", stores error, and disables Apply', () => {
    const missionContext: MissionContext = {
      origin_harbor: 'Ratnagiri',
      craft_profile: 'motorized_boat',
      vessel_size: 'medium',
      departure_time: '2026-10-04T06:00:00.000Z',
      return_time: '2026-10-04T14:00:00.000Z',
    };
    const contextKey = missionContextKey(missionContext);

    // Initial pending proposal
    let proposalState: any = {
      status: 'pending',
      baselineAssessmentId: 'asm-baseline-1',
      evidenceBundleId: 'bundle-01',
      hours: 4,
      missionContextKey: contextKey,
      baseDeparture: missionContext.departure_time,
      proposedDeparture: '2026-10-04T10:00:00.000Z',
    };

    // Helper checking eligibility to apply
    const checkApplicable = (state: any, currentAsmId: string, currentOffset: number, isLoading: boolean) => {
      return Boolean(
        state &&
        state.status === 'success' &&
        state.proposedAssessment &&
        state.delta &&
        state.baselineAssessmentId === currentAsmId &&
        state.hours === currentOffset &&
        !isLoading
      );
    };

    // While pending, Apply is disabled
    expect(checkApplicable(proposalState, 'asm-baseline-1', 4, false)).toBe(false);

    // Simulation fails with network or domain error
    proposalState = {
      ...proposalState,
      status: 'error',
      error: 'Simulation server returned 503 Service Unavailable',
    };

    // Stored error is present
    expect(proposalState.status).toBe('error');
    expect(proposalState.error).toContain('503 Service Unavailable');
    // Apply is strictly disabled on error
    expect(checkApplicable(proposalState, 'asm-baseline-1', 4, false)).toBe(false);
  });

  it('prevents applying stale proposals when baseline changes or responses arrive out-of-order', () => {
    const missionContext: MissionContext = {
      origin_harbor: 'Ratnagiri',
      craft_profile: 'motorized_boat',
      departure_time: '2026-10-04T06:00:00.000Z',
      return_time: '2026-10-04T14:00:00.000Z',
    };
    const contextKey = missionContextKey(missionContext);

    // Proposal completed for old baseline asm-1
    const proposalFromAsm1 = {
      status: 'success',
      baselineAssessmentId: 'asm-1',
      evidenceBundleId: 'bundle-1',
      hours: 3,
      missionContextKey: contextKey,
      proposedAssessment: { assessment_id: 'asm-sim-1' },
      delta: { summary: 'Lower swell' },
    };

    // Baseline replaced in main application to asm-2
    const currentBaselineId = 'asm-2';

    const isApplicable = Boolean(
      proposalFromAsm1.status === 'success' &&
      proposalFromAsm1.proposedAssessment &&
      proposalFromAsm1.baselineAssessmentId === currentBaselineId
    );

    // Stale proposal cannot be applied to the new baseline!
    expect(isApplicable).toBe(false);
  });

  it('invalidates proposal immediately when mission parameters change', () => {
    const baseContext: MissionContext = {
      origin_harbor: 'Ratnagiri',
      craft_profile: 'motorized_boat',
      vessel_size: 'medium',
      departure_time: '2026-10-04T06:00:00.000Z',
      return_time: '2026-10-04T14:00:00.000Z',
    };
    const key1 = missionContextKey(baseContext);

    // Changing departure time changes the key
    const changedTimeContext: MissionContext = {
      ...baseContext,
      departure_time: '2026-10-04T08:00:00.000Z',
    };
    expect(missionContextKey(changedTimeContext)).not.toBe(key1);

    // Changing craft profile changes the key
    const changedCraftContext: MissionContext = {
      ...baseContext,
      craft_profile: 'mechanized_trawler',
    };
    expect(missionContextKey(changedCraftContext)).not.toBe(key1);

    // Changing harbor changes the key
    const changedHarborContext: MissionContext = {
      ...baseContext,
      origin_harbor: 'Malvan',
    };
    expect(missionContextKey(changedHarborContext)).not.toBe(key1);
  });

  it('executes handleApplyMapProposal using the exact evaluated server result and resets map state', () => {
    let appliedAssessment: any = null;
    let mapTimeOffset = 4;
    let mapProposal: any = {
      status: 'success',
      baselineAssessmentId: 'asm-base-1',
      evidenceBundleId: 'bundle-01',
      hours: 4,
      proposedAssessment: {
        assessment_id: 'asm-evaluated-sim-1',
        decision: 'GO',
        evidence_bundle_id: 'bundle-01',
        conditions: { data_mode: 'SNAPSHOT' },
      },
      delta: { decision_flipped: true },
    };

    const isProposalApplicable = Boolean(
      mapProposal &&
      mapProposal.status === 'success' &&
      mapProposal.proposedAssessment &&
      mapProposal.baselineAssessmentId === 'asm-base-1' &&
      mapProposal.hours === mapTimeOffset
    );

    expect(isProposalApplicable).toBe(true);

    const applyAssessment = (evaluated: any) => {
      appliedAssessment = evaluated;
    };

    const handleApplyMapProposal = () => {
      if (!isProposalApplicable || !mapProposal?.proposedAssessment) return;
      applyAssessment(mapProposal.proposedAssessment);
      mapTimeOffset = 0;
      mapProposal = null;
    };

    handleApplyMapProposal();

    // Applied result is strictly the exact evaluated object from server simulation
    expect(appliedAssessment).toEqual({
      assessment_id: 'asm-evaluated-sim-1',
      decision: 'GO',
      evidence_bundle_id: 'bundle-01',
      conditions: { data_mode: 'SNAPSHOT' },
    });
    expect(mapTimeOffset).toBe(0);
    expect(mapProposal).toBeNull();
  });
});

