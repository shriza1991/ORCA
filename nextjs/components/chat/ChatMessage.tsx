import { useState, useEffect } from 'react';
import type { ChatMessage as ChatMessageType } from '../../hooks/useChat';
import { AlertTriangle, Bot, User, Volume2, VolumeX } from 'lucide-react';
import { TRANSLATIONS, translateChatMessage, translateText, type SupportedLanguage } from '../../i18n/translations';

interface ChatMessageProps {
  message: ChatMessageType;
  language?: SupportedLanguage;
  onEvidenceClick?: () => void;
  onFollowUp?: (message: string) => void;
}

export default function ChatMessage({ message, language = 'en', onEvidenceClick, onFollowUp }: ChatMessageProps) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const isUser = message.role === 'user';
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const displayContent = translateChatMessage(message.content, language, message.response?.intent);

  useEffect(() => {
    return () => {
      if (isPlayingAudio && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlayingAudio]);

  const handleToggleSpeak = () => {
    if (isPlayingAudio) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      return;
    }

    const voiceAudio = (message.response as any)?.audio_base64;
    if (voiceAudio) {
      try {
        const audio = new Audio(`data:audio/mp3;base64,${voiceAudio}`);
        audio.onended = () => setIsPlayingAudio(false);
        audio.onerror = () => setIsPlayingAudio(false);
        audio.play().catch(() => setIsPlayingAudio(false));
        setIsPlayingAudio(true);
        return;
      } catch {
        // Fallback to speechSynthesis
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(displayContent);
      utterance.lang = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN';
      utterance.rate = 0.95;
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  if (message.isLoading) {
    return (
      <div className="chat-message assistant">
        <div className="chat-message-avatar">
          <Bot size={16} />
        </div>
        <div className="chat-message-content">
          <div className="chat-loading">
            <span className="chat-loading-dot" />
            <span className="chat-loading-dot" />
            <span className="chat-loading-dot" />
          </div>
          <span className="chat-loading-text">{t.agentsReasoning}</span>
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="chat-message assistant error">
        <div className="chat-message-avatar error-avatar">
          <AlertTriangle size={16} />
        </div>
        <div className="chat-message-content">
          <p className="chat-error-text">{translateText(message.error, language)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className={`chat-message-avatar ${isUser ? 'user-avatar' : ''}`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="chat-message-content">
        <p style={{ whiteSpace: 'pre-line' }}>{displayContent}</p>
        {!isUser && (
          <div className="message-action-row">
            <button
              type="button"
              className={`message-tts-btn ${isPlayingAudio ? 'playing' : ''}`}
              onClick={handleToggleSpeak}
              title={isPlayingAudio ? t.stopAudioBtn : t.listenBtn}
              aria-label={isPlayingAudio ? t.stopAudioBtn : t.listenBtn}
            >
              {isPlayingAudio ? <VolumeX size={13} /> : <Volume2 size={13} />}
              <span>{isPlayingAudio ? t.stopAudioBtn : t.listenBtn}</span>
            </button>
            {message.response && message.response.evidence.length > 0 && (
              <button className="evidence-link" onClick={onEvidenceClick}>
                {t.viewEvidenceBtn(message.response.evidence.length)}
              </button>
            )}
          </div>
        )}
        {!isUser && message.response?.suggested_followups && message.response.suggested_followups.length > 0 && (
          <div className="suggested-followups">
            {message.response.suggested_followups.map((followup, i) => (
              <button
                key={i}
                type="button"
                className="followup-chip"
                onClick={() => onFollowUp?.(followup)}
                disabled={!onFollowUp}
              >
                {translateText(followup, language)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
