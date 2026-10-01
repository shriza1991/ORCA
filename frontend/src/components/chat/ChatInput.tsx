import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Send, Mic, Square, Loader2, X, PhoneCall } from 'lucide-react';
import { TRANSLATIONS, type SupportedLanguage } from '../../i18n/translations';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useTranslation } from "react-i18next";

interface ChatInputProps {
  language?: SupportedLanguage;
  onSend: (message: string, languageOverride?: 'en' | 'hi' | 'mr') => void;
  onStartCall?: () => void;
  disabled?: boolean;
}

export default function ChatInput({ language = 'en', onSend, onStartCall, disabled }: ChatInputProps) {
    const { t: i18nT } = useTranslation();
  const [text, setText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  const {
    isRecording,
    isTranscribing,
    error: voiceError,
    startRecording,
    stopRecording,
    clearError: clearVoiceError,
    isSupported,
  } = useVoiceRecorder({
    onTranscription: result => {
      if (result && result.transcript) {
        setDetectedLanguage(result.normalized_language);
        setText((prev) => prev ? `${prev} ${result.transcript}` : result.transcript);
      }
    },
  });

  useEffect(() => {
    if (!disabled && !isRecording && !isTranscribing) {
      inputRef.current?.focus();
    }
  }, [disabled, isRecording, isTranscribing]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isRecording || isTranscribing) return;
    onSend(trimmed, detectedLanguage === "en" || detectedLanguage === "hi" || detectedLanguage === "mr" ? detectedLanguage : undefined);
    setDetectedLanguage(null);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePointerDown = async (e: React.PointerEvent) => {
    // Only primary button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (isRecording) return;
    
    // Attempt to request pointer capture so we don't lose the up event if dragged outside
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    await startRecording();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isRecording) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    stopRecording();
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-card">
        {voiceError && (
          <div className="voice-error-pill" role="alert">
            <span>{voiceError}</span>
            <button
              type="button"
              className="voice-error-close"
              onClick={clearVoiceError}
              aria-label="Dismiss error"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {isRecording && (
          <div className="voice-status-pill recording" role="status" aria-live="polite">
            <span className="voice-pulse-dot" />
            <span>{t.recordingIndicator}</span>
            <div className="voice-waveform-mini" aria-hidden="true">
              <span className="waveform-bar bar-1" />
              <span className="waveform-bar bar-2" />
              <span className="waveform-bar bar-3" />
              <span className="waveform-bar bar-4" />
              <span className="waveform-bar bar-5" />
            </div>
          </div>
        )}

        {isTranscribing && (
          <div className="voice-status-pill transcribing" role="status" aria-live="polite">
            <Loader2 size={13} className="spin" />
            <span>{t.transcribingIndicator}</span>
          </div>
        )}

        {detectedLanguage && !isRecording && !isTranscribing && (
          <div className="voice-status-pill detected" role="status">
            <Mic size={13} />
            <span>{i18nT('ChatInput.voicedetectedva', { val: languageLabel(detectedLanguage) })} ? Review harbor and time before sending.</span>
          </div>
        )}

        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={isRecording ? t.recordingIndicator : t.inputPlaceholder}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isRecording || isTranscribing}
          rows={2}
          aria-label={t.sendBtnAria}
        />

        <div className="chat-input-actions-bar">
          <div className="chat-input-actions-left">
            {onStartCall && (
              <button
                type="button"
                className="call-orca-trigger-btn"
                onClick={onStartCall}
                disabled={disabled || isRecording || isTranscribing}
                title={t.callOrcaBtn}
                aria-label={t.callOrcaBtn}
              >
                <span className="call-trigger-pulse-dot" aria-hidden="true" />
                <PhoneCall size={13} />
                <span>{t.callOrcaBtn}</span>
              </button>
            )}
          </div>

          <div className="chat-input-actions-right">
            <button
              type="button"
              className={`chat-mic-btn ptt-btn ${isRecording ? 'is-recording' : ''} ${isTranscribing ? 'is-transcribing' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={e => e.preventDefault()} // Prevent context menu on long press
              disabled={disabled || isTranscribing || !isSupported}
              title={
                !isSupported
                  ? 'Voice recording not supported in this browser'
                  : isRecording
                  ? t.micRecordingAria
                  : isTranscribing
                  ? t.micTranscribingAria
                  : "Hold to Talk"
              }
              aria-label={
                !isSupported
                  ? 'Voice recording not supported in this browser'
                  : isRecording
                  ? t.micRecordingAria
                  : isTranscribing
                  ? t.micTranscribingAria
                  : "Hold to Talk"
              }
            >
              {isTranscribing ? (
                <Loader2 size={16} className="spin" />
              ) : isRecording ? (
                <Square size={14} fill="currentColor" />
              ) : (
                <Mic size={16} />
              )}
            </button>

            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={disabled || isRecording || isTranscribing || !text.trim()}
              aria-label={t.sendBtnAria}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function languageLabel(language: string): string {
  const normalized = language.toLowerCase();
  if (normalized.startsWith('hi')) return 'Hindi';
  if (normalized.startsWith('mr')) return 'Marathi';
  if (normalized.startsWith('ta')) return 'Tamil';
  return 'English';
}

