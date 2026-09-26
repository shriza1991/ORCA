import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  HelpCircle,
  Waves as WavesIcon,
  Wind as WindIcon,
  Eye as VisibilityIcon,
  Droplets as TideIcon,
  AlertTriangle,
  Loader2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Map as MapIcon,
} from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';
import type { DecisionDiff, MissionContext } from '../../types/mission';
import { translateText, type SupportedLanguage, TRANSLATIONS } from '../../i18n/translations';
import { useSpokenGuidance } from '../../hooks/useSpokenGuidance';

export type FisherDecisionStatus = 'SAFE_TO_GO' | 'CAUTION' | 'DO_NOT_GO' | 'UNKNOWN';

export interface FisherConditions {
  waves: string;
  wind: string;
  visibility: string;
  tide: string;
  hazard: string;
  isForecast: boolean;
}

export interface FisherDecisionSurfaceProps {
  assessment: TripAssessmentResponse | null;
  isLoading?: boolean;
  error?: string | null;
  activeDiff?: DecisionDiff | null;
  missionContext?: MissionContext;
  language?: SupportedLanguage;
  onOpenVoyageSettings?: () => void;
  onViewMap?: () => void;
  isOffline?: boolean;
  isExpired?: boolean;
}

export function getFisherDecisionStatus(
  assessment: TripAssessmentResponse | null,
  error?: string | null
): FisherDecisionStatus {
  if (error || !assessment || !assessment.decision) {
    return 'UNKNOWN';
  }
  const rawStatus = typeof assessment.decision === 'string' 
    ? (assessment.decision as string).toUpperCase() 
    : (assessment.decision as any)?.status?.toUpperCase() || '';
  switch (rawStatus) {
    case 'GO':
      return 'SAFE_TO_GO';
    case 'CAUTION':
      return 'CAUTION';
    case 'NO_GO':
      return 'DO_NOT_GO';
    case 'UNKNOWN':
    case 'INFORMATIONAL':
    default:
      return 'UNKNOWN';
  }
}

export function getFisherExplanation(
  response: TripAssessmentResponse | null,
  status: FisherDecisionStatus,
  language: SupportedLanguage = 'en',
  error?: string | null,
  isLoading?: boolean
): string {
  if (isLoading) {
    return translateText('Checking current marine conditions…', language);
  }
  if (error) {
    return translateText('Unable to obtain a current safety assessment.', language);
  }
  if (!response || !response.decision) {
    return translateText('No current safety assessment available.', language);
  }

  const rec = response.decision as any;
  if (typeof rec === 'string') {
    // If it's a string, we might only have alerts for the explanation
    if (status === 'UNKNOWN' && response.alerts?.length > 0) {
      return translateText((response.alerts[0] as any).message || response.alerts[0].title || 'A safety recommendation is not available from the current evidence.', language);
    }
    if (status === 'SAFE_TO_GO') {
      return translateText('Conditions are within safe operating limits.', language);
    }
    if (status === 'CAUTION' || status === 'DO_NOT_GO') {
      return translateText((response.alerts?.[0] as any)?.message || response.alerts?.[0]?.title || 'Conditions exceed safety limits.', language);
    }
    return translateText('A safety recommendation is not available from the current evidence.', language);
  }

  if (status === 'UNKNOWN') {
    if (rec.summary && rec.summary.trim().length > 0) {
      return translateText(rec.summary, language);
    }
    return translateText(
      'A safety recommendation is not available from the current evidence.',
      language
    );
  }

  if (rec.summary && rec.summary.trim().length > 0) {
    return translateText(rec.summary, language);
  }

  if (rec.decisive_factors && rec.decisive_factors.length > 0) {
    return translateText(rec.decisive_factors[0], language);
  }

  return translateText('No operational summary available.', language);
}

/**
 * Safe numeric formatter — returns null for null/undefined/NaN/empty.
 */
function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === '—') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/**
 * Mines the evidence[] array for a named metric value.
 * Used when conditions.measurements is empty (HYBRID fallback path).
 */
function evidenceVal(
  evidence: Record<string, any>[],
  metricName: string
): number | null {
  for (const e of evidence || []) {
    if (
      e.metric_name === metricName &&
      e.impact !== 'UNKNOWN_TRIGGER'
    ) {
      return safeNum(e.observed_value);
    }
  }
  return null;
}

