import { useCallback, useEffect, useState } from "react";
import { SupportedLanguage } from "../i18n/translations";
import { speechCoordinator, type SpeakOptions } from "../utils/speech-coordinator";

export interface SpokenGuidanceOptions {
  language: SupportedLanguage;
}

export function useSpokenGuidance({ language }: SpokenGuidanceOptions) {
  const [isPlaying, setIsPlaying] = useState<boolean>(speechCoordinator.isPlaying());
  const [isMuted, setIsMuted] = useState<boolean>(speechCoordinator.getMuted());

  useEffect(() => {
    const unsubPlay = speechCoordinator.subscribePlayState(setIsPlaying);
    const unsubMute = speechCoordinator.subscribeMute(setIsMuted);
    return () => {
      unsubPlay();
      unsubMute();
    };
  }, []);

  const speak = useCallback(
    (text: string, options: Omit<SpeakOptions, 'language'> = {}) => {
      return speechCoordinator.speak(text, {
        language,
        ...options,
      });
    },
    [language],
  );

  const stop = useCallback(() => {
    speechCoordinator.stop();
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    speechCoordinator.setMuted(muted);
  }, []);

  const toggleMute = useCallback(() => {
    return speechCoordinator.toggleMute();
  }, []);

  return {
    speak,
    stop,
    isPlaying,
    isMuted,
    setMuted,
    toggleMute,
  };
}
