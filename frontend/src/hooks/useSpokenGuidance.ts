import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportedLanguage } from '../i18n/translations';

export interface SpokenGuidanceOptions {
  language: SupportedLanguage;
}

/**
 * BCP-47 priority fallback chains.
 * Each entry is tried in order until a matching installed voice is found.
 * Marathi falls back to Hindi so Devnagari is always readable on Windows.
 */
const LANG_FALLBACK_CHAINS: Record<SupportedLanguage, string[]> = {
  en: ['en-IN', 'en-US', 'en-GB', 'en'],
  hi: ['hi-IN', 'hi'],
  mr: [
      "आपला प्रवास सुरू करण्यासाठी..."
    ],
    ta: [
      "Start your trip..."
    ],
    te: [
      "Start your trip..."
    ],
};

/**
 * Finds the best installed SpeechSynthesisVoice for a given BCP-47 priority chain.
 * Returns null when no matching voice is available.
 */
function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  chain: string[]
): SpeechSynthesisVoice | null {
  for (const tag of chain) {
    // Exact locale match (e.g. hi-IN)
    const exact = voices.find(
      (v) => v.lang.replace('_', '-').toLowerCase() === tag.toLowerCase()
    );
    if (exact) return exact;

    // Language-prefix match (e.g. "hi" matches "hi-IN")
    const prefix = tag.split('-')[0].toLowerCase();
    const partial = voices.find(
      (v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix)
    );
    if (partial) return partial;
  }
  return null;
}

export function useSpokenGuidance({ language }: SpokenGuidanceOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const synth = window.speechSynthesis;

  // Keep track of the currently speaking utterance so we can cancel it
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingSpeakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechRequestId = useRef(0);

  // Load voices on mount and whenever the browser's voice list changes
  useEffect(() => {
    if (!synth) return;
    const updateVoices = () => setVoices(synth.getVoices());
    updateVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = updateVoices;
    }
    return () => {
      // Clean up listener on unmount
      if (synth.onvoiceschanged === updateVoices) {
        synth.onvoiceschanged = null;
      }
    };
  }, [synth]);

  // Cancel speech when component unmounts
  useEffect(() => {
    return () => {
      speechRequestId.current += 1;
      if (pendingSpeakTimer.current !== null) {
        clearTimeout(pendingSpeakTimer.current);
        pendingSpeakTimer.current = null;
      }
      if (synth) synth.cancel();
    };
  }, [synth]);

  const speak = useCallback(
    (text: string) => {
      if (!synth || !text?.trim()) return;

      // Cancel any currently queued or playing utterance
      speechRequestId.current += 1;
      const requestId = speechRequestId.current;
      if (pendingSpeakTimer.current !== null) {
        clearTimeout(pendingSpeakTimer.current);
        pendingSpeakTimer.current = null;
      }
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance.current = utterance;

      const chain = LANG_FALLBACK_CHAINS[language] || LANG_FALLBACK_CHAINS.en;

      // Use cached voices; also query directly in case state update is lagging
      const availableVoices = voices.length > 0 ? voices : synth.getVoices();

      const bestVoice = pickBestVoice(availableVoices, chain);

      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang; // keep lang consistent with chosen voice
        console.debug(
          `[TTS] language=${language} → voice="${bestVoice.name}" (${bestVoice.lang})`
        );
      } else {
        // At minimum set the lang so the browser can try its internal routing
        utterance.lang = chain[0];
        console.warn(
          `[TTS] No voice found for chain [${chain.join(', ')}]. Falling back to browser default.`
        );
      }

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = (e) => {
        // Cancellation is expected when navigation/action changes replace speech.
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.warn('[TTS] Speech synthesis error:', e.error);
        setIsPlaying(false);
      };

      // 50 ms buffer gives the browser time to swap the TTS engine after cancel()
      pendingSpeakTimer.current = setTimeout(() => {
        pendingSpeakTimer.current = null;
        if (requestId !== speechRequestId.current) return;
        synth.speak(utterance);
      }, 50);
    },
    [language, synth, voices]
  );

  const stop = useCallback(() => {
    if (synth) {
      speechRequestId.current += 1;
      if (pendingSpeakTimer.current !== null) {
        clearTimeout(pendingSpeakTimer.current);
        pendingSpeakTimer.current = null;
      }
      synth.cancel();
      currentUtterance.current = null;
      setIsPlaying(false);
    }
  }, [synth]);

  return { speak, stop, isPlaying };
}

