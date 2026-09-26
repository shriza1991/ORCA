import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportedLanguage } from '../i18n/translations';

export interface SpokenGuidanceOptions {
  language: SupportedLanguage;
}

export function useSpokenGuidance({ language }: SpokenGuidanceOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  
  // Keep track of the currently speaking utterance so we can cancel it
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

  // Load voices on mount
  useEffect(() => {
    if (!synth) return;
    const updateVoices = () => {
      setVoices(synth.getVoices());
    };
    updateVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }
  }, [synth]);

  // Stop speaking when component unmounts
  useEffect(() => {
    return () => {
      if (synth) synth.cancel();
    };
  }, [synth]);

  const speak = useCallback(
    (text: string) => {
      if (!synth) return;

      // Cancel any ongoing speech
      synth.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance.current = utterance;

      // Map our SupportedLanguage to BCP 47 language tags
      const langMap: Record<SupportedLanguage, string> = {
        en: 'en-IN',
        hi: 'hi-IN',
        mr: 'mr-IN',
      };
      
      const targetLang = langMap[language] || 'en-IN';
      utterance.lang = targetLang;
      
      // Explicitly try to select a matching voice if available, especially on Windows
      const availableVoices = voices.length > 0 ? voices : synth.getVoices();
      if (availableVoices.length > 0) {
        // Try exact locale match first (e.g. hi-IN)
        let bestVoice = availableVoices.find(v => v.lang.replace('_', '-') === targetLang);
        
        // Fallback to language prefix match (e.g. hi)
        if (!bestVoice) {
           const prefix = targetLang.split('-')[0];
           bestVoice = availableVoices.find(v => v.lang.replace('_', '-').startsWith(prefix));
        }
        
        if (bestVoice) {
          utterance.voice = bestVoice;
        } else {
          console.warn(`No TTS voice found for language: ${targetLang}`);
        }
      } else {
         console.warn('No TTS voices available in the browser.');
      }
      
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = (e) => {
        console.warn('Speech synthesis error:', e);
        setIsPlaying(false);
      };

      // Sometimes calling speak too quickly after initialization fails on some browsers.
      // Small timeout helps ensure the voice engine is ready.
      setTimeout(() => {
        synth.speak(utterance);
      }, 50);
    },
    [language, synth, voices]
  );

  const stop = useCallback(() => {
    if (synth) {
      synth.cancel();
      setIsPlaying(false);
    }
  }, [synth]);

  return {
    speak,
    stop,
    isPlaying,
  };
}
