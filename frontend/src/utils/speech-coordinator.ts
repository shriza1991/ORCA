import type { SupportedLanguage } from '../i18n/translations';

export type SpeechPriority = 'high' | 'normal';

export interface SpeakOptions {
  priority?: SpeechPriority;
  dedupeKey?: string;
  isExplicit?: boolean;
  isCallSpeech?: boolean;
  language?: SupportedLanguage;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err?: any) => void;
}

interface QueuedUtterance {
  id: number;
  text: string;
  language: SupportedLanguage;
  priority: number;
  isExplicit: boolean;
  dedupeKey?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err?: any) => void;
}

const LANG_FALLBACK_CHAINS: Record<SupportedLanguage, string[]> = {
  en: ['en-IN', 'en-US', 'en-GB', 'en'],
  hi: ['hi-IN', 'hi'],
  mr: ['mr-IN', 'mr', 'hi-IN', 'hi'],
  ta: ['ta-IN', 'ta', 'en-IN', 'en'],
  te: ['te-IN', 'te', 'en-IN', 'en'],
};

function pickBestVoice(voices: SpeechSynthesisVoice[], chain: string[]): SpeechSynthesisVoice | null {
  for (const tag of chain) {
    const exact = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === tag.toLowerCase());
    if (exact) return exact;

    const prefix = tag.split('-')[0].toLowerCase();
    const partial = voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix));
    if (partial) return partial;
  }
  return null;
}