export function extractFisherConditions(response: TripAssessmentResponse | null): FisherConditions {
  if (!response) {
    return { waves: '—', wind: '—', visibility: '—', tide: '—', hazard: '—', isForecast: false };
  }

  const measurements = response.conditions?.measurements || {};
  const evidence: Record<string, any>[] = response.evidence || [];
  const isForecast = !!measurements.is_forecast;

  /** Try measurements object first, then fall back to evidence array. */
  const resolveMetric = (
    measurementKeys: string[],
    evidenceKeys: string[],
    unit: string
  ): string => {
    // 1. Try measurements map
    for (const key of measurementKeys) {
      const m = measurements[key];
      const n = safeNum(m?.value ?? m);
      if (n !== null) return `${n.toFixed(1)} ${m?.unit || unit}`.trim();
    }
    // 2. Fall back to evidence array (contains real Open-Meteo values)
    for (const key of evidenceKeys) {
      const n = evidenceVal(evidence, key);
      if (n !== null) return `${n.toFixed(1)} ${unit}`;
    }
    return '—';
  };

  const waveVal = resolveMetric(
    ['wave_height', 'significant_wave_height'],
    ['significant_wave_height_m'],
    'm'
  );

  const windVal = resolveMetric(
    ['wind_speed', 'wind_speed_knots'],
    ['wind_speed_knots'],
    'kt'
  );

  // Visibility: not in evidence array today — show '—' (no data) rather than 'N/A'
  const visRaw = (() => {
    for (const key of ['visibility', 'visibility_km']) {
      const m = measurements[key];
      const n = safeNum(m?.value ?? m);
      if (n !== null) return `${n.toFixed(1)} ${m?.unit || 'km'}`.trim();
    }
    return '—';
  })();

  // Tide: not wired to live data yet — show 'Not available' rather than just a dash
  const tideVal = (() => {
    for (const key of ['tide', 'tide_level', 'tide_height_m']) {
      const m = measurements[key];
      const n = safeNum(m?.value ?? m);
      if (n !== null) return `${n.toFixed(1)} ${m?.unit || 'm'}`.trim();
    }
    if (measurements.tide_schedule) return 'Available';
    return 'Not available';
  })();

  let hazardVal = '—';
  if (response.alerts && response.alerts.length > 0) {
    const highestAlert = response.alerts.find(a => a.affects_trip) || response.alerts[0];
    hazardVal = highestAlert.title || (highestAlert as any).message || '—';
  } else {
    const status = (response.decision as any)?.status;
    if (status === 'GO') hazardVal = 'No Active Hazards';
    else if (status === 'UNKNOWN') hazardVal = 'Status Unknown';
    else if (status === 'CAUTION') hazardVal = 'Elevated Hazard';
    else if (status === 'NO_GO') hazardVal = 'Hazard Alert';
  }

  return {
    waves: waveVal,
    wind: windVal,
    visibility: visRaw,
    tide: tideVal,
    hazard: hazardVal,
    isForecast,
  };
}

