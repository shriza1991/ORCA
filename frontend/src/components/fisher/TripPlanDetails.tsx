import { Clock, Route as RouteIcon, Fuel, ShieldAlert, CheckCircle2, XCircle, Award } from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { translateText, type SupportedLanguage } from '../../i18n/translations';

interface TripPlanDetailsProps {
  assessment: TripAssessmentResponse | null;
  language: SupportedLanguage;
}

export function getRiskBadgeStyle(risk: string): { backgroundColor: string; color: string; borderColor: string } {
  switch (risk) {
    case 'LOW':
      return { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#86efac' };
    case 'MODERATE':
      return { backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' };
    case 'HIGH':
      return { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' };
    default:
      return { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' };
  }
}

export default function TripPlanDetails({ assessment, language }: TripPlanDetailsProps) {
  const title = translateText('Trip Plan & Evaluated Routes', language);

  if (!assessment || !assessment.route_candidates || assessment.route_candidates.length === 0) {
    return (
      <div style={{ marginTop: '16px', background: '#f8fafc', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RouteIcon size={18} color="#3b82f6" /> {title}
          </h3>
        </div>
        <div style={{ padding: '16px', color: '#64748b' }}>
          No route estimates available for this trip. Check your data connection.
        </div>
      </div>
    );
  }

  // Find recommended route (marked with is_recommended or the first route)
  const routes = assessment.route_candidates;
  const recommendedIndex = routes.findIndex((r) => r.is_recommended);
  const primaryRoute = recommendedIndex >= 0 ? routes[recommendedIndex] : routes[0];

  const distance = primaryRoute.distance_km || 0;
  const etaHours = primaryRoute.eta_hours || 0;
  const fuel = primaryRoute.fuel_estimate_liters || 0;
  const risk = primaryRoute.risk_rating || 'UNKNOWN';
  const waves = primaryRoute.max_wave_height_m || 0;

  // Format time
  const hours = Math.floor(etaHours);
  const minutes = Math.round((etaHours - hours) * 60);
  let timeStr = `${hours}h ${minutes}m`;
  if (hours === 0) timeStr = `${minutes}m`;

  // Estimate arrival date/time
  let departureTimeMs = Date.now();
  const rawDep = assessment.trip_context?.departure_time;
  if (rawDep) {
    const parsed = Date.parse(rawDep);
    if (!isNaN(parsed)) {
      departureTimeMs = parsed;
    } else if (rawDep.toLowerCase().includes('tomorrow')) {
      departureTimeMs += 24 * 60 * 60 * 1000;
    }
  }
  const arrivalDate = new Date(departureTimeMs + etaHours * 60 * 60 * 1000);
  const arrivalStr = isNaN(arrivalDate.getTime()) ? 'Unknown' : arrivalDate.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
  });

  // Summary message for recommended route
  let summaryStr = '';
  if (risk === 'LOW') {
    summaryStr = `Recommended route is safe. Expect waves up to ${waves}m. You will need approximately ${fuel}L of fuel.`;
  } else if (risk === 'MODERATE') {
    summaryStr = `Recommended route requires caution. Expect waves up to ${waves}m. You will need approximately ${fuel}L of fuel.`;
  } else {
    summaryStr = `Recommended route has elevated exposure. Waves up to ${waves}m. Exercise high vigilance.`;
  }

  const distLabel = language === 'hi' ? 'दूरी' : language === 'mr' ? 'अंतर' : 'Distance';
  const timeLabel = language === 'hi' ? 'समय' : language === 'mr' ? 'वेळ' : 'Time';
  const fuelLabel = language === 'hi' ? 'ईंधन' : language === 'mr' ? 'इंधन' : 'Fuel';

  return (
    <div
      className="trip-plan-details-panel"
      data-testid="trip-plan-details"
      style={{ marginTop: '16px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}
    >
      <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RouteIcon size={20} color="#3b82f6" />
          {title}
        </h3>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: '#dbeafe', color: '#1d4ed8' }}>
          {routes.length} ROUTES EVALUATED
        </span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Recommended Route Banner */}
        <p
          data-testid="route-summary-banner"
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            color: risk === 'LOW' ? '#166534' : risk === 'MODERATE' ? '#854d0e' : '#991b1b',
            background: risk === 'LOW' ? '#dcfce7' : risk === 'MODERATE' ? '#fef08a' : '#fee2e2',
            padding: '12px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ShieldAlert size={20} />
          {summaryStr}
        </p>

        {/* Quick Metrics for Recommended Route */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <RouteIcon size={24} color="#3b82f6" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>{distLabel}</div>
            <div style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold' }}>{distance} km</div>
          </div>

          <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Clock size={24} color="#f59e0b" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>{timeLabel}</div>
            <div style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold' }}>{timeStr}</div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '4px' }}>Arriving: {arrivalStr}</div>
          </div>

          <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Fuel size={24} color="#ef4444" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>{fuelLabel}</div>
            <div style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 'bold' }}>
              {fuel === 0 ? '0 L' : `${fuel} L`}
            </div>
          </div>
        </div>

        {/* All Evaluated Routes Comparison Table */}
        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>
              Route Evaluation & Exposure Comparison
            </h4>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Deterministic Dev 4 Exposure Model</span>
          </div>

          <div
            className="route-comparison-table-wrapper"
            data-testid="route-comparison-table"
            style={{
              overflowX: 'auto',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
                textAlign: 'left',
                minWidth: '650px',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    color: '#475569',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontSize: '0.6875rem',
                  }}
                >
                  <th style={{ padding: '10px 12px' }}>Route</th>
                  <th style={{ padding: '10px 12px' }}>Distance</th>
                  <th style={{ padding: '10px 12px' }}>Wave Height</th>
                  <th style={{ padding: '10px 12px' }}>ETA</th>
                  <th style={{ padding: '10px 12px' }}>Fuel</th>
                  <th style={{ padding: '10px 12px' }}>Exposure Score</th>
                  <th style={{ padding: '10px 12px' }}>Risk Rating</th>
                  <th style={{ padding: '10px 12px' }}>Feasible</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route, idx) => {
                  const isRec = Boolean(route.is_recommended || (recommendedIndex < 0 && idx === 0));
                  const isFeasible = route.is_feasible !== false;
                  const infeasibleReasons: string[] = route.infeasibility_reasons || [];
                  const riskStyle = getRiskBadgeStyle(route.risk_rating);

                  return (
                    <tr
                      key={idx}
                      data-testid={`route-candidate-${idx}`}
                      style={{
                        borderBottom: idx === routes.length - 1 ? 'none' : '1px solid #f1f5f9',
                        backgroundColor: isRec ? '#f0fdf4' : idx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                      }}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isRec && <Award size={15} color="#16a34a" />}
                          <span>{route.name || route.route_id || `Route ${idx + 1}`}</span>
                          {isRec && (
                            <span
                              data-testid="recommended-route-badge"
                              style={{
                                fontSize: '0.625rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '9999px',
                                backgroundColor: '#16a34a',
                                color: '#ffffff',
                              }}
                            >
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                        {route.distance_km !== undefined ? `${route.distance_km} km` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                        {route.max_wave_height_m !== undefined ? `${route.max_wave_height_m} m` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                        {route.eta_hours !== undefined ? `${route.eta_hours} h` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                        {route.fuel_estimate_liters !== undefined ? `${route.fuel_estimate_liters} L` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                        {route.exposure_score !== undefined ? route.exposure_score : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            border: `1px solid ${riskStyle.borderColor}`,
                            backgroundColor: riskStyle.backgroundColor,
                            color: riskStyle.color,
                          }}
                        >
                          {route.risk_rating || 'UNKNOWN'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {isFeasible ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 600 }}>
                            <CheckCircle2 size={14} /> Feasible
                          </span>
                        ) : (
                          <div>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: 600 }}>
                              <XCircle size={14} /> Infeasible
                            </span>
                            {infeasibleReasons.length > 0 && (
                              <div
                                data-testid={`infeasibility-reasons-${idx}`}
                                style={{
                                  fontSize: '0.6875rem',
                                  color: '#b91c1c',
                                  marginTop: '2px',
                                  maxWidth: '180px',
                                  lineHeight: '1.3',
                                }}
                              >
                                {infeasibleReasons.join('; ')}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
