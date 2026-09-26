import { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { EvidenceItem, AgentTraceItem, ThresholdComparison } from '../../types/contracts';
import type { AssessmentSourceStatus, MissionBriefPayload } from '../../types/assessment';
import { TRANSLATIONS, type SupportedLanguage } from '../../i18n/translations';
import EvidenceCard from './EvidenceCard';
import ThresholdTable from './ThresholdTable';
import AgentTimeline from '../trace/AgentTimeline';
import { X, FileText, Activity, Database, ShieldCheck } from 'lucide-react';

export interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidence?: (ThresholdComparison | EvidenceItem | Record<string, any>)[];
  trace?: AgentTraceItem[];
  sourceStatus?: AssessmentSourceStatus[];
  brief?: MissionBriefPayload;
  language?: SupportedLanguage;
}

export default function EvidenceDrawer({
  isOpen,
  onClose,
  evidence = [],
  trace = [],
  sourceStatus = [],
  brief,
  language = 'en',
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

  const hasThresholds = thresholdComparisons.length > 0;
  const hasRawEvidence = rawEvidenceItems.length > 0;
  const hasSources = sourceStatus && sourceStatus.length > 0;
  const hasTrace = trace && trace.length > 0;

  // Select initial tab
  const defaultTab = hasThresholds ? 'thresholds' : hasRawEvidence ? 'evidence' : hasSources ? 'sources' : 'trace';
  const [activeTab, setActiveTab] = useState<'thresholds' | 'evidence' | 'sources' | 'trace'>(defaultTab);

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

            {activeTab === 'evidence' && (
              <div className="evidence-list" data-testid="evidence-pane">
                {rawEvidenceItems.length === 0 ? (
                  <div className="drawer-empty">
                    <p>{t.drawerEmptyEvidence}</p>
                  </div>
                ) : (
                  rawEvidenceItems.map((item, idx) => (
                    <EvidenceCard key={idx} evidence={item} />
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
