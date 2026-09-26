import { useRef, useEffect } from 'react';
import type { ChatMessage as ChatMessageType } from '../../hooks/useChat';
import type { ChatResponse } from '../../types/contracts';
import { TRANSLATIONS, type SupportedLanguage } from '../../i18n/translations';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import SamplePrompts from './SamplePrompts';
import RecommendationBanner from '../recommendation/RecommendationBanner';
import { Anchor, ArrowLeft, RotateCcw } from 'lucide-react';

interface ChatPanelProps {
  language: SupportedLanguage;
  messages: ChatMessageType[];
  activeResponse: ChatResponse | null;
  isLoading: boolean;
  onSend: (text: string, languageOverride?: 'en' | 'hi' | 'mr') => void;
  onStartCall?: () => void;
  onBack?: () => void;
  onReset?: () => void;
  onEvidenceClick?: () => void;
}


export default function ChatPanel({
  language,
  messages,
  activeResponse,
  isLoading,
  onSend,
  onStartCall,
  onBack,
  onReset,
  onEvidenceClick,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(timer);
  }, [messages, activeResponse, isLoading]);

  const showWelcome = messages.length === 0;

  return (
    <section className="chat-panel" aria-label="Chat interface">
      <div className="chat-panel-topbar">
        <button
          type="button"
          className="chat-back-btn"
          onClick={onBack}
          title={t.backToStart}
          aria-label={t.backToStart}
        >
          <ArrowLeft size={16} />
          <span>{t.back}</span>
        </button>

        <span className="chat-panel-title">{t.chatTitle}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {messages.length > 0 && onReset && (
            <button
              type="button"
              className="chat-reset-btn"
              onClick={onReset}
              title={t.newChat}
              aria-label={t.newChat}
            >
              <RotateCcw size={14} />
              <span>{t.newChat}</span>
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {showWelcome && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">
              <Anchor size={32} />
            </div>
            <h2 className="chat-welcome-title">{t.welcomeTitle}</h2>
            <p className="chat-welcome-subtitle">{t.welcomeSubtitle}</p>
            <SamplePrompts language={language} onSelect={onSend} disabled={isLoading} />
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            language={language}
            onEvidenceClick={onEvidenceClick}
            onFollowUp={onSend}
          />
        ))}

        {/* Show recommendation banner after the latest assistant response */}
        {activeResponse && !isLoading && activeResponse.recommendation && (
          <div className="chat-recommendation-wrapper">
            <RecommendationBanner
              recommendation={activeResponse.recommendation}
              confidence={activeResponse.confidence}
              warnings={activeResponse.warnings}
              language={language}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput language={language} onSend={onSend} onStartCall={onStartCall} disabled={isLoading} />
    </section>
  );
}

