import { useState, useRef, useCallback, useEffect } from 'react';
import { sendVoiceChat, ApiError } from '../api/client';

export type CallState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'HEARING_YOU'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'ERROR'
  | 'ENDED';

export interface CallTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  language?: string;
  timestamp: Date;
}

export interface UseCallSessionOptions {
  originHarbor?: string;
  craftProfile?: string;
  silenceTimeoutMs?: number; // Configurable silence duration before auto-turn completion (~3000ms)
  speechThreshold?: number;  // RMS volume threshold for speech detection (default: 0.032)
  minSpeechDurationMs?: number; // Minimum speech duration before confirming user speech (default: 300ms)
  onCallEnd?: () => void;
}

export interface UseCallSessionReturn {
  callState: CallState;
  duration: number;
  formattedDuration: string;
  conversationId: string | null;
  detectedLanguage: string | null;
  transcriptHistory: CallTurn[];
  volumeLevel: number;
  error: string | null;
  isMuted: boolean;
  startCall: () => Promise<void>;
  finishSpeakingTurn: () => void;
  toggleMute: () => void;
  retryTurn: () => void;
  endCall: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function generateTurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useCallSession({
  originHarbor = 'Ratnagiri',
  craftProfile = 'motorized_boat',
  silenceTimeoutMs = 3000,
  speechThreshold = 0.032,
  minSpeechDurationMs = 300,
  onCallEnd,
}: UseCallSessionOptions = {}): UseCallSessionReturn {
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [duration, setDuration] = useState<number>(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [transcriptHistory, setTranscriptHistory] = useState<CallTurn[]>([]);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // References
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const conversationIdRef = useRef<string | null>(null);
  const callActiveRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const callStateRef = useRef<CallState>('IDLE');

  // VAD state trackers
  const speechOnsetStartTimeRef = useRef<number | null>(null);
  const isUserSpeakingRef = useRef<boolean>(false);
  const silenceTimeoutTimerRef = useRef<any>(null);

  // Synchronize ref for inner loops
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Clear VAD timers
  const clearVadTimers = useCallback(() => {
    if (silenceTimeoutTimerRef.current) {
      clearTimeout(silenceTimeoutTimerRef.current);
      silenceTimeoutTimerRef.current = null;
    }
    speechOnsetStartTimeRef.current = null;
    isUserSpeakingRef.current = false;
  }, []);

  // Cleanup audio playback
  const cleanupAudioPlayback = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
  }, []);

  // Cleanup media streams
  const cleanupMediaStream = useCallback(() => {
    clearVadTimers();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setVolumeLevel(0);
  }, [clearVadTimers]);

