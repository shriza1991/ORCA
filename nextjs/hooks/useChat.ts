import { useState, useCallback } from 'react';
import type { ChatRequest, ChatResponse } from '../types/contracts';
import { sendMessage, ApiError } from '../api/client';
import { DEFAULT_MISSION_CONTEXT, type DecisionDiff, type MissionContext, type WhatIfParameters } from '../types/mission';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeResponse, setActiveResponse] = useState<ChatResponse | null>(null);
  const [language, setLanguage] = useState<'en' | 'hi' | 'mr'>('en');
  const [missionContext, setMissionContext] = useState<MissionContext>(DEFAULT_MISSION_CONTEXT);
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
        conversation_id: conversationId ?? undefined,
        message: text,
        user_context: {
          ...missionContext,
          language_preference: targetLanguage,
          ...requestContext,
        },
      };

      // Always call the live backend API
      const response = await sendMessage(req);

      if (!conversationId && response.conversation_id) {
        setConversationId(response.conversation_id);
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
      let errorMsg = 'Failed to connect to SAMUDRA backend.';
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
  }, [conversationId, language, missionContext]);

  const simulateWhatIf = useCallback(async (params: WhatIfParameters, queryText: string, currentAssessmentId?: string) => {
    const baselineStatus = activeResponse?.recommendation.status ?? 'READY';
    
    // Calculate new departure and return times
    const now = new Date();
    const departureDate = new Date(now.getTime() + (params.timeOffsetHours || 0) * 60 * 60 * 1000);
    const returnDate = new Date(departureDate.getTime() + 12 * 60 * 60 * 1000); // Assume 12hr default trip

    const effectiveContext: MissionContext = {
      origin_harbor: missionContext.origin_harbor,
      craft_profile: params.craftProfileOverride ?? missionContext.craft_profile,
      departure_time: departureDate.toISOString(),
      return_time: returnDate.toISOString()
    };

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: queryText,
      timestamp: new Date(),
    };

    const loadingMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      const req: ChatRequest = {
        conversation_id: conversationId ?? undefined,
        message: queryText,
        user_context: {
          ...effectiveContext,
          language_preference: language,
          parent_assessment_id: currentAssessmentId || activeResponse?.assessment_id,
        },
      };

      const response = await sendMessage(req);

      if (!conversationId && response.conversation_id) {
        setConversationId(response.conversation_id);
      }

      const assistantMsg: ChatMessage = {
        id: loadingMsg.id,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        response,
      };

      setMessages(prev => prev.map(m => (m.id === loadingMsg.id ? assistantMsg : m)));
      setActiveResponse(response);

      // Construct Decision Diff
      setActiveDiff({
        baselineStatus,
        simulatedStatus: response.recommendation.status,
        summary: response.recommendation.summary,
        timeOffsetHours: params.timeOffsetHours,
        craftProfile: effectiveContext.craft_profile,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      let errorMsg = 'Failed to run simulation. Please check server connectivity.';
      if (err instanceof ApiError) {
        errorMsg = `Simulation error (${err.status}): ${err.statusText}`;
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
  }, [activeResponse, conversationId, language, missionContext]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setActiveResponse(null);
    setActiveDiff(null);
  }, []);

  return {
    messages,
    isLoading,
    conversationId,
    activeResponse,
    language,
    setLanguage,
    missionContext,
    setMissionContext,
    activeDiff,
    simulateWhatIf,
    send,
    clearChat,
  };
}
