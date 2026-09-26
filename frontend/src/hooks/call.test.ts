import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendVoiceChat, ApiError } from '../api/client';
import { MOCK_SAFETY_RESPONSE } from '../api/mock-data';
import { TRANSLATIONS } from '../i18n/translations';

describe('Call Mode Pipeline, VAD & Translations', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Call Mode Multilingual Translations', () => {
    it.each(['en', 'hi', 'mr'] as const)('provides complete Call Mode strings for %s including VAD hearing state', (lang) => {
      const t = TRANSLATIONS[lang];
      expect(t.callSamudraBtn).toBeTruthy();
      expect(t.callTitle).toBeTruthy();
      expect(t.callStatusConnecting).toBeTruthy();
      expect(t.callStatusListening).toBeTruthy();
      expect(t.callStatusHearing).toBeTruthy();
      expect(t.callStatusProcessing).toBeTruthy();
      expect(t.callStatusSpeaking).toBeTruthy();
      expect(t.callStatusMuted).toBeTruthy();
      expect(t.callTapToFinish).toBeTruthy();
      expect(t.callTapToSendNow).toBeTruthy();
      expect(t.callEndBtn).toBeTruthy();
      expect(t.callRetryBtn).toBeTruthy();
      expect(t.callMicDenied).toBeTruthy();
      expect(t.callNoSpeech).toBeTruthy();
      expect(t.callDetectedLanguage).toBeTruthy();
      expect(t.callSubtitleUser).toBeTruthy();
      expect(t.callSubtitleSamudra).toBeTruthy();
    });
  });

  describe('Multi-Turn Continuous Spoken Language Switching (Marathi -> Hindi -> English)', () => {
    it('Turn 1 (Marathi Audio): sends audio to /api/v1/voice/chat and decodes audio_base64 and transcript', async () => {
      const mockMarathiVoiceResponse = {
        ...MOCK_SAFETY_RESPONSE,
        conversation_id: 'call-session-uuid-001',
        language: 'mr',
        detected_language: 'mr-IN',
        intent: 'SAFETY',
        transcript: 'रत्नागिरीतून उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?',
        answer: '[CAUTION] मध्यम सागरी लाट स्थिती मुळे सावधगिरी बाळगा.',
        audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        audio_format: 'audio/wav',
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMarathiVoiceResponse,
      });

      const audioBlob = new Blob(['mock-marathi-speech-bytes'], { type: 'audio/webm' });
      const res = await sendVoiceChat(audioBlob, {
        conversation_id: 'call-session-uuid-001',
        origin_harbor: 'Ratnagiri',
        craft_profile: 'motorized_boat',
        language_preference: 'auto',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/voice/chat', expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }));

      expect(res.conversation_id).toBe('call-session-uuid-001');
      expect(res.detected_language).toBe('mr-IN');
      expect(res.transcript).toBe('रत्नागिरीतून उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?');
      expect(res.audio_base64).toBeDefined();
      expect(res.audio_format).toBe('audio/wav');
    });

    it('Turn 2 (Hindi Audio): reuses same conversation_id and adapts language seamlessly', async () => {
      const mockHindiVoiceResponse = {
        ...MOCK_SAFETY_RESPONSE,
        conversation_id: 'call-session-uuid-001',
        language: 'hi',
        detected_language: 'hi-IN',
        intent: 'WEATHER',
        transcript: 'हवा की गति और समुद्र की लहरें कैसी हैं?',
        answer: 'रत्नागिरी के लिए हवा की गति 15 नॉट्स है।',
        audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        audio_format: 'audio/wav',
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHindiVoiceResponse,
      });

      const audioBlob = new Blob(['mock-hindi-speech-bytes'], { type: 'audio/webm' });
      const res = await sendVoiceChat(audioBlob, {
        conversation_id: 'call-session-uuid-001',
        origin_harbor: 'Ratnagiri',
      });

      expect(res.conversation_id).toBe('call-session-uuid-001');
      expect(res.detected_language).toBe('hi-IN');
      expect(res.transcript).toBe('हवा की गति और समुद्र की लहरें कैसी हैं?');
      expect(res.answer).toContain('रत्नागिरी');
    });

    it('Turn 3 (English Audio): reuses same conversation_id and adapts to English', async () => {
      const mockEnglishVoiceResponse = {
        ...MOCK_SAFETY_RESPONSE,
        conversation_id: 'call-session-uuid-001',
        language: 'en',
        detected_language: 'en-IN',
        intent: 'OCEAN_CONDITIONS',
        transcript: 'What about the swell period?',
        answer: 'The swell period for Ratnagiri is 8.0 seconds.',
        audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        audio_format: 'audio/wav',
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockEnglishVoiceResponse,
      });

      const audioBlob = new Blob(['mock-english-speech-bytes'], { type: 'audio/webm' });
      const res = await sendVoiceChat(audioBlob, {
        conversation_id: 'call-session-uuid-001',
        origin_harbor: 'Ratnagiri',
      });

      expect(res.conversation_id).toBe('call-session-uuid-001');
      expect(res.detected_language).toBe('en-IN');
      expect(res.transcript).toBe('What about the swell period?');
      expect(res.answer).toContain('8.0 seconds');
    });

    it('handles API errors gracefully', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ detail: 'Sarvam Voice service temporarily unreachable' }),
      });

      const audioBlob = new Blob(['mock-audio'], { type: 'audio/webm' });
      await expect(sendVoiceChat(audioBlob)).rejects.toThrow(ApiError);
    });

    it('M1.1.5: sends mission timing, target_pfz, and parent_assessment_id in voice chat payload', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversation_id: 'call-sess-123',
          transcript: 'test',
          answer: 'ok',
          language: 'en',
        }),
      });

      const audioBlob = new Blob(['mock-audio'], { type: 'audio/webm' });
      await sendVoiceChat(audioBlob, {
        conversation_id: 'call-sess-123',
        origin_harbor: 'Ratnagiri',
        craft_profile: 'motorized_boat',
        departure_time: '2026-09-27T04:00:00Z',
        return_time: '2026-09-27T18:00:00Z',
        target_pfz: 'pfz-zone-9',
        parent_assessment_id: 'assmnt-voice-123',
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (globalThis.fetch as any).mock.calls[0];
      expect(callArgs[0]).toContain('/voice/chat');
      const sentFormData: FormData = callArgs[1].body;
      expect(sentFormData.get('origin_harbor')).toBe('Ratnagiri');
      expect(sentFormData.get('craft_profile')).toBe('motorized_boat');
      expect(sentFormData.get('departure_time')).toBe('2026-09-27T04:00:00Z');
      expect(sentFormData.get('return_time')).toBe('2026-09-27T18:00:00Z');
      expect(sentFormData.get('target_pfz')).toBe('pfz-zone-9');
      expect(sentFormData.get('parent_assessment_id')).toBe('assmnt-voice-123');
    });
  });
});
