import type { ChatResponse } from '../types/contracts';

export const SAMPLE_QUERIES = [
  { label: '🐟 Nearest PFZ', query: 'Where is the nearest Potential Fishing Zone today from Ratnagiri?' },
  { label: '⚓ Safety Check', query: 'Is it safe to leave tomorrow at 6 AM from Ratnagiri?' },
  { label: '⚠️ Hazard Alert', query: 'Any cyclone, lightning or restricted-water risk on this trip?' },
  { label: '🧭 Safer Route', query: 'Which route from Ratnagiri to the PFZ has the lowest risk?' },
];

export const MOCK_SAFETY_RESPONSE: ChatResponse = {
  run_id: 'run_98f82a1e-84b2-4d22-964d-0457639f283a',
  conversation_id: 'conv_67b3112c-15a4-4a5e-9f0e-3b2d18302f3a',
  language: 'en',
  intent: 'GO_NO_GO_SAFETY',
  answer: 'Departure from Ratnagiri tomorrow at 06:00 is advised against (NO-GO). Severe sea state with significant wave heights of 3.4m and active IMD squall alert.',
  recommendation: {
    status: 'NO_GO',
    summary: 'High risk of craft swamping due to elevated wave heights and squall conditions.',
    decisive_factors: [
      'Significant wave height 3.4m exceeds craft safety ceiling (2.5m)',
      'IMD coastal squall warning active across Konkan coast until 14:00 tomorrow',
    ],
    next_action: 'Postpone departure until wave heights abate below 2.0m (expected after 18:00 tomorrow).',
  },
  confidence: {
    level: 'HIGH',
    reasons: [
      'Recent INCOIS Ocean State Forecast updated 2 hours ago',
      'Corroborated by IMD coastal bulletin issued at 18:00 IST',
    ],
  },
  evidence: [
    {
      source_name: 'INCOIS Ocean State Forecast',
      source_url: 'https://incois.gov.in/portal/osf/osf.jsp',
      observed_time: '2026-09-05T00:00:00Z',
      valid_from: '2026-09-05T05:00:00Z',
      valid_to: '2026-09-05T12:00:00Z',
      retrieved_at: '2026-09-04T22:30:00Z',
      geometry: { type: 'Point', coordinates: [73.28, 16.99] },
      metric_name: 'significant_wave_height',
      metric_value: 3.4,
      metric_unit: 'meters',
      quality_flags: ['fresh', 'official_source'],
    },
    {
      source_name: 'IMD Coastal Bulletin',
      source_url: 'https://mausam.imd.gov.in/',
      observed_time: '2026-09-04T18:00:00Z',
      valid_from: '2026-09-04T18:00:00Z',
      valid_to: '2026-09-05T18:00:00Z',
      retrieved_at: '2026-09-04T22:30:00Z',
      metric_name: 'coastal_squall_warning',
      metric_value: 'ACTIVE',
      metric_unit: 'status',
      quality_flags: ['fresh', 'official_source'],
    },
  ],
  map_layers: [
    {
      layer_id: 'layer_warning_zone_ratnagiri',
      name: 'Squall Warning Sector',
      layer_type: 'geojson',
      visible: true,
      style: { color: '#ef4444', opacity: 0.35, line_width: 2 },
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [72.60, 16.50],
                  [72.95, 16.45],
                  [73.30, 16.65],
                  [73.38, 16.90],
                  [73.35, 17.20],
                  [73.10, 17.38],
                  [72.75, 17.30],
                  [72.55, 17.00],
                  [72.50, 16.70],
                  [72.60, 16.50],
                ],
              ],
            },
            properties: { severity: 'CRITICAL', label: 'IMD Squall Advisory Zone' },
          },
        ],
      },
    },
    {
      layer_id: 'layer_origin_ratnagiri',
      name: 'Departure Point',
      layer_type: 'geojson',
      visible: true,
      style: { color: '#38bdf8', opacity: 1 },
      geojson: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [73.28, 16.99] },
        properties: { label: 'Ratnagiri Harbor' },
      },
    },
  ],
  trace: [
    { step: 1, node: 'intent_locale', action: 'Detected intent: GO_NO_GO_SAFETY (en)', status: 'completed', timestamp: '2026-09-04T22:31:01Z' },
    { step: 2, node: 'supervisor', action: 'Dispatched tools: get_marine_weather, evaluate_risk', status: 'completed', timestamp: '2026-09-04T22:31:02Z' },
    { step: 3, node: 'weather_hazard', action: 'Retrieved INCOIS OSF + IMD squall warning', status: 'completed', timestamp: '2026-09-04T22:31:04Z' },
    { step: 4, node: 'risk_evaluator', action: 'Evaluated: NO_GO (wave_height, squall_warning)', status: 'completed', timestamp: '2026-09-04T22:31:05Z' },
    { step: 5, node: 'evidence_validator', action: 'Validated 2 evidence items, all fresh', status: 'completed', timestamp: '2026-09-04T22:31:05Z' },
    { step: 6, node: 'response_composer', action: 'Composed safety advisory in English', status: 'completed', timestamp: '2026-09-04T22:31:06Z' },
  ],
  warnings: ['Open-Meteo fallback was not needed. Primary data is fresh.'],
  suggested_followups: [
    'Check safety window for tomorrow evening',
    'Where is the nearest safe anchorage near Ratnagiri?',
  ],
};

