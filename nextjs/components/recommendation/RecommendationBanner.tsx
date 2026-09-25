import type { Recommendation, Confidence } from '../../types/contracts';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Info, ChevronRight, AlertTriangle } from 'lucide-react';
import { TRANSLATIONS, translateText, type SupportedLanguage } from '../../i18n/translations';

interface RecommendationBannerProps {
  recommendation: Recommendation;
  confidence?: Confidence;
  warnings?: string[];
  language?: SupportedLanguage;
}

const STATUS_ICONS: Record<string, any> = {
  GO: ShieldCheck,
  CAUTION: ShieldAlert,
  NO_GO: ShieldX,
  UNKNOWN: ShieldQuestion,
  INFORMATIONAL: Info,
};

const STATUS_CLASSES: Record<string, string> = {
  GO: 'status-go',
  CAUTION: 'status-caution',
  NO_GO: 'status-no-go',
  UNKNOWN: 'status-unknown',
  INFORMATIONAL: 'status-informational',
};

export default function RecommendationBanner({
  recommendation,
  confidence,
  warnings,
  language = 'en',
}: RecommendationBannerProps) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const normalizedStatus = (recommendation.status || 'UNKNOWN').toUpperCase();

  const Icon = STATUS_ICONS[normalizedStatus] || Info;
  const statusClass = STATUS_CLASSES[normalizedStatus] || 'status-informational';
  const statusLabel = t.statusLabels[normalizedStatus] || recommendation.status || 'Advisory';

  const rawConf = confidence?.level?.toUpperCase() || 'MEDIUM';
  const confLabel = t.confidenceLabels[rawConf] || `${rawConf} Confidence`;

  return (
    <div className={`recommendation-banner ${statusClass}`}>
      <div className="recommendation-header">
        <div className="recommendation-status">
          <Icon size={20} />
          <span className="recommendation-label">{statusLabel}</span>
        </div>
        {confidence && (
          <span className={`confidence-badge confidence-${rawConf.toLowerCase()}`}>
            {confLabel}
          </span>
        )}
      </div>

      {recommendation.summary && (
        <p className="recommendation-summary">{translateText(recommendation.summary, language)}</p>
      )}

      {recommendation.decisive_factors && recommendation.decisive_factors.length > 0 && (
        <div className="decisive-factors">
          <h5 className="factors-title">{t.decisiveFactorsTitle}</h5>
          <ul className="factors-list">
            {recommendation.decisive_factors.map((factor, i) => (
              <li key={i} className="factor-item">
                <ChevronRight size={12} />
                <span>{translateText(factor, language)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendation.threshold_comparisons && recommendation.threshold_comparisons.length > 0 && (
        <div className="threshold-checks" style={{ margin: '8px 0', padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
          <h6 style={{ margin: '0 0 6px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
            Deterministic Threshold Verification
          </h6>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {recommendation.threshold_comparisons.map((tc, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>{tc.description || tc.metric_name}</span>
                <span style={{
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 600,
                  background: tc.impact === 'NO_GO_TRIGGER' ? 'rgba(239, 68, 68, 0.2)' : tc.impact === 'CAUTION_TRIGGER' ? 'rgba(245, 158, 11, 0.2)' : tc.impact === 'UNKNOWN_TRIGGER' ? 'rgba(100, 116, 139, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: tc.impact === 'NO_GO_TRIGGER' ? '#ef4444' : tc.impact === 'CAUTION_TRIGGER' ? '#f59e0b' : tc.impact === 'UNKNOWN_TRIGGER' ? '#94a3b8' : '#10b981',
                }}>
                  {tc.impact.replace('_TRIGGER', '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendation.non_decisive_factors && recommendation.non_decisive_factors.length > 0 && (
        <div className="non-decisive-factors" style={{ margin: '6px 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          <ul style={{ margin: 0, paddingLeft: '14px' }}>
            {recommendation.non_decisive_factors.map((factor, i) => (
              <li key={i}>{translateText(factor, language)}</li>
            ))}
          </ul>
        </div>
      )}

      {recommendation.next_action && (
        <div className="next-action">
          <strong>{t.nextActionLabel}:</strong> {translateText(recommendation.next_action, language)}
        </div>
      )}

      {recommendation.provenance && recommendation.provenance.length > 0 && (
        <div className="data-provenance" style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {recommendation.provenance.map((prov, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
              {prov.provider_name} • {prov.source_name} {prov.valid_to ? `(Valid to ${prov.valid_to.slice(0, 16).replace('T', ' ')} UTC)` : ''}
            </span>
          ))}
        </div>
      )}

      {confidence?.reasons && confidence.reasons.length > 0 && (
        <div className="confidence-reasons">
          {confidence.reasons.map((reason, i) => (
            <span key={i} className="confidence-reason">{translateText(reason, language)}</span>
          ))}
        </div>
      )}

      {((warnings && warnings.length > 0) || (recommendation.warnings && recommendation.warnings.length > 0)) && (
        <div className="banner-warnings" style={{ marginTop: '8px' }}>
          <h6 style={{ margin: '0 0 4px', fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase' }}>
            {t.warningsTitle}
          </h6>
          {(warnings || recommendation.warnings || []).map((warn, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#f59e0b' }}>
              <AlertTriangle size={12} />
              <span>{translateText(warn, language)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
