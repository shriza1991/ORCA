import { Navigation, Clock } from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface PFZDetailsProps {
  assessment: TripAssessmentResponse | null;
  language?: SupportedLanguage;
}

export default function PFZDetails({ assessment, language = 'en' }: PFZDetailsProps) {
  if (!assessment || !assessment.pfz_candidates || assessment.pfz_candidates.length === 0) {
    return null;
  }

  // Display the top-ranked PFZ candidate
  const pfz = assessment.pfz_candidates[0];

  return (
    <div style={{ marginTop: '16px', padding: '16px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Navigation size={24} color="#3b82f6" />
        {translateText('Suggested Fishing Area', language)}
      </h3>
      
      {pfz.location_reference && (
        <div style={{ marginBottom: '16px', color: '#334155', fontWeight: 600, fontSize: '1.1rem' }}>
          📍 {pfz.location_reference}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '4px' }}>
            {translateText('Distance & Direction', language)}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 500, color: '#334155' }}>
            {pfz.distance_nautical_miles !== undefined ? pfz.distance_nautical_miles?.toFixed(1) : (pfz.distance_nm?.toFixed(1) || '—')} nm, {pfz.bearing_degrees ?? pfz.bearing_deg ?? '—'}°
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={14} />
            {translateText('Valid Until', language)}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 500, color: '#334155' }}>
            {pfz.valid_until || pfz.valid_to ? new Date(pfz.valid_until || pfz.valid_to).toLocaleDateString() : translateText('Unknown', language)}
          </div>
        </div>
      </div>

      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '4px' }}>
          {translateText('Why this area?', language)}
        </div>
        <p style={{ margin: 0, fontSize: '1rem', color: '#475569', lineHeight: '1.5' }}>
          {translateText('Selected based on favorable ocean conditions within operational limits.', language)}
        </p>
      </div>
    </div>
  );
}
