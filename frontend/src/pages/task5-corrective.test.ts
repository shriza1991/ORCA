import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import FisherPage from './FisherPage';
import RouteChoices from '../components/mission/RouteChoices';
import MissionChanges from '../components/mission/MissionChanges';
import { useChat } from '../hooks/useChat';
import { CACHE_EXPIRY_MS } from '../hooks/useTripAssessment';
import * as client from '../api/client';
import { assessmentMatchesInputs, validateRouteChoiceProposal, validateRefreshedAssessment } from '../utils/mission-proposal';
import { storedAssessmentMatchesRequest, getOfflineCacheKey } from '../utils/offline-cache';

vi.mock('../api/client', async () => ({ ...await vi.importActual<any>('../api/client'), sendMessage: vi.fn() }));
vi.mock('../i18n/i18n', () => ({ default: { changeLanguage: vi.fn() } }));
vi.mock('../utils/geo', async () => ({ ...await vi.importActual<any>('../utils/geo'), fetchAndFormatBaseLayers: vi.fn().mockResolvedValue([]) }));
vi.mock('../hooks/useAlerts', () => ({ useAlerts: () => ({ alerts: [], registerTrip: vi.fn(), acknowledgeAlert: vi.fn() }) }));
vi.mock('../hooks/useSpokenGuidance', () => ({ useSpokenGuidance: () => ({ speak: vi.fn() }) }));
vi.mock('../hooks/useGeolocation', () => ({ useGeolocation: () => ({ status: 'idle', location: null, isTracking: false, startTracking: vi.fn(), stopTracking: vi.fn() }) }));
vi.mock('../hooks/useGeofence', () => ({ useGeofence: () => ({ alerts: [], evaluationState: 'UNKNOWN', isEvaluating: false }) }));
vi.mock('../components/map/MapView', () => ({ default: (props: any) => createElement('map-snapshot', props) }));
vi.mock('../components/fisher/GuidedTripSetup', () => ({ default: (props: any) => createElement('trip-setup', props) }));
vi.mock('../components/chat/ChatPanel', () => ({ default: () => null }));
vi.mock('../components/fisher/FisherDecisionSurface', () => ({ default: () => null, getFisherDecisionStatus: (a: any) => a?.decision === 'GO' ? 'SAFE_TO_GO' : 'UNKNOWN' }));
vi.mock('../components/fisher/MissionSummary', () => ({ default: (props: any) => createElement('mission-summary', props), assessmentStatus: (a: any) => a?.decision || 'UNKNOWN' }));
vi.mock('../components/map/LocationWarningsOverlay', () => ({ default: () => null }));
vi.mock('../components/fisher/FisherAlertPanel', () => ({ default: () => null }));

const context = { origin_harbor: 'Ratnagiri', craft_profile: 'motorized_boat' as const, vessel_size: 'medium' as const,
  departure_time: '2026-10-04T06:00:00Z', return_time: '2026-10-04T18:00:00Z', target_pfz: 'pfz_1' };
// Canonical harbor coordinates from the production helper.
import { getHarborCoordinates } from '../utils/geo';
const coordinates = getHarborCoordinates('Ratnagiri');
const baseline: any = { assessment_id: 'baseline', evidence_bundle_id: 'evidence', assessed_at: '2026-10-03T06:00:00Z',
  trip_context: { ...context, coordinates }, decision: 'GO', conditions: { data_mode: 'DEMO' },
  mission_state: { mission_id: 'mission', vessel: { type: 'motorized_boat', size_category: 'medium' } },
  route_candidates: [{ route_id: 'route_1', is_recommended: true, departure_supported: true, geometry: { coordinates: [[73,17],[73,18]] } }],
  pfz_candidates: [], alerts: [], brief: { summary: 'Calm', positive_factors: [], negative_factors: [] } };
