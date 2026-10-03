import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatRequest, ChatResponse } from '../types/contracts';
import { sendMessage, ApiError } from '../api/client';
import {
  DEFAULT_MISSION_CONTEXT,
  type DecisionDiff,
  type MissionContext,
  type MissionState,
  type WhatIfParameters,
} from '../types/mission';
import type { TripAssessmentResponse } from '../types/assessment';
import {
  getMissionIdentityKey,
  isAssessmentApplicableToContext,
  type DecisionMissionIdentityInputs,
} from '../utils/mission-proposal';

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
  /** Mission key for which this message was generated */
  missionKey?: string;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface MissionAssessmentAvailability {
  isLoading?: boolean;
  isExpired?: boolean;
  coordinates?: [number, number];
  dataMode?: string;
}

export interface ActiveBaselineInfo {
  isApplicable: boolean;
  assessmentId?: string;
  evidenceBundleId?: string;
  dataMode?: string;
  coordinates?: [number, number];
  parentAssessmentId?: string;
  isLoading: boolean;
  isExpired: boolean;
  assessment: TripAssessmentResponse | null;
  missionContext: MissionContext;
}

export function useChat() {
  const [missionAssessment, storeMissionAssessment] = useState<TripAssessmentResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeResponse, setActiveResponse] = useState<ChatResponse | null>(null);
  const [language, setLanguage] = useState<'en' | 'hi' | 'mr' | 'ta' | 'te'>('en');

  const chatGenerationRef = useRef<number>(0);
  const inFlightRef = useRef(new Set<number>());
  const clearGenerationRef = useRef(0);
  const baselineRef = useRef<TripAssessmentResponse | null>(null);
  const availabilityRef = useRef<MissionAssessmentAvailability>({});
  const baselineGenerationRef = useRef(0);
  const setMissionAssessment = useCallback((assessment: TripAssessmentResponse | null, availability: MissionAssessmentAvailability = {}) => {
    const previous = baselineRef.current;
    if (previous !== assessment || JSON.stringify(availabilityRef.current) !== JSON.stringify(availability)) {
      baselineGenerationRef.current++;
      setActiveResponse(null);
    }
    baselineRef.current = assessment;
    availabilityRef.current = availability;
    storeMissionAssessment(assessment);
  }, []);

  useEffect(() => {
    import('../i18n/i18n').then((module) => {
      module.default.changeLanguage(language);
    });
  }, [language]);

  const [missionContext, setMissionContext] = useState<MissionContext>(() => {
    try {
      return JSON.parse(localStorage.getItem('orca.mission') || 'null') || DEFAULT_MISSION_CONTEXT;
    } catch {
      return DEFAULT_MISSION_CONTEXT;
    }
  });

  const missionContextRef = useRef<MissionContext>(missionContext);
  missionContextRef.current = missionContext;
  const contextIdentity = getMissionIdentityKey(missionContext);
  useEffect(() => { setActiveResponse(null); }, [contextIdentity]);
  useEffect(() => {
    try {
      localStorage.setItem('orca.mission', JSON.stringify(missionContext));
    } catch {}
  }, [missionContext]);

  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [activeDiff, setActiveDiff] = useState<DecisionDiff | null>(null);

  const getActiveBaseline = useCallback(
    (sectorId?: string): ActiveBaselineInfo => {
      const availability = availabilityRef.current;
      const currentAssessment = baselineRef.current;
      const effectiveContext = {
        ...missionContextRef.current,
        coordinates: availability.coordinates || (missionContextRef.current as DecisionMissionIdentityInputs).coordinates,
        data_mode: availability.dataMode || (import.meta.env.VITE_DATA_MODE || 'DEMO').toUpperCase(),
      };

      const isApplicable =
        !sectorId &&
        Boolean(
          currentAssessment &&
          isAssessmentApplicableToContext(
            currentAssessment,
            effectiveContext,
            availability.isExpired,
            availability.isLoading,
          )
        );

      return {
        isApplicable,
        assessmentId: isApplicable ? currentAssessment?.assessment_id : undefined,
        evidenceBundleId: isApplicable ? currentAssessment?.evidence_bundle_id : undefined,
        dataMode: isApplicable
          ? currentAssessment?.conditions.data_mode
          : (availability.dataMode || (import.meta.env.VITE_DATA_MODE || 'DEMO')).toUpperCase(),
        parentAssessmentId: !sectorId && isApplicable
          ? missionContextRef.current.parent_assessment_id || missionState?.parent_assessment_id || undefined
          : undefined,
        coordinates: availability.coordinates || (isApplicable ? currentAssessment?.trip_context.coordinates : undefined),
        isLoading: Boolean(availability.isLoading),
        isExpired: Boolean(availability.isExpired),
        assessment: isApplicable ? currentAssessment : null,
        missionContext: missionContextRef.current,
      };
    },
    [missionState],
  );

  const send = useCallback(
    async (
      text: string,
      languageOverride?: 'en' | 'hi' | 'mr',
      requestContext?: Partial<NonNullable<ChatRequest['user_context']>>,
    ) => {
      const targetLanguage = languageOverride || language;
      if (languageOverride && languageOverride !== language) {
        setLanguage(languageOverride);
      }

      const requestGen = ++chatGenerationRef.current;
      const clearGeneration = clearGenerationRef.current;
      const baselineGeneration = baselineGenerationRef.current;
      inFlightRef.current.add(requestGen);
      setIsLoading(true);

      const capturedMissionKey = getMissionIdentityKey(missionContext);

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        sectorId: requestContext?.sector_id,
        missionKey: capturedMissionKey,
      };

      const loadingMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
        sectorId: requestContext?.sector_id,
        missionKey: capturedMissionKey,
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);

      // Only attach baseline assessment if it's strictly applicable to the current active mission context
      const baseline = getActiveBaseline(requestContext?.sector_id);
      const isApplicable = baseline.isApplicable;
      const effectiveBaselineId = baseline.assessmentId;
      const effectiveBundleId = baseline.evidenceBundleId;
      const effectiveMissionState = requestContext?.sector_id
        ? undefined
        : isApplicable
        ? missionState ?? undefined
        : undefined;

      try {
        const req: ChatRequest = {
          evidence_bundle_id: effectiveBundleId,
          baseline_assessment_id: effectiveBaselineId,
          data_mode: baseline.dataMode || (import.meta.env.VITE_DATA_MODE || 'DEMO').toUpperCase(),
          conversation_id: conversationId ?? undefined,
          message: text,
          user_context: {
            ...missionContext,
            language_preference: targetLanguage as any,
            ...requestContext,
          },
          mission_state: effectiveMissionState,
        };

        const response = await sendMessage(req);

        // Discard result if chat was cleared in the meantime
        if (clearGeneration !== clearGenerationRef.current) {
          return;
        }

        if (!conversationId && response.conversation_id) {
          setConversationId(response.conversation_id);
        }

        const isSectorChat = Boolean(requestContext?.sector_id);
        const isCurrentMission = capturedMissionKey === getMissionIdentityKey(missionContextRef.current);

        // Authority sector requests remain isolated from Fisher mission state
        if (!isSectorChat && isCurrentMission &&
            baselineGeneration === baselineGenerationRef.current && requestGen === chatGenerationRef.current) {
          if (response.mission_state) {
            setMissionState(response.mission_state);
          }
          setActiveResponse(response);
        }

        const assistantMsg: ChatMessage = {
          id: loadingMsg.id,
          role: 'assistant',
          content: response.answer,
          timestamp: new Date(),
          response,
          sectorId: requestContext?.sector_id,
          missionKey: capturedMissionKey,
        };

        setMessages((prev) =>
          prev.map((m) => (m.id === loadingMsg.id ? assistantMsg : m)),
        );
      } catch (err) {
        if (clearGeneration !== clearGenerationRef.current) {
          return;
        }

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

        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingMsg.id
              ? { ...m, isLoading: false, error: errorMsg, content: errorMsg }
              : m,
          ),
        );
      } finally {
        inFlightRef.current.delete(requestGen);
        setIsLoading(inFlightRef.current.size > 0);
      }
    },
    [conversationId, language, missionContext, missionState, missionAssessment],
  );

  const simulateWhatIf = useCallback(
    async (params: WhatIfParameters, queryText: string, currentAssessmentId?: string) => {
      if (!missionContext.departure_time || !missionContext.return_time || !currentAssessmentId) {
        await send('What if I change my plan?');
        return;
      }
      const edit = params.craftProfileOverride
        ? `What if I use a ${params.craftProfileOverride.replace(/_/g, ' ')}?`
        : `What if I leave ${params.timeOffsetHours || 0} hours later?`;
      await send(edit || queryText);
    },
    [missionContext, send],
  );

  const clearChat = useCallback(() => {
    // Invalidate outstanding replies so they cannot repopulate active state
    clearGenerationRef.current++;
    chatGenerationRef.current++;
    inFlightRef.current.clear();
    setIsLoading(false);
    setMessages([]);
    setConversationId(null);
    setActiveResponse(null);
    setActiveDiff(null);
  }, []);

  useEffect(() => () => {
    clearGenerationRef.current++;
    inFlightRef.current.clear();
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
    getActiveBaseline,
  };
}
