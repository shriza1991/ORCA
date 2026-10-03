import type { AgentEvidenceSource } from '../../types/contracts';
import { Database, ShieldCheck, Clock, MapPin, AlertCircle } from 'lucide-react';

interface AgentEvidenceCardProps {
  sources: AgentEvidenceSource[];
  agentName: string;
}

export default function AgentEvidenceCard({ sources, agentName }: AgentEvidenceCardProps) {
  if (!sources || sources.length === 0) {
    return (
      <div className="agent-evidence-source-empty">
        <span className="text-dim">No external source feeds registered.</span>
      </div>
    );
  }

  const formatTime = (iso?: string) => {
    if (!iso) return 'No observation timestamp';
    try {
      return new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="agent-evidence-sources-block" data-testid={`evidence-sources-${agentName}`}>
      <div className="sources-block-header">
        <span className="sources-title">
          <Database size={13} className="text-accent" />
          Data Feeds & Provenance
        </span>
      </div>

      <div className="sources-list">
        {sources.map((src, idx) => {
          const isVerified = src.quality_rating === 'Verified';
          const isFallback = src.quality_rating === 'Snapshot Fallback';
          const isLimited = src.quality_rating === 'Limited';

          const iconColor = isVerified ? '#16a34a' : isFallback ? '#d97706' : isLimited ? '#ef4444' : '#64748b';
          const iconChar = isVerified ? '✓' : isFallback ? '⟳' : '!';

          return (
            <div key={idx} className="source-item-row">
              <div className="source-row-top">
                <span
                  className={`source-check-icon ${isVerified ? 'verified' : isFallback ? 'fallback' : isLimited ? 'limited' : 'partial'}`}
                  style={{ color: iconColor }}
                >
                  {iconChar}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <span className="source-feed-name">{src.source_name}</span>
                  {src.provider && src.provider !== src.source_name && (
                    <span className="source-provider-label" style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Provider: {src.provider}
                    </span>
                  )}
                </div>
                <span className={`source-quality-pill ${isVerified ? 'verified' : isFallback ? 'fallback' : isLimited ? 'limited' : 'partial'}`}>
                  {isVerified ? (
                    <>
                      <ShieldCheck size={11} /> Verified
                    </>
                  ) : (
                    <>
                      <AlertCircle size={11} /> {src.quality_rating}
                    </>
                  )}
                </span>
              </div>

              <div className="source-metadata-row">
                <span className="source-meta-item">
                  <Clock size={11} />
                  <span>Observation: {formatTime(src.last_updated)}</span>
                </span>
                <span className="source-meta-item">
                  <MapPin size={11} />
                  <span>{src.coverage}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
