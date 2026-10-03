import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useChat } from '../hooks/useChat';
import * as client from '../api/client';
import type { TripAssessmentResponse } from '../types/assessment';
import type { MissionContext } from '../types/mission';
import {
  getMissionIdentityKey,
  validateSimulationProposal,
  validateRouteChoiceProposal,
  validateRefreshedAssessment,
  validateChatProposedAssessment,
} from '../utils/mission-proposal';

// Mock client.sendMessage
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof client>('../api/client');
  return {
    ...actual,
    sendMessage: vi.fn(),
  };
});

let tree: ReactTestRenderer | undefined;
let chatHook: ReturnType<typeof useChat>;

function ChatProbe() {
  chatHook = useChat();
  return null;
}

const baseContext: MissionContext = {
  origin_harbor: 'Ratnagiri',
  craft_profile: 'motorized_boat',
  vessel_size: 'medium',
  departure_time: '2026-10-04T06:00:00Z',
  return_time: '2026-10-04T18:00:00Z',
  target_pfz: 'pfz_zone_1',
  coordinates: [73.1234, 17.5678],
} as unknown as MissionContext;

const baseAssessment: TripAssessmentResponse = {
  assessment_id: 'asm_base_100',
  evidence_bundle_id: 'bundle_100',
  decision: 'GO',
  overall_risk_level: 'LOW',
  conditions: {
    data_mode: 'DEMO',
    wind_speed_knots: 12,
    wave_height_meters: 1.1,
    visibility_km: 10,
    risk_level: 'LOW',
    advisory: 'Fair conditions',
    timestamp: '2026-10-04T06:00:00Z',
  },
  route_candidates: [
    {
      route_id: 'route_1',
      name: 'North passage',
      departure_supported: true,
      is_recommended: true,
      summary: 'Clear waypoints',
      risk_level: 'LOW',
      rejection_reasons: [],
    },
  ],
  trip_context: {
    origin_harbor: 'Ratnagiri',
    craft_profile: 'motorized_boat',
    vessel_size: 'medium',
    departure_time: '2026-10-04T06:00:00Z',
    return_time: '2026-10-04T18:00:00Z',
    target_pfz: 'pfz_zone_1',
    coordinates: [73.1234, 17.5678],
  },
  brief: {
    summary: 'Good departure window',
    recommended_action: 'Proceed as planned',
    positive_factors: ['Calm winds'],
    negative_factors: [],
    confidence: 'HIGH',
    confidence_reasons: ['Consistent demo data'],
  },
  mission_state: {
    mission_id: 'mission_100',
  },
} as unknown as TripAssessmentResponse;

let store: Record<string, string> = {};

