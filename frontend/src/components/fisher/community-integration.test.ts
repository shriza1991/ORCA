import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest';
import { createElement } from 'react';
import { create,act,ReactTestRenderer } from 'react-test-renderer';
import Community from './CommunityObservationsPanel';
import * as api from '../../api/client';
vi.mock('../../api/client',()=>({ getFieldObservations:vi.fn(),submitFieldObservation:vi.fn(),corroborateFieldObservation:vi.fn(),uploadFieldImage:vi.fn() }));
vi.mock('../../hooks/useVoiceRecorder',()=>({useVoiceRecorder:()=>({isSupported:false,isRecording:false,isTranscribing:false})}));
let tree:ReactTestRenderer;
const feed={observations:[],total_count:0,epistemic_notice:'No reports does not mean safe.',feed_generated_at:'2026-10-04T06:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.getFieldObservations).mockResolvedValue(feed);});
afterEach(()=>{act(()=>tree?.unmount());});
async function mount(props:any={}){await act(async()=>{tree=create(createElement(Community,{harbor:'Malvan',...props}));});}
function button(text:string){return tree.root.findAllByType('button').find(b=>b.children.some(c=>typeof c==='string'&&c.includes(text)));}
describe('Community integration',()=>{
 it('loads the real API instead of inventing initial Ratnagiri reports',async()=>{const onSignals=vi.fn();await mount({dataMode:'LIVE',onSignals});expect(api.getFieldObservations).toHaveBeenCalledWith({harbor:'Malvan',include_demo:false});expect(onSignals).toHaveBeenLastCalledWith([]);});
 it('requires an explicit observation location before submission',async()=>{await mount();await act(async()=>button('Report')?.props.onClick());const form=tree.root.findByType('form');await act(async()=>{await form.props.onSubmit({preventDefault:vi.fn()});});expect(api.submitFieldObservation).not.toHaveBeenCalled();expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('location');});
 it('posts the selected confirmed location and preserves demo identity',async()=>{await mount({userCoordinates:[73.47,16.06]});await act(async()=>button('Report')?.props.onClick());const check=tree.root.findAllByType('input').find(x=>x.props.type==='checkbox')!;act(()=>check.props.onChange({target:{checked:true}}));vi.mocked(api.submitFieldObservation).mockResolvedValue({public_id:'saved'} as any);await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault:vi.fn()});});expect(api.submitFieldObservation).toHaveBeenCalledWith(expect.objectContaining({longitude:73.47,latitude:16.06,harbor_reference:'Malvan',is_demo:true}));});
 it('shows a persistence error rather than claiming success',async()=>{await mount({userCoordinates:[73.47,16.06]});await act(async()=>button('Report')?.props.onClick());act(()=>tree.root.findAllByType('input').find(x=>x.props.type==='checkbox')!.props.onChange({target:{checked:true}}));vi.mocked(api.submitFieldObservation).mockRejectedValue(new Error('Not saved'));await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault:vi.fn()});});expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('Not saved');expect(tree.root.findByType('form')).toBeTruthy();});
});
