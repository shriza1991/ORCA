import type { ThresholdComparison } from '../types/contracts';
import type { CounterfactualFlipExplanation } from '../types/assessment';

export function deriveCounterfactualFlip(
  baselineStatus: string,
  simulatedStatus: string,
  baselineComparisons: (ThresholdComparison | Record<string, any>)[] = [],
  simulatedComparisons: (ThresholdComparison | Record<string, any>)[] = []
): CounterfactualFlipExplanation {
  const bDec = (baselineStatus || 'UNKNOWN').toUpperCase();
  const sDec = (simulatedStatus || 'UNKNOWN').toUpperCase();
  const flipped = bDec !== sDec;

  if (!flipped) {
    return {
      baseline_decision: bDec,
      simulated_decision: sDec,
      decision_flipped: false,
      primary_cause_metric: 'none',
      observed_before: '—',
      observed_after: '—',
      threshold_crossed: '—',
      explanation_text: `Decision remained ${bDec}. No safety threshold boundaries were crossed.`,
      minimal_adjustment_to_revert: null,
    };
  }

  const bMap = new Map<string, any>();
  for (const tc of baselineComparisons) {
    if (tc.metric_name) bMap.set(tc.metric_name, tc);
  }

  const candidates: {
    metric: string;
    obsBefore: number;
    obsAfter: number;
    threshold: number;
    unit: string;
    impact: string;
    severity: number;
  }[] = [];

  for (const sTc of simulatedComparisons) {
    const bTc = bMap.get(sTc.metric_name);
    const sObs = typeof sTc.observed_value === 'number' ? sTc.observed_value : parseFloat(String(sTc.observed_value));
    const sThresh = typeof sTc.threshold_value === 'number' ? sTc.threshold_value : parseFloat(String(sTc.threshold_value));
    const bObs = bTc ? (typeof bTc.observed_value === 'number' ? bTc.observed_value : parseFloat(String(bTc.observed_value))) : sObs;

    if (!isNaN(sObs) && !isNaN(sThresh)) {
      const unit = sTc.unit?.includes('meter') ? 'm' : (sTc.unit?.includes('knot') ? 'kt' : sTc.unit || '');
      if (sTc.exceeded && (!bTc || !bTc.exceeded || sObs > bObs)) {
        const severity = sThresh !== 0 ? (sObs - sThresh) / sThresh : 0;
        candidates.push({
          metric: sTc.metric_name,
          obsBefore: isNaN(bObs) ? sObs : bObs,
          obsAfter: sObs,
          threshold: sThresh,
          unit,
          impact: sTc.impact || 'CAUTION_TRIGGER',
          severity,
        });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.severity - a.severity);
    const primary = candidates[0];
    const metricDisplay = primary.metric.includes('wave')
      ? 'Significant Wave Height'
      : primary.metric.includes('wind_speed')
      ? 'Wind Speed'
      : primary.metric.includes('gust')
      ? 'Wind Gust'
      : primary.metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const tierLabel = primary.impact.includes('NO_GO') ? 'NO_GO' : 'CAUTION';
    const delta = Math.abs(primary.obsAfter - primary.threshold);

    const explanationText = `Decision flipped ${bDec} → ${sDec}.\n\nPrimary Cause:\n${metricDisplay}\n\n${primary.obsBefore.toFixed(1)}${primary.unit} → ${primary.obsAfter.toFixed(1)}${primary.unit}\n\nCrossed:\n${primary.threshold.toFixed(1)}${primary.unit} ${tierLabel} threshold.`;
    const revertMsg = `Reduce ${metricDisplay.toLowerCase()} by ${delta.toFixed(1)}${primary.unit} to revert to ${bDec}.`;

    return {
      baseline_decision: bDec,
      simulated_decision: sDec,
      decision_flipped: true,
      primary_cause_metric: metricDisplay,
      observed_before: `${primary.obsBefore.toFixed(1)}${primary.unit}`,
      observed_after: `${primary.obsAfter.toFixed(1)}${primary.unit}`,
      threshold_crossed: `${primary.threshold.toFixed(1)}${primary.unit} ${tierLabel}`,
      explanation_text: explanationText,
      minimal_adjustment_to_revert: revertMsg,
    };
  }

  return {
    baseline_decision: bDec,
    simulated_decision: sDec,
    decision_flipped: true,
    primary_cause_metric: 'Severe Weather Bulletin',
    observed_before: 'Normal',
    observed_after: 'Active Bulletin',
    threshold_crossed: 'Normal Status',
    explanation_text: `Decision flipped ${bDec} → ${sDec} due to an active weather advisory or craft restriction.`,
    minimal_adjustment_to_revert: `Wait for weather advisory clearance to revert to ${bDec}.`,
  };
}
