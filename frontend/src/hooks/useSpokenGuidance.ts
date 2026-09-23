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
      
      utterance.lang = langMap[language] || 'en-IN';
      
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
