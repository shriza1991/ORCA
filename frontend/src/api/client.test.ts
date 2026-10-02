import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMessage, getHealth, getDemoScenarios, ApiError } from './client';
import { MOCK_SAFETY_RESPONSE } from './mock-data';

describe('API Client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends chat message and returns typed ChatResponse', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SAFETY_RESPONSE,
    });

    const response = await sendMessage({
      message: 'Is it safe from Ratnagiri?',
      user_context: {
        origin_harbor: 'Ratnagiri',
        coordinates: [73.28, 16.99],
        craft_profile: 'motorized_boat',
        language_preference: 'auto',
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/chat', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('Ratnagiri'),
    }));
    expect(response.run_id).toBe(MOCK_SAFETY_RESPONSE.run_id);
    expect(response.recommendation.status).toBe('NO_GO');
  });

  it('preserves a canonical Authority sector ID in the chat request', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SAFETY_RESPONSE,
    });

    await sendMessage({
      message: 'Why is this sector safe?',
      user_context: { sector_id: 'sector-goa' },
    });

    const [, options] = (globalThis.fetch as any).mock.calls[0];
    expect(JSON.parse(options.body).user_context.sector_id).toBe('sector-goa');
  });

  it('throws ApiError on non-200 responses', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ detail: 'Backend service warming up' }),
    });

    await expect(sendMessage({ message: 'test' })).rejects.toThrow(ApiError);
  });

  it('fetches health status successfully', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'healthy',
        data_mode: 'HYBRID',
        database: 'connected',
        timestamp: '2026-09-06T12:00:00Z',
      }),
    });

    const health = await getHealth();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ headers: {} }));
    expect(health.status).toBe('healthy');
    expect(health.data_mode).toBe('HYBRID');
  });

  it('fetches demo scenarios successfully', async () => {
    const mockScenarios = [
      { id: 's1', name: 'Normal Safe', description: 'Safe conditions', query: 'Is it safe?' },
      { id: 's2', name: 'Elevated Sea', description: 'Caution wave heights', query: 'Wave alert?' },
    ];
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockScenarios,
    });

    const scenarios = await getDemoScenarios();
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].id).toBe('s1');
  });

  it('transcribes audio via POST /api/v1/voice/transcribe', async () => {
    const mockTranscribeResult = {
      transcript: 'उद्या रत्नागिरीहून जाणे सुरक्षित आहे का?',
      language: 'mr-IN',
      normalized_language: 'mr',
    };

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTranscribeResult,
    });

    const blob = new Blob(['mock-audio-data'], { type: 'audio/webm' });
    const { transcribeAudio } = await import('./client');
    const result = await transcribeAudio(blob);

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/voice/transcribe', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }));
    expect(result.transcript).toBe('उद्या रत्नागिरीहून जाणे सुरक्षित आहे का?');
    expect(result.language).toBe('mr-IN');
    expect(result.normalized_language).toBe('mr');
  });

  it('sends voice chat audio via POST /api/v1/voice/chat and receives VoiceChatResponse', async () => {
    const mockVoiceResponse = {
      ...MOCK_SAFETY_RESPONSE,
      transcript: 'रत्नागिरीतून उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?',
      detected_language: 'mr-IN',
      audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      audio_format: 'audio/wav',
    };

    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockVoiceResponse,
    });

    const blob = new Blob(['mock-audio-bytes'], { type: 'audio/webm' });
    const { sendVoiceChat } = await import('./client');
    const result = await sendVoiceChat(blob, {
      conversation_id: 'conv-123',
      origin_harbor: 'Ratnagiri',
      craft_profile: 'motorized_boat',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/voice/chat', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }));
    expect(result.transcript).toBe('रत्नागिरीतून उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?');
    expect(result.detected_language).toBe('mr-IN');
    expect(result.audio_base64).toBeDefined();
    expect(result.audio_format).toBe('audio/wav');
  });

  it('throws ApiError when voice chat endpoint fails', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ detail: 'Voice pipeline execution failed' }),
    });

    const blob = new Blob(['mock-audio-bytes'], { type: 'audio/webm' });
    const { sendVoiceChat } = await import('./client');
    await expect(sendVoiceChat(blob)).rejects.toThrow(ApiError);
  });

  it('fetches base layers via GET /api/v1/layers/base', async () => {
    const mockBaseLayers = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: 'POLY-NAV-01', properties: { name: 'Naval Range' } }],
    };
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBaseLayers,
    });

    const { getBaseLayers } = await import('./client');
    const layers = await getBaseLayers();
    expect(layers.type).toBe('FeatureCollection');
    expect(layers.features).toHaveLength(1);
  });

  it('runs scenario benchmark via POST /api/v1/scenarios/{id}/run', async () => {
    const mockBenchmark = {
      scenario_id: 'S1',
      scenario_name: 'Normal Safe',
      passed: true,
      actual_status: 'GO',
      expected_status: 'GO',
      executed_tools: ['marine_conditions'],
      evidence_count: 3,
      evidence_grounded: true,
      response_text: 'Safe to depart',
      trace_steps_count: 5,
      warnings: [],
      validation_notes: ['Match'],
    };
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBenchmark,
    });

    const { runScenario } = await import('./client');
    const res = await runScenario('S1');
    expect(res.passed).toBe(true);
    expect(res.actual_status).toBe('GO');
  });

  it('fetches demo sectors, vessels, and replay positions via API', async () => {
    const mockSectors = [
      {
        public_id: 'sector-ratnagiri',
        name: 'Ratnagiri Sector (MH-03)',
        code: 'MH-03',
        station_name: 'Ratnagiri Post',
        harbor_id: 'harbor-ratnagiri',
        center: [73.28, 16.99],
        zoom: 8.8,
        polygon: [[72.6, 16.5], [73.5, 16.5], [73.5, 17.5], [72.6, 17.5], [72.6, 16.5]],
      },
    ];
    const mockVessels = [
      {
        public_id: 'vessel-01',
        name: 'Matsya Sagar 01',
        vessel_type: 'motorized_boat',
        length_m: 9.5,
        capacity_tons: 3.0,
        home_harbor_id: 'harbor-ratnagiri',
        status: 'OPERATIONAL',
      },
    ];
    const mockReplay = [
      {
        public_id: 'pos-1',
        vessel_id: 'vessel-01',
        trip_id: 'trip-01',
        timestamp: '00:00',
        latitude: 16.99,
        longitude: 73.28,
        speed_knots: 7.5,
        heading_deg: 235,
      },
    ];
    const mockNotifications = [
      {
        public_id: 'notif-01',
        recipient_role: 'fisher',
        title: 'Squall Warning',
        message: 'High waves',
        severity: 'WARNING',
        is_read: false,
        timestamp: '2026-09-12T05:00:00Z',
      },
    ];

    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => mockSectors })
      .mockResolvedValueOnce({ ok: true, json: async () => mockVessels })
      .mockResolvedValueOnce({ ok: true, json: async () => mockReplay })
      .mockResolvedValueOnce({ ok: true, json: async () => mockNotifications });

    const { getDemoSectors, getDemoVessels, getDemoVesselReplay, getDemoNotifications } = await import('./client');

    const sectors = await getDemoSectors();
    expect(sectors).toHaveLength(1);
    expect(sectors[0].public_id).toBe('sector-ratnagiri');

    const vessels = await getDemoVessels('Ratnagiri Sector (MH-03)');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/demo/vessels?sector='),
      expect.anything()
    );
    expect(vessels).toHaveLength(1);
    expect(vessels[0].public_id).toBe('vessel-01');

    const positions = await getDemoVesselReplay('vessel-01');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/demo/vessels/vessel-01/replay', expect.anything());
    expect(positions).toHaveLength(1);
    expect(positions[0].latitude).toBeCloseTo(16.99, 2);

    const notifs = await getDemoNotifications('Ratnagiri Sector (MH-03)');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/demo/notifications?sector='),
      expect.anything()
    );
    expect(notifs).toHaveLength(1);
  });

  it('requests derived operational alerts using the canonical sector ID', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ sector_id: 'sector-goa', alerts: [] }) });
    const { getDemoSectorOperationalAlerts } = await import('./client');
    await expect(getDemoSectorOperationalAlerts('sector-goa')).resolves.toEqual({ sector_id: 'sector-goa', alerts: [] });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/demo/sectors/sector-goa/operational-alerts', expect.anything());
  });
});


