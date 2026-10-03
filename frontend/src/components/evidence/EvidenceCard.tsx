import type { EvidenceItem } from '../../types/contracts';
import { Clock, ExternalLink, MapPin } from 'lucide-react';
import { useTranslation } from "react-i18next";

export interface EvidenceCardProps {
  evidence: EvidenceItem;
  assessmentTime?: string;
  departureTime?: string;
}

export default function EvidenceCard({ evidence, assessmentTime, departureTime }: EvidenceCardProps) {
  const { t } = useTranslation();
  const originBadge = getSourceOriginBadge(evidence);
  const evalTime = departureTime || assessmentTime;
  const validityBadge = getTemporalValidityBadge(evidence, evalTime);

  const isCalculation =
    evidence.data_mode === 'CALCULATED' ||
    Boolean(evidence.quality_flags?.some(f => {
      const u = f.toUpperCase();
      return u.includes('CALCULATION') || u.includes('EVAL');
    })) ||
    Boolean(evidence.lineage_id?.includes('eval'));

  return (
    <div className="evidence-card">
      <div className="evidence-card-header">
        <div className="evidence-source-info">
          <span className="evidence-source-name">{evidence.source_name}</span>
          {evidence.provider_name && evidence.provider_name !== evidence.source_name && (
            <span className="evidence-provider-label" style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
              Provider: {evidence.provider_name}
            </span>
          )}
        </div>
        <div className="evidence-badge-group" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`origin-badge freshness-badge ${originBadge.badgeClass}`}>
            {originBadge.label}
          </span>
          <span className={`validity-badge freshness-badge ${validityBadge.badgeClass}`}>
            {validityBadge.label}
          </span>
        </div>
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
        {evidence.coverage && (
          <div className="evidence-time-row" style={{ fontSize: '0.75rem', color: '#64748b' }}>
            <MapPin size={11} />
            <span>Coverage: {evidence.coverage}</span>
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

export function getSourceOriginBadge(evidence: EvidenceItem): { label: string; badgeClass: string } {
  const flags = (evidence.quality_flags || []).map(f => f.toLowerCase());
  const dataMode = (evidence.data_mode || '').toUpperCase();
  const sourceName = (evidence.source_name || '').toLowerCase();
  const lineage = (evidence.lineage_id || '').toLowerCase();

  const isCalculation =
    dataMode === 'CALCULATED' ||
    Boolean(evidence.quality_flags?.some(f => {
      const u = f.toUpperCase();
      return u.includes('CALCULATION') || u.includes('EVAL');
    })) ||
    Boolean(evidence.lineage_id?.includes('eval'));

  // 1. Source unavailable
  if (dataMode === 'UNAVAILABLE' || flags.includes('unavailable') || sourceName.includes('unavailable')) {
    return { label: 'Source unavailable', badgeClass: 'freshness-stale' };
  }

  // 2. Contract mock
  if (flags.includes('m2_contract_mock') || lineage.includes('m2_contract_mock') || sourceName.includes('contract mock')) {
    return { label: 'Contract mock', badgeClass: 'freshness-aging' };
  }

  // 3. Demo scenario
  if (
    dataMode === 'DEMO' ||
    flags.includes('deterministic_demo') ||
    flags.includes('m1_demo_data') ||
    sourceName.includes('demo scenario') ||
    sourceName.includes('controlled marine scenario')
  ) {
    return { label: 'Demo scenario', badgeClass: 'freshness-aging' };
  }

  // 4. Calculations: distinguish snapshot inputs vs general calculation
  if (isCalculation) {
    if (
      lineage.includes('snapshot') ||
      flags.includes('snapshot_source') ||
      dataMode === 'SNAPSHOT' ||
      lineage.includes('fixture')
    ) {
      return { label: 'Calculated from snapshot inputs', badgeClass: 'freshness-aging' };
    }
    return { label: 'Calculated domain result', badgeClass: 'freshness-aging' };
  }

  // 5. Raw Snapshot fixture (must NOT be a calculation)
  if (
    dataMode === 'SNAPSHOT' ||
    lineage.includes('snapshot_fixture') ||
    flags.includes('snapshot_source') ||
    lineage.includes('fixture')
  ) {
    return { label: 'Snapshot fixture', badgeClass: 'freshness-aging' };
  }

  // 6. Geographic fallback
  if (
    flags.includes('geographic_fallback') ||
    sourceName.includes('geographic_fallback') ||
    sourceName.includes('ratnagiri fallback')
  ) {
    return { label: 'Geographic fallback', badgeClass: 'freshness-aging' };
  }

  // 7. Model fallback
  if (
    flags.includes('fallback_model') ||
    flags.includes('fallback') ||
    dataMode === 'FALLBACK' ||
    dataMode === 'PHYSICAL_FALLBACK_MODEL' ||
    sourceName.includes('fallback') ||
    sourceName.includes('open-meteo')
  ) {
    return { label: 'Fallback physical model', badgeClass: 'freshness-aging' };
  }

  // 8. Cached provider data: official origin ONLY when established
  if (
    dataMode === 'CACHED_REAL' ||
    dataMode === 'CACHED' ||
    flags.includes('cached_source') ||
    flags.includes('cached_official') ||
    flags.includes('cached')
  ) {
    const hasOfficial = flags.includes('official_source') || flags.includes('is_official') || (evidence as any).is_official === true;
    if (hasOfficial) {
      return { label: 'Cached official bulletin', badgeClass: 'freshness-aging' };
    }
    return { label: 'Cached provider data', badgeClass: 'freshness-aging' };
  }

  // 9. Live provider data (official vs general)
  if (flags.includes('verified_live') || flags.includes('live') || dataMode === 'LIVE') {
    if (flags.includes('official_source') || flags.includes('is_official') || (evidence as any).is_official === true) {
      return { label: 'Live official provider', badgeClass: 'freshness-fresh' };
    }
    return { label: 'Live provider data', badgeClass: 'freshness-fresh' };
  }

  // Fallback for unknown evidence - DO NOT default to 'Active feed'!
  return { label: 'Unknown source origin', badgeClass: 'freshness-stale' };
}

export function getTemporalValidityBadge(
  evidence: EvidenceItem,
  evalTimeIso?: string
): { label: string; badgeClass: string } {
  const flags = (evidence.quality_flags || []).map(f => f.toLowerCase());
  const dataMode = (evidence.data_mode || '').toUpperCase();
  const isExpiredFlag = flags.includes('expired') || flags.includes('stale') || dataMode === 'HISTORICAL';

  if (dataMode === 'CALCULATED') {
    return { label: 'Calculated result', badgeClass: 'validity-calc' };
  }

  // If no evaluation time supplied or malformed, we cannot confirm validity window against mission
  if (!evalTimeIso) {
    if (isExpiredFlag) {
      return { label: 'Expired', badgeClass: 'validity-expired' };
    }
    return { label: 'Validity unknown', badgeClass: 'validity-unknown' };
  }

  const evalTime = Date.parse(evalTimeIso);
  if (isNaN(evalTime)) {
    if (isExpiredFlag) {
      return { label: 'Expired', badgeClass: 'validity-expired' };
    }
    return { label: 'Validity unknown', badgeClass: 'validity-unknown' };
  }

  // Check valid_to / valid_from against evalTime
  if (evidence.valid_to) {
    const vt = Date.parse(evidence.valid_to);
    if (!isNaN(vt)) {
      if (evalTime > vt || isExpiredFlag) {
        return { label: 'Expired', badgeClass: 'validity-expired' };
      }
      if (evidence.valid_from) {
        const vf = Date.parse(evidence.valid_from);
        if (isNaN(vf) || vf > vt) return { label: "Validity unknown", badgeClass: "validity-unknown" };
        if (evalTime < vf) {
          return { label: 'Not yet valid', badgeClass: 'validity-future' };
        }
      }
      if (!evidence.valid_from) return { label: 'Validity unknown', badgeClass: 'validity-unknown' };
      return { label: 'Valid', badgeClass: 'validity-valid' };
    }
  }

  if (isExpiredFlag) {
    return { label: 'Expired', badgeClass: 'validity-expired' };
  }

  return { label: 'Validity unknown', badgeClass: 'validity-unknown' };
}

export function getEvidenceProvenanceBadge(evidence: EvidenceItem, evalTimeIso?: string): { label: string; badgeClass: string } {
  // Backward compatibility composite badge
  const origin = getSourceOriginBadge(evidence);
  const validity = getTemporalValidityBadge(evidence, evalTimeIso);
  if (validity.label === 'Expired') {
    return { label: `${origin.label} (Expired)`, badgeClass: 'freshness-stale' };
  }
  return origin;
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