class SpeechCoordinator {
  private queue: QueuedUtterance[] = [];
  private currentUtteranceId: number | null = null;
  private currentPriority: number = 0;
  private currentItem: QueuedUtterance | null = null;
  private utteranceCounter = 0;
  private isMuted: boolean = false;
  private isCallActive: boolean = false;
  private announcedDedupeKeys = new Set<string>();
  private voices: SpeechSynthesisVoice[] = [];
  private isPlayingState = false;
  private muteListeners = new Set<(muted: boolean) => void>();
  private playListeners = new Set<(playing: boolean) => void>();
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const synth = window.speechSynthesis;
        this.voices = synth.getVoices() || [];
        // Additive listener to avoid stomping other window listeners
        synth.addEventListener?.('voiceschanged', () => {
          this.voices = synth.getVoices() || [];
        });
      } catch {
        // SpeechSynthesis unavailable or restricted in test environment
      }
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    if (this.isMuted === muted) return;
    this.isMuted = muted;
    if (muted) {
      this.cancelAutomaticSpeech();
    }
    this.muteListeners.forEach((fn) => {
      try {
        fn(muted);
      } catch {}
    });
  }

  public toggleMute(): boolean {
    const next = !this.isMuted;
    this.setMuted(next);
    return next;
  }

  public subscribeMute(listener: (muted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => this.muteListeners.delete(listener);
  }

  public subscribePlayState(listener: (playing: boolean) => void): () => void {
    this.playListeners.add(listener);
    return () => this.playListeners.delete(listener);
  }

  public isPlaying(): boolean {
    return this.isPlayingState;
  }

  public setCallActive(active: boolean): void {
    this.isCallActive = active;
    if (active) {
      // In continuous call mode, alerts must not be spoken over mic/call audio
      this.stop();
    }
  }

  public getCallActive(): boolean {
    return this.isCallActive;
  }

  public resetDeduplication(scopePrefix?: string): void {
    if (!scopePrefix) {
      this.announcedDedupeKeys.clear();
      return;
    }
    for (const key of Array.from(this.announcedDedupeKeys)) {
      if (key.startsWith(scopePrefix)) {
        this.announcedDedupeKeys.delete(key);
      }
    }
  }

  public replay(text: string, language?: SupportedLanguage): boolean {
    return this.speak(text, { isExplicit: true, priority: 'high', language });
  }

  public speak(
    text: string,
    options: SpeakOptions = {},
  ): boolean {
    const trimmed = text?.trim();
    if (this.isCallActive && !options.isCallSpeech) return false;
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      options.onError?.(new Error('SpeechSynthesis not supported'));
      return false;
    }
    if (!trimmed) return false;

    const isExplicit = Boolean(options.isExplicit);
    const priorityLevel = options.priority === 'high' ? 10 : 5;
    const dedupeKey = options.dedupeKey;

    // Automatic speech checks mute, call active, and deduplication
    if (!isExplicit) {
      if (this.isMuted || this.isCallActive) {
        return false;
      }
      if (dedupeKey && this.announcedDedupeKeys.has(dedupeKey)) {
        return false;
      }
    }

    if (dedupeKey) {
      this.announcedDedupeKeys.add(dedupeKey);
    }

    const item: QueuedUtterance = {
      id: ++this.utteranceCounter,
      text: trimmed,
      language: options.language || 'en',
      priority: priorityLevel,
      isExplicit,
      dedupeKey,
      onStart: options.onStart,
      onEnd: options.onEnd,
      onError: options.onError,
    };

    if (item.priority > this.currentPriority && this.currentUtteranceId !== null) {
      // High priority (e.g. INSIDE boundary escalation) interrupts lower-priority speech
      this.interruptCurrentAndPreempt(item);
    } else {
      // Enqueue in priority order (high priority first, then FIFO)
      const insertIndex = this.queue.findIndex((q) => q.priority < item.priority);
      if (insertIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIndex, 0, item);
      }
      this.processQueue();
    }

    return true;
  }

  public stop(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.queue = [];
    this.currentUtteranceId = null;
    this.currentPriority = 0;
    this.currentItem = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.setPlaying(false);
  }

  public cancelScope(prefix: string): void {
    this.queue = this.queue.filter(item => !item.dedupeKey?.startsWith(prefix));
    if (this.currentItem?.dedupeKey?.startsWith(prefix)) this.cancelCurrent();
    this.processQueue();
  }

  private cancelCurrent(): void {
    if (this.pendingTimer !== null) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
    const cancelled = this.currentItem;
    this.currentUtteranceId = null;
    this.currentPriority = 0;
    this.currentItem = null;
    // Invalidate callbacks before cancel(), which may synchronously emit an error.
    try { if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); } catch {}
    this.setPlaying(false);
    cancelled?.onError?.({ error: 'canceled' });
  }

  private cancelAutomaticSpeech(): void {
    this.queue = this.queue.filter(item => item.isExplicit);
    if (this.currentItem && !this.currentItem.isExplicit) this.cancelCurrent();
    this.processQueue();
  }

  private interruptCurrentAndPreempt(highPriorityItem: QueuedUtterance): void {
    this.cancelCurrent();
    this.queue.unshift(highPriorityItem);
    this.processQueue();
  }

  private processQueue(): void {
    if (this.currentUtteranceId !== null || this.queue.length === 0) {
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      // SpeechSynthesis unsupported in this environment
      const item = this.queue.shift();
      item?.onError?.(new Error('SpeechSynthesis not supported'));
      return;
    }

    const synth = window.speechSynthesis;
    const item = this.queue.shift();
    if (!item) return;

    this.currentUtteranceId = item.id;
    this.currentItem = item;
    this.currentPriority = item.priority;

    try {
      const utterance = new SpeechSynthesisUtterance(item.text);
      const chain = LANG_FALLBACK_CHAINS[item.language] || LANG_FALLBACK_CHAINS.en;
      const availableVoices = this.voices.length > 0 ? this.voices : (synth.getVoices ? synth.getVoices() : []);
      const bestVoice = pickBestVoice(availableVoices, chain);

      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang;
      } else {
        utterance.lang = chain[0];
      }

      utterance.onstart = () => {
        if (this.currentUtteranceId === item.id) {
          this.setPlaying(true);
          item.onStart?.();
        }
      };

      utterance.onend = () => {
        if (this.currentUtteranceId === item.id) {
          this.currentUtteranceId = null;
          this.currentPriority = 0;
          this.currentItem = null;
          this.setPlaying(false);
          item.onEnd?.();
          this.processQueue();
        }
      };

      utterance.onerror = (e) => {
        if (this.currentUtteranceId === item.id) {
          this.currentUtteranceId = null;
          this.currentPriority = 0;
          this.currentItem = null;
          this.setPlaying(false);
          if (e.error !== 'interrupted' && e.error !== 'canceled') {
            item.onError?.(e);
          }
          this.processQueue();
        }
      };

      // 50ms buffer for browser TTS engine setup
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        if (this.currentUtteranceId === item.id) {
          synth.speak(utterance);
        }
      }, 50);
    } catch (err) {
      this.currentUtteranceId = null;
      this.currentPriority = 0;
      this.setPlaying(false);
      item.onError?.(err);
      this.processQueue();
    }
  }

  private setPlaying(playing: boolean): void {
    if (this.isPlayingState === playing) return;
    this.isPlayingState = playing;
    this.playListeners.forEach((fn) => {
      try {
        fn(playing);
      } catch {}
    });
  }
}

export const speechCoordinator = new SpeechCoordinator();