let tree: ReactTestRenderer;
let chat: ReturnType<typeof useChat>;
let store: Record<string,string>;
function Harness(props: any = {}) { chat = useChat(); return createElement(FisherPage, { chat, voiceProposal: props.voiceProposal, onVoiceProposalHandled: props.onHandled, theme: 'light', mobileView: 'map', onStartCall: vi.fn(), onOpenEvidence: vi.fn(), onBack: vi.fn(), onViewMap: vi.fn() }); }
function ChatProbe() { chat = useChat(); return null; }
async function mount(component: () => ReturnType<typeof createElement> | null = Harness) { await act(async () => { tree = create(createElement(component)); }); }
function navigate(label: string) { const nav = tree.root.findByProps({ 'aria-label': 'Fisher workspace' }); act(() => nav.findAllByType('button').find(b => b.findAllByType('span').some(span => span.children.includes(label)))!.props.onClick()); }
function map() { return tree.root.findByType('map-snapshot' as any).props; }
function deferred() { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); store = { 'orca.mission': JSON.stringify(context) };
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] || null, setItem: (k: string,v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => baseline }));
  vi.mocked(client.sendMessage).mockResolvedValue({ answer: 'Reply' } as any);
});
afterEach(() => { act(() => tree?.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Task 5 corrective production integration', () => {
  it('keeps assessment and evidence unchanged when navigating tabs or changing language', async () => {
    await mount();
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const label of ['Ask ORCA', 'Map', 'Alerts', 'Home', 'Plan', 'Home']) { navigate(label); await act(async () => {}); }
    act(() => chat.setLanguage('hi'));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chat.missionAssessment?.assessment_id).toBe('baseline');
  });

  it('hides the previous decision and omits chat baseline while a changed mission is pending', async () => {
    await mount();
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    act(() => chat.setMissionContext({ ...context, origin_harbor: 'Malvan' }));
    expect(map().assessment).toBeNull(); expect(map().canonicalDecision).toBe('UNKNOWN');
    await act(async () => { await chat.send('Can I go?'); });
    expect(vi.mocked(client.sendMessage).mock.calls[0][0].baseline_assessment_id).toBeUndefined();
    expect(vi.mocked(client.sendMessage).mock.calls[0][0].mission_state).toBeUndefined();
  });

  it('uses one proposed snapshot for geometry and telemetry, and adopts it without another assessment', async () => {
    await mount();
    const proposed = { ...baseline, assessment_id: 'proposal', decision: 'NO_GO',
      trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline', departure_time: '2026-10-04T12:00:00Z', return_time: '2026-10-05T00:00:00Z' },
      conditions: { data_mode: 'DEMO', marker: 'proposed' },
      route_candidates: [{ ...baseline.route_candidates[0], departure_supported: false, geometry: { coordinates: [[70,15],[71,16]] } }] };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ baseline, simulated: proposed, delta: {} }) } as any);
    await act(async () => { map().onTimeOffsetChange(6); });
    expect(map().assessment.assessment_id).toBe('proposal');
    expect(map().canonicalConditions.marker).toBe('proposed');
    expect(map().layers.find((l: any) => l.layer_id === 'route_route_1').geojson.features[0].geometry.coordinates).toEqual([[70,15],[71,16]]);
    const apply = tree.root.findAllByType('button').find(b => String(b.props.children).includes('Apply'))!;
    expect(apply).toBeDefined();
    await act(async () => { apply.props.onClick(); });
    expect(chat.missionAssessment?.assessment_id).toBe('proposal');
    expect(map().assessment.assessment_id).toBe('proposal');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('propagates mounted offline expiry to map and chat without re-fetching on navigation', async () => {
    vi.useFakeTimers();
    store['orca_trip_assessment_Ratnagiri_motorized_boat_2026-10-04T06:00:00Z'] = JSON.stringify({ timestamp: Date.now() - CACHE_EXPIRY_MS + 1000, data: baseline });
    vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
    await mount(); expect(map().canonicalDecision).toBe('GO');
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(map().canonicalDecision).toBe('UNKNOWN');
    expect(map().assessment.route_candidates[0].departure_supported).toBe(false);
    navigate('Ask ORCA');
    await act(async () => { await chat.send('Can I go?'); });
    expect(vi.mocked(client.sendMessage).mock.calls[0][0].baseline_assessment_id).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('assesses edits made inside the planner when leaving it, without assessing untouched navigation', async () => {
    await mount(); navigate('Plan');
    act(() => chat.setMissionContext({ ...context, vessel_size: 'small' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    navigate('Home'); await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).vessel_size).toBe('small');
  });

  it('central Apply rejects a callback captured before a mission edit', async () => {
    await mount(); navigate('Plan');
    await act(async () => { tree.root.findByType('trip-setup' as any).props.onComplete(context); });
    const capturedApply = tree.root.findByType(RouteChoices).props.onApply;
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    act(() => chat.setMissionContext({ ...context, origin_harbor: 'Malvan' }));
    act(() => capturedApply({ ...baseline, assessment_id: 'stale-proposal', trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline' } }));
    expect(chat.missionContext.origin_harbor).toBe('Malvan');
    expect(chat.missionAssessment?.assessment_id).toBe('baseline');
  });

  it('route selection cancels a response when its mounted baseline changes', async () => {
    const onApply = vi.fn(), pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    await act(async () => { tree = create(createElement(RouteChoices, { assessment: baseline, onApply })); });
    act(() => tree.root.findAllByType('button')[0].props.onClick());
    let request!: Promise<void>;
    act(() => { request = tree.root.findAllByType('button').find(b => String(b.props.children).includes('Use evaluated corridor'))!.props.onClick(); });
    act(() => tree.update(createElement(RouteChoices, { assessment: { ...baseline, assessment_id: 'new' }, onApply })));
    await act(async () => { pending.resolve({ ok: true, json: async () => ({ ...baseline, assessment_id: 'route-proposal', trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline' } }) }); await request; });
    expect(onApply).not.toHaveBeenCalled();
  });

  it('mounted refresh accepts new evidence and adopts only after explicit Apply', async () => {
    const onApply = vi.fn();
    const refreshed = { ...baseline, assessment_id: 'refresh', evidence_bundle_id: 'new-evidence', trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline' } };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ baseline, simulated: refreshed, delta: { decision_changed: true, changed_factors: [], added_factors: [], removed_factors: [] } }) } as any);
    await act(async () => { tree = create(createElement(MissionChanges, { assessment: baseline, onApply })); });
    await act(async () => { tree.root.findAllByType('button').find(b => b.props.children === 'Check for changes')!.props.onClick(); });
    expect(onApply).not.toHaveBeenCalled();
    act(() => tree.root.findAllByType('button').find(b => b.props.children === 'Review and use refreshed assessment')!.props.onClick());
    expect(onApply).toHaveBeenCalledWith(refreshed);
  });

  it('explicit voice proposal adoption uses the guarded Fisher flow without reassessment', async () => {
    await mount(); const handled = vi.fn();
    const voiceProposal = { ...baseline, assessment_id: 'voice-proposal', trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline', departure_time: '2026-10-04T12:00:00Z', return_time: '2026-10-05T00:00:00Z' } };
    await act(async () => tree.update(createElement(Harness, { voiceProposal, onHandled: handled })));
    expect(chat.missionAssessment?.assessment_id).toBe('voice-proposal');
    expect(map().assessment.assessment_id).toBe('voice-proposal');
    expect(fetch).toHaveBeenCalledTimes(1); expect(handled).toHaveBeenCalled();
  });

  it('rejects a chat reply after baseline replacement for identical mission parameters', async () => {
    await mount(ChatProbe);
    act(() => chat.setMissionAssessment(baseline));
    const pending = deferred(); vi.mocked(client.sendMessage).mockReturnValueOnce(pending.promise);
    let request!: Promise<void>; act(() => { request = chat.send('Why?'); });
    act(() => chat.setMissionAssessment({ ...baseline, assessment_id: 'new-baseline' }));
    await act(async () => { pending.resolve({ answer: 'Old answer', mission_state: { mission_id: 'old-state' } }); await request; });
    expect(chat.activeResponse).toBeNull(); expect(chat.missionState).toBeNull();
    expect(chat.messages[chat.messages.length - 1]?.content).toBe('Old answer');
  });

  it('keeps a new request loading after clear while an earlier request finishes', async () => {
    await mount(ChatProbe); const old = deferred(), next = deferred();
    vi.mocked(client.sendMessage).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    let oldRequest!: Promise<void>, nextRequest!: Promise<void>;
    act(() => { oldRequest = chat.send('Old'); }); act(() => chat.clearChat());
    act(() => { nextRequest = chat.send('New'); });
    await act(async () => { old.resolve({ answer: 'Old' }); await oldRequest; });
    expect(chat.isLoading).toBe(true);
    await act(async () => { next.resolve({ answer: 'New' }); await nextRequest; });
    expect(chat.isLoading).toBe(false); expect(chat.messages[chat.messages.length - 1]?.content).toBe('New');
  });
});

describe('Complete production mission validation', () => {
  it('rejects changed coordinates, data mode, and missing requested fields', () => {
    expect(assessmentMatchesInputs(baseline, { ...context, coordinates: [74,18] })).toBe(false);
    expect(assessmentMatchesInputs(baseline, { ...context, data_mode: 'LIVE' })).toBe(false);
    expect(storedAssessmentMatchesRequest({ ...baseline, trip_context: { ...baseline.trip_context, target_pfz: undefined } }, { originHarbor: 'Ratnagiri', destinationId: 'pfz_1' })).toBe(false);
    expect(storedAssessmentMatchesRequest(baseline, { originHarbor: 'Ratnagiri', destinationId: 'pfz_1', coordinates: [74,18] })).toBe(false);
  });
  it('rejects refresh changes in size, coordinates, destination or mode but allows fresh evidence', () => {
    const proposal = { ...baseline, assessment_id: 'refresh', evidence_bundle_id: 'fresh', trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline' } };
    expect(validateRefreshedAssessment(baseline, proposal).valid).toBe(true);
    for (const extra of [{ coordinates: [74,18] }, { target_pfz: 'other' }]) expect(validateRefreshedAssessment(baseline, { ...proposal, trip_context: { ...proposal.trip_context, ...extra } }).valid).toBe(false);
    expect(validateRefreshedAssessment(baseline, { ...proposal, mission_state: { ...baseline.mission_state, vessel: { size_category: 'large' } } }).valid).toBe(false);
    expect(validateRefreshedAssessment(baseline, { ...proposal, conditions: { data_mode: 'LIVE' } }).valid).toBe(false);
  });
  it('requires the requested supported route to actually be selected', () => {
    const proposal = { ...baseline, assessment_id: 'route', trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline' }, route_candidates: [{ route_id: 'requested', is_recommended: false, departure_supported: true }, { route_id: 'other', is_recommended: true, departure_supported: true }] };
    expect(validateRouteChoiceProposal(baseline, proposal, 'requested').valid).toBe(false);
  });
  it('normalizes timezone-equivalent timestamps in full cache identity', () => {
    expect(getOfflineCacheKey('Ratnagiri','motorized_boat','2026-10-04T06:00:00Z',context.return_time,'medium','pfz_1',coordinates,'DEMO')).toBe(getOfflineCacheKey('Ratnagiri','motorized_boat','2026-10-04T11:30:00+05:30',context.return_time,'medium','pfz_1',coordinates,'demo'));
  });
});
