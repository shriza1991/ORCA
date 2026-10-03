import { useState, useRef, useCallback, useEffect } from 'react';
import { sendVoiceChat, ApiError } from '../api/client';
import { speechCoordinator } from '../utils/speech-coordinator';
import type { TripAssessmentResponse } from '../types/assessment';
import { getMissionIdentityKey } from '../utils/mission-proposal';

export type CallState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'HEARING_YOU'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'ERROR'
  | 'PAUSED'
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
  vesselSize?: string;
  coordinates?: [number, number];
  departureTime?: string;
  returnTime?: string;
  targetPfz?: string;
  parentAssessmentId?: string;
  baselineAssessmentId?: string;
  evidenceBundleId?: string;
  dataMode?: string;
  isBaselineApplicable?: boolean;
  isBaselineLoading?: boolean;
  isBaselineExpired?: boolean;
  silenceTimeoutMs?: number; // Configurable silence duration before auto-turn completion (~3000ms)
  speechThreshold?: number;  // RMS volume threshold for speech detection (default: 0.032)
  minSpeechDurationMs?: number; // Minimum speech duration before confirming user speech (default: 300ms)
  onCallEnd?: () => void;
  onApplyProposal?: (assessment: TripAssessmentResponse) => void;
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
  pendingProposal: TripAssessmentResponse | null;
  applyPendingProposal: () => void;
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
  vesselSize = 'medium',
  coordinates,
  departureTime,
  returnTime,
  targetPfz,
  parentAssessmentId,
  baselineAssessmentId,
  evidenceBundleId,
  dataMode,
  isBaselineApplicable,
  isBaselineLoading,
  isBaselineExpired,
  silenceTimeoutMs = 3000,
  speechThreshold = 0.032,
  minSpeechDurationMs = 300,
  onCallEnd,
  onApplyProposal,
}: UseCallSessionOptions = {}): UseCallSessionReturn {
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [duration, setDuration] = useState<number>(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [transcriptHistory, setTranscriptHistory] = useState<CallTurn[]>([]);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [pendingProposal, setPendingProposal] = useState<TripAssessmentResponse | null>(null);

  // Generational trackers to eliminate race conditions across restarts and turns
  const callGenRef = useRef<number>(0);
  const turnGenRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // References
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const resumeTimerRef = useRef<any>(null);
  const conversationIdRef = useRef<string | null>(null);
  const callActiveRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const callStateRef = useRef<CallState>('IDLE');
  const isSubmittingTurnRef = useRef<boolean>(false);

  // VAD state trackers
  const speechOnsetStartTimeRef = useRef<number | null>(null);
  const isUserSpeakingRef = useRef<boolean>(false);
  const silenceTimeoutTimerRef = useRef<any>(null);

  // Synchronize ref for inner loops
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Track mission parameter changes during an active call
  const activeMissionKeyRef = useRef<string>('');
  const currentMissionKey = getMissionIdentityKey({
    origin_harbor: originHarbor,
    coordinates,
    craft_profile: craftProfile,
    vessel_size: vesselSize,
    departure_time: departureTime,
    return_time: returnTime,
    target_pfz: targetPfz,
    data_mode: dataMode,
  });

  // Clear VAD timers
  const clearVadTimers = useCallback(() => {
    if (silenceTimeoutTimerRef.current) {
      clearTimeout(silenceTimeoutTimerRef.current);
      silenceTimeoutTimerRef.current = null;
    }
    speechOnsetStartTimeRef.current = null;
    isUserSpeakingRef.current = false;
  }, []);

  // Cleanup audio playback and revoke object URL
  const cleanupAudioPlayback = useCallback(() => {
    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch {}
      activeAudioUrlRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
      } catch {}
      currentAudioRef.current = null;
    }
  }, []);

  // Clear resume timers
  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  // Cleanup media streams and web audio
  const cleanupMediaStream = useCallback(() => {
    clearVadTimers();
    clearResumeTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
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
  }, [clearResumeTimer, clearVadTimers]);

  // Invalidate turn if mission parameters change while call is active
  useEffect(() => {
    if (callActiveRef.current && activeMissionKeyRef.current && activeMissionKeyRef.current !== currentMissionKey) {
      // Mission context changed during call -> invalidate current turn
      turnGenRef.current++;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      cleanupAudioPlayback();
      clearVadTimers();
      clearResumeTimer();
      setCallState('PAUSED');
      callStateRef.current = 'PAUSED';
      setError('Mission plan was updated. Please tap to speak for the updated mission.');
    }
    activeMissionKeyRef.current = currentMissionKey;
  }, [currentMissionKey, cleanupAudioPlayback, clearResumeTimer, clearVadTimers]);

  // Core turn execution: begins recording for a new speech turn
  const startListeningTurn = useCallback(() => {
    if (!callActiveRef.current || isMutedRef.current) return;

    clearVadTimers();
    clearResumeTimer();
    isSubmittingTurnRef.current = false;
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

      recorder.ondataavailable = (e) => {
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
  }, [clearResumeTimer, clearVadTimers]);

  // Process captured audio turn through /api/v1/voice/chat and play TTS response
  const processCapturedAudio = useCallback(async (audioBlob: Blob) => {
    const currentCallGen = callGenRef.current;
    const currentTurnGen = ++turnGenRef.current;

    if (!callActiveRef.current || currentCallGen !== callGenRef.current) return;

    if (audioBlob.size < 250) {
      // Audio empty or negligible -> reset to listening
      startListeningTurn();
      return;
    }

    setCallState('PROCESSING');
    callStateRef.current = 'PROCESSING';
    clearVadTimers();
    clearResumeTimer();
    setError(null);

    // Prepare fresh AbortController for this turn's request
    abortControllerRef.current?.abort();
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const response = await sendVoiceChat(audioBlob, {
        conversation_id: conversationIdRef.current || undefined,
        origin_harbor: originHarbor,
        craft_profile: craftProfile,
        vessel_size: vesselSize,
        coordinates,
        departure_time: departureTime,
        return_time: returnTime,
        target_pfz: targetPfz,
        parent_assessment_id: isBaselineApplicable && !isBaselineExpired && !isBaselineLoading ? parentAssessmentId : undefined,
        baseline_assessment_id: isBaselineApplicable && !isBaselineExpired && !isBaselineLoading ? baselineAssessmentId : undefined,
        evidence_bundle_id: isBaselineApplicable && !isBaselineExpired && !isBaselineLoading ? evidenceBundleId : undefined,
        data_mode: dataMode,
        language_preference: 'auto',
        signal: abortCtrl.signal,
      });

      // Verify call and turn generations are still current
      if (
        !callActiveRef.current ||
        currentCallGen !== callGenRef.current ||
        currentTurnGen !== turnGenRef.current ||
        abortCtrl.signal.aborted
      ) {
        return;
      }

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

      setTranscriptHistory((prev) => [...prev, userTurn, assistantTurn]);

      // If response includes a proposed mission assessment, hold it for explicit user review
      if (response.mission_assessment) {
        setPendingProposal(response.mission_assessment as TripAssessmentResponse);
      }

      // Play audio response if available from backend TTS
      if (response.audio_base64 && response.audio_base64.length > 50) {
        setCallState('SPEAKING');
        callStateRef.current = 'SPEAKING';

        const binaryString = atob(response.audio_base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: response.audio_format || 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        activeAudioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;

        audio.onended = () => {
          cleanupAudioPlayback();
          if (callActiveRef.current && currentCallGen === callGenRef.current && currentTurnGen === turnGenRef.current) {
            // Guard interval before re-enabling listening to avoid capturing speaker echo
            clearResumeTimer();
            resumeTimerRef.current = setTimeout(() => {
              resumeTimerRef.current = null;
              if (callActiveRef.current && currentCallGen === callGenRef.current) {
                startListeningTurn();
              }
            }, 300);
          }
        };

        audio.onerror = () => {
          cleanupAudioPlayback();
          if (callActiveRef.current && currentCallGen === callGenRef.current && currentTurnGen === turnGenRef.current) {
            clearResumeTimer();
            resumeTimerRef.current = setTimeout(() => {
              resumeTimerRef.current = null;
              if (callActiveRef.current && currentCallGen === callGenRef.current) {
                startListeningTurn();
              }
            }, 300);
          }
        };

        await audio.play();
      } else {
        // Fall back to browser speech synthesis when server audio is absent.
        // Preserves the valid text answer and does NOT retry assessment.
        setCallState('SPEAKING');
        callStateRef.current = 'SPEAKING';

        const spoke = speechCoordinator.speak(response.answer, {
          isExplicit: true,
          language: (response.language as any) || 'en',
          onEnd: () => {
            if (callActiveRef.current && currentCallGen === callGenRef.current && currentTurnGen === turnGenRef.current) {
              clearResumeTimer();
              resumeTimerRef.current = setTimeout(() => {
                resumeTimerRef.current = null;
                if (callActiveRef.current && currentCallGen === callGenRef.current) {
                  startListeningTurn();
                }
              }, 300);
            }
          },
          onError: () => {
            if (callActiveRef.current && currentCallGen === callGenRef.current && currentTurnGen === turnGenRef.current) {
              clearResumeTimer();
              resumeTimerRef.current = setTimeout(() => {
                resumeTimerRef.current = null;
                if (callActiveRef.current && currentCallGen === callGenRef.current) {
                  startListeningTurn();
                }
              }, 1500);
            }
          },
        });

        if (!spoke) {
          // If speech couldn't start (unsupported browser), pause briefly and resume listening
          clearResumeTimer();
          resumeTimerRef.current = setTimeout(() => {
            resumeTimerRef.current = null;
            if (callActiveRef.current && currentCallGen === callGenRef.current) {
              startListeningTurn();
            }
          }, 2000);
        }
      }
    } catch (err: unknown) {
      if (!callActiveRef.current || currentCallGen !== callGenRef.current || abortCtrl.signal.aborted) {
        return;
      }

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
    } finally {
      isSubmittingTurnRef.current = false;
    }
  }, [
    baselineAssessmentId,
    cleanupAudioPlayback,
    clearResumeTimer,
    clearVadTimers,
    coordinates,
    craftProfile,
    dataMode,
    departureTime,
    evidenceBundleId,
    isBaselineApplicable,
    isBaselineExpired,
    isBaselineLoading,
    originHarbor,
    parentAssessmentId,
    returnTime,
    startListeningTurn,
    targetPfz,
    vesselSize,
  ]);

  // Finalize speech turn (triggered automatically by VAD silence timeout or manual fallback)
  const finishSpeakingTurn = useCallback(() => {
    const currentState = callStateRef.current;
    if (currentState !== 'LISTENING' && currentState !== 'HEARING_YOU') return;
    if (isSubmittingTurnRef.current) return;
    if (!mediaRecorderRef.current) return;

    isSubmittingTurnRef.current = true;
    clearVadTimers();

    const recorder = mediaRecorderRef.current;
    if (recorder.state === 'recording') {
      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        processCapturedAudio(audioBlob);
      };
      try {
        recorder.stop();
      } catch {
        isSubmittingTurnRef.current = false;
      }
    } else {
      isSubmittingTurnRef.current = false;
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

        // Compute Root-Mean-Square (RMS) volume level normalized to 0.0 - 1.0
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const norm = (timeDomainData[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        setVolumeLevel(rms);

        const currentTurnState = callStateRef.current;
        if (!isMutedRef.current && (currentTurnState === 'LISTENING' || currentTurnState === 'HEARING_YOU')) {
          if (rms > speechThreshold) {
            // Speech detected
            if (silenceTimeoutTimerRef.current) {
              clearTimeout(silenceTimeoutTimerRef.current);
              silenceTimeoutTimerRef.current = null;
            }

            const now = Date.now();
            if (speechOnsetStartTimeRef.current === null) {
              speechOnsetStartTimeRef.current = now;
            } else if (now - speechOnsetStartTimeRef.current >= minSpeechDurationMs) {
              isUserSpeakingRef.current = true;
              if (currentTurnState === 'LISTENING') {
                setCallState('HEARING_YOU');
                callStateRef.current = 'HEARING_YOU';
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
    // Increment call generation to invalidate previous in-flight turns
    const currentCallGen = ++callGenRef.current;
    turnGenRef.current++;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

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
    setPendingProposal(null);
    callActiveRef.current = true;
    isMutedRef.current = false;
    setIsMuted(false);
    setCallState('CONNECTING');
    callStateRef.current = 'CONNECTING';

    // Notify speech coordinator that call mode is active (suppresses background alert speech)
    speechCoordinator.setCallActive(true);

    // Request Microphone Access
    if (!navigator.mediaDevices?.getUserMedia) {
      callActiveRef.current = false;
      setCallState('ERROR');
      callStateRef.current = 'ERROR';
      setError('Microphone access is not supported in this browser.');
      speechCoordinator.setCallActive(false);
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

      if (!callActiveRef.current || currentCallGen !== callGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Start duration timer only after permission is successfully acquired
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      startVadAnalyser(stream);

      // Begin first listening turn
      startListeningTurn();
    } catch (err: unknown) {
      callActiveRef.current = false;
      setCallState('ERROR');
      callStateRef.current = 'ERROR';
      speechCoordinator.setCallActive(false);
      const isDenied = (err as Error)?.name === 'NotAllowedError' || (err as Error)?.name === 'PermissionDeniedError';
      setError(
        isDenied
          ? 'Microphone permission denied. Please allow microphone access to talk with ORCA.'
          : 'Unable to connect to audio input device.'
      );
    }
  }, [cleanupAudioPlayback, cleanupMediaStream, startListeningTurn, startVadAnalyser]);

  // End Call
  const endCall = useCallback(() => {
    callGenRef.current++;
    turnGenRef.current++;
    callActiveRef.current = false;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

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
    speechCoordinator.setCallActive(false);
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
      streamRef.current.getAudioTracks().forEach((track) => {
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

  // Apply pending proposal surfaced during call
  const applyPendingProposal = useCallback(() => {
    if (pendingProposal && onApplyProposal) {
      onApplyProposal(pendingProposal);
      setPendingProposal(null);
    }
  }, [onApplyProposal, pendingProposal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      callGenRef.current++;
      turnGenRef.current++;
      callActiveRef.current = false;
      abortControllerRef.current?.abort();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      cleanupAudioPlayback();
      cleanupMediaStream();
      speechCoordinator.setCallActive(false);
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
    pendingProposal,
    applyPendingProposal,
    startCall,
    finishSpeakingTurn,
    toggleMute,
    retryTurn,
    endCall,
  };
}
