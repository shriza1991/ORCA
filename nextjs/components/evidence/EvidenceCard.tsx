import type { EvidenceItem } from '../../types/contracts';
import { Clock, ExternalLink, MapPin } from 'lucide-react';

interface EvidenceCardProps {
  evidence: EvidenceItem;
}

export default function EvidenceCard({ evidence }: EvidenceCardProps) {
  const freshness = getFreshness(evidence);

  return (
    <div className="evidence-card">
      <div className="evidence-card-header">
        <span className="evidence-source-name">{evidence.source_name}</span>
        <FreshnessBadge freshness={freshness} />
      </div>

      {evidence.metric_name && (
        <div className="evidence-metric">
          <span className="evidence-metric-name">{formatMetricName(evidence.metric_name)}</span>
          <span className="evidence-metric-value">
            {formatMetricValue(evidence.metric_value)} {evidence.metric_unit}
          </span>
        </div>
      )}

      <div className="evidence-times">
        {evidence.valid_from && evidence.valid_to && (
          <div className="evidence-time-row">
            <Clock size={11} />
            <span>Valid: {formatTime(evidence.valid_from)} — {formatTime(evidence.valid_to)}</span>
          </div>
        )}
        {evidence.retrieved_at && (
          <div className="evidence-time-row">
            <Clock size={11} />
            <span>Retrieved: {formatTime(evidence.retrieved_at)}</span>
          </div>
        )}
      </div>

      {evidence.geometry && (
        <div className="evidence-geo">
          <MapPin size={11} />
          <span>{evidence.geometry.type}: [{formatCoords(evidence.geometry.coordinates)}]</span>
        </div>
      )}

      <div className="evidence-footer">
        <div className="evidence-flags">
          {evidence.quality_flags.map((flag, i) => (
            <span key={i} className={`evidence-flag flag-${flag}`}>{flag}</span>
          ))}
        </div>
        {evidence.source_url && (
          <a href={evidence.source_url} target="_blank" rel="noopener noreferrer" className="evidence-url">
            <ExternalLink size={11} /> Source
          </a>
        )}
      </div>
    </div>
  );
}

function FreshnessBadge({ freshness }: { freshness: string }) {
  const norm = freshness.toLowerCase();
  const badgeClass = norm.includes('fresh') || norm.includes('real-time')
    ? 'freshness-fresh'
    : norm.includes('stale')
    ? 'freshness-stale'
    : 'freshness-aging';

  return (
    <span className={`freshness-badge ${badgeClass}`}>
      {freshness}
    </span>
  );
}

function getFreshness(evidence: EvidenceItem): string {
  // Check if quality_flags already contains freshness labels
  const directFlag = evidence.quality_flags?.find(f =>
    ['fresh', 'stale', 'aging', 'official_source', 'snapshot', 'simulated', 'live'].includes(f.toLowerCase())
  );
  if (directFlag) return directFlag;

  if (!evidence.retrieved_at) return 'active';
  const ageMs = Date.now() - new Date(evidence.retrieved_at).getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 6) return 'fresh';
  if (hours < 24) return 'aging';
  return 'stale';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function formatMetricName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatMetricValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'number') return value.toFixed(1);
  return String(value);
}

function formatCoords(coords: unknown): string {
  if (Array.isArray(coords) && coords.length === 2 && typeof coords[0] === 'number') {
    return `${coords[0].toFixed(2)}, ${coords[1].toFixed(2)}`;
  }
  return JSON.stringify(coords).slice(0, 40);
}