beforeEach(() => {
  vi.clearAllMocks();
  store = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

describe('Task 5 Chat Baseline and Mission Synchronization', () => {
  it('Authority sector requests remain strictly isolated from Fisher mission state and assessment IDs', async () => {
    const sendMessageMock = vi.mocked(client.sendMessage);
    sendMessageMock.mockResolvedValue({
      answer: 'Sector patrol advisory: 2 vessels active.',
      conversation_id: 'conv_sector_1',
      mission_state: {
        mission_id: 'sector_mission_do_not_leak',
      },
    } as any);

    await act(async () => {
      tree = create(createElement(ChatProbe));
    });

    // Populate active Fisher assessment
    act(() => {
      chatHook.setMissionAssessment(baseAssessment);
      chatHook.setMissionContext(baseContext);
    });

    // Send sector-scoped chat
    await act(async () => {
      await chatHook.send('Status update for Sector North', undefined, {
        sector_id: 'SECTOR_NORTH',
      });
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const sentReq = sendMessageMock.mock.calls[0][0];

    // CRITICAL: Sector chat must NOT inherit Fisher baseline_assessment_id or evidence_bundle_id
    expect(sentReq.baseline_assessment_id).toBeUndefined();
    expect(sentReq.evidence_bundle_id).toBeUndefined();
    expect(sentReq.mission_state).toBeUndefined();
    expect(sentReq.user_context?.sector_id).toBe('SECTOR_NORTH');

    // CRITICAL: Sector response mission_state must NOT overwrite Fisher mission state
    expect(chatHook.missionState).toBeNull();
    expect(chatHook.activeResponse).toBeNull();
  });

  it('an old chat reply cannot overwrite activeResponse or missionState if mission context has changed', async () => {
    let resolveFirstMsg!: (val: any) => void;
    const sendMessageMock = vi.mocked(client.sendMessage);
    sendMessageMock.mockImplementationOnce(
      () => new Promise((res) => { resolveFirstMsg = res; })
    );

    await act(async () => {
      tree = create(createElement(ChatProbe));
    });

    act(() => {
      chatHook.setMissionAssessment(baseAssessment);
      chatHook.setMissionContext(baseContext);
    });

    // Send chat message under baseContext (e.g., Ratnagiri)
    act(() => {
      chatHook.send('Can I go now?');
    });

    // While request is in-flight, user changes mission to Malvan
    const changedContext: MissionContext = {
      ...baseContext,
      origin_harbor: 'Malvan',
    };
    act(() => {
      chatHook.setMissionContext(changedContext);
    });

    // Now first chat response resolves
    await act(async () => {
      resolveFirstMsg({
        answer: 'You are good to go from Ratnagiri!',
        conversation_id: 'conv_1',
        mission_state: { mission_id: 'old_ratnagiri_state' },
      });
    });

    // The late response must NOT overwrite activeResponse or missionState for the new mission
    expect(chatHook.missionState).toBeNull();
    expect(chatHook.activeResponse).toBeNull();
    // But the message remains in history tagged with its origin mission key
    expect(chatHook.messages.length).toBe(2);
    expect(chatHook.messages[1].missionKey).toBe(getMissionIdentityKey(baseContext));
    expect(chatHook.messages[1].content).toBe('You are good to go from Ratnagiri!');
  });

  it('clearing chat invalidates outstanding replies so they cannot repopulate active state', async () => {
    let resolvePending!: (val: any) => void;
    const sendMessageMock = vi.mocked(client.sendMessage);
    sendMessageMock.mockImplementationOnce(
      () => new Promise((res) => { resolvePending = res; })
    );

    await act(async () => {
      tree = create(createElement(ChatProbe));
    });

    act(() => {
      chatHook.setMissionAssessment(baseAssessment);
      chatHook.setMissionContext(baseContext);
    });

    // Send message
    act(() => {
      chatHook.send('Hello ocean intelligence');
    });
    expect(chatHook.isLoading).toBe(true);

    // User clears chat
    act(() => {
      chatHook.clearChat();
    });
    expect(chatHook.messages).toEqual([]);
    expect(chatHook.isLoading).toBe(false);

    // Pending response resolves
    await act(async () => {
      resolvePending({
        answer: 'Late ocean intelligence reply',
        conversation_id: 'conv_stale',
      });
    });

    // Must remain completely clear
    expect(chatHook.messages).toEqual([]);
    expect(chatHook.activeResponse).toBeNull();
  });

  it('omits baseline assessment when assessment is expired or mismatched to current context', async () => {
    const sendMessageMock = vi.mocked(client.sendMessage);
    sendMessageMock.mockResolvedValue({
      answer: 'Standard response',
      conversation_id: 'conv_1',
    } as any);

    await act(async () => {
      tree = create(createElement(ChatProbe));
    });

    // Assessment is for Ratnagiri, but context is Malvan
    act(() => {
      chatHook.setMissionAssessment(baseAssessment);
      chatHook.setMissionContext({ ...baseContext, origin_harbor: 'Malvan' });
    });

    await act(async () => {
      await chatHook.send('Should I sail?');
    });

    const sentReq = sendMessageMock.mock.calls[0][0];
    // Must NOT send baseline assessment since context does not match
    expect(sentReq.baseline_assessment_id).toBeUndefined();
    expect(sentReq.evidence_bundle_id).toBeUndefined();
  });
});

describe('Task 5 Proposal and Apply Validation (Simulation, Route, Refresh, Chat)', () => {
  it('validateSimulationProposal accepts intentional craft/size edits but rejects unexpected changes', () => {
    const simProposal: TripAssessmentResponse = {
      ...baseAssessment,
      assessment_id: 'asm_sim_200',
      trip_context: {
        ...baseAssessment.trip_context,
        craft_profile: 'mechanized_trawler', // intentional craft revision
        vessel_size: 'large', // intentional size revision
        parent_assessment_id: baseAssessment.assessment_id,
      },
    };

    // Valid intentional revision
    const validResult = validateSimulationProposal(
      baseAssessment,
      simProposal,
      { craftProfile: 'mechanized_trawler', vesselSize: 'large' },
    );
    expect(validResult.valid).toBe(true);

    // Rejection 1: parent_assessment_id does not link to baseline
    const unlinkedProposal: TripAssessmentResponse = {
      ...simProposal,
      trip_context: {
        ...simProposal.trip_context,
        parent_assessment_id: 'different_parent',
      },
    };
    expect(
      validateSimulationProposal(
        baseAssessment,
        unlinkedProposal,
        { craftProfile: 'mechanized_trawler', vesselSize: 'large' },
      ).valid
    ).toBe(false);

    // Rejection 2: unexpected mutation in unedited field (e.g. coordinates altered)
    const alteredCoordsProposal: TripAssessmentResponse = {
      ...simProposal,
      trip_context: {
        ...simProposal.trip_context,
        coordinates: [70.0, 15.0], // unexpected alteration!
      },
    };
    expect(
      validateSimulationProposal(
        baseAssessment,
        alteredCoordsProposal,
        { craftProfile: 'mechanized_trawler', vesselSize: 'large' },
      ).valid
    ).toBe(false);

    // Rejection 3: craft profile does not match requested revision
    expect(
      validateSimulationProposal(
        baseAssessment,
        simProposal,
        { craftProfile: 'traditional_kattu', vesselSize: 'large' }, // requested something else!
      ).valid
    ).toBe(false);
  });

  it('validateRouteChoiceProposal accepts candidate route selection from matching baseline and rejects obsolete baseline', () => {
    const routeProposal: TripAssessmentResponse = {
      ...baseAssessment,
      assessment_id: 'asm_route_choice_300',
      route_candidates: [
        {
          route_id: 'route_alternative',
          name: 'Alternative Corridor',
          departure_supported: true,
          is_recommended: true,
          summary: 'Alternative route',
          risk_level: 'LOW',
          rejection_reasons: [],
        },
      ],
      trip_context: {
        ...baseAssessment.trip_context,
        parent_assessment_id: baseAssessment.assessment_id,
      },
    };

    // Valid candidate selection
    const valid = validateRouteChoiceProposal(
      baseAssessment,
      routeProposal,
      'route_alternative'
    );
    expect(valid.valid).toBe(true);

    // Rejects when baseline has changed in the meantime
    const obsoleteBaselineCheck = validateRouteChoiceProposal(
      { ...baseAssessment, assessment_id: 'newer_active_baseline_999' },
      routeProposal,
      'route_alternative'
    );
    expect(obsoleteBaselineCheck.valid).toBe(false);
    expect(obsoleteBaselineCheck.reason).toContain('baseline');
  });

  it('validateRefreshedAssessment accepts fresh evidence but rejects obsolete results or plan changes', () => {
    const refreshedWithNewEvidence: TripAssessmentResponse = {
      ...baseAssessment,
      assessment_id: 'asm_refreshed_400',
      evidence_bundle_id: 'new_evidence_bundle_fresh_999', // Fresh evidence allowed!
      trip_context: {
        ...baseAssessment.trip_context,
        parent_assessment_id: baseAssessment.assessment_id,
      },
    };

    // Valid refresh
    const validRefresh = validateRefreshedAssessment(
      baseAssessment,
      refreshedWithNewEvidence
    );
    expect(validRefresh.valid).toBe(true);

    // Rejection: baseline mismatch (e.g. user moved to different baseline while refresh was in-flight)
    const obsoleteRefresh = validateRefreshedAssessment(
      { ...baseAssessment, assessment_id: 'asm_base_different' },
      refreshedWithNewEvidence
    );
    expect(obsoleteRefresh.valid).toBe(false);

    // Rejection: harbor changed in returned assessment
    const tamperedRefresh: TripAssessmentResponse = {
      ...refreshedWithNewEvidence,
      trip_context: {
        ...refreshedWithNewEvidence.trip_context,
        origin_harbor: 'DifferentHarbor',
      },
    };
    expect(
      validateRefreshedAssessment(
        baseAssessment,
        tamperedRefresh
      ).valid
    ).toBe(false);
  });

  it('validateChatProposedAssessment validates proposal against active baseline before allowing Apply', () => {
    const validChatProposal: TripAssessmentResponse = {
      ...baseAssessment,
      assessment_id: 'asm_chat_proposed_500',
      trip_context: {
        ...baseAssessment.trip_context,
        parent_assessment_id: baseAssessment.assessment_id,
      },
    };

    expect(
      validateChatProposedAssessment(baseAssessment, validChatProposal).valid
    ).toBe(true);

    // Rejection: missing proposed assessment
    expect(
      validateChatProposedAssessment(baseAssessment, undefined).valid
    ).toBe(false);

    // Rejection: proposed assessment does not match context / harbor
    const mismatchedChatProposal: TripAssessmentResponse = {
      ...validChatProposal,
      trip_context: {
        ...validChatProposal.trip_context,
        origin_harbor: 'HarborMismatch',
      },
    };
    expect(
      validateChatProposedAssessment(baseAssessment, mismatchedChatProposal).valid
    ).toBe(false);
  });

  it('language change is presentation state only and preserves active assessment and evidence identity', async () => {
    await act(async () => {
      tree = create(createElement(ChatProbe));
    });

    act(() => {
      chatHook.setMissionAssessment(baseAssessment);
      chatHook.setMissionContext(baseContext);
    });

    const initialKey = getMissionIdentityKey(chatHook.missionContext);

    // Change language to Marathi
    act(() => {
      chatHook.setLanguage('mr');
    });

    expect(chatHook.language).toBe('mr');
    // Active assessment is unchanged
    expect(chatHook.missionAssessment?.assessment_id).toBe('asm_base_100');
    expect(chatHook.missionAssessment?.evidence_bundle_id).toBe('bundle_100');
    // Mission identity key is identical (language not part of mission key)
    expect(getMissionIdentityKey(chatHook.missionContext)).toBe(initialKey);
  });

  it('map preview derives all layers, telemetry, and decision from proposed assessment without mixing snapshots', () => {
    const proposedAsm: TripAssessmentResponse = {
      ...baseAssessment,
      assessment_id: 'asm_future_preview_900',
      decision: 'NO_GO',
      conditions: {
        ...baseAssessment.conditions,
        risk_level: 'HIGH',
        wind_speed_knots: 35,
        wave_height_meters: 3.8,
      },
      trip_context: {
        ...baseAssessment.trip_context,
        parent_assessment_id: baseAssessment.assessment_id,
        departure_time: '2026-10-04T12:00:00Z',
      },
    } as unknown as TripAssessmentResponse;

    // Helper replicating the FisherPage mapLayersTarget derivation
    const deriveMapLayersTarget = (
      activeAsm: TripAssessmentResponse | null,
      offset: number,
      proposal: {
        status: string;
        proposedAssessment?: TripAssessmentResponse;
        baselineAssessmentId?: string;
        hours?: number;
      } | null
    ) => {
      const isApplicable = Boolean(
        offset > 0 &&
        proposal &&
        proposal.status === 'success' &&
        proposal.proposedAssessment &&
        proposal.baselineAssessmentId === activeAsm?.assessment_id &&
        proposal.hours === offset
      );

      const target = offset === 0
        ? activeAsm
        : isApplicable
        ? proposal!.proposedAssessment!
        : null;

      const isPreview = Boolean(offset > 0 && isApplicable);
      return { target, isPreview };
    };

    // Case 1: At offset 0, targets active assessment
    const activeResult = deriveMapLayersTarget(baseAssessment, 0, null);
    expect(activeResult.target?.assessment_id).toBe('asm_base_100');
    expect(activeResult.target?.decision).toBe('GO');
    expect(activeResult.isPreview).toBe(false);

    // Case 2: At offset +6h with valid evaluated proposal, targets proposed assessment
    const previewResult = deriveMapLayersTarget(baseAssessment, 6, {
      status: 'success',
      proposedAssessment: proposedAsm,
      baselineAssessmentId: 'asm_base_100',
      hours: 6,
    });
    expect(previewResult.target?.assessment_id).toBe('asm_future_preview_900');
    expect(previewResult.target?.decision).toBe('NO_GO');
    expect((previewResult.target?.conditions as any).wind_speed_knots).toBe(35);
    expect(previewResult.isPreview).toBe(true);

    // Case 3: While proposal is pending/loading at +6h, target is null (NEVER fallback to active GO for future time!)
    const loadingResult = deriveMapLayersTarget(baseAssessment, 6, {
      status: 'pending',
      proposedAssessment: undefined,
      baselineAssessmentId: 'asm_base_100',
      hours: 6,
    });
    expect(loadingResult.target).toBeNull();
    expect(loadingResult.isPreview).toBe(false);

    // Case 4: If proposal was for old baseline, target is null
    const staleResult = deriveMapLayersTarget(baseAssessment, 6, {
      status: 'success',
      proposedAssessment: proposedAsm,
      baselineAssessmentId: 'asm_old_baseline',
      hours: 6,
    });
    expect(staleResult.target).toBeNull();
  });
});

