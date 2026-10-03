import { useEffect, useRef, useState } from 'react';
import type { TripAssessmentResponse } from '../../types/assessment';
import type { DecisionDeltaContract } from '../../types/mission';
import { validateRefreshedAssessment } from '../../utils/mission-proposal';

const API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
type Update = { simulated: TripAssessmentResponse; delta: DecisionDeltaContract };

export default function MissionChanges({
  assessment,
  onApply,
}: {
  assessment: TripAssessmentResponse;
  onApply: (a: TripAssessmentResponse) => void;
}) {
  const [watch, setWatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [notice, setNotice] = useState('');
  const current = useRef(assessment.assessment_id);
  const controller = useRef<AbortController | null>(null);
  const seen = useRef('');

  useEffect(() => {
    current.current = assessment.assessment_id;
    controller.current?.abort();
    controller.current = null;
    setUpdate(null);
    setNotice('');
    setBusy(false);
    seen.current = ''; // Reset deduplication state when baseline changes
  }, [assessment.assessment_id]);

  async function check() {
    if (controller.current) return;
    const id = assessment.assessment_id;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);

    try {
      const res = await fetch(`${API}/trip-assessments/${id}/refresh`, {
        method: 'POST',
        signal: abort.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not check mission changes.');
      if (current.current !== id || abort.signal.aborted) return;

      const val = validateRefreshedAssessment(assessment, data.simulated);
      if (!val.valid) {
        setNotice(val.reason || 'Could not validate refreshed assessment.');
        return;
      }

      const validation = validateRefreshedAssessment(assessment, data.simulated);
      if (!validation.valid || data.baseline?.assessment_id !== id) {
        throw new Error(validation.reason || 'Refresh returned a different baseline.');
      }
      const d: DecisionDeltaContract = data.delta;
      const material =
        d.decision_changed ||
        Boolean(d.confidence_change) ||
        d.changed_factors.length ||
        d.added_factors.length ||
        d.removed_factors.length;
      const signature = JSON.stringify(d);

      if (material && signature !== seen.current) {
        seen.current = signature;
        setUpdate(data);
        setNotice('New evidence affects this mission. Review before applying.');
      } else {
        setNotice('No new decision factors for this mission.');
      }
    } catch (e) {
      if (!abort.signal.aborted) setNotice((e as Error).message);
    } finally {
      if (controller.current === abort) controller.current = null;
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    if (!watch) return;
    const timer = window.setInterval(() => {
      if (navigator.onLine) void check();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [watch, assessment.assessment_id]);

  useEffect(() => () => controller.current?.abort(), []);

  function handleApply() {
    if (!update) return;
    if (assessment.assessment_id !== current.current) {
      setNotice('Active mission has changed. Refreshed assessment is obsolete.');
      return;
    }
    const validation = validateRefreshedAssessment(assessment, update.simulated);
    if (!validation.valid) { setNotice(validation.reason || 'Refresh is no longer applicable.'); return; }
    onApply(update.simulated);
    setUpdate(null);
  }

  return (
    <section className="product-section">
      <h3>What changed for my mission?</h3>
      <p className="muted">
        Refresh checks new evidence for the same plan. Comparisons keep their original evidence. Nothing is applied automatically.
      </p>
      <button disabled={busy} onClick={() => void check()}>
        {busy ? 'Checking…' : 'Check for changes'}
      </button>
      <label className="monitor-toggle">
        <input
          type="checkbox"
          checked={watch}
          onChange={(e) => setWatch(e.target.checked)}
        />{' '}
        Check every minute while this view is open
      </label>
      <p role="status">{notice}</p>
      {update && (
        <div className="product-notice" role="alert">
          <strong>
            {update.delta.original_decision} → {update.delta.new_decision}
          </strong>
          <ul>
            {[
              ...update.delta.changed_factors,
              ...update.delta.added_factors,
              ...update.delta.removed_factors,
            ].map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <p>{update.delta.summary}</p>
          <button onClick={handleApply}>Review and use refreshed assessment</button>
          <button
            onClick={() => {
              setUpdate(null);
              setNotice('Update acknowledged. Your active assessment is unchanged.');
            }}
          >
            Acknowledge without applying
          </button>
        </div>
      )}
    </section>
  );
}
