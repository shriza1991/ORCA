import type { EvidenceItem } from '../../types/contracts';
import { Clock, ExternalLink, MapPin } from 'lucide-react';
import { useTranslation } from "react-i18next";

interface EvidenceCardProps {
  evidence: EvidenceItem;
}

export default function EvidenceCard({ evidence }: EvidenceCardProps) {
  const { t } = useTranslation();
  const { label: freshnessLabel, badgeClass } = getEvidenceProvenanceBadge(evidence);

  const isCalculation =
    Boolean(evidence.quality_flags?.some(f => f.toUpperCase().includes('CALCULATION') || f.toUpperCase().includes('EVAL'))) ||
    Boolean(evidence.lineage_id?.includes('eval'));

  return (
    <div className="evidence-card">
      <div className="evidence-card-header">
        <span className="evidence-source-name">{evidence.source_name}</span>
        <span className={`freshness-badge ${badgeClass}`}>
          {freshnessLabel}
        </span>
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
        {evidence.observed_time ? (
          <div className="evidence-time-row">
            <Clock size={11} />
            <span>Observed: {formatTime(evidence.observed_time)}</span>
          </div>
        ) : isCalculation ? (
          <div className="evidence-time-row text-dim" style={{ fontSize: '0.75rem', color: '#64748b' }}>
            <Clock size={11} />
            <span>Calculation result (no direct sensor timestamp)</span>
          </div>
        ) : null}

        {evidence.valid_from && evidence.valid_to && (
          <div className="evidence-time-row">
            <Clock size={11} />
            <span>Valid: {formatTime(evidence.valid_from)} — {formatTime(evidence.valid_to)}</span>
          </div>
        )}
        {evidence.retrieved_at && (
          <div className="evidence-time-row">
            <Clock size={11} />
            <span>{t('EvidenceCard.retrievedval', { val: formatTime(evidence.retrieved_at) })}</span>
          </div>
        )}
        {evidence.lineage_id && (
          <div className="evidence-time-row" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            <span>Lineage: <code>{evidence.lineage_id}</code></span>
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

function getEvidenceProvenanceBadge(evidence: EvidenceItem): { label: string; badgeClass: string } {
  const flags = (evidence.quality_flags || []).map(f => f.toLowerCase());
  const dataMode = (evidence.data_mode || '').toUpperCase();
  const sourceName = (evidence.source_name || '').toLowerCase();
  const lineage = (evidence.lineage_id || '').toLowerCase();

  // 1. Source unavailable
  if (dataMode === 'UNAVAILABLE' || flags.includes('unavailable') || sourceName.includes('unavailable')) {
    return { label: 'Source unavailable', badgeClass: 'freshness-stale' };
  }

  // 2. Historical / Expired
  if (flags.includes('expired') || flags.includes('stale') || dataMode === 'HISTORICAL') {
    return { label: 'Historical/expired data', badgeClass: 'freshness-stale' };
  }

  // 3. Calculated from snapshot inputs
  if (
    lineage.includes('snapshot_inputs') ||
    lineage.includes('snapshot_fixture') ||
    (flags.includes('geospatial_calculation') && (dataMode === 'SNAPSHOT' || flags.includes('snapshot_source'))) ||
    (flags.includes('snapshot_source') && flags.includes('geospatial_calculation'))
  ) {
    return { label: 'Calculated from snapshot inputs', badgeClass: 'freshness-aging' };
  }

  // 4. Demo scenario
  if (
    dataMode === 'DEMO' ||
    dataMode === 'MOCK' ||
    flags.includes('deterministic_demo') ||
    flags.includes('m2_contract_mock') ||
    flags.includes('m1_demo_data') ||
    sourceName.includes('demo') ||
    sourceName.includes('synthetic')
  ) {
    return { label: 'Demo scenario', badgeClass: 'freshness-aging' };
  }

  // 5. Coverage fallback
  if (
    flags.includes('geographic_fallback') ||
    sourceName.includes('geographic_fallback') ||
    sourceName.includes('ratnagiri fallback')
  ) {
    return { label: 'Coverage fallback', badgeClass: 'freshness-aging' };
  }

  // 6. Model fallback
  if (
    flags.includes('fallback_model') ||
    flags.includes('fallback') ||
    dataMode === 'FALLBACK' ||
    dataMode === 'PHYSICAL_FALLBACK_MODEL' ||
    sourceName.includes('fallback') ||
    sourceName.includes('open-meteo')
  ) {
    return { label: 'Model fallback', badgeClass: 'freshness-aging' };
  }

  // 7. Cached official bulletin
  if (
    dataMode === 'CACHED_REAL' ||
    dataMode === 'CACHED' ||
    flags.includes('cached_source') ||
    flags.includes('cached_official') ||
    (flags.includes('official_source') && !flags.includes('verified_live'))
  ) {
    return { label: 'Cached official bulletin', badgeClass: 'freshness-aging' };
  }

  // 8. Live provider data (genuinely verified live official)
  if (
    (dataMode === 'LIVE' || flags.includes('verified_live')) &&
    flags.includes('official_source')
  ) {
    return { label: 'Live provider data', badgeClass: 'freshness-fresh' };
  }

  if (flags.includes('live') || dataMode === 'LIVE') {
    return { label: 'Live provider data', badgeClass: 'freshness-fresh' };
  }

  // 9. Calculation without observation timestamp
  if (flags.includes('geospatial_calculation') || flags.includes('route_eval') || flags.includes('deterministic_eval')) {
    return { label: 'Calculated metric', badgeClass: 'freshness-aging' };
  }

  return { label: 'Active feed', badgeClass: 'freshness-aging' };
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
