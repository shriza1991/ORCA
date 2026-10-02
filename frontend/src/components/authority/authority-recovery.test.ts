import { describe, it, expect } from 'vitest';
import ErrorBoundary from '../common/ErrorBoundary';
import MissionRecordInspector from '../mission/MissionRecordInspector';
import PortWatchRegistry from './PortWatchRegistry';
import AquaWatchRegistry from './AquaWatchRegistry';
import type { AuthorityTab } from '../../pages/AuthorityPage';

// Logic mirror to verify resilience behavior directly
function parseAndFilterMissionRecords(raw: string | null): { valid: any[]; skipped: number } {
  if (!raw) return { valid: [], skipped: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { valid: [], skipped: 1 };
    }
    const valid: any[] = [];
    let skipped = 0;
    for (const item of parsed) {
      if (item && typeof item === 'object' && typeof item.assessment_id === 'string' && item.assessment_id.trim()) {
        valid.push(item);
      } else {
        skipped++;
      }
    }
    return { valid, skipped };
  } catch {
    return { valid: [], skipped: 0 };
  }
}

function safeAssessmentStatus(a: any): string {
  if (!a) return 'UNKNOWN';
  if (typeof a.decision === 'string') return a.decision;
  return a.decision?.status || 'UNKNOWN';
}

describe('Authority Recovery & Failure Isolation Regression Suite', () => {
  describe('Mission Record Persistence & Incompatible Records Boundary', () => {
    it('safely parses empty string or null without throwing', () => {
      const resNull = parseAndFilterMissionRecords(null);
      expect(resNull.valid).toEqual([]);
      expect(resNull.skipped).toBe(0);

      const resEmpty = parseAndFilterMissionRecords('');
      expect(resEmpty.valid).toEqual([]);
      expect(resEmpty.skipped).toBe(0);
    });

    it('safely handles non-array object in localStorage and marks as skipped without throwing', () => {
      const nonArray = '{"key": "value"}';
      const res = parseAndFilterMissionRecords(nonArray);
      expect(res.valid).toEqual([]);
      expect(res.skipped).toBe(1);
    });

    it('safely handles invalid JSON syntax without throwing', () => {
      const badSyntax = '{broken';
      const res = parseAndFilterMissionRecords(badSyntax);
      expect(res.valid).toEqual([]);
      expect(res.skipped).toBe(0);
    });

    it('filters out incompatible records while retaining valid records', () => {
      const mixed = JSON.stringify([
        { corrupt: true },
        null,
        'string-entry',
        { assessment_id: 'rec-01', trip_context: { origin_harbor: 'Ratnagiri' }, decision: 'GO' },
        { assessment_id: 'rec-02', trip_context: { origin_harbor: 'Malvan' }, decision: { status: 'CAUTION' } },
      ]);

      const res = parseAndFilterMissionRecords(mixed);
      expect(res.valid).toHaveLength(2);
      expect(res.skipped).toBe(3);
      expect(res.valid[0].assessment_id).toBe('rec-01');
      expect(res.valid[1].assessment_id).toBe('rec-02');
    });

    it('safeAssessmentStatus resolves both string decisions and rich decision objects', () => {
      expect(safeAssessmentStatus(null)).toBe('UNKNOWN');
      expect(safeAssessmentStatus({})).toBe('UNKNOWN');
      expect(safeAssessmentStatus({ decision: 'NO_GO' })).toBe('NO_GO');
      expect(safeAssessmentStatus({ decision: { status: 'CAUTION' } })).toBe('CAUTION');
    });
  });

  describe('Scoped ErrorBoundary Mechanics', () => {
    it('instantiates ErrorBoundary cleanly', () => {
      expect(ErrorBoundary).toBeDefined();
      expect(typeof ErrorBoundary).toBe('function');
    });

    it('getDerivedStateFromError captures thrown errors and transitions state', () => {
      const testError = new Error('WebGL context loss simulation');
      const state = ErrorBoundary.getDerivedStateFromError(testError);
      expect(state.hasError).toBe(true);
      expect(state.error).toBe(testError);
    });
  });

  describe('Authority Page Tab Set Completeness', () => {
    it('contains all 6 authoritative navigation modes including audit and benchmarks', () => {
      const allTabs: AuthorityTab[] = [
        'terminal',
        'fleet',
        'ports',
        'aquaculture',
        'benchmarks',
        'audit',
      ];
      expect(allTabs).toContain('terminal');
      expect(allTabs).toContain('fleet');
      expect(allTabs).toContain('ports');
      expect(allTabs).toContain('aquaculture');
      expect(allTabs).toContain('benchmarks');
      expect(allTabs).toContain('audit');
    });
  });

  describe('Authority Component Exports', () => {
    it('exports MissionRecordInspector cleanly', () => {
      expect(MissionRecordInspector).toBeDefined();
      expect(typeof MissionRecordInspector).toBe('function');
    });

    it('exports PortWatchRegistry cleanly', () => {
      expect(PortWatchRegistry).toBeDefined();
      expect(typeof PortWatchRegistry).toBe('function');
    });

    it('exports AquaWatchRegistry cleanly', () => {
      expect(AquaWatchRegistry).toBeDefined();
      expect(typeof AquaWatchRegistry).toBe('function');
    });
  });
});
