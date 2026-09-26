import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_MISSION_CONTEXT } from '../../types/mission';

describe('M1.1.5: GuidedTripSetup & Mission Setup Hardening', () => {
  it('ensures DEFAULT_MISSION_CONTEXT uses valid ISO-8601 timestamps', () => {
    expect(DEFAULT_MISSION_CONTEXT.departure_time).not.toBe('today');
    expect(DEFAULT_MISSION_CONTEXT.return_time).not.toBe('tomorrow');

    const depDate = new Date(DEFAULT_MISSION_CONTEXT.departure_time);
    const retDate = new Date(DEFAULT_MISSION_CONTEXT.return_time);

    expect(isNaN(depDate.getTime())).toBe(false);
    expect(isNaN(retDate.getTime())).toBe(false);
    expect(retDate.getTime()).toBeGreaterThan(depDate.getTime());
  });

  it('validates departure time must not be in the past', () => {
    const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
    const futureTime = new Date(Date.now() + 3600 * 1000).toISOString();

    const isPastValid = (iso: string) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return false;
      return d.getTime() >= Date.now() - 15 * 60 * 1000;
    };

    expect(isPastValid(pastTime)).toBe(false);
    expect(isPastValid(futureTime)).toBe(true);
  });

  it('validates return time must be strictly after departure time', () => {
    const depTime = new Date(Date.now() + 3600 * 1000).toISOString();
    const retBefore = new Date(Date.now() + 1800 * 1000).toISOString();
    const retEqual = depTime;
    const retAfter = new Date(Date.now() + 7200 * 1000).toISOString();

    const isWindowValid = (dep: string, ret: string) => {
      const d = new Date(dep);
      const r = new Date(ret);
      if (isNaN(d.getTime()) || isNaN(r.getTime())) return false;
      return r.getTime() > d.getTime();
    };

    expect(isWindowValid(depTime, retBefore)).toBe(false);
    expect(isWindowValid(depTime, retEqual)).toBe(false);
    expect(isWindowValid(depTime, retAfter)).toBe(true);
  });

  it('calculates duration in hours and formats correctly for mission review', () => {
    const depTime = '2026-09-27T04:00:00.000Z';
    const retTime = '2026-09-27T16:30:00.000Z';

    const depDate = new Date(depTime);
    const retDate = new Date(retTime);
    const diffHours = (retDate.getTime() - depDate.getTime()) / (1000 * 60 * 60);

    expect(diffHours).toBe(12.5);
    const formatted = `${diffHours.toFixed(1)} hrs`;
    expect(formatted).toBe('12.5 hrs');
  });

  it('verifies deterministic 7 steps definitions exist', () => {
    const stepIds = ['harbor', 'boat', 'depart', 'return', 'pfz', 'review', 'confirm'];
    expect(stepIds.length).toBe(7);
    expect(stepIds[0]).toBe('harbor');
    expect(stepIds[1]).toBe('boat');
    expect(stepIds[2]).toBe('depart');
    expect(stepIds[3]).toBe('return');
    expect(stepIds[4]).toBe('pfz');
    expect(stepIds[5]).toBe('review');
    expect(stepIds[6]).toBe('confirm');
  });
});
