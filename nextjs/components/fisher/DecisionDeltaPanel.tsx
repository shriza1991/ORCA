import type { CounterfactualFlipExplanation } from '../../types/assessment';
import type { DecisionDiff } from '../../types/mission';
import { translateText, type SupportedLanguage } from '../../i18n/translations';
import { ArrowRight, AlertTriangle, RefreshCcw } from 'lucide-react';

export interface DecisionDeltaPanelProps {
  diff?: DecisionDiff | null;
  flipExplanation?: CounterfactualFlipExplanation | null;
  language?: SupportedLanguage;
}

export default function DecisionDeltaPanel({
  diff,
  flipExplanation,
  language = 'en',
}: DecisionDeltaPanelProps) {
  if (!diff && !flipExplanation) {
    return null;
  }

  const baselineStatus = flipExplanation?.baseline_decision || diff?.baselineStatus || 'UNKNOWN';
  const simulatedStatus = flipExplanation?.simulated_decision || diff?.simulatedStatus || 'UNKNOWN';
  const explanation = flipExplanation || diff?.flip_explanation;

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'GO':
        return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
      case 'CAUTION':
        return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      case 'NO_GO':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  const oldStyle = getStatusColor(baselineStatus);
  const newStyle = getStatusColor(simulatedStatus);

  return (
    <div
      className="decision-delta-panel"
      data-testid="decision-delta-panel"
      style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '10px',
      }}
    >
      {/* Header with status flip pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
          <AlertTriangle size={16} color="#d97706" />
          <span>{translateText('Counterfactual Flip Attribution', language)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            data-testid="delta-old-decision"
            style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: oldStyle.bg,
              color: oldStyle.text,
              border: `1px solid ${oldStyle.border}`,
            }}
          >
            {baselineStatus}
          </span>
          <ArrowRight size={14} color="#64748b" />
          <span
            data-testid="delta-new-decision"
            style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: newStyle.bg,
              color: newStyle.text,
              border: `1px solid ${newStyle.border}`,
            }}
          >
            {simulatedStatus}
          </span>
        </div>
      </div>

      {/* Causal Driver Details */}
      {explanation && explanation.primary_cause_metric && explanation.primary_cause_metric !== 'none' ? (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>{translateText('Primary Cause', language)}:</span>
            <span data-testid="delta-primary-cause" style={{ fontWeight: 700, color: '#0f172a' }}>
              {translateText(explanation.primary_cause_metric, language)}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>{translateText('Observed Shift', language)}:</span>
            <span data-testid="delta-shift-values" style={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>
              {explanation.observed_before} → {explanation.observed_after}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>{translateText('Threshold Crossed', language)}:</span>
            <span data-testid="delta-threshold-crossed" style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
              {explanation.threshold_crossed}
            </span>
          </div>

          {explanation.minimal_adjustment_to_revert && (
            <div
              data-testid="delta-revert-adjustment"
              style={{
                marginTop: '4px',
                paddingTop: '8px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#15803d',
                fontWeight: 600,
              }}
            >
              <RefreshCcw size={13} />
              <span>{translateText(explanation.minimal_adjustment_to_revert, language)}</span>
            </div>
          )}
        </div>
      ) : (
        /* Fallback when full explanation payload is not provided */
        <div
          data-testid="delta-summary-text"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '0.85rem',
            color: '#334155',
            lineHeight: 1.5,
          }}
        >
          {diff?.summary ? translateText(diff.summary, language) : translateText('Counterfactual simulation evaluated under adjusted parameters.', language)}
        </div>
      )}
    </div>
  );
}
