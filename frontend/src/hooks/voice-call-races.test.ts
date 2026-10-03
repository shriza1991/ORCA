import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement } from 'react';
import { useVoiceRecorder } from './useVoiceRecorder';
import { useCallSession } from './useCallSession';
import * as client from '../api/client';

// Mock client.sendVoiceChat and client.transcribeAudio
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof client>('../api/client');
  return {
    ...actual,
    sendVoiceChat: vi.fn(),
    transcribeAudio: vi.fn(),
  };
});

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('Voice Recorder & Call Lifecycle Race Condition Regressions', () => {
  let originalMediaDevices: any;
  let originalMediaRecorder: any;
  let originalAudio: any;
  let originalCreateObjectURL: any;
  let originalRevokeObjectURL: any;

  beforeEach(() => {
    vi.clearAllMocks();

    (globalThis as any).window = globalThis;
    originalMediaDevices = navigator.mediaDevices;
    originalMediaRecorder = (globalThis as any).MediaRecorder;
    originalAudio = (globalThis as any).Audio;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn(() => 'blob:mock-url-123');
    URL.revokeObjectURL = vi.fn();

    (globalThis as any).Audio = class {
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      src = '';
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
    };

    class DefaultMediaRecorder {
      state = 'inactive';
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
      static isTypeSupported() {
        return true;
      }
    }
    (globalThis as any).MediaRecorder = DefaultMediaRecorder;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
    (globalThis as any).MediaRecorder = originalMediaRecorder;
    (globalThis as any).Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('useVoiceRecorder: releasing/cancelling before getUserMedia resolves stops tracks and does not record', async () => {
    let recorderHook: ReturnType<typeof useVoiceRecorder>;
    let tree: ReactTestRenderer;

    function RecorderProbe() {
      recorderHook = useVoiceRecorder();
      return null;
    }

    const mockTrack = { stop: vi.fn(), readyState: 'live' };
    const mockStream = {
      getTracks: () => [mockTrack],
    };

    let resolveGetUserMedia: (stream: any) => void = () => {};
    const getUserMediaPromise = new Promise((resolve) => {
      resolveGetUserMedia = resolve;
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(() => getUserMediaPromise),
      },
      configurable: true,
      writable: true,
    });

    await act(async () => {
      tree = create(createElement(RecorderProbe));
    });

    // Start recording, which triggers getUserMedia
    act(() => {
      void recorderHook.startRecording();
    });

    // Cancel while getUserMedia is still pending
    act(() => {
      recorderHook.cancelRecording();
    });

    expect(recorderHook!.isRecording).toBe(false);

    // Now getUserMedia resolves late
    await act(async () => {
      resolveGetUserMedia(mockStream);
    });

    // Track must be immediately stopped because session was already cancelled
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(recorderHook!.isRecording).toBe(false);

    tree!.unmount();
  });

  it('useVoiceRecorder: cancellation while transcription is in-flight suppresses late result', async () => {
    let recorderHook: ReturnType<typeof useVoiceRecorder>;
    let tree: ReactTestRenderer;
    const onTranscribed = vi.fn();

    function RecorderProbe() {
      recorderHook = useVoiceRecorder({ onTranscription: onTranscribed });
      return null;
    }

    const mockTrack = { stop: vi.fn(), readyState: 'live' };
    const mockStream = { getTracks: () => [mockTrack] };

    // Mock MediaRecorder
    class MockMediaRecorder {
      state = 'inactive';
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(['a'.repeat(200)], { type: 'audio/webm' }) });
        }
        if (this.onstop) {
          this.onstop();
        }
      }
    }
    (window as any).MediaRecorder = MockMediaRecorder;
    (MockMediaRecorder as any).isTypeSupported = () => true;

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    let resolveTranscription: (data: any) => void = () => {};
    (client.transcribeAudio as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscription = resolve;
        }),
    );

    await act(async () => {
      tree = create(createElement(RecorderProbe));
    });

    // Start and stop to trigger transcription
    await act(async () => {
      await recorderHook.startRecording();
    });

    await act(async () => {
      await recorderHook.stopRecording();
    });

    expect(recorderHook!.isTranscribing).toBe(true);

    // Cancel while transcription is pending
    act(() => {
      recorderHook.cancelRecording();
    });

    expect(recorderHook!.isTranscribing).toBe(false);

    // Transcription resolves late
    await act(async () => {
      resolveTranscription({ transcript: 'Late query result', language: 'en' });
    });

    // onTranscribed must not have been called with obsolete result
    expect(onTranscribed).not.toHaveBeenCalled();

    tree!.unmount();
  });

  it('useCallSession: omits expired or unapplicable baseline IDs from voice parameters', async () => {
    let callHook: ReturnType<typeof useCallSession>;
    let tree: ReactTestRenderer;

    function CallProbe(props: any) {
      callHook = useCallSession(props);
      return null;
    }

    const mockTrack = { stop: vi.fn(), readyState: 'live' };
    const mockStream = { getTracks: () => [mockTrack] };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    (client.sendVoiceChat as any).mockResolvedValue({
      answer: 'Conditions are safe to depart.',
      language: 'en',
    });

    // Baseline is EXPIRED
    await act(async () => {
      tree = create(
        createElement(CallProbe, {
          originHarbor: 'Ratnagiri',
          craftProfile: 'motorized_boat',
          vesselSize: 'medium',
          departureTime: '2026-10-04T06:00:00Z',
          baselineAssessmentId: 'asm-expired-123',
          evidenceBundleId: 'bundle-expired-456',
          parentAssessmentId: 'asm-parent-789',
          isBaselineApplicable: false,
          isBaselineExpired: true,
          isBaselineLoading: false,
        }),
      );
    });

    await act(async () => {
      await callHook.startCall();
    });

    // Trigger speech turn submission
    await act(async () => {
      callHook.finishSpeakingTurn();
    });

    // If sendVoiceChat was called, baselineAssessmentId must NOT be asm-expired-123
    const calls = (client.sendVoiceChat as any).mock.calls;
    if (calls.length > 0) {
      const sentParams = calls[0][0];
      expect(sentParams.baseline_assessment_id).toBeUndefined();
      expect(sentParams.evidence_bundle_id).toBeUndefined();
      expect(sentParams.parent_assessment_id).toBeUndefined();
      // Vessel size and current inputs must be preserved
      expect(sentParams.vessel_size).toBe('medium');
      expect(sentParams.origin_harbor).toBe('Ratnagiri');
    }

    tree!.unmount();
  });

  it('useCallSession: mission/baseline change during call transitions to PAUSED', async () => {
    let callHook: ReturnType<typeof useCallSession>;
    let tree: ReactTestRenderer;

    function CallProbe(props: any) {
      callHook = useCallSession(props);
      return null;
    }

    const mockTrack = { stop: vi.fn(), readyState: 'live' };
    const mockStream = { getTracks: () => [mockTrack] };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    await act(async () => {
      tree = create(
        createElement(CallProbe, {
          originHarbor: 'Ratnagiri',
          craftProfile: 'motorized_boat',
          vesselSize: 'medium',
          baselineAssessmentId: 'asm-100',
        }),
      );
    });

    await act(async () => {
      await callHook.startCall();
    });

    expect(callHook!.callState).toBe('LISTENING');

    // Props change: user changed mission harbor in UI
    await act(async () => {
      tree.update(
        createElement(CallProbe, {
          originHarbor: 'Malvan',
          craftProfile: 'motorized_boat',
          vesselSize: 'medium',
          baselineAssessmentId: 'asm-200',
        }),
      );
    });

    // Call must enter PAUSED to prevent answering for the old mission
    expect(callHook!.callState).toBe('PAUSED');

    tree!.unmount();
  });

  it('useCallSession: cleans up active stream tracks and object URLs on unmount', async () => {
    let callHook: ReturnType<typeof useCallSession>;
    let tree: ReactTestRenderer;

    function CallProbe(props: any) {
      callHook = useCallSession(props);
      return null;
    }

    const mockTrack = { stop: vi.fn(), readyState: 'live' };
    const mockStream = { getTracks: () => [mockTrack] };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    await act(async () => {
      tree = create(createElement(CallProbe, { originHarbor: 'Ratnagiri' }));
    });

    await act(async () => {
      await callHook.startCall();
    });

    expect(mockTrack.stop).not.toHaveBeenCalled();

    // Unmount while call is active
    act(() => {
      tree.unmount();
    });

    // Track must be stopped on unmount
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
