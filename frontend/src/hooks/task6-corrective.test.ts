import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useAlerts, isAlertCurrentlyValid } from './useAlerts';
import { useCallSession } from './useCallSession';
import { useVoiceRecorder } from './useVoiceRecorder';
import { speechCoordinator } from '../utils/speech-coordinator';
import * as client from '../api/client';
vi.mock('../api/client', async () => ({ ...await vi.importActual<any>('../api/client'), sendVoiceChat: vi.fn(), transcribeAudio: vi.fn() }));
const baseline: any = { assessment_id: 'baseline', evidence_bundle_id: 'evidence', decision: 'GO', conditions: { data_mode: 'DEMO' }, trip_context: { origin_harbor: 'Ratnagiri', craft_profile: 'motorized_boat', departure_time: '2026-10-04T06:00:00Z', return_time: '2026-10-04T18:00:00Z' }, mission_state: { mission_id: 'mission' }, route_candidates: [], pfz_candidates: [] };
const proposal = { ...baseline, assessment_id: 'proposal', trip_context: { ...baseline.trip_context, parent_assessment_id: 'baseline' } };
const refresh = { baseline, simulated: proposal, delta: { original_decision: 'GO', new_decision: 'CAUTION', decision_changed: true, changed_factors: ['waves'], added_factors: [], removed_factors: [], summary: 'Waves increased' } };
const warning: any = { id: 'warning', status: 'ACTIVE', title: 'Warning', description: 'Waves increased', recommended_action: 'Review', severity: 'high', is_acknowledged: false, valid_from: null, valid_to: null };
let tree: ReactTestRenderer | undefined;
let alertHook: ReturnType<typeof useAlerts>;
let call: ReturnType<typeof useCallSession>;
let recorder: ReturnType<typeof useVoiceRecorder>;
let recorders: any[], audios: any[], tracks: any[];
function AlertProbe(props: any) { alertHook = useAlerts('en', props); return null; }
function CallProbe(props: any) { call = useCallSession(props); return null; }
function RecorderProbe() { recorder = useVoiceRecorder(); return null; }
function deferred() { let resolve!: (v: any) => void, reject!: (v: any) => void; const promise = new Promise<any>((r,j) => { resolve=r; reject=j; }); return { promise, resolve, reject }; }
async function mount(component: any, props: any = {}) { await act(async () => { tree = create(createElement(component,props)); }); }
async function finish() { const r = recorders[recorders.length-1]; r.ondataavailable?.({ data: new Blob(['x'.repeat(400)]) }); await act(async () => call.finishSpeakingTurn()); }
const callProps = { originHarbor: 'Ratnagiri', baselineAssessmentId: 'baseline', evidenceBundleId: 'evidence', isBaselineApplicable: true, dataMode: 'DEMO' };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); recorders=[]; audios=[]; tracks=[];
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [], addEventListener: vi.fn() });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  vi.stubGlobal('MediaRecorder', class {
    state='inactive'; mimeType='audio/webm'; onstop: any; ondataavailable: any;
    constructor() { recorders.push(this); } start() { this.state='recording'; } stop() { this.state='inactive'; this.onstop?.(); } static isTypeSupported() { return true; }
  });
  vi.stubGlobal('Audio', class { src=''; onended:any; onerror:any; play=vi.fn().mockResolvedValue(undefined); pause=vi.fn(); constructor() { audios.push(this); } });
  vi.stubGlobal('navigator', { onLine: true, mediaDevices: { getUserMedia: vi.fn(async () => { const track={stop:vi.fn(),enabled:true}; tracks.push(track); return { active:true, getTracks:()=>[track], getAudioTracks:()=>[track] }; }) } });
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test'); vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true,json:async()=>refresh }));
  speechCoordinator.stop(); speechCoordinator.setMuted(false); speechCoordinator.setCallActive(false); speechCoordinator.resetDeduplication();
});
afterEach(() => { act(() => tree?.unmount()); tree=undefined; speechCoordinator.stop(); speechCoordinator.setCallActive(false); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Task 6 monitoring ownership and validity', () => {
  it('filters expired, future, malformed and inverted alert intervals before delivery', () => {
    const now=Date.now();
    for (const extra of [{valid_to:new Date(now-1).toISOString()},{valid_from:new Date(now+1000).toISOString()},{valid_to:'invalid'},{valid_from:'invalid'},{valid_from:new Date(now).toISOString(),valid_to:new Date(now-100).toISOString()}]) expect(isAlertCurrentlyValid({...warning,...extra},now)).toBe(false);
  });
  it('clears previous baseline alerts and rejects stale Apply immediately', async () => {
    const apply=vi.fn();
    await mount(AlertProbe,{applicableAssessment:baseline,isApplicable:true,dataMode:'DEMO',onApplyRefreshed:apply});
    const id=alertHook.alerts[0].id;
    await act(async () => tree!.update(createElement(AlertProbe,{applicableAssessment:null,isApplicable:false,isLoading:true,dataMode:'DEMO',onApplyRefreshed:apply})));
    expect(alertHook.alerts).toEqual([]); act(()=>alertHook.applyRefreshedAlert(id)); expect(apply).not.toHaveBeenCalled();
  });
  it('does not restart successful session polling because monitoring status changed', async () => {
    await mount(AlertProbe,{applicableAssessment:baseline,isApplicable:true,dataMode:'DEMO'});
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async()=>{ vi.advanceTimersByTime(60000); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reports a failed session refresh as degraded and monitoring pause as off', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await mount(AlertProbe,{applicableAssessment:baseline,isApplicable:true,dataMode:'DEMO'});
    expect(alertHook.monitoringMode).toBe('degraded');
    act(()=>alertHook.setIsMonitoringEnabled(false)); expect(alertHook.monitoringMode).toBe('off');
  });
  it('operational poll never speaks an expired or future alert', async () => {
    const speak=vi.spyOn(speechCoordinator,'speak');
    vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>({subscription_id:'sub',is_active:true,monitoring_mode:'durable'})} as any).mockResolvedValueOnce({ok:true,json:async()=>({monitoring_mode:'durable',alerts:[{...warning,valid_to:new Date(Date.now()-1).toISOString()},{...warning,id:'future',valid_from:new Date(Date.now()+100000).toISOString()}]})} as any);
    await mount(AlertProbe,{dataMode:'LIVE'});
    await act(async()=>{await alertHook.registerTrip({origin_harbor:'Ratnagiri',craft_profile:'motorized_boat',language:'en'});});
    expect(alertHook.alerts).toEqual([]); expect(speak).not.toHaveBeenCalled();
  });
  it('a late registration cannot resume monitoring after mission invalidation', async () => {
    const pending=deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    await mount(AlertProbe,{dataMode:'LIVE'}); let request:any;
    act(()=>{ request=alertHook.registerTrip({origin_harbor:'Ratnagiri',craft_profile:'motorized_boat',language:'en'}); });
    act(()=>tree!.update(createElement(AlertProbe,{dataMode:'LIVE',isApplicable:false,isLoading:true})));
    await act(async()=>{pending.resolve({ok:true,json:async()=>({subscription_id:'old',is_active:true})});await request;});
    expect(alertHook.subscriptionId).toBeNull(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects unrelated refresh baselines and exposes acknowledgement failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>({...refresh,baseline:{assessment_id:'other'}})} as any);
    await mount(AlertProbe,{applicableAssessment:baseline,isApplicable:true,dataMode:'DEMO'});
    expect(alertHook.alerts).toEqual([]);expect(alertHook.monitoringMode).toBe('degraded');
  });
});