  // Core turn execution: begins recording for a new speech turn
  const startListeningTurn = useCallback(() => {
    if (!callActiveRef.current || isMutedRef.current) return;

    clearVadTimers();
    audioChunksRef.current = [];
    setCallState('LISTENING');
    callStateRef.current = 'LISTENING';
    setError(null);

    if (!streamRef.current || !streamRef.current.active) return;

    try {
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          mimeType = 'audio/wav';
        }
      }

      const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(200);
    } catch {
      setCallState('ERROR');
      callStateRef.current = 'ERROR';
      setError('Failed to record audio. Please check microphone permissions.');
    }
  }, [clearVadTimers]);

  // Process captured audio turn through /api/v1/voice/chat and play TTS response
  const processCapturedAudio = useCallback(async (audioBlob: Blob) => {
    if (!callActiveRef.current) return;

    if (audioBlob.size < 250) {
      // Audio empty or negligible -> reset to listening
      startListeningTurn();
      return;
    }

    setCallState('PROCESSING');
    callStateRef.current = 'PROCESSING';
    clearVadTimers();
    setError(null);

    try {
      const response = await sendVoiceChat(audioBlob, {
        conversation_id: conversationIdRef.current || undefined,
        origin_harbor: originHarbor,
        craft_profile: craftProfile,
        language_preference: 'auto',
      });

      if (!callActiveRef.current) return;

      // Update conversation ID
      if (response.conversation_id && !conversationIdRef.current) {
        conversationIdRef.current = response.conversation_id;
        setConversationId(response.conversation_id);
      }

      // Update detected language
      if (response.detected_language) {
        setDetectedLanguage(response.detected_language);
      }

      // Append turns
      const userTurn: CallTurn = {
        id: generateTurnId(),
        role: 'user',
        text: response.transcript || '(Audio Query)',
        language: response.detected_language,
        timestamp: new Date(),
      };

      const assistantTurn: CallTurn = {
        id: generateTurnId(),
        role: 'assistant',
        text: response.answer,
        language: response.language,
        timestamp: new Date(),
      };

      setTranscriptHistory(prev => [...prev, userTurn, assistantTurn]);

      // Play audio response if available
      if (response.audio_base64) {
        setCallState('SPEAKING');
        callStateRef.current = 'SPEAKING';

        const binaryString = atob(response.audio_base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: response.audio_format || 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          if (callActiveRef.current) {
            // Guard interval before re-enabling listening to avoid capturing speaker echo
            setTimeout(() => {
              if (callActiveRef.current) {
                startListeningTurn();
              }
            }, 200);
          }
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          if (callActiveRef.current) {
            startListeningTurn();
          }
        };

        await audio.play();
      } else {
        // If no audio was synthesized, wait briefly and resume listening
        setTimeout(() => {
          if (callActiveRef.current) {
            startListeningTurn();
          }
        }, 2000);
      }
    } catch (err) {
      if (!callActiveRef.current) return;

      let msg = 'Failed to process voice query.';
      if (err instanceof ApiError) {
        if (typeof err.body === 'object' && err.body !== null && 'detail' in err.body) {
          msg = String((err.body as Record<string, unknown>).detail);
        } else if (err.status === 503) {
          msg = 'Voice service is currently unconfigured or offline.';
        } else {
          msg = `Voice API Error (${err.status}): ${err.statusText}`;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }

      setCallState('ERROR');
      callStateRef.current = 'ERROR';
      setError(msg);
    }
  }, [clearVadTimers, craftProfile, originHarbor, startListeningTurn]);

  // Finalize speech turn (triggered automatically by VAD silence timeout or manual fallback)
  const finishSpeakingTurn = useCallback(() => {
    const currentState = callStateRef.current;
    if (currentState !== 'LISTENING' && currentState !== 'HEARING_YOU') return;
    if (!mediaRecorderRef.current) return;

    clearVadTimers();

    const recorder = mediaRecorderRef.current;
    if (recorder.state === 'recording') {
      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        processCapturedAudio(audioBlob);
      };
      recorder.stop();
    }
  }, [clearVadTimers, processCapturedAudio]);

  // Real-time Voice Activity Detection (VAD) loop
  const startVadAnalyser = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const timeDomainData = new Uint8Array(analyser.fftSize);

      const vadLoop = () => {
        if (!callActiveRef.current || !analyserRef.current) return;

        analyserRef.current.getByteTimeDomainData(timeDomainData);

        // Compute RMS energy
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const val = (timeDomainData[i] - 128) / 128;
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        const normalizedVol = Math.min(1, rms * 6);
        setVolumeLevel(normalizedVol);

        const currentState = callStateRef.current;

        // VAD only operates during user input phases (LISTENING or HEARING_YOU)
        // While SAMUDRA is SPEAKING or PROCESSING, VAD is dormant to prevent speaker echo
        if ((currentState === 'LISTENING' || currentState === 'HEARING_YOU') && !isMutedRef.current) {
          const now = Date.now();

          if (rms >= speechThreshold) {
            // Speech detected
            if (!speechOnsetStartTimeRef.current) {
              speechOnsetStartTimeRef.current = now;
            } else if (now - speechOnsetStartTimeRef.current >= minSpeechDurationMs) {
              // Sustained speech confirmed (not a momentary noise spike)
              if (!isUserSpeakingRef.current) {
                isUserSpeakingRef.current = true;
                setCallState('HEARING_YOU');
                callStateRef.current = 'HEARING_YOU';
              }
              // Reset any pending silence timeout since user is speaking
              if (silenceTimeoutTimerRef.current) {
                clearTimeout(silenceTimeoutTimerRef.current);
                silenceTimeoutTimerRef.current = null;
              }
            }
          } else {
            // Signal below speech threshold (silence/pause)
            speechOnsetStartTimeRef.current = null;

            if (isUserSpeakingRef.current) {
              // User was speaking and has now paused/stopped
              if (!silenceTimeoutTimerRef.current) {
                silenceTimeoutTimerRef.current = setTimeout(() => {
                  if (callActiveRef.current && callStateRef.current === 'HEARING_YOU') {
                    // ~3 seconds silence reached -> finalize speech turn automatically!
                    finishSpeakingTurn();
                  }
                }, silenceTimeoutMs);
              }
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(vadLoop);
      };

      vadLoop();
    } catch {
      // Web Audio VAD fallback
    }
  }, [finishSpeakingTurn, minSpeechDurationMs, silenceTimeoutMs, speechThreshold]);

  // Start Call
  const startCall = useCallback(async () => {
    cleanupAudioPlayback();
    cleanupMediaStream();

    const newConvId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `call_${Date.now()}`;

    conversationIdRef.current = newConvId;
    setConversationId(newConvId);
    setTranscriptHistory([]);
    setDetectedLanguage(null);
    setError(null);
    setDuration(0);
    callActiveRef.current = true;
    isMutedRef.current = false;
    setIsMuted(false);
    setCallState('CONNECTING');
    callStateRef.current = 'CONNECTING';

    // Start duration timer
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);

    // Request Microphone Access
    if (!navigator.mediaDevices?.getUserMedia) {
      setCallState('ERROR');
      callStateRef.current = 'ERROR';
      setError('Microphone access is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!callActiveRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      startVadAnalyser(stream);

      // Begin first listening turn
      startListeningTurn();
    } catch (err: unknown) {
      setCallState('ERROR');
      callStateRef.current = 'ERROR';
      const isDenied = (err as Error)?.name === 'NotAllowedError' || (err as Error)?.name === 'PermissionDeniedError';
      setError(
        isDenied
          ? 'Microphone permission denied. Please allow microphone access to talk with SAMUDRA.'
          : 'Unable to connect to audio input device.'
      );
    }
  }, [cleanupAudioPlayback, cleanupMediaStream, startListeningTurn, startVadAnalyser]);

  // End Call
  const endCall = useCallback(() => {
    callActiveRef.current = false;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    cleanupAudioPlayback();
    cleanupMediaStream();
    setCallState('ENDED');
    callStateRef.current = 'ENDED';
    onCallEnd?.();
  }, [cleanupAudioPlayback, cleanupMediaStream, onCallEnd]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }

    if (nextMuted) {
      clearVadTimers();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
    } else if (!nextMuted && callActiveRef.current && (callStateRef.current === 'LISTENING' || callStateRef.current === 'HEARING_YOU')) {
      startListeningTurn();
    }
  }, [clearVadTimers, isMuted, startListeningTurn]);

  // Retry Turn after error
  const retryTurn = useCallback(() => {
    setError(null);
    startListeningTurn();
  }, [startListeningTurn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      callActiveRef.current = false;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      cleanupAudioPlayback();
      cleanupMediaStream();
    };
  }, [cleanupAudioPlayback, cleanupMediaStream]);

  return {
    callState,
    duration,
    formattedDuration: formatDuration(duration),
    conversationId,
    detectedLanguage,
    transcriptHistory,
    volumeLevel,
    error,
    isMuted,
    startCall,
    finishSpeakingTurn,
    toggleMute,
    retryTurn,
    endCall,
  };
}
