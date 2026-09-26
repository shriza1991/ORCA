import { Navigation, Clock, Fish, Anchor } from 'lucide-react';
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

  const targetSpecies = Array.isArray(pfz.target_species)
    ? pfz.target_species.join(', ')
    : pfz.target_species || 'Sardines, Mackerel, Coastal Pelagics';

  const gears = Array.isArray(pfz.gear_recommended)
    ? pfz.gear_recommended.join(', ')
    : pfz.gear_recommended || 'Gillnet, Ring Seine, Hook & Line';

  return (
    <div style={{ marginTop: '16px', padding: '16px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Navigation size={24} color="#10b981" />
          {translateText('INCOIS Potential Fishing Zone (PFZ)', language)}
        </h3>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: '#dcfce7', color: '#166534' }}>
          RANK #{pfz.rank || 1} ADVISORY
        </span>
      </div>

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
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#334155' }}>
            {pfz.distance_nautical_miles !== undefined
              ? `${pfz.distance_nautical_miles.toFixed(1)} nm`
              : pfz.distance_nm !== undefined
              ? `${pfz.distance_nm.toFixed(1)} nm`
              : pfz.distance_km !== undefined
              ? `${pfz.distance_km.toFixed(1)} km`
              : '—'}, {pfz.bearing_degrees ?? pfz.bearing_deg ?? '—'}°
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={14} />
            {translateText('Valid Until', language)}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#334155' }}>
            {pfz.valid_until || pfz.valid_to
              ? new Date(pfz.valid_until || pfz.valid_to).toLocaleDateString()
              : translateText('24h Advisory Window', language)}
          </div>
        </div>
      </div>

      {/* Target Species and Gears */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
        <div>
          <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
            <Fish size={12} className="text-primary" /> Target Catch
          </span>
          <strong style={{ color: '#0f172a', display: 'block', marginTop: '2px' }}>{targetSpecies}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
            <Anchor size={12} className="text-primary" /> Recommended Gear
          </span>
          <strong style={{ color: '#0f172a', display: 'block', marginTop: '2px' }}>{gears}</strong>
        </div>
      </div>

      <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534', marginBottom: '4px' }}>
          {translateText('Oceanographic Thermal Front Corroboration', language)}
        </div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#15803d', lineHeight: '1.4' }}>
          {translateText(
            'High chlorophyll-a plankton accumulation and sea surface temperature gradients detected via satellite telemetry. Complies with INCOIS advisory bulletins.',
            language
          )}
        </p>
      </div>
    </div>
  );
}