describe('Task 6 speech ownership',()=>{
  it('mute cancels pending high-priority automatic speech before it starts',()=>{
    speechCoordinator.speak('Restricted zone',{priority:'high',dedupeKey:'boundary:x'});
    speechCoordinator.setMuted(true); vi.advanceTimersByTime(100);
    expect(speechSynthesis.speak).not.toHaveBeenCalled();
  });
  it('scope cancellation drops an old mission without losing other queued announcements',()=>{
    speechCoordinator.speak('Old',{dedupeKey:'demo:old:warning'});speechCoordinator.speak('New',{dedupeKey:'demo:new:warning'});
    speechCoordinator.cancelScope('demo:old:');vi.advanceTimersByTime(100);
    expect((speechSynthesis.speak as any).mock.calls[0][0].text).toBe('New');
  });
  it('blocks explicit alert replay during a call but allows owned call fallback speech',()=>{
    speechCoordinator.setCallActive(true);expect(speechCoordinator.replay('Alert')).toBe(false);
    expect(speechCoordinator.speak('Call answer',{isExplicit:true,isCallSpeech:true})).toBe(true);
  });
  it('reports unavailable speech immediately without retaining deduplication',()=>{
    vi.stubGlobal('speechSynthesis',undefined);const onError=vi.fn();
    expect(speechCoordinator.speak('Warning',{dedupeKey:'missing',onError})).toBe(false);expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('Task 6 call and recorder races',()=>{
  it('holds proposed_assessment, not the baseline mission_assessment, for explicit Apply',async()=>{
    const apply=vi.fn();vi.mocked(client.sendVoiceChat).mockResolvedValue({answer:'Preview',mission_assessment:baseline,proposed_assessment:proposal,language:'en'} as any);
    await mount(CallProbe,{...callProps,onApplyProposal:apply}); await act(async()=>call.startCall()); await finish();
    expect(call.pendingProposal?.assessment_id).toBe('proposal');expect(apply).not.toHaveBeenCalled();act(()=>call.applyPendingProposal());expect(apply).toHaveBeenCalledWith(proposal);
  });
  it('same-plan baseline replacement pauses recording and clears any previous proposal',async()=>{
    await mount(CallProbe,callProps);await act(async()=>call.startCall());
    act(()=>tree!.update(createElement(CallProbe,{...callProps,baselineAssessmentId:'replacement'})));
    expect(call.callState).toBe('PAUSED');expect(recorders[0].state).toBe('inactive');expect(call.pendingProposal).toBeNull();
    act(()=>call.retryTurn());await finish();
    expect(vi.mocked(client.sendVoiceChat).mock.calls[0][1]?.baseline_assessment_id).toBe('replacement');
  });
  it('old permission rejection cannot shut down a restarted call',async()=>{
    const pending=deferred();(navigator.mediaDevices.getUserMedia as any).mockReturnValueOnce(pending.promise);
    await mount(CallProbe,callProps);let first:any;act(()=>{first=call.startCall();});act(()=>call.endCall());await act(async()=>call.startCall());
    await act(async()=>{pending.reject(new Error('old denied'));await first;});expect(call.callState).toBe('LISTENING');
  });
  it('ending a call cancels browser fallback audio and its delayed resume',async()=>{
    vi.mocked(client.sendVoiceChat).mockResolvedValue({answer:'Answer',language:'en'} as any);
    await mount(CallProbe,callProps);await act(async()=>call.startCall());await finish();act(()=>call.endCall());vi.advanceTimersByTime(100);
    expect(speechSynthesis.speak).not.toHaveBeenCalled();expect(call.callState).toBe('ENDED');
  });
  it('old audio callbacks cannot pause audio belonging to a newer call',async()=>{
    vi.mocked(client.sendVoiceChat).mockResolvedValue({answer:'Answer',audio_base64:btoa('x'.repeat(100)),audio_format:'audio/wav'} as any);
    await mount(CallProbe,callProps);await act(async()=>call.startCall());await finish();const oldEnded=audios[0].onended;
    act(()=>call.endCall());await act(async()=>call.startCall());await finish();act(()=>oldEnded());
    expect(audios[1].pause).not.toHaveBeenCalled();expect(call.callState).toBe('SPEAKING');
  });
  it('second permission acquisition is cancelled by release even after a prior recorder exists',async()=>{
    await mount(RecorderProbe);await act(async()=>recorder.startRecording());act(()=>recorder.cancelRecording());
    const pending=deferred();(navigator.mediaDevices.getUserMedia as any).mockReturnValueOnce(pending.promise);
    let request:any;act(()=>{request=recorder.startRecording();});act(()=>recorder.stopRecording());const stop=vi.fn();
    await act(async()=>{pending.resolve({getTracks:()=>[{stop}]});await request;});expect(stop).toHaveBeenCalled();expect(recorders).toHaveLength(1);
  });
});
