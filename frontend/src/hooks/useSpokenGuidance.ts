import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportedLanguage } from '../i18n/translations';

export interface SpokenGuidanceOptions {
  language: SupportedLanguage;
}

export function useSpokenGuidance({ language }: SpokenGuidanceOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const synth = window.speechSynthesis;
  
  // Keep track of the currently speaking utterance so we can cancel it
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

  // Stop speaking when component unmounts
  useEffect(() => {
    return () => {
      synth.cancel();
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
      const voices = synth.getVoices();
      if (voices.length > 0) {
        // Try exact locale match first (e.g. hi-IN)
        let bestVoice = voices.find(v => v.lang.replace('_', '-') === targetLang);
        // Fallback to language prefix match (e.g. hi)
        if (!bestVoice) {
           const prefix = targetLang.split('-')[0];
           bestVoice = voices.find(v => v.lang.replace('_', '-').startsWith(prefix));
        }
        if (bestVoice) {
          utterance.voice = bestVoice;
        }
      }
      
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      synth.speak(utterance);
    },
    [language, synth]
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
