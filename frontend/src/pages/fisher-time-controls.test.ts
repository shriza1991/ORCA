import { describe, it, expect } from 'vitest';

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
});
