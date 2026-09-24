import { useState } from 'react';
import { Shield, ShieldAlert, Info, Database, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface DatasetTrustMetadata {
  datasetName: string;
  sourceProvider: string;
  sourceProduct: string;
  dataMode: 'SYNTHETIC SNAPSHOT' | 'SYNTHETIC DEMO' | 'HYBRID' | 'LIVE';
  snapshotPeriod: string;
  referenceTime?: string;
  validCount: number;
  totalCount: number;
  qcBreakdown?: Record<string, number>;
  statusBreakdown?: Record<string, number>;
  confidenceBreakdown?: Record<string, number>;
  meanUncertainty?: number | null;
  semanticsDescription: string;
  officialDocUrl?: string;
  notes?: string[];
}

export interface DataProvenancePanelProps {
  metadata: DatasetTrustMetadata | null;
  loading?: boolean;
  compact?: boolean;
}

export default function DataProvenancePanel({
  metadata,
  loading = false,
  compact = false,
}: DataProvenancePanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="dataset-provenance-bar loading" data-testid="data-provenance-loading">
        <Database size={13} className="researcher-spinner" />
        <span>Loading dataset provenance & quality metadata…</span>
      </div>
    );
  }

  if (!metadata || metadata.totalCount === 0) {
    return (
      <div className="dataset-provenance-bar unavailable" data-testid="data-provenance-unavailable">
        <ShieldAlert size={13} className="provenance-icon-warn" />
        <span className="provenance-title">Dataset Trust & Provenance:</span>
        <span className="provenance-unavailable-text">Quality and provenance metadata unavailable for this selection.</span>
      </div>
    );
  }

  const isAllValid = metadata.validCount === metadata.totalCount && metadata.totalCount > 0;
  const validRate = metadata.totalCount > 0 ? Math.round((metadata.validCount / metadata.totalCount) * 100) : 0;

  return (
    <div className={`dataset-provenance-container ${compact ? 'compact' : ''}`} data-testid="data-provenance-panel">
      {/* Top Bar Summary */}
      <div className="dataset-provenance-bar">
        <div className="provenance-left">
          <Shield size={14} className={isAllValid ? 'provenance-icon-good' : 'provenance-icon-warn'} />
          <span className="provenance-provider-badge">{metadata.sourceProvider}</span>
          <span className="provenance-name">{metadata.datasetName}</span>
          <span className="provenance-mode-badge">{metadata.dataMode}</span>
          <span className="provenance-period-text">· {metadata.snapshotPeriod}</span>
        </div>

        <div className="provenance-right">
          <div className="provenance-quality-pill">
            <span className="quality-pill-label">Quality:</span>
            <strong className={`quality-pill-val ${validRate < 100 ? 'has-suspect' : ''}`}>
              {metadata.validCount} / {metadata.totalCount} valid ({validRate}%)
            </strong>
          </div>

          <button
            type="button"
            className="provenance-details-toggle"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label="Toggle provenance and quality details"
          >
            <span>{expanded ? 'Hide Trust Details' : 'Data Trust & Lineage'}</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Expandable Trust & Lineage Details */}
      {expanded && (
        <div className="dataset-provenance-details" data-testid="provenance-expanded-details">
          <div className="provenance-grid">
            {/* Source & Instrument */}
            <div className="provenance-section">
              <span className="provenance-section-title">
                <Database size={12} />
                Source Lineage & Product
              </span>
              <div className="provenance-keyval">
                <span className="p-key">Provider:</span>
                <span className="p-val">{metadata.sourceProvider}</span>
              </div>
              <div className="provenance-keyval">
                <span className="p-key">Source Product:</span>
                <span className="p-val">{metadata.sourceProduct}</span>
              </div>
              {metadata.referenceTime && (
                <div className="provenance-keyval">
                  <span className="p-key">Reference Time:</span>
                  <span className="p-val mono">{metadata.referenceTime}</span>
                </div>
              )}
              {metadata.officialDocUrl && (
                <div className="provenance-keyval">
                  <span className="p-key">Documentation:</span>
                  <a
                    href={metadata.officialDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="provenance-link"
                  >
                    {metadata.officialDocUrl}
                  </a>
                </div>
              )}
            </div>

            {/* Quality Control & Breakdown */}
            <div className="provenance-section">
              <span className="provenance-section-title">
                <CheckCircle2 size={12} />
                Quality Control Breakdown
              </span>
              <div className="provenance-qc-badges">
                {metadata.qcBreakdown &&
                  Object.entries(metadata.qcBreakdown).map(([status, count]) => {
                    const statusLower = status.toLowerCase();
                    return (
                      <span key={status} className={`p-qc-badge ${statusLower}`}>
                        {status}: {count}
                      </span>
                    );
                  })}
                {metadata.confidenceBreakdown &&
                  Object.entries(metadata.confidenceBreakdown).map(([conf, count]) => (
                    <span key={conf} className={`p-conf-badge ${conf.toLowerCase()}`}>
                      Confidence {conf}: {count}
                    </span>
                  ))}
                {metadata.statusBreakdown &&
                  Object.entries(metadata.statusBreakdown).map(([st, count]) => (
                    <span key={st} className={`p-status-badge ${st.toLowerCase()}`}>
                      Status {st}: {count}
                    </span>
                  ))}
              </div>

              {metadata.meanUncertainty !== undefined && metadata.meanUncertainty !== null && (
                <div className="provenance-keyval" style={{ marginTop: 6 }}>
                  <span className="p-key">Mean Pixel Uncertainty:</span>
                  <span className="p-val mono">±{metadata.meanUncertainty}</span>
                </div>
              )}
            </div>

            {/* Scientific Semantics & Disclosures */}
            <div className="provenance-section full-width">
              <span className="provenance-section-title">
                <Info size={12} />
                Scientific Semantics & Data Disclosure
              </span>
              <p className="provenance-semantics-desc">{metadata.semanticsDescription}</p>

              <div className="provenance-disclosure-notice">
                <AlertTriangle size={13} className="disclosure-icon" />
                <span>
                  <strong>SYNTHETIC DATA DISCLOSURE:</strong> This dataset is a deterministic, source-faithful synthetic snapshot modeled on official documented specifications. It is not connected to live real-time operational sensors.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
