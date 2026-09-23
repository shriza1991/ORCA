import { Clock, Route as RouteIcon, Fuel, ShieldAlert } from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface TripPlanDetailsProps {
  assessment?: TripAssessmentResponse;
  language: SupportedLanguage;
}

export default function TripPlanDetails({ assessment, language }: TripPlanDetailsProps) {
  if (!assessment || !assessment.route_candidates || assessment.route_candidates.length === 0) {
    return null;
  }

  const primaryRoute = assessment.route_candidates[0];
  const distance = primaryRoute.distance_km;
  const etaHours = primaryRoute.eta_hours;
  const fuel = primaryRoute.fuel_estimate_liters;
  const risk = primaryRoute.risk_rating;
  const waves = primaryRoute.max_wave_height_m;

  // Format time
  const hours = Math.floor(etaHours);
  const minutes = Math.round((etaHours - hours) * 60);
  let timeStr = `${hours}h ${minutes}m`;
  if (hours === 0) timeStr = `${minutes}m`;

  // Summary message
  let summaryStr = '';
  if (risk === 'LOW') {
    summaryStr = `This route is safe. Expect waves up to ${waves}m. You will need ${fuel} liters of fuel.`;
  } else if (risk === 'MODERATE') {
    summaryStr = `This route requires caution. Expect waves up to ${waves}m. You will need ${fuel} liters of fuel.`;
  } else {
    summaryStr = `This route is DANGEROUS. Waves up to ${waves}m. Do not proceed unless necessary.`;
  }

  // Very basic translation fallback for the metrics
  const distLabel = language === 'hi' ? 'दूरी' : language === 'mr' ? 'अंतर' : 'Distance';
  const timeLabel = language === 'hi' ? 'समय' : language === 'mr' ? 'वेळ' : 'Time';
  const fuelLabel = language === 'hi' ? 'ईंधन' : language === 'mr' ? 'इंधन' : 'Fuel';

  return (
    <div className="ocean-details-panel" style={{ marginTop: '16px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
          {translateText('Trip Plan Summary', language) || 'Trip Plan Summary'}
        </h3>
      </div>
      
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ margin: 0, fontSize: '1rem', color: risk === 'LOW' ? '#166534' : risk === 'MODERATE' ? '#854d0e' : '#991b1b', background: risk === 'LOW' ? '#dcfce7' : risk === 'MODERATE' ? '#fef08a' : '#fee2e2', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={20} />
          {summaryStr}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <RouteIcon size={24} color="#3b82f6" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>{distLabel}</div>
            <div style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold' }}>{distance} km</div>
          </div>

          <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Clock size={24} color="#f59e0b" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>{timeLabel}</div>
            <div style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold' }}>{timeStr}</div>
          </div>

          <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Fuel size={24} color="#ef4444" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>{fuelLabel}</div>
            <div style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold' }}>
              {fuel === 0 ? '0 L' : `${fuel} L`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
