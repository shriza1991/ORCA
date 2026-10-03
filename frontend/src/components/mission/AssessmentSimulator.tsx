import { useEffect, useRef, useState } from 'react';
import type { TripAssessmentRequest, TripAssessmentResponse } from '../../types/assessment';
import type { DecisionDeltaContract } from '../../types/mission';
import { assessmentStatus } from '../fisher/MissionSummary';
import { validateSimulationProposal } from '../../utils/mission-proposal';

const API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

export function assessmentRequest(a: TripAssessmentResponse): TripAssessmentRequest {
  return {
    evidence_bundle_id: a.evidence_bundle_id,
    coordinates: a.trip_context.coordinates,
    origin_harbor: a.trip_context.origin_harbor,
    craft_profile: a.trip_context.craft_profile || 'motorized_boat',
    vessel_size: a.mission_state?.vessel?.size_category || a.trip_context.vessel_size || 'medium',
    departure_time: a.trip_context.departure_time,
    return_time: a.trip_context.return_time,
    destination_id: a.trip_context.target_pfz,
    language_preference: a.trip_context.language_preference || 'en',
    data_mode: a.conditions.data_mode || 'DEMO',
    mission_state: a.mission_state || undefined,
  };
}

export default function AssessmentSimulator({
  assessment,
  onApply,
}: {
  assessment: TripAssessmentResponse;
  onApply: (a: TripAssessmentResponse) => void;
}) {
  const [delay, setDelay] = useState(6);
  const [craft, setCraft] = useState<string>(assessment.trip_context.craft_profile || 'motorized_boat');
  const [size, setSize] = useState(assessment.mission_state?.vessel?.size_category || assessment.trip_context.vessel_size || 'medium');
  const [result, setResult] = useState<{
    baseline: TripAssessmentResponse;
    simulated: TripAssessmentResponse;
    delta: DecisionDeltaContract;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);

  // Reset craft and size controls when the baseline assessment changes
  useEffect(() => {
    controller.current?.abort();
    setCraft(assessment.trip_context.craft_profile || 'motorized_boat');
    setSize(assessment.mission_state?.vessel?.size_category || assessment.trip_context.vessel_size || 'medium');
    setResult(null);
    setError('');
    setLoading(false);
  }, [assessment.assessment_id]);

  useEffect(() => {
    controller.current?.abort();
    setResult(null);
    setLoading(false);
  }, [delay, craft, size]);

  useEffect(() => () => controller.current?.abort(), []);

  const departure = assessment.trip_context.departure_time;
  const proposed = departure ? new Date(Date.parse(departure) + delay * 3600000).toISOString() : undefined;

  async function simulate() {
    if (!proposed) {
      setError('Choose a departure time in your trip plan first.');
      return;
    }
    setLoading(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    const capturedBaselineId = assessment.assessment_id;
    const baseline = assessmentRequest(assessment);
    const proposedReturn = baseline.return_time
      ? new Date(Date.parse(baseline.return_time) + delay * 3600000).toISOString()
      : undefined;

    const simulated = {
      ...baseline,
      mission_state: undefined,
      craft_profile: craft,
      vessel_size: size,
      departure_time: proposed,
      return_time: proposedReturn,
      parent_assessment_id: assessment.assessment_id,
    };

    try {
      const response = await fetch(`${API}/trip-assessments/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseline,
          simulated,
          baseline_assessment_id: assessment.assessment_id,
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.detail || 'Could not compare these missions.');
      }
      const data = await response.json();

      if (!abort.signal.aborted && assessment.assessment_id === capturedBaselineId) {
        const validation = validateSimulationProposal(assessment, data.simulated, {
          craftProfile: craft,
          vesselSize: size,
          departure: proposed,
          returnTime: proposedReturn,
        });
        if (!validation.valid) {
          throw new Error(validation.reason || 'Simulation does not match requested changes.');
        }
        setResult(data);
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError((e as Error).message);
      }
    } finally {
      if (!abort.signal.aborted) {
        setLoading(false);
      }
    }
  }

  function handleApply() {
    if (!result) return;
    if (assessment.assessment_id !== result.baseline.assessment_id) {
      setError('Active mission baseline changed. Cannot apply this proposal.');
      return;
    }
    onApply(result.simulated);
  }

  return (
    <section className="mission-simulator">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MISSION TWIN</span>
          <h3>Try a different plan</h3>
        </div>
        <span className="muted">Same scenario · Recomputed safety</span>
      </div>
      <p className="muted">
        {assessment.trip_context.origin_harbor} → {assessment.trip_context.target_pfz || 'Best available fishing area'} ·{' '}
        {departure ? new Date(departure).toLocaleString() : 'Set departure'}
      </p>
      <div className="simulator-controls">
        <label>
          Departure delay
          <select value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
            {[0, 2, 4, 6, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h === 0 ? 'Same departure' : `+${h} hours`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vessel
          <select value={craft} onChange={(e) => setCraft(e.target.value)}>
            <option value="traditional_non_motorized">Traditional craft</option>
            <option value="motorized_boat">Motorized boat</option>
            <option value="mechanized_trawler">Mechanized trawler</option>
          </select>
        </label>
        <label>
          Size
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {['small', 'medium', 'large'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        New departure: <strong>{proposed ? new Date(proposed).toLocaleString() : 'Choose a departure'}</strong>. Trip duration is preserved.
      </p>
      <button className="product-primary" disabled={loading} onClick={simulate}>
        {loading ? 'Comparing missions…' : 'Compare plans'}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div className="simulation-result" aria-live="polite">
          <div className="decision-comparison">
            <div>
              <small>CURRENT</small>
              <strong>{assessmentStatus(result.baseline)}</strong>
            </div>
            <span>→</span>
            <div>
              <small>NEW SCENARIO</small>
              <strong>{assessmentStatus(result.simulated)}</strong>
            </div>
          </div>
          <h4>What changed?</h4>
          {result.delta.changed_factors.length ? (
            <ul>
              {result.delta.changed_factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <p>No measured threshold values changed.</p>
          )}
          <p>{result.delta.summary}</p>
          <ul>
            {[...result.delta.added_factors, ...result.delta.removed_factors].map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <p className="muted">
            Evidence: {result.simulated.evidence_bundle_id}. Evaluator: {result.simulated.evaluator_version}. Unchanged restrictions still apply.
          </p>
          <button onClick={handleApply}>Use this exact plan</button>
        </div>
      )}
    </section>
  );
}
