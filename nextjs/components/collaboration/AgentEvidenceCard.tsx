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
    if (!iso) return 'Recent sync';
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
          Official Data Feeds & Provenance
        </span>
      </div>

      <div className="sources-list">
        {sources.map((src, idx) => {
          const isVerified = src.quality_rating === 'Verified';
          const isFallback = src.quality_rating === 'Snapshot Fallback';

          return (
            <div key={idx} className="source-item-row">
              <div className="source-row-top">
                <span className="source-check-icon">✓</span>
                <span className="source-feed-name">{src.source_name}</span>
                <span className={`source-quality-pill ${isVerified ? 'verified' : isFallback ? 'fallback' : 'partial'}`}>
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
                  <span>Updated: {formatTime(src.last_updated)}</span>
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
