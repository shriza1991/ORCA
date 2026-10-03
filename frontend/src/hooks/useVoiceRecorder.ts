import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio, ApiError } from '../api/client';
import type { TranscribeResponse } from '../types/contracts';

export interface UseVoiceRecorderOptions {
  onTranscription?: (result: TranscribeResponse) => void;
  onError?: (error: string) => void;
}

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  clearError: () => void;
  isSupported: boolean;
}

export function useVoiceRecorder({
  onTranscription,
  onError,
}: UseVoiceRecorderOptions = {}): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const recorderGenRef = useRef<number>(0);
  const permissionPendingRef = useRef(false);
  const isMountedRef = useRef<boolean>(true);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isCancelledRef.current = true;
      recorderGenRef.current++;
      cleanupStream();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
    };
  }, [cleanupStream]);

  const startRecording = useCallback(async () => {
    if (permissionPendingRef.current || mediaRecorderRef.current?.state === "recording") return;
    mediaRecorderRef.current = null;
    setError(null);
    isCancelledRef.current = false;
    audioChunksRef.current = [];
    const currentGen = ++recorderGenRef.current;

    if (!isSupported) {
      const errMsg = 'Voice recording is not supported in this browser environment.';
      setError(errMsg);
      onError?.(errMsg);
      return;
    }

    try {
      permissionPendingRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // If user released, cancelled, or component unmounted while waiting for permission:
      if (!isMountedRef.current || isCancelledRef.current || recorderGenRef.current !== currentGen) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      permissionPendingRef.current = false;
      streamRef.current = stream;

      // Determine best supported MIME type
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (recorderGenRef.current !== currentGen || isCancelledRef.current || !isMountedRef.current) {
          stream.getTracks().forEach(track => track.stop()); return;
        }
        cleanupStream();
        if (isMountedRef.current) {
          setIsRecording(false);
        }

        if (isCancelledRef.current || recorderGenRef.current !== currentGen || !isMountedRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const chunks = audioChunksRef.current;
        if (!chunks || chunks.length === 0) {
          return;
        }

        const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];

        if (audioBlob.size < 100) {
          // Audio too short / empty
          return;
        }

        if (isMountedRef.current) {
          setIsTranscribing(true);
        }
        try {
          const result = await transcribeAudio(audioBlob);
          // Check if cancelled during transcription
          if (isCancelledRef.current || recorderGenRef.current !== currentGen || !isMountedRef.current) {
            return;
          }
          if (result && result.transcript) {
            onTranscription?.(result);
          } else {
            const warnMsg = 'No speech was recognized in the recording. Please try again.';
            setError(warnMsg);
            onError?.(warnMsg);
          }
        } catch (err) {
          if (isCancelledRef.current || recorderGenRef.current !== currentGen || !isMountedRef.current) {
            return;
          }
          let msg = 'Voice transcription failed. Please try again or type your message.';
          if (err instanceof ApiError) {
            if (typeof err.body === 'object' && err.body !== null && 'detail' in err.body) {
              msg = String((err.body as Record<string, unknown>).detail);
            } else if (err.status === 503) {
              msg = 'Voice service is currently unconfigured or offline. Please type your query.';
            }
          } else if (err instanceof Error) {
            msg = err.message;
          }
          setError(msg);
          onError?.(msg);
        } finally {
          if (isMountedRef.current && recorderGenRef.current === currentGen) {
            setIsTranscribing(false);
          }
        }
      };

      recorder.onerror = () => {
        if (recorderGenRef.current !== currentGen || !isMountedRef.current) return;
        cleanupStream();
        if (isMountedRef.current) {
          setIsRecording(false);
          setIsTranscribing(false);
          const errMsg = 'An error occurred during audio recording.';
          setError(errMsg);
          onError?.(errMsg);
        }
      };

      recorder.start(250);
      if (isMountedRef.current) {
        setIsRecording(true);
      }
    } catch (err: any) {
      if (recorderGenRef.current !== currentGen || isCancelledRef.current || !isMountedRef.current) return;
      permissionPendingRef.current = false;
      cleanupStream();
      if (isMountedRef.current) {
        setIsRecording(false);
        let errMsg = 'Failed to access microphone.';
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          errMsg = 'Microphone permission was denied. Please allow microphone access to use voice input.';
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          errMsg = 'No microphone device was found.';
        } else if (err?.message) {
          errMsg = err.message;
        }
        setError(errMsg);
        onError?.(errMsg);
      }
    }
  }, [isSupported, cleanupStream, onTranscription, onError]);

  const stopRecording = useCallback(() => {
    if (permissionPendingRef.current) {
      permissionPendingRef.current = false;
      // Permission request still pending when stopped -> cancel it
      isCancelledRef.current = true;
      recorderGenRef.current++;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        cleanupStream();
        setIsRecording(false);
      }
    } else {
      cleanupStream();
      setIsRecording(false);
    }
  }, [cleanupStream]);

  const cancelRecording = useCallback(() => {
    isCancelledRef.current = true;
    permissionPendingRef.current = false;
    recorderGenRef.current++;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        cleanupStream();
        setIsRecording(false);
      }
    } else {
      cleanupStream();
      setIsRecording(false);
    }
    cleanupStream();
    setIsRecording(false);
    setIsTranscribing(false);
    audioChunksRef.current = [];
  }, [cleanupStream]);

  return {
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
    isSupported,
  };
}