export default function FisherDecisionSurface({
  assessment,
  isLoading = false,
  error = null,
  language = 'en',
  onOpenVoyageSettings,
  onViewMap,
  isOffline = false,
  isExpired = false,
}: FisherDecisionSurfaceProps) {
  const { t: i18nT } = useTranslation();
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
    let status = getFisherDecisionStatus(assessment, error);
  const conditions = extractFisherConditions(isLoading || error ? null : assessment);
  const hazardVal = conditions.hazard;
  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';

  if (hasActiveHazard && status === 'SAFE_TO_GO') {
    const highestAlert = assessment?.alerts?.find((a: any) => a.affects_trip) || assessment?.alerts?.[0];
    const alertSeverity = highestAlert?.severity ? String(highestAlert.severity).toUpperCase() : '';
    if (highestAlert && (alertSeverity === 'CRITICAL' || alertSeverity === 'HIGH')) {
      status = 'DO_NOT_GO';
    } else {
      status = 'CAUTION';
    }
  }

  const explanation = getFisherExplanation(assessment, status, language, error, isLoading);
  const { speak, stop, isPlaying } = useSpokenGuidance({ language });

  const statusConfig: Record<
    FisherDecisionStatus,
    { label: string; bgClass: string; icon: React.ReactNode; testId: string }
  > = {
    SAFE_TO_GO: {
      label: t.statusLabels['GO'] || 'Within assessed limits',
      bgClass: 'decision-safe',
      icon: <ShieldCheck size={32} className="decision-icon" />,
      testId: 'status-safe-to-go',
    },
    CAUTION: {
      label: t.statusLabels['CAUTION'] || 'Be careful',
      bgClass: 'decision-caution',
      icon: <ShieldAlert size={32} className="decision-icon" />,
      testId: 'status-caution',
    },
    DO_NOT_GO: {
      label: t.statusLabels['NO_GO'] || 'Do not depart',
      bgClass: 'decision-nogo',
      icon: <ShieldX size={32} className="decision-icon" />,
      testId: 'status-do-not-go',
    },
    UNKNOWN: {
      label: t.statusLabels['UNKNOWN'] || 'Information unavailable',
      bgClass: 'decision-unknown',
      icon: <HelpCircle size={32} className="decision-icon" />,
      testId: 'status-unknown',
    },
  };

  const currentCfg = isLoading
    ? {
        label: i18nT('FisherDecisionSurface.CHECKING…', 'CHECKING…'),
        bgClass: 'decision-loading',
        icon: <Loader2 size={32} className="decision-icon spin-icon" />,
        testId: 'status-loading',
      }
    : statusConfig[status];


  const handleSpeak = () => {
    if (isPlaying) {
      stop();
    } else {
      let textToSpeak = `${currentCfg.label}. ${explanation}.`;
      if (hasActiveHazard) {
        const alertPrefix = i18nT('FisherDecisionSurface.Alert', 'Alert');
        const affectsSuffix = i18nT('FisherDecisionSurface.affects your planned trip. Do not depart.', 'affects your planned trip. Do not depart.');
        const hazardText = hazardVal ? i18nT('Hazard.' + hazardVal, hazardVal) : '';
        textToSpeak += ` ${alertPrefix}: ${hazardText} ${affectsSuffix}`;
      }
      speak(textToSpeak);
    }
  };

  return (
    <section
      className="fisher-decision-surface"
      aria-label="Primary Mission Decision and Conditions"
      data-testid="fisher-decision-surface"
    >
      <div className={`fisher-decision-card ${currentCfg.bgClass}`} data-testid={currentCfg.testId}>
        {/* Connectivity / Data Status Indicator */}
        {(() => {
          const isDegraded = assessment?.alerts?.some(
            (a: any) =>
              (a.message || a.title || '').includes('DEGRADED_DATA') ||
              (a.message || a.title || '').includes('Stale') ||
              (a.message || a.title || '').includes('incomplete telemetry')
          );
          return (
            <div className="connectivity-strip" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              {isOffline ? (
                <span className="badge badge-error" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={12} />
                  {isExpired ? (t.statusLabels?.['EXPIRED'] || 'Expired Cache') : (t.statusLabels?.['CACHED'] || 'Offline Cached')}
                </span>
              ) : isDegraded ? (
                <span className="badge badge-warning" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', color: '#92400e', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '4px', padding: '2px 6px' }}>
                  <AlertTriangle size={12} />
                  {t.statusLabels?.['PARTIAL'] || 'Partial Data'}
                </span>
              ) : (
                <span className="badge badge-success" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, backgroundColor: 'currentColor', borderRadius: '50%' }}></span>
                  {t.statusLabels?.['LIVE'] || 'Live Data'}
                </span>
              )}
            </div>
          );
        })()}

        <div className="decision-card-badge-row">
          <div className="decision-badge" style={{ padding: '16px', gap: '12px' }}>
            {currentCfg.icon}
            <span className="decision-status-text" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{currentCfg.label}</span>
          </div>
        </div>

        <p className="decision-explanation-text" style={{ fontSize: '1.25rem', lineHeight: '1.6' }} data-testid="decision-explanation">
          {explanation}
        </p>
        
        {assessment && (
          <div style={{ marginTop: '16px', fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>
              <strong>{i18nT('FisherDecisionSurface.Evaluated Window:', 'Evaluated Window:')}</strong>{' '}
              {assessment.trip_context.departure_time || 'Now'} - {assessment.trip_context.return_time || 'End of trip'}
            </div>
            <div>
              <strong>{i18nT('FisherDecisionSurface.Assessment Time:', 'Assessment Time:')}</strong>{' '}
              {new Date(assessment.assessed_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <div className="fisher-conditions-grid" role="group" aria-label="Essential local conditions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
        <div className="condition-tile" data-testid="condition-waves">
          <div className="condition-tile-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
            <WavesIcon size={16} className="condition-icon" />
            <span className="condition-label">{i18nT('FisherDecisionSurface.Waves', 'Waves')}</span>
          </div>
          <div className="condition-value" style={{ fontSize: '1.25rem', marginTop: '4px' }}>{conditions.waves}</div>
        </div>
        <div className="condition-tile" data-testid="condition-wind">
          <div className="condition-tile-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
            <WindIcon size={16} className="condition-icon" />
            <span className="condition-label">{i18nT('FisherDecisionSurface.Wind', 'Wind')}</span>
          </div>
          <div className="condition-value" style={{ fontSize: '1.25rem', marginTop: '4px' }}>{conditions.wind}</div>
        </div>
        <div className="condition-tile" data-testid="condition-visibility">
          <div className="condition-tile-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
            <VisibilityIcon size={16} className="condition-icon" />
            <span className="condition-label">{i18nT('FisherDecisionSurface.Visibility', 'Visibility')}</span>
          </div>
          <div className="condition-value" style={{ fontSize: '1.25rem', marginTop: '4px' }}>{conditions.visibility}</div>
        </div>
        <div className="condition-tile" data-testid="condition-tide">
          <div className="condition-tile-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
            <TideIcon size={16} className="condition-icon" />
            <span className="condition-label">{i18nT('FisherDecisionSurface.Tide', 'Tide')}</span>
          </div>
          <div className="condition-value" style={{ fontSize: '1.25rem', marginTop: '4px' }}>
            {translateText(conditions.tide, language)}
          </div>
        </div>
      </div>
      
      <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '12px', textAlign: 'center' }}>
        {conditions.isForecast ? i18nT('FisherDecisionSurface.Based on forecast', 'Based on forecast') : i18nT('FisherDecisionSurface.Based on current observation', 'Based on current observation')}
      </div>

      {hasActiveHazard && (
        <div className="fisher-actionable-alert" style={{ background: status === 'DO_NOT_GO' ? '#fef2f2' : '#fffbeb', borderLeft: `8px solid ${status === 'DO_NOT_GO' ? '#ef4444' : '#f59e0b'}`, padding: '16px', marginTop: '16px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: status === 'DO_NOT_GO' ? '#991b1b' : '#b45309', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={24} />
            {i18nT('Hazard.' + hazardVal, hazardVal)}
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: status === 'DO_NOT_GO' ? '#7f1d1d' : '#92400e' }}>
            <strong>{i18nT('FisherDecisionSurface.What is happening:', 'What is happening:')}</strong> {i18nT('Hazard.' + hazardVal, hazardVal)}.<br/>
            <strong>{i18nT('FisherDecisionSurface.Does it affect this trip?', 'Does it affect this trip?')}</strong> {i18nT('FisherDecisionSurface.Yes, it directly affects your planned route.', 'Yes, it directly affects your planned route.')}<br/>
            <strong>{i18nT('FisherDecisionSurface.What to do next:', 'What to do next:')}</strong> {status === 'DO_NOT_GO' ? i18nT('FisherDecisionSurface.Do not depart. Await further clearance.', 'Do not depart. Await further clearance.') : i18nT('FisherDecisionSurface.Proceed with caution.', 'Proceed with caution.')}
          </p>
          <button
            onClick={() => {
              const alertPrefix = i18nT('FisherDecisionSurface.Alert', 'Alert');
              const affectsSuffix = i18nT('FisherDecisionSurface.affects your planned trip. Do not depart.', 'affects your planned trip. Do not depart.');
              const hearAdvisory = i18nT('FisherDecisionSurface.Hear the official advisory', 'Hear the official advisory');
              speak(`${alertPrefix}: ${i18nT('Hazard.' + hazardVal, hazardVal)}. ${affectsSuffix} ${hearAdvisory}`);
            }}
            style={{ padding: '16px', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#ef4444', color: 'white', borderRadius: '8px', border: 'none', width: '100%' }}
          >
            <Volume2 size={24} />
            {i18nT('FisherDecisionSurface.Hear the official advisory', 'Hear the official advisory')}
          </button>
        </div>
      )}

      <div className="fisher-action-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
        <button
          onClick={handleSpeak}
          className="fisher-large-action-btn"
          style={{ padding: '20px', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', background: '#0f172a', color: 'white', borderRadius: '12px', border: 'none' }}
        >
          {isPlaying ? <VolumeX size={28} /> : <Volume2 size={28} />}
          {isPlaying ? TRANSLATIONS[language].stopAudioBtn : TRANSLATIONS[language].hearTheUpdate}
        </button>
        
        <button
          onClick={onOpenVoyageSettings}
          className="fisher-large-action-btn"
          style={{ padding: '20px', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', background: '#f1f5f9', color: '#0f172a', borderRadius: '12px', border: '1px solid #cbd5e1' }}
        >
          <SlidersHorizontal size={28} />
          {TRANSLATIONS[language].planMyTrip}
        </button>

        <button
          onClick={onViewMap}
          className="fisher-large-action-btn"
          style={{ padding: '20px', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', background: '#f1f5f9', color: '#0f172a', borderRadius: '12px', border: '1px solid #cbd5e1' }}
        >
          <MapIcon size={28} />
          {TRANSLATIONS[language].viewTheMap}
        </button>
      </div>
    </section>
  );
}
