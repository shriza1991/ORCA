import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Loader2,
  Anchor,
  Globe,
  RefreshCw,
  X,
  Radio,
  SendHorizontal,
  Sparkles,
} from 'lucide-react';
import type { SupportedLanguage } from '../../i18n/translations';
import { TRANSLATIONS } from '../../i18n/translations';
import { useCallSession } from '../../hooks/useCallSession';

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: SupportedLanguage;
  originHarbor?: string;
  craftProfile?: string;
}

function getLanguageLabel(code: string | null): { name: string; flag: string } {
  if (!code) return { name: 'Multi-lingual Auto', flag: '🌐' };
  const lower = code.toLowerCase();
  if (lower.startsWith('mr')) return { name: 'मराठी (Marathi)', flag: '🇮🇳' };
  if (lower.startsWith('hi')) return { name: 'हिन्दी (Hindi)', flag: '🇮🇳' };
  if (lower.startsWith('en')) return { name: 'English', flag: '🌐' };
  if (lower.startsWith('ta')) return { name: 'தமிழ் (Tamil)', flag: '🇮🇳' };
  return { name: code, flag: '🌐' };
}

export default function CallModal({
  isOpen,
  onClose,
  language = 'en',
  originHarbor = 'Ratnagiri',
  craftProfile = 'motorized_boat',
}: CallModalProps) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    callState,
    formattedDuration,
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
  } = useCallSession({
    originHarbor,
    craftProfile,
    silenceTimeoutMs: 3000, // ~3 seconds silence detection
    speechThreshold: 0.032,
    minSpeechDurationMs: 300,
    onCallEnd: onClose,
  });

  // Start call when opened
  useEffect(() => {
    if (isOpen) {
      startCall();
    } else {
      endCall();
    }
  }, [isOpen]);

  // Auto-scroll transcript box
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptHistory, callState]);

  const langInfo = getLanguageLabel(detectedLanguage);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) endCall(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="call-modal-backdrop" />
        <Dialog.Content
          className="call-modal-container"
          aria-describedby={undefined}
        >
          {/* Top Header */}
          <header className="call-header">
            <div className="call-branding">
              <div className="call-logo-icon">
                <Anchor size={18} />
              </div>
              <div>
                <Dialog.Title className="call-title">{t.callTitle}</Dialog.Title>
                <div className="call-status-row">
                  <span className={`call-status-dot ${callState === 'ERROR' ? 'error' : 'active'}`} />
                  <span className="call-duration-text">{formattedDuration}</span>
                  <span className="call-harbor-tag">{originHarbor}</span>
                </div>
              </div>
            </div>

            <div className="call-header-right">
              {detectedLanguage && (
                <div className="call-lang-pill" title={`${t.callDetectedLanguage}: ${langInfo.name}`}>
                  <Globe size={13} />
                  <span>{langInfo.flag} {langInfo.name}</span>
                </div>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="call-close-icon-btn"
                  aria-label={t.callEndBtn}
                  title={t.callEndBtn}
                >
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          </header>

        {/* Central Visualizer Section */}
        <section className="call-visualizer-section">
          <div className={`call-avatar-wrapper state-${callState.toLowerCase()}`}>
            {/* Pulsing Ripple Rings */}
            <div
              className={`call-pulse-ring ring-1 ${callState === 'HEARING_YOU' ? 'hearing' : ''}`}
              style={{
                transform: `scale(${1 + (callState === 'LISTENING' || callState === 'HEARING_YOU' ? volumeLevel * 0.45 : 0.05)})`,
                opacity: callState === 'HEARING_YOU' ? 0.6 + volumeLevel * 0.4 : callState === 'LISTENING' ? 0.25 + volumeLevel * 0.4 : 0.2,
              }}
            />
            <div
              className={`call-pulse-ring ring-2 ${callState === 'HEARING_YOU' ? 'hearing' : ''}`}
              style={{
                transform: `scale(${1 + (callState === 'LISTENING' || callState === 'HEARING_YOU' ? volumeLevel * 0.9 : 0.1)})`,
                opacity: callState === 'HEARING_YOU' ? 0.35 + volumeLevel * 0.35 : callState === 'LISTENING' ? 0.12 + volumeLevel * 0.25 : 0.1,
              }}
            />

            {/* Main Avatar Core */}
            <div className={`call-avatar-core ${callState === 'HEARING_YOU' ? 'hearing' : ''}`}>
              <div className="call-avatar-inner">
                {callState === 'SPEAKING' ? (
                  <Volume2 size={28} className="call-speaking-icon" />
                ) : callState === 'PROCESSING' ? (
                  <Loader2 size={28} className="call-processing-icon spin" />
                ) : callState === 'HEARING_YOU' ? (
                  <Radio size={28} className="call-hearing-icon pulse" />
                ) : isMuted ? (
                  <MicOff size={28} className="call-muted-icon" />
                ) : (
                  <Mic size={28} className="call-listening-icon" />
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Audio Equalizer Bars during SPEAKING / HEARING_YOU / LISTENING */}
          <div className="call-waveform-bars" aria-hidden="true">
            {[0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 0.3].map((heightMult, i) => (
              <span
                key={i}
                className={`call-wave-bar ${callState.toLowerCase()}`}
                style={{
                  height:
                    callState === 'SPEAKING'
                      ? `${14 + heightMult * 22}px`
                      : callState === 'HEARING_YOU'
                      ? `${10 + volumeLevel * heightMult * 30}px`
                      : callState === 'LISTENING'
                      ? `${5 + volumeLevel * heightMult * 16}px`
                      : '5px',
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </div>

          {/* Status Label Banner */}
          <div className="call-state-banner">
            {callState === 'CONNECTING' && (
              <span className="call-state-pill connecting">
                <Radio size={14} className="pulse" />
                {t.callStatusConnecting}
              </span>
            )}
            {callState === 'LISTENING' && !isMuted && (
              <span className="call-state-pill listening">
                <Mic size={14} className="pulse-mic" />
                {t.callStatusListening}
              </span>
            )}
            {callState === 'HEARING_YOU' && !isMuted && (
              <span className="call-state-pill hearing">
                <Sparkles size={14} className="pulse" />
                {t.callStatusHearing}
              </span>
            )}
            {callState === 'LISTENING' && isMuted && (
              <span className="call-state-pill muted">
                <MicOff size={14} />
                {t.callStatusMuted}
              </span>
            )}
            {callState === 'PROCESSING' && (
              <span className="call-state-pill processing">
                <Loader2 size={14} className="spin" />
                {t.callStatusProcessing}
              </span>
            )}
            {callState === 'SPEAKING' && (
              <span className="call-state-pill speaking">
                <Volume2 size={14} className="speaking-wave" />
                {t.callStatusSpeaking}
              </span>
            )}
            {callState === 'ERROR' && (
              <span className="call-state-pill error">
                {error || 'Connection issue'}
              </span>
            )}
          </div>
        </section>

        {/* Live Conversation Transcript History */}
        <section className="call-transcript-container" aria-label="Call live transcript">
          <div className="call-transcript-list">
            {transcriptHistory.length === 0 ? (
              <div className="call-transcript-empty">
                <p className="call-empty-hint">
                  🎙️ Speak naturally in <strong>मराठी</strong>, <strong>हिन्दी</strong>, or <strong>English</strong>.
                </p>
                <p className="call-empty-subhint">
                  SAMUDRA automatically detects when you speak and pauses for 3 seconds before responding.
                </p>
              </div>
            ) : (
              transcriptHistory.map(turn => (
                <div key={turn.id} className={`call-turn-item role-${turn.role}`}>
                  <div className="call-turn-header">
                    <span className="call-turn-author">
                      {turn.role === 'user' ? t.callSubtitleUser : t.callSubtitleSamudra}
                    </span>
                    {turn.language && (
                      <span className="call-turn-lang">
                        {turn.language.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="call-turn-bubble">
                    <p>{turn.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </section>

        {/* Bottom Call Action Toolbar */}
        <footer className="call-toolbar">
          {/* Subtle Fallback Action: Send Now (allows skipping 3s silence if user prefers) */}
          {(callState === 'HEARING_YOU' || callState === 'LISTENING') && (
            <button
              type="button"
              className="call-fallback-send-btn"
              onClick={finishSpeakingTurn}
              aria-label={t.callTapToSendNow}
              title={t.callTapToSendNow}
            >
              <SendHorizontal size={14} />
              <span>{t.callTapToSendNow}</span>
            </button>
          )}

          {/* Retry Button on Error */}
          {callState === 'ERROR' && (
            <button
              type="button"
              className="call-retry-btn"
              onClick={retryTurn}
              aria-label={t.callRetryBtn}
            >
              <RefreshCw size={16} />
              <span>{t.callRetryBtn}</span>
            </button>
          )}

          <div className="call-action-buttons">
            {/* Mute Button */}
            <button
              type="button"
              className={`call-action-circle-btn ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            {/* End Call Hang-up Button */}
            <button
              type="button"
              className="call-hangup-btn"
              onClick={endCall}
              title={t.callEndBtn}
              aria-label={t.callEndBtn}
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
}
