import { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { EvidenceItem, AgentTraceItem, ThresholdComparison } from '../../types/contracts';
import type { AssessmentSourceStatus, MissionBriefPayload, DecisionStabilityPayload } from '../../types/assessment';
import { TRANSLATIONS, type SupportedLanguage } from '../../i18n/translations';
import EvidenceCard from './EvidenceCard';
import ThresholdTable from './ThresholdTable';
import AgentTimeline from '../trace/AgentTimeline';
import { X, FileText, Activity, Database, ShieldCheck, Gauge, TrendingUp } from 'lucide-react';

export interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidence?: (ThresholdComparison | EvidenceItem | Record<string, any>)[];
  trace?: AgentTraceItem[];
  sourceStatus?: AssessmentSourceStatus[];
  brief?: MissionBriefPayload;
  stability?: DecisionStabilityPayload | null;
  language?: SupportedLanguage;
  assessmentTime?: string;
  departureTime?: string;
}

export default function EvidenceDrawer({
  isOpen,
  onClose,
  evidence = [],
  trace = [],
  sourceStatus = [],
  brief,
  stability,
  language = 'en',
  assessmentTime,
  departureTime,
}: EvidenceDrawerProps) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  // Separate threshold comparisons from raw chat evidence items
  const { thresholdComparisons, rawEvidenceItems } = useMemo(() => {
    const thresholds: (ThresholdComparison | Record<string, any>)[] = [];
    const raw: EvidenceItem[] = [];

    for (const item of evidence) {
      if ('operator' in item || 'threshold_value' in item || 'impact' in item) {
        thresholds.push(item);
      } else {
        raw.push(item as EvidenceItem);
      }
    }
    return { thresholdComparisons: thresholds, rawEvidenceItems: raw };
  }, [evidence]);

  // Deterministic Decision Boundaries (M1.4)
  const decisionBoundaries = useMemo(() => {
    return thresholdComparisons
      .filter((tc: any) => typeof tc.observed_value === 'number' && typeof tc.threshold_value === 'number')
      .map((tc: any) => {
        const isUpper = tc.operator !== '<' && tc.operator !== '<=';
        const margin = typeof tc.margin === 'number' ? tc.margin : (isUpper ? tc.threshold_value - tc.observed_value : tc.observed_value - tc.threshold_value);
        const marginPercent = typeof tc.margin_percent === 'number' ? tc.margin_percent : (tc.threshold_value !== 0 ? (margin / tc.threshold_value) * 100 : 0);
        const isNearest = Boolean(tc.is_nearest_boundary) || (stability?.nearest_boundary?.metric_name === tc.metric_name);
        return {
          metric_name: tc.metric_name,
          observed_value: tc.observed_value,
          threshold_value: tc.threshold_value,
          unit: tc.unit || '',
          operator: tc.operator || '>=',
          margin: Number(margin.toFixed(2)),
          margin_percent: Number(marginPercent.toFixed(1)),
          target_tier: tc.exceeded ? 'GO' : 'CAUTION',
          is_nearest_boundary: isNearest,
          exceeded: Boolean(tc.exceeded),
        };
      })
      .sort((a, b) => (a.is_nearest_boundary ? -1 : b.is_nearest_boundary ? 1 : a.margin - b.margin));
  }, [thresholdComparisons, stability]);

  // Deterministic Sensitivity Ranking (M1.4)
  const sensitivityRanking = useMemo(() => {
    if (stability?.sensitivity_ranking && stability.sensitivity_ranking.length > 0) {
      return stability.sensitivity_ranking;
    }
    const tier1: string[] = [];
    const tier2: { ratio: number; line: string }[] = [];
    const tier3: { ratio: number; line: string }[] = [];

    for (const tc of thresholdComparisons as any[]) {
      if (tc.metric_name === 'cyclone_warning_active' && Boolean(tc.observed_value)) {
        tier1.push('Cyclone warnings (Active IMD cyclone bulletin)');
      } else if (tc.metric_name === 'squall_alert' && Boolean(tc.observed_value)) {
        tier1.push('Squall alerts (Active IMD squall warning)');
      } else if ((tc.metric_name === 'geofence' || tc.metric_name === 'geofence_restriction') && Boolean(tc.observed_value)) {
        tier1.push('Geofence hazards (Restricted maritime zone)');
      }

      if (typeof tc.observed_value === 'number' && typeof tc.threshold_value === 'number') {
        const obs = tc.observed_value;
        const thresh = tc.threshold_value;
        const unit = tc.unit || '';
        const label = tc.metric_name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        if (tc.exceeded) {
          const ratio = thresh !== 0 ? (obs - thresh) / thresh : 0;
          tier2.push({ ratio, line: `${label} (+${(ratio * 100).toFixed(1)}% breach: ${obs}${unit} vs ${thresh}${unit} limit)` });
        } else {
          const ratio = thresh !== 0 ? (thresh - obs) / thresh : 0;
          tier3.push({ ratio, line: `${label} (${(ratio * 100).toFixed(1)}% safe margin: ${obs}${unit} vs ${thresh}${unit} limit)` });
        }
      }
    }

    tier2.sort((a, b) => b.ratio - a.ratio);
    tier3.sort((a, b) => a.ratio - b.ratio);

    return [...tier1, ...tier2.map((x) => x.line), ...tier3.map((x) => x.line)];
  }, [thresholdComparisons, stability]);

  const hasThresholds = thresholdComparisons.length > 0;
  const hasBoundaries = decisionBoundaries.length > 0;
  const hasSensitivity = sensitivityRanking.length > 0;
  const hasRawEvidence = rawEvidenceItems.length > 0;
  const hasSources = sourceStatus && sourceStatus.length > 0;
  const hasTrace = trace && trace.length > 0;

  // Select initial tab
  type TabType = 'thresholds' | 'boundaries' | 'sensitivity' | 'evidence' | 'sources' | 'trace';
  const defaultTab: TabType = hasThresholds ? 'thresholds' : hasBoundaries ? 'boundaries' : hasRawEvidence ? 'evidence' : 'sources';
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className="evidence-drawer"
          aria-describedby={undefined}
          style={{ width: '680px', maxWidth: '95vw' }}
        >
          <div className="drawer-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Dialog.Title style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="#0284c7" />
              Evidence & Data Feeds
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="drawer-close-btn"
                aria-label="Close drawer"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div
            className="drawer-tabs"
            style={{
              display: 'flex',
              gap: '4px',
              padding: '8px 16px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              overflowX: 'auto',
            }}
          >
            {hasThresholds && (
              <button
                type="button"
                data-testid="tab-thresholds"
                className={`drawer-tab ${activeTab === 'thresholds' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'thresholds' ? '#ffffff' : 'transparent',
                  color: activeTab === 'thresholds' ? '#0f172a' : '#64748b',
                  fontWeight: activeTab === 'thresholds' ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: activeTab === 'thresholds' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
                onClick={() => setActiveTab('thresholds')}
              >
                <FileText size={15} />
                <span>Threshold Matrix ({thresholdComparisons.length})</span>
              </button>
            )}

            {hasBoundaries && (
              <button
                type="button"
                data-testid="tab-boundaries"
                className={`drawer-tab ${activeTab === 'boundaries' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'boundaries' ? '#ffffff' : 'transparent',
                  color: activeTab === 'boundaries' ? '#0f172a' : '#64748b',
                  fontWeight: activeTab === 'boundaries' ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: activeTab === 'boundaries' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
                onClick={() => setActiveTab('boundaries')}
              >
                <Gauge size={15} />
                <span>Decision Boundaries ({decisionBoundaries.length})</span>
              </button>
            )}

            {hasSensitivity && (
              <button
                type="button"
                data-testid="tab-sensitivity"
                className={`drawer-tab ${activeTab === 'sensitivity' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'sensitivity' ? '#ffffff' : 'transparent',
                  color: activeTab === 'sensitivity' ? '#0f172a' : '#64748b',
                  fontWeight: activeTab === 'sensitivity' ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: activeTab === 'sensitivity' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
                onClick={() => setActiveTab('sensitivity')}
              >
                <TrendingUp size={15} />
                <span>Sensitivity Ranking ({sensitivityRanking.length})</span>
              </button>
            )}

            {hasRawEvidence && (
              <button
                type="button"
                data-testid="tab-evidence"
                className={`drawer-tab ${activeTab === 'evidence' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'evidence' ? '#ffffff' : 'transparent',
                  color: activeTab === 'evidence' ? '#0f172a' : '#64748b',
                  fontWeight: activeTab === 'evidence' ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: activeTab === 'evidence' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
                onClick={() => setActiveTab('evidence')}
              >
                <FileText size={15} />
                <span>{t.drawerTitleEvidence} ({rawEvidenceItems.length})</span>
              </button>
            )}

            {hasSources && (
              <button
                type="button"
                data-testid="tab-sources"
                className={`drawer-tab ${activeTab === 'sources' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'sources' ? '#ffffff' : 'transparent',
                  color: activeTab === 'sources' ? '#0f172a' : '#64748b',
                  fontWeight: activeTab === 'sources' ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: activeTab === 'sources' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
                onClick={() => setActiveTab('sources')}
              >
                <Database size={15} />
                <span>Data Feeds ({sourceStatus.length})</span>
              </button>
            )}

            {hasTrace && (
              <button
                type="button"
                data-testid="tab-trace"
                className={`drawer-tab ${activeTab === 'trace' ? 'active' : ''}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'trace' ? '#ffffff' : 'transparent',
                  color: activeTab === 'trace' ? '#0f172a' : '#64748b',
                  fontWeight: activeTab === 'trace' ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: activeTab === 'trace' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
                onClick={() => setActiveTab('trace')}
              >
                <Activity size={15} />
                <span>{t.drawerTitleTrace} ({trace.length})</span>
              </button>
            )}
          </div>

          <div className="drawer-content" style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
            {brief && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.8125rem',
                  color: '#334155',
                }}
                data-testid="drawer-brief-summary"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong style={{ color: '#0f172a' }}>Assessment Confidence: {brief.confidence}</strong>
                  <span style={{ color: '#64748b' }}>{brief.recommended_action}</span>
                </div>
                {brief.confidence_reasons && brief.confidence_reasons.length > 0 && (
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', color: '#475569' }}>
                    {brief.confidence_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === 'thresholds' && (
              <div data-testid="thresholds-pane">
                <div style={{ marginBottom: '8px', fontSize: '0.875rem', color: '#64748b' }}>
                  Complete deterministic comparison matrix for evaluated safety thresholds.
                </div>
                <ThresholdTable evidence={thresholdComparisons} />
              </div>
            )}

            {activeTab === 'boundaries' && (
              <div data-testid="boundaries-pane">
                <div style={{ marginBottom: '12px', fontSize: '0.875rem', color: '#64748b' }}>
                  Proximity margins to safety threshold boundaries. Nearest boundary indicates primary limiting constraint.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {decisionBoundaries.map((b, idx) => (
                    <div
                      key={idx}
                      data-testid={`boundary-card-${idx}`}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: b.is_nearest_boundary ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        backgroundColor: b.is_nearest_boundary ? '#f0f9ff' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
                            {b.metric_name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </span>
                          {b.is_nearest_boundary && (
                            <span
                              data-testid="nearest-boundary-tag"
                              style={{
                                fontSize: '0.6875rem',
                                fontWeight: 700,
                                backgroundColor: '#0284c7',
                                color: '#ffffff',
                                padding: '1px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              NEAREST BOUNDARY
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>
                          Observed: {b.observed_value} {b.unit} | Limit: {b.threshold_value} {b.unit} ({b.target_tier})
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: b.margin >= 0 ? '#16a34a' : '#dc2626' }}>
                          {b.margin >= 0 ? '+' : ''}{b.margin.toFixed(2)} {b.unit}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: b.margin >= 0 ? '#16a34a' : '#dc2626' }}>
                          {b.margin >= 0 ? '+' : ''}{b.margin_percent.toFixed(1)}% buffer
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'sensitivity' && (
              <div data-testid="sensitivity-pane">
                <div style={{ marginBottom: '12px', fontSize: '0.875rem', color: '#64748b' }}>
                  Deterministic sensitivity hierarchy ranking risk factors by operational severity and headroom margin.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sensitivityRanking.map((item, idx) => (
                    <div
                      key={idx}
                      data-testid={`sensitivity-item-${idx}`}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: idx === 0 ? '#fee2e2' : '#f1f5f9',
                          color: idx === 0 ? '#dc2626' : '#475569',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ color: '#1e293b', fontWeight: 500 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'evidence' && (
              <div className="evidence-list" data-testid="evidence-pane">
                {rawEvidenceItems.length === 0 ? (
                  <div className="drawer-empty">
                    <p>{t.drawerEmptyEvidence}</p>
                  </div>
                ) : (
                  rawEvidenceItems.map((item, idx) => (
                    <EvidenceCard
                      key={idx}
                      evidence={item}
                      assessmentTime={assessmentTime}
                      departureTime={departureTime}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'sources' && (
              <div data-testid="sources-pane" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ marginBottom: '8px', fontSize: '0.875rem', color: '#64748b' }}>
                  Active telemetry feeds and environmental data providers.
                </div>
                {sourceStatus.map((src, idx) => (
                  <div
                    key={idx}
                    data-testid={`source-item-${idx}`}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
                        {src.provider_name}
                      </div>
                      {src.error_message && (
                        <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '2px' }}>
                          {src.error_message}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        backgroundColor:
                          src.status === 'HEALTHY' || src.status === 'OK' || src.status === 'LIVE'
                            ? '#dcfce7'
                            : '#fef3c7',
                        color:
                          src.status === 'HEALTHY' || src.status === 'OK' || src.status === 'LIVE'
                            ? '#166534'
                            : '#92400e',
                      }}
                    >
                      {src.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'trace' && (
              <div className="trace-container" data-testid="trace-pane">
                {trace.length === 0 ? (
                  <div className="drawer-empty">
                    <p>{t.drawerEmptyTrace}</p>
                  </div>
                ) : (
                  <AgentTimeline trace={trace} />
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
