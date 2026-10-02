import { useState, useMemo } from 'react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { assessmentStatus } from '../fisher/MissionSummary';
import ErrorBoundary from '../common/ErrorBoundary';

function safeAssessmentStatus(a: any): string {
  if (!a) return 'UNKNOWN';
  try {
    return assessmentStatus(a);
  } catch {
    if (typeof a.decision === 'string') return a.decision;
    return a.decision?.status || 'UNKNOWN';
  }
}

function formatAssessedAt(ts?: string): string {
  if (!ts) return 'Date unavailable';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? ts : d.toLocaleString();
  } catch {
    return ts;
  }
}

function isValidMissionRecord(item: any): item is TripAssessmentResponse {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.assessment_id !== 'string' || !item.assessment_id.trim()) return false;
  return true;
}

export function MissionRecordInspectorInner() {
  const { validRecords, skippedCount } = useMemo(() => {
    try {
      const raw = localStorage.getItem('orca.trips');
      if (!raw) return { validRecords: [], skippedCount: 0 };
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return { validRecords: [], skippedCount: 1 };
      }
      const valid: TripAssessmentResponse[] = [];
      let skipped = 0;
      for (const item of parsed) {
        if (isValidMissionRecord(item)) {
          valid.push(item);
        } else {
          skipped++;
        }
      }
      return { validRecords: valid, skippedCount: skipped };
    } catch {
      return { validRecords: [], skippedCount: 0 };
    }
  }, []);

  const [selectedRecordId, setSelectedRecordId] = useState<string>('');

  const record = useMemo(() => {
    if (!selectedRecordId) return null;
    return validRecords.find((a) => a.assessment_id === selectedRecordId) || null;
  }, [validRecords, selectedRecordId]);

  const negativeFactors = Array.isArray(record?.brief?.negative_factors)
    ? record.brief.negative_factors
    : [];

  const evidenceItems = Array.isArray(record?.evidence)
    ? record.evidence.filter((e) => e && typeof e.metric_name === 'string')
    : [];

  return (
    <details className="product-details shared-mission-record">
      <summary>Inspect a Fisher mission record on this device</summary>
      <p className="muted">
        Read-only historical assessment. These records are not authenticated fleet telemetry or a fresh departure clearance.
      </p>

      {skippedCount > 0 && (
        <p className="muted" role="status" style={{ color: 'var(--color-warning, #d97706)' }}>
          Note: {skippedCount} incompatible mission record(s) on this device were skipped.
        </p>
      )}

      <label>
        Mission
        <select
          value={selectedRecordId}
          onChange={(e) => setSelectedRecordId(e.target.value)}
          aria-label="Select stored mission record"
        >
          <option value="">Select a record</option>
          {validRecords.map((a) => (
            <option key={a.assessment_id} value={a.assessment_id}>
              {(a.trip_context?.origin_harbor) || 'Unknown Port'} · {formatAssessedAt(a.assessed_at)} · {safeAssessmentStatus(a)}
            </option>
          ))}
        </select>
      </label>

      {!validRecords.length && (
        <p>Complete a Fisher assessment to inspect its evidence here.</p>
      )}

      {record && (
        <div>
          <p>
            <strong>{safeAssessmentStatus(record)}</strong> ·{' '}
            {record.conditions?.source_metadata?.provenance_mode ||
              record.conditions?.data_mode ||
              'UNKNOWN'}
          </p>
          <p>{record.brief?.recommended_action || record.brief?.summary || 'No recommendation summary recorded.'}</p>
          <p>
            Evidence {record.evidence_bundle_id || 'unassigned'} · evaluated {formatAssessedAt(record.assessed_at)}
          </p>

          {negativeFactors.length > 0 && (
            <ul>
              {negativeFactors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}

          {evidenceItems.length > 0 && (
            <div className="route-timeline">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Limit</th>
                    <th>Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceItems.map((e, i) => (
                    <tr key={i}>
                      <td>{e.metric_name}</td>
                      <td>{String(e.observed_value ?? '—')}</td>
                      <td>{String(e.threshold_value ?? '—')}</td>
                      <td>{e.impact ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </details>
  );
}

/** Reuse Fisher records across workspaces; no synthetic fleet membership implied. */
export default function MissionRecordInspector() {
  return (
    <ErrorBoundary
      fallbackTitle="Mission Record Inspector Unavailable"
      fallbackMessage="Unable to read stored local mission records on this device."
    >
      <MissionRecordInspectorInner />
    </ErrorBoundary>
  );
}