export const MOCK_PFZ_RESPONSE: ChatResponse = {
  run_id: 'run_pfz_demo_001',
  conversation_id: 'conv_67b3112c-15a4-4a5e-9f0e-3b2d18302f3a',
  language: 'en',
  intent: 'NEAREST_PFZ',
  answer: 'The nearest Potential Fishing Zone is approximately 42.6 km southwest of Ratnagiri Harbor, bearing 245°. The zone shows favorable SST (28.4°C) and chlorophyll-a concentration (1.2 mg/m³).',
  recommendation: {
    status: 'GO',
    summary: 'Favorable conditions for fishing trip to nearest PFZ.',
    decisive_factors: [
      'PFZ zone PFZ-MH-20260905-01 identified 42.6 km from harbor',
      'Sea conditions within safe operational limits',
      'SST 28.4°C favorable for target species',
    ],
    next_action: 'Proceed with trip planning. Check departure safety before leaving.',
  },
  confidence: {
    level: 'HIGH',
    reasons: [
      'INCOIS PFZ advisory valid for today',
      'Ocean State Forecast corroborates calm conditions',
    ],
  },
  evidence: [
    {
      source_name: 'INCOIS PFZ Advisory',
      source_url: 'https://incois.gov.in/portal/pfz/pfz.jsp',
      observed_time: '2026-09-04T12:00:00Z',
      valid_from: '2026-09-05T00:00:00Z',
      valid_to: '2026-09-05T23:59:59Z',
      retrieved_at: '2026-09-04T22:30:00Z',
      geometry: { type: 'Point', coordinates: [72.95, 16.82] },
      metric_name: 'pfz_coordinates',
      metric_value: [72.95, 16.82],
      metric_unit: 'lon_lat',
      quality_flags: ['verified_geometry'],
    },
  ],
  map_layers: [
    {
      layer_id: 'layer_pfz_candidates',
      name: 'PFZ Zones',
      layer_type: 'geojson',
      visible: true,
      style: { color: '#22c55e', opacity: 0.6, line_width: 2 },
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [72.86, 16.80],
                  [72.90, 16.74],
                  [72.98, 16.73],
                  [73.04, 16.78],
                  [73.05, 16.86],
                  [73.01, 16.91],
                  [72.93, 16.92],
                  [72.87, 16.87],
                  [72.86, 16.80],
                ],
              ],
            },
            properties: { label: 'PFZ-MH-20260905-01', sst: 28.4, chlorophyll: 1.2, rank: 1 },
          },
        ],
      },
    },
    {
      layer_id: 'layer_origin_ratnagiri',
      name: 'Departure Point',
      layer_type: 'geojson',
      visible: true,
      style: { color: '#38bdf8', opacity: 1 },
      geojson: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [73.28, 16.99] },
        properties: { label: 'Ratnagiri Harbor' },
      },
    },
    {
      layer_id: 'layer_pfz_route',
      name: 'Route to PFZ',
      layer_type: 'geojson',
      visible: true,
      style: { color: '#38bdf8', opacity: 0.8, line_width: 3 },
      geojson: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[73.28, 16.99], [73.05, 16.90], [72.95, 16.82]] },
        properties: { label: 'Route to nearest PFZ', distance_km: 42.6 },
      },
    },
  ],
  trace: [
    { step: 1, node: 'intent_locale', action: 'Detected intent: NEAREST_PFZ (en)', status: 'completed', timestamp: '2026-09-04T22:31:01Z' },
    { step: 2, node: 'supervisor', action: 'Dispatched tools: get_pfz_advisory, rank_pfz', status: 'completed', timestamp: '2026-09-04T22:31:02Z' },
    { step: 3, node: 'marine_pfz', action: 'Retrieved INCOIS PFZ advisory, ranked 1 candidate', status: 'completed', timestamp: '2026-09-04T22:31:04Z' },
    { step: 4, node: 'response_composer', action: 'Composed PFZ advisory in English', status: 'completed', timestamp: '2026-09-04T22:31:05Z' },
  ],
  warnings: [],
  suggested_followups: [
    'Is it safe to depart for this PFZ tomorrow at 6 AM?',
    'Show alternative PFZ options further south',
  ],
};
