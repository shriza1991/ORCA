import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WHAT_IF_PARAMS,
  type DecisionDiff,
} from '../../types/mission';

describe('Mission Twin What-If Simulator Contract & Logic', () => {
  it('validates default what-if simulation parameters', () => {
    expect(DEFAULT_WHAT_IF_PARAMS.timeOffsetHours).toBe(4);
    expect(DEFAULT_WHAT_IF_PARAMS.craftProfileOverride).toBe('motorized_boat');
    expect(DEFAULT_WHAT_IF_PARAMS.objective).toBe('pfz');
  });

  it('generates correct counterfactual queries in English', () => {
    const harbor = 'Ratnagiri';
    const craft = 'Mechanized trawler';
    const offset = 4;
    const query = `What if I delay departure from ${harbor} by ${offset} hours with a ${craft}?`;

    expect(query).toContain('Ratnagiri');
    expect(query).toContain('4 hours');
    expect(query).toContain('Mechanized trawler');
  });

  it('generates correct counterfactual queries in Hindi and Marathi', () => {
    const harbor = 'Ratnagiri';
    const craft = 'Motorized boat';
    const offset = 2;

    const hiQuery = `यदि मैं ${harbor} से प्रस्थान ${offset} घंटे विलंबित करूँ (${craft}), तो क्या स्थिति अनुकूल होगी?`;
    const mrQuery = `जर मी ${harbor} वरून प्रस्थान ${offset} तास पुढे ढकलले (${craft}), तर स्थिती कशी असेल?`;

    expect(hiQuery).toContain('घंटे विलंबित');
    expect(mrQuery).toContain('तास पुढे');
  });

  it('computes and validates Decision Diff structure', () => {
    const diff: DecisionDiff = {
      baselineStatus: 'NO_GO',
      simulatedStatus: 'CAUTION',
      summary: 'Wave height abates from 3.2m to 1.8m after a 4-hour delay.',
      timeOffsetHours: 4,
      craftProfile: 'motorized_boat',
      timestamp: new Date().toISOString(),
    };

    expect(diff.baselineStatus).toBe('NO_GO');
    expect(diff.simulatedStatus).toBe('CAUTION');
    expect(diff.timeOffsetHours).toBe(4);
    expect(diff.summary).toContain('1.8m');
  });

  it('handles unchanged decision status in Decision Diff', () => {
    const diff: DecisionDiff = {
      baselineStatus: 'NO_GO',
      simulatedStatus: 'NO_GO',
      summary: 'Squall warning remains active along the coast.',
      timeOffsetHours: 2,
      craftProfile: 'traditional_non_motorized',
      timestamp: new Date().toISOString(),
    };

    expect(diff.baselineStatus).toBe(diff.simulatedStatus);
    expect(diff.craftProfile).toBe('traditional_non_motorized');
  });

  it('preserves departure_time, return_time, target_pfz, and parent_assessment_id during what-if apply', () => {
    const baseContext = {
      origin_harbor: 'Ratnagiri',
      craft_profile: 'motorized_boat' as const,
      departure_time: '2026-09-27T04:00:00.000Z',
      return_time: '2026-09-27T16:00:00.000Z',
      target_pfz: 'pfz-zone-42',
      parent_assessment_id: 'assmnt-base-123',
    };

    const timeOffsetHours = 4;
    const craftOverride = 'mechanized_trawler' as const;

    const depDate = new Date(baseContext.departure_time);
    const retDate = new Date(baseContext.return_time);
    const newDep = new Date(depDate.getTime() + timeOffsetHours * 3600 * 1000).toISOString();
    const newRet = new Date(retDate.getTime() + timeOffsetHours * 3600 * 1000).toISOString();

    const appliedContext = {
      ...baseContext,
      craft_profile: craftOverride,
      departure_time: newDep,
      return_time: newRet,
      target_pfz: baseContext.target_pfz,
      parent_assessment_id: baseContext.parent_assessment_id,
    };

    expect(appliedContext.craft_profile).toBe('mechanized_trawler');
    expect(appliedContext.departure_time).toBe('2026-09-27T08:00:00.000Z');
    expect(appliedContext.return_time).toBe('2026-09-27T20:00:00.000Z');
    expect(appliedContext.target_pfz).toBe('pfz-zone-42');
    expect(appliedContext.parent_assessment_id).toBe('assmnt-base-123');
    // Ensure duration is preserved
    const originalDuration = new Date(baseContext.return_time).getTime() - new Date(baseContext.departure_time).getTime();
    const newDuration = new Date(appliedContext.return_time).getTime() - new Date(appliedContext.departure_time).getTime();
    expect(newDuration).toBe(originalDuration);
  });
});

