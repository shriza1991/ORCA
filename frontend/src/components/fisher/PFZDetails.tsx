import { Navigation, Clock, Fish, Anchor, Award } from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface PFZDetailsProps {
  assessment: TripAssessmentResponse | null;
  language?: SupportedLanguage;
}

function getDistNm(c: Record<string, any>): number | null {
  if (c.distance_nautical_miles !== undefined && c.distance_nautical_miles !== null) {
    return Number(c.distance_nautical_miles);
  }
  if (c.distance_nm !== undefined && c.distance_nm !== null) {
    return Number(c.distance_nm);
  }
  if (c.distance_km !== undefined && c.distance_km !== null) {
    return Number((Number(c.distance_km) / 1.852).toFixed(1));
  }
  return null;
}

export default function PFZDetails({ assessment, language = 'en' }: PFZDetailsProps) {
  if (!assessment || !assessment.pfz_candidates || assessment.pfz_candidates.length === 0) {
    return null;
  }

  const top3 = assessment.pfz_candidates.slice(0, 3);
  const primary = top3[0];

  const targetSpecies = Array.isArray(primary.target_species)
    ? primary.target_species.join(', ')
    : primary.target_species || 'Sardines, Mackerel, Coastal Pelagics';

  const gears = Array.isArray(primary.gear_recommended)
    ? primary.gear_recommended.join(', ')
    : primary.gear_recommended || 'Gillnet, Ring Seine, Hook & Line';

  // Deterministic rationale calculation comparing Candidate #1 to Candidate #2
  let rationale = 'Selected because it is the nearest viable PFZ.';
  if (top3.length > 1) {
    const d1 = getDistNm(top3[0]);
    const d2 = getDistNm(top3[1]);
    if (d1 !== null && d2 !== null) {
      const advantage = (d2 - d1).toFixed(1);
      rationale = `Selected because it is the nearest viable PFZ. Distance advantage: ${advantage}nm closer than Candidate #2.`;
    }
  }

  return (
    <div
      className="pfz-details-container"
      data-testid="pfz-explainability-panel"
      style={{
        marginTop: '16px',
        padding: '16px',
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Navigation size={24} color="#10b981" />
          {translateText('INCOIS Potential Fishing Zone (PFZ)', language)}
        </h3>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '9999px',
            background: '#dcfce7',
            color: '#166534',
          }}
        >
          {top3.length} CANDIDATES EVALUATED
        </span>
      </div>

      {/* Selected PFZ Deterministic Rationale Banner */}
      <div
        data-testid="pfz-selection-rationale"
        style={{
          background: '#f0fdf4',
          borderLeft: '4px solid #16a34a',
          padding: '12px 14px',
          borderRadius: '6px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: 700, fontSize: '0.875rem' }}>
          <Award size={16} />
          {translateText('Deterministic Selection Rationale', language)}
        </div>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#15803d', fontWeight: 500 }}>
          {rationale}
        </p>
      </div>

      {/* Candidates List (Top 3) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {top3.map((cand, idx) => {
          const rankNum = cand.rank || idx + 1;
          const isSelected = idx === 0;
          const distVal = getDistNm(cand);
          const distStr = distVal !== null ? `${distVal} nm` : '—';
          const bearingStr = cand.bearing_degrees ?? cand.bearing_deg ?? cand.bearing ?? '—';
          const depthStr =
            cand.water_depth_m !== undefined && cand.water_depth_m !== null
              ? `${cand.water_depth_m}m`
              : cand.depth_m !== undefined && cand.depth_m !== null
              ? `${cand.depth_m}m`
              : '—';
          const sstStr =
            cand.sea_surface_temp_c !== undefined && cand.sea_surface_temp_c !== null
              ? `${cand.sea_surface_temp_c}°C`
              : cand.sst !== undefined && cand.sst !== null
              ? `${cand.sst}°C`
              : '—';
          const chlStr =
            cand.chlorophyll_mg_m3 !== undefined && cand.chlorophyll_mg_m3 !== null
              ? `${cand.chlorophyll_mg_m3} mg/m³`
              : cand.chlorophyll !== undefined && cand.chlorophyll !== null
              ? `${cand.chlorophyll} mg/m³`
              : '—';

          return (
            <div
              key={idx}
              data-testid={`pfz-candidate-${idx}`}
              style={{
                border: isSelected ? '2px solid #10b981' : '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 14px',
                background: isSelected ? '#ffffff' : '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: isSelected ? '#10b981' : '#e2e8f0',
                      color: isSelected ? '#ffffff' : '#475569',
                    }}
                  >
                    Rank #{rankNum} {isSelected ? '(Selected)' : ''}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
                    {cand.location_reference || cand.candidate_id || `Candidate #${rankNum}`}
                  </span>
                </div>
                {cand.valid_until && (
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {new Date(cand.valid_until).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '8px',
                  fontSize: '0.75rem',
                }}
              >
                <div>
                  <div style={{ color: '#64748b' }}>Distance (nm)</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{distStr}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b' }}>Bearing</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{bearingStr}°</div>
                </div>
                <div>
                  <div style={{ color: '#64748b' }}>Depth</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{depthStr}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b' }}>SST</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{sstStr}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b' }}>Chlorophyll</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{chlStr}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Target Species and Gears */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '12px',
          padding: '10px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          fontSize: '0.85rem',
        }}
      >
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
    </div>
  );
}
