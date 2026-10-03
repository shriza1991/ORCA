import { useState, useRef, useEffect } from 'react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { assessmentRequest } from './AssessmentSimulator';
import { validateRouteChoiceProposal } from '../../utils/mission-proposal';

const API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

export default function RouteChoices({
  assessment,
  onApply,
}: {
  assessment: TripAssessmentResponse;
  onApply: (a: TripAssessmentResponse) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setSelected(null);
    setError('');
    setBusy(false);
  }, [assessment.assessment_id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function apply(routeId: string) {
    const baselineId = assessment.assessment_id;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setBusy(true);
    setError('');

    try {
      const res = await fetch(`${API}/trip-assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...assessmentRequest(assessment),
          selected_route_id: routeId,
          parent_assessment_id: assessment.assessment_id,
        }),
        signal: abort.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not select this corridor.');

      if (abort.signal.aborted || assessment.assessment_id !== baselineId) {
        return;
      }

      const validation = validateRouteChoiceProposal(assessment, data, routeId);
      if (!validation.valid) {
        setError(validation.reason || 'Could not validate selected corridor.');
        return;
      }

      onApply(data);
    } catch (e) {
      if (!abort.signal.aborted) {
        setError((e as Error).message);
      }
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false);
      }
    }
  }

  return (
    <section className="product-section route-choices">
      <h3>Compare corridors</h3>
      <p className="muted">
        Origin forecast applied along the route. Transit estimates assume craft speed; currents are unadjusted. Outbound exposure is not a return-route navigation clearance.
      </p>
      {assessment.route_candidates.map((r) => (
        <div key={r.route_id} className="route-choice">
          <button
            aria-expanded={selected === r.route_id}
            onClick={() => setSelected(selected === r.route_id ? null : r.route_id)}
          >
            <strong>{r.name}</strong>
            <span>
              {r.distance_km} km · {r.eta_hours} h ·{' '}
              {r.departure_supported ? 'Supported by mission evidence' : 'Departure not supported'}
            </span>
          </button>
          {selected === r.route_id && (
            <div>
              <p>{r.eta_assumptions}</p>
              {(r.rejection_reasons || []).map((reason: string, i: number) => (
                <p className="product-notice" key={i}>
                  {reason}
                </p>
              ))}
              <div
                className="route-timeline"
                role="region"
                aria-label="Time and exposure along corridor"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Point</th>
                      <th>Arrival</th>
                      <th>Wave (m)</th>
                      <th>Wind (kt)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(r.waypoint_timeline || []).map((w: Record<string, any>, i: number) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          {new Date(w.eta_iso).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>{w.wave_height_m}</td>
                        <td>{w.wind_knots}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.peak_exposure_point && (
                <p>
                  Peak exposure at point {Number(r.peak_exposure_point.waypoint_index ?? 0) + 1}:{' '}
                  {r.max_wave_height_m} m waves.
                </p>
              )}
              <button
                disabled={busy || !r.departure_supported}
                onClick={() => apply(r.route_id)}
              >
                {busy ? 'Selecting…' : 'Use evaluated corridor'}
              </button>
            </div>
          )}
        </div>
      ))}
      {!assessment.route_candidates.length && (
        <p>No evaluated corridor available for this mission.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
