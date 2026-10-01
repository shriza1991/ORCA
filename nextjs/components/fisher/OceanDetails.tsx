import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Droplets, Thermometer, Activity, Compass } from 'lucide-react';
import type { TripAssessmentResponse } from '../../types/assessment';
import { translateText, type SupportedLanguage } from '../../i18n/translations';
import { getHarborCoordinates } from '../../utils/geo';
import { executeSpatialQuery, type UnifiedSpatialQueryResponse } from '../../api/marinewatch-client';

interface OceanDetailsProps {
  assessment: TripAssessmentResponse | null;
  language?: SupportedLanguage;
}

export default function OceanDetails({ assessment, language = 'en' }: OceanDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [spatialData, setSpatialData] = useState<UnifiedSpatialQueryResponse | null>(null);

  const originHarbor = assessment?.trip_context?.origin_harbor || 'Ratnagiri';

  useEffect(() => {
    const coords = assessment?.trip_context?.coordinates || getHarborCoordinates(originHarbor);
    if (coords && coords.length === 2) {
      // getHarborCoordinates returns [lon, lat], executeSpatialQuery takes (lat, lon)
      const lat = coords[1];
      const lon = coords[0];
      const depTime = assessment?.trip_context?.departure_time;
      executeSpatialQuery(lat, lon, 50, undefined, depTime)
        .then((res) => setSpatialData(res))
        .catch((err) => console.error('Spatial query error:', err));
    }
  }, [originHarbor, assessment?.trip_context?.coordinates, assessment?.trip_context?.departure_time]);

  if (!assessment) return null;

  const measurements = assessment.conditions?.measurements || {};
  const sst = measurements.sea_surface_temperature;
  const chl = measurements.chlorophyll_a;

  const tide = spatialData?.astronomical_tide;
  const lighthouse = spatialData?.nearby_lighthouses && spatialData.nearby_lighthouses.length > 0
    ? spatialData.nearby_lighthouses[0]
    : null;
  const bathy = spatialData?.bathymetry_and_shelf;

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
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={24} className="text-primary" />
          {translateText('Ocean Details, Tides & Navigation Aids', language)}
        </div>
        {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
      </button>

      {isOpen && (
        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 1. INCOIS Astronomical Predicted Tide (PAT) */}
          {tide && (
            <div style={{ background: 'white', borderRadius: '10px', padding: '14px', border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7' }}>
                  INCOIS Predicted Astronomical Tide (PAT)
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: tide.phase === 'FLOOD' ? '#dcfce7' : '#fef3c7',
                    color: tide.phase === 'FLOOD' ? '#166534' : '#92400e',
                  }}
                >
                  {tide.phase} TIDE
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
                  {tide.current_height_m}
                </span>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>meters above Chart Datum ({tide.datum})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Next High Water</span>
                  <strong>{tide.next_high?.height_m}m</strong> at {tide.next_high?.time}
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Next Low Water</span>
                  <strong>{tide.next_low?.height_m}m</strong> at {tide.next_low?.time}
                </div>
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#64748b' }}>
                Station: {tide.station_name}
              </div>
            </div>
          )}

          {/* 2. DGLL Coastal Lighthouse Navigation Aid */}
          {lighthouse && (
            <div style={{ background: 'white', borderRadius: '10px', padding: '14px', border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Compass size={14} /> DGLL Coastal Navigational Aid
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {lighthouse.district}, {lighthouse.state}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                {lighthouse.name}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px' }}>
                Light: <strong>{lighthouse.light_character}</strong>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                <span>Optical Range: <strong>{lighthouse.range_nm} nm</strong></span>
                <span>Focal Height: <strong>{lighthouse.focal_height_m} m</strong></span>
              </div>
            </div>
          )}

          {/* 3. Bathymetry Depth & Continental Shelf */}
          {bathy && (
            <div style={{ background: 'white', borderRadius: '10px', padding: '14px', border: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569', marginBottom: '6px' }}>
                GEBCO Bathymetry & Seabed Profile
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
                  {bathy.bathymetry_depth_m} <small style={{ fontSize: '0.8rem', fontWeight: 400 }}>m water depth</small>
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0284c7' }}>
                  {bathy.shelf_zone}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                Distance to Coastline: {bathy.distance_to_shore_km} km
              </div>
            </div>
          )}

          {/* 4. Decision Evidence Reasoning */}
          <h4 style={{ fontSize: '1.1rem', color: '#475569', marginBottom: '4px', marginTop: '8px' }}>
            {translateText('Why this recommendation?', language)}
          </h4>

          <ul style={{ margin: 0, paddingLeft: '24px', color: '#334155', fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {assessment.evidence?.slice(0, 3).map((ev, i) => (
              <li key={i}>
                {ev.description || `${ev.metric_name}: ${(ev as any).metric_value}`}
              </li>
            ))}
          </ul>

          {(sst || chl) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
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
