import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { speechCoordinator } from './speech-coordinator';

describe('SpeechCoordinator Regression Suite', () => {
  let mockSynth: any;

  beforeEach(() => {
    mockSynth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    (globalThis as any).window = globalThis;
    (globalThis as any).speechSynthesis = mockSynth;
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      voice: any = null;
      lang: string = 'en';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };

    speechCoordinator.resetDeduplication();
    speechCoordinator.setMuted(false);
    speechCoordinator.setCallActive(false);
    speechCoordinator.stop();
  });

  afterEach(() => {
    speechCoordinator.stop();
    speechCoordinator.resetDeduplication();
  });

  it('serializes announcements into a queue rather than dropping them', async () => {
    // Speak two normal announcements
    const spoken1 = speechCoordinator.speak('First alert advisory', {
      priority: 'normal',
      dedupeKey: 'alert-1',
    });
    const spoken2 = speechCoordinator.speak('Second alert advisory', {
      priority: 'normal',
      dedupeKey: 'alert-2',
    });

    expect(spoken1).toBe(true);
    expect(spoken2).toBe(true);

    // Both items were processed: one current, one queued in coordinator
    const currentId = (speechCoordinator as any).currentUtteranceId;
    const queue = (speechCoordinator as any).queue;
    expect(currentId !== null || queue.length >= 1).toBe(true);

    // Wait for the 50ms buffer timer before synth.speak
    await new Promise((r) => setTimeout(r, 60));
    expect(mockSynth.speak).toHaveBeenCalled();
  });

  it('deduplicates automatic speech by dedupeKey unless explicitly replayed', () => {
    const first = speechCoordinator.speak('Approaching border zone', {
      priority: 'normal',
      dedupeKey: 'boundary-zone-a',
    });
    expect(first).toBe(true);

    // Immediate repeat with same dedupeKey should be rejected
    const repeat = speechCoordinator.speak('Approaching border zone', {
      priority: 'normal',
      dedupeKey: 'boundary-zone-a',
    });
    expect(repeat).toBe(false);

    // Explicit replay must bypass automatic deduplication
    const replayed = speechCoordinator.replay('Approaching border zone', 'en');
    expect(replayed).toBe(true);
  });

  it('resets deduplication for a specific scope prefix when boundaries clear', () => {
    speechCoordinator.speak('Approaching Zone A', {
      priority: 'normal',
      dedupeKey: 'mission123:boundary:approaching:Zone A',
    });

    // Subsumed repeat blocked
    expect(
      speechCoordinator.speak('Approaching Zone A', {
        priority: 'normal',
        dedupeKey: 'mission123:boundary:approaching:Zone A',
      }),
    ).toBe(false);

    // When vessel returns to CLEAR, reset boundary scope
    speechCoordinator.resetDeduplication('mission123:boundary');

    // Subsequent approach is now speakable
    const reApproached = speechCoordinator.speak('Approaching Zone A', {
      priority: 'normal',
      dedupeKey: 'mission123:boundary:approaching:Zone A',
    });
    expect(reApproached).toBe(true);
  });

  it('global mute suppresses automatic speech but permits explicit user replay', () => {
    speechCoordinator.setMuted(true);
    expect(speechCoordinator.getMuted()).toBe(true);

    const autoAlert = speechCoordinator.speak('Severe weather incoming', {
      priority: 'normal',
      dedupeKey: 'weather-alert-1',
    });
    expect(autoAlert).toBe(false);

    // User taps Replay button: explicit speech is allowed even when muted
    const explicitReplay = speechCoordinator.replay('Severe weather incoming', 'en');
    expect(explicitReplay).toBe(true);
  });

  it('continuous call mode suppresses background alert speech to avoid echo capture', () => {
    speechCoordinator.setCallActive(true);
    expect(speechCoordinator.getCallActive()).toBe(true);

    const autoAlert = speechCoordinator.speak('Approaching restricted border', {
      priority: 'high',
      dedupeKey: 'boundary-border-1',
    });
    expect(autoAlert).toBe(false);

    // When call ends, alerts can be spoken again
    speechCoordinator.setCallActive(false);
    const postCallAlert = speechCoordinator.speak('Approaching restricted border', {
      priority: 'high',
      dedupeKey: 'boundary-border-2',
    });
    expect(postCallAlert).toBe(true);
  });

  it('subscribes to mute changes cleanly', () => {
    const listener = vi.fn();
    const unsubscribe = speechCoordinator.subscribeMute(listener);

    speechCoordinator.toggleMute();
    expect(listener).toHaveBeenCalledWith(true);

    speechCoordinator.toggleMute();
    expect(listener).toHaveBeenCalledWith(false);

    unsubscribe();
    speechCoordinator.toggleMute();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
