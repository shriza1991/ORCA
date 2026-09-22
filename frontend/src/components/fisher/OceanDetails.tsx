import { useState } from 'react';
import { ChevronDown, ChevronUp, Droplets, Thermometer, Activity } from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface OceanDetailsProps {
  assessment: TripAssessmentResponse | null;
  language?: SupportedLanguage;
}

export default function OceanDetails({ assessment, language = 'en' }: OceanDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!assessment) return null;

  const measurements = assessment.conditions?.measurements || {};
  const sst = measurements.sea_surface_temperature;
  const chl = measurements.chlorophyll_a;
  
  if (!sst && !chl && (!assessment.evidence || assessment.evidence.length === 0)) {
    return null;
  }

  return (
    <div style={{ marginTop: '16px', background: '#f8fafc', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          fontSize: '1.25rem',
          fontWeight: 600,
          color: '#334155',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={24} />
          {translateText('Ocean Details & Diagnostics', language)}
        </div>
        {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
      </button>

      {isOpen && (
        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ fontSize: '1.1rem', color: '#475569', marginBottom: '8px' }}>
            {translateText('Why this recommendation?', language)}
          </h4>
          
          <ul style={{ margin: 0, paddingLeft: '24px', color: '#334155', fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {assessment.evidence?.slice(0, 3).map((ev, i) => (
              <li key={i}>
                {ev.description || `${ev.metric_name}: ${ev.metric_value}`}
              </li>
            ))}
          </ul>

          {(sst || chl) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              {sst && (
                <div style={{ padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.9rem', marginBottom: '4px' }}>
                    <Thermometer size={16} />
                    Sea Surface Temp
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>
                    {sst.value?.toFixed(1)} {sst.unit || '°C'}
                  </div>
                </div>
              )}
              {chl && (
                <div style={{ padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.9rem', marginBottom: '4px' }}>
                    <Droplets size={16} />
                    Chlorophyll-a
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 500 }}>
                    {chl.value?.toFixed(2)} {chl.unit || 'mg/m³'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
