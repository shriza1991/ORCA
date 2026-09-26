import type { MissionBriefPayload } from '../../types/assessment';
import type { DecisionDelta, DecisionDiff } from '../../types/mission';
import { translateText, type SupportedLanguage } from '../../i18n/translations';
import {
  HelpCircle,
  ArrowRightCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  GitCommit,
} from 'lucide-react';

export interface MissionBriefPanelProps {
  brief?: MissionBriefPayload | null;
  delta?: DecisionDelta | null;
  activeDiff?: DecisionDiff | null;
  language?: SupportedLanguage;
}

export default function MissionBriefPanel({
  brief,
  delta,
  activeDiff,
  language = 'en',
}: MissionBriefPanelProps) {
  if (!brief) {
    return null;
  }

  const {
    summary,
    recommended_action,
    positive_factors = [],
    negative_factors = [],
    confidence,
    confidence_reasons = [],
  } = brief;

  const changedFactors = delta?.changed_factors || [];
  const hasChangedFactors = changedFactors.length > 0 || !!activeDiff?.summary;

  const confUpper = (confidence || 'MEDIUM').toUpperCase();
  const getConfidenceBadgeColor = () => {
    switch (confUpper) {
      case 'HIGH':
        return { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' };
      case 'LOW':
        return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' };
      case 'MEDIUM':
      default:
        return { bg: '#fffbeb', text: '#92400e', border: '#fde68a' };
    }
  };

  const confBadge = getConfidenceBadgeColor();

  return (
    <div
      className="mission-brief-panel"
      data-testid="mission-brief-panel"
      style={{
        marginTop: '16px',
        marginBottom: '16px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '18px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} style={{ color: '#0284c7' }} />
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
            {translateText('Mission Brief & Why Panel', language)}
          </h3>
        </div>
        <div
          data-testid="confidence-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: confBadge.bg,
            color: confBadge.text,
            border: `1px solid ${confBadge.border}`,
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.82rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <ShieldCheck size={14} />
          <span>{translateText('Confidence', language)}: {confUpper}</span>
        </div>
      </div>

      {/* 1. Why ORCA Recommends This */}
      <div data-testid="why-summary-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155', fontWeight: 700, fontSize: '0.95rem' }}>
          <HelpCircle size={16} style={{ color: '#0284c7' }} />
          <span>{translateText('Why ORCA Recommends This', language)}</span>
        </div>
        <div
          data-testid="why-summary"
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 14px',
            fontSize: '0.98rem',
            color: '#1e293b',
            lineHeight: 1.5,
          }}
        >
          {translateText(summary, language)}
        </div>
      </div>

      {/* 2. Recommended Action */}
      <div data-testid="recommended-action-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: 700, fontSize: '0.95rem' }}>
          <ArrowRightCircle size={16} style={{ color: '#16a34a' }} />
          <span>{translateText('Recommended Action', language)}</span>
        </div>
        <div
          data-testid="recommended-action"
          style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '12px 14px',
            fontSize: '0.98rem',
            color: '#14532d',
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          {translateText(recommended_action, language)}
        </div>
      </div>

      {/* 3. Positive Factors */}
      {positive_factors.length > 0 && (
        <div data-testid="positive-factors-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803d', fontWeight: 700, fontSize: '0.92rem' }}>
            <CheckCircle2 size={16} />
            <span>{translateText('Top Positive Factors', language)}</span>
          </div>
          <ul
            data-testid="positive-factors-list"
            style={{
              margin: 0,
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.92rem',
              color: '#334155',
            }}
          >
            {positive_factors.map((factor, idx) => (
              <li key={idx} style={{ lineHeight: 1.45 }}>
                {translateText(factor, language)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. Negative Factors (Hidden when empty) */}
      {negative_factors.length > 0 && (
        <div data-testid="negative-factors-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontWeight: 700, fontSize: '0.92rem' }}>
            <AlertTriangle size={16} />
            <span>{translateText('Negative & Risk Factors', language)}</span>
          </div>
          <ul
            data-testid="negative-factors-list"
            style={{
              margin: 0,
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.92rem',
              color: '#991b1b',
            }}
          >
            {negative_factors.map((factor, idx) => (
              <li key={idx} style={{ lineHeight: 1.45 }}>
                {translateText(factor, language)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Confidence & Supporting Reasons */}
      <div data-testid="confidence-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontWeight: 600, fontSize: '0.88rem' }}>
          <ShieldCheck size={15} style={{ color: '#64748b' }} />
          <span>{translateText('Confidence Justification', language)} ({confUpper})</span>
        </div>
        {confidence_reasons.length > 0 && (
          <ul
            data-testid="confidence-reasons-list"
            style={{
              margin: 0,
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '0.85rem',
              color: '#64748b',
            }}
          >
            {confidence_reasons.map((reason, idx) => (
              <li key={idx}>{translateText(reason, language)}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 6. What Changed? (What-If Delta Section) */}
      {hasChangedFactors && (
        <div
          data-testid="what-changed-section"
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1d4ed8', fontWeight: 700, fontSize: '0.95rem' }}>
            <GitCommit size={16} />
            <span>{translateText('What Changed?', language)}</span>
          </div>

          {activeDiff && (
            <div style={{ fontSize: '0.9rem', color: '#1e40af', fontWeight: 600 }}>
              {activeDiff.baselineStatus} → {activeDiff.simulatedStatus}: {activeDiff.summary}
            </div>
          )}

          {changedFactors.length > 0 && (
            <ul
              data-testid="changed-factors-list"
              style={{
                margin: 0,
                paddingLeft: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '0.9rem',
                color: '#1e3a8a',
              }}
            >
              {changedFactors.map((cf: string, idx: number) => (
                <li key={idx}>{translateText(cf, language)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
