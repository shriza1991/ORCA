import { Waves, Wind, Eye, Thermometer, Navigation, Droplets, ArrowRight } from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';

export function assessmentStatus(a: TripAssessmentResponse) {
  return typeof a.decision === 'string' ? a.decision : a.decision.status;
}

export function ConditionStrip({ assessment }: { assessment: TripAssessmentResponse | null }) {
  const marine = assessment?.conditions.marine;
  const weather = assessment?.conditions.weather;
  const metrics = [
    [Waves, 'Waves', marine?.significant_wave_height_m, 'm'],
    [Wind, 'Wind', weather?.wind_speed_knots, 'kt'],
    [Eye, 'Visibility', weather?.visibility_km, 'km'],
    [Thermometer, 'Sea temperature', marine?.sea_surface_temp_c, '°C'],
    [Navigation, 'Current', marine?.surface_current_knots, 'kt'],
    [Droplets, 'Tide', marine?.tide_level_m ?? marine?.sea_level_height_m, 'm'],
  ] as const;
  return <div className="condition-strip">{metrics.map(([Icon, label, value, unit]) => <div key={label}><span><Icon size={16} />{label}</span><strong>{value == null ? '—' : value.toFixed(1)} <small>{unit}</small></strong>{label === 'Tide' && <small>{marine?.tide_phase || 'Phase unavailable'}</small>}</div>)}</div>;
}

export default function MissionSummary({ assessment, loading, error, onPlan, onMap }: { assessment: TripAssessmentResponse | null; loading?: boolean; error?: string | null; onPlan: () => void; onMap: () => void }) {
  if (loading) return <section className="mission-summary" role="status"><span className="eyebrow">ASSESSING YOUR MISSION</span><h2>Checking the sea ahead…</h2><p>Matching your vessel and trip window to marine evidence.</p></section>;
  if (!assessment || error) return <section className="mission-summary"><h2>{error ? 'Assessment needs a connection' : 'Your next trip starts here'}</h2><p>{error || 'Choose your vessel, departure and fishing area.'}</p><button className="product-primary" onClick={onPlan}>Plan a trip <ArrowRight size={16} /></button></section>;
  const status = assessmentStatus(assessment);
  const titles: Record<string, string> = { GO: 'Within operating limits', CAUTION: 'Plan with care', NO_GO: 'Hold departure', UNKNOWN: 'Check conditions before departure' };
  const brief = assessment.brief;
  return <section className={`mission-summary status-${status}`}>
    <div className="section-heading"><span className="eyebrow">YOUR TRIP ASSESSMENT</span><span className="decision-label">{status.replace('_', ' ')}</span></div>
    <p className="muted">{assessment.conditions.source_metadata?.provenance_mode || assessment.conditions.data_mode} ? Evidence {assessment.evidence_bundle_id || "not retained"}</p>
    <h2>{titles[status] || 'Review your mission'}</h2>
    <p className="mission-action">{brief?.recommended_action || brief?.summary}</p>
    <ConditionStrip assessment={assessment} />
    <details className="product-details"><summary>Why this decision?</summary><p>{brief?.negative_factors[0] || brief?.positive_factors[0] || brief?.summary}</p><ul>{[...(brief?.negative_factors || []), ...(brief?.positive_factors || [])].slice(0, 5).map((factor, i) => <li key={i}>{factor}</li>)}</ul><p className="muted">Confidence: {brief?.confidence}. {brief?.confidence_reasons.join(' ')}</p></details>
    <details className="product-details"><summary>Evidence and evaluation record</summary><p>Derived domain explanation. These are executed service outcomes, not specialist agent votes.</p><ul>{assessment.evaluation_events?.map((e, i) => <li key={i}>{e.component}: {e.status}{e.details ? ` ? ${e.details}` : ""}</li>)}</ul><p>Captured: {assessment.conditions.captured_at}. Evaluator: {assessment.evaluator_version}.</p><p>Marine: {assessment.conditions.marine?.source_name} ? valid until {assessment.conditions.marine?.valid_to || "unavailable"}</p><p>Weather: {assessment.conditions.weather?.source_name} ? valid until {assessment.conditions.weather?.valid_to || "unavailable"}</p></details>
    <div className="product-actions"><button className="product-primary" onClick={onMap}>Explore trip map <ArrowRight size={16} /></button><button onClick={onPlan}>Edit trip</button></div>
  </section>;
}
