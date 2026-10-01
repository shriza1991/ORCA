import { useState, useCallback, useEffect } from 'react';
import type { ChatRequest, ChatResponse } from '../types/contracts';
import { sendMessage, ApiError } from '../api/client';
import { DEFAULT_MISSION_CONTEXT, type DecisionDiff, type MissionContext, type MissionState, type WhatIfParameters } from '../types/mission';
import type { TripAssessmentResponse } from '../types/assessment';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  response?: ChatResponse;
  isLoading?: boolean;
  error?: string;
  /** Request-scoped Authority sector, when the message originated in that deck. */
  sectorId?: string;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useChat() {
  const [missionAssessment, setMissionAssessment] = useState<TripAssessmentResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeResponse, setActiveResponse] = useState<ChatResponse | null>(null);
  const [language, setLanguage] = useState<'en' | 'hi' | 'mr' | 'ta' | 'te'>('en');

  useEffect(() => {
    import('../i18n/i18n').then((module) => {
      module.default.changeLanguage(language);
    });
  }, [language]);
  const [missionContext, setMissionContext] = useState<MissionContext>(() => {
    try { return JSON.parse(localStorage.getItem('orca.mission') || 'null') || DEFAULT_MISSION_CONTEXT; }
    catch { return DEFAULT_MISSION_CONTEXT; }
  });
  useEffect(() => { try { localStorage.setItem('orca.mission', JSON.stringify(missionContext)); } catch {} }, [missionContext]);
  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [activeDiff, setActiveDiff] = useState<DecisionDiff | null>(null);

  const send = useCallback(async (
    text: string,
    languageOverride?: 'en' | 'hi' | 'mr',
    requestContext?: Partial<NonNullable<ChatRequest['user_context']>>,
  ) => {
    const targetLanguage = languageOverride || language;
    if (languageOverride && languageOverride !== language) {
      setLanguage(languageOverride);
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      sectorId: requestContext?.sector_id,
    };

    const loadingMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
      sectorId: requestContext?.sector_id,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      const req: ChatRequest = {
        evidence_bundle_id: requestContext?.sector_id ? undefined : missionAssessment?.evidence_bundle_id,
        baseline_assessment_id: requestContext?.sector_id ? undefined : missionAssessment?.assessment_id,
        data_mode: missionAssessment?.conditions.data_mode || (import.meta.env.VITE_DATA_MODE || 'DEMO').toUpperCase(),
        conversation_id: conversationId ?? undefined,
        message: text,
        user_context: {
          ...missionContext,
          language_preference: targetLanguage as any,
          ...requestContext,
        },
        mission_state: missionState ?? undefined,
      };

      // Always call the live backend API
      const response = await sendMessage(req);

      if (!conversationId && response.conversation_id) {
        setConversationId(response.conversation_id);
      }

      if (response.mission_state) {
        setMissionState(response.mission_state);
      }

      const assistantMsg: ChatMessage = {
        id: loadingMsg.id,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        response,
        sectorId: requestContext?.sector_id,
      };

      setMessages(prev => prev.map(m => m.id === loadingMsg.id ? assistantMsg : m));
      setActiveResponse(response);
    } catch (err) {
      let errorMsg = 'Failed to connect to ORCA backend.';
      if (err instanceof ApiError) {
        if (typeof err.body === 'object' && err.body !== null && 'detail' in err.body) {
          errorMsg = String((err.body as Record<string, unknown>).detail);
        } else if (typeof err.body === 'object' && err.body !== null && 'message' in err.body) {
          errorMsg = String((err.body as Record<string, unknown>).message);
        } else {
          errorMsg = `API Error (${err.status}): ${err.statusText}`;
        }
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, isLoading: false, error: errorMsg, content: errorMsg }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, language, missionContext, missionState, missionAssessment]);

  const simulateWhatIf = useCallback(async (params: WhatIfParameters, queryText: string, currentAssessmentId?: string) => {
    if (!missionContext.departure_time || !missionContext.return_time || !currentAssessmentId) {
      await send('What if I change my plan?');
      return;
    }
    // The backend resolves edits relative to the retained mission; React does not compute a verdict.
    const edit = params.craftProfileOverride ? `What if I use a ${params.craftProfileOverride.replace(/_/g, ' ')}?` : `What if I leave ${params.timeOffsetHours || 0} hours later?`;
    await send(edit || queryText);
  }, [missionContext, send]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setActiveResponse(null);
    setActiveDiff(null);
  }, []);

  return {
    messages,
    missionAssessment,
    setMissionAssessment,
    isLoading,
    conversationId,
    activeResponse,
    language,
    setLanguage,
    missionContext,
    setMissionContext,
    missionState,
    setMissionState,
    activeDiff,
    simulateWhatIf,
    send,
    clearChat,
  };
}
