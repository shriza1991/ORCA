import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useGeofence, type UseGeofenceReturn } from './useGeofence';
import type { LocationData, GeolocationStatus } from './useGeolocation';

let tree: ReactTestRenderer | undefined;
let result: UseGeofenceReturn;
const fix = (edit: Partial<LocationData> = {}): LocationData => ({ latitude: 15.4, longitude: 73.25, accuracy: 15, speed: null, heading: null, timestamp: Date.now(), ...edit });
function Probe({ location, status = 'accurate' }: { location: LocationData | null; status?: GeolocationStatus }) {
  result = useGeofence(location, status); return null;
}
const reply = (state = 'CLEAR') => ({ ok: true, json: async () => ({ evaluation_state: state, warnings: state === 'CLEAR' ? [] : [{ boundary_id: 'zone', boundary_name: 'Zone', distance_km: 2, is_inside: state === 'INSIDE', boundary_type: 'NAVAL_FIRING_RANGE' }] }) });
async function render(location: LocationData | null, status: GeolocationStatus = 'accurate') {
  await act(async () => { if (tree) tree.update(createElement(Probe, { location, status })); else tree = create(createElement(Probe, { location, status })); });
}
async function advance(ms: number) { await act(async () => { vi.advanceTimersByTime(ms); }); }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T12:00:00Z')); });
afterEach(() => { act(() => tree?.unmount()); tree = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('production useGeofence lifecycle', () => {
  it('evaluates the first fix and preserves geometric warning truth', async () => {
    const fetch = vi.fn().mockResolvedValue(reply('APPROACHING')); vi.stubGlobal('fetch', fetch);
    await render(fix());
    expect(fetch).toHaveBeenCalledTimes(1); expect(result.evaluationState).toBe('APPROACHING');
    expect(result.alerts[0].isInside).toBe(false); expect(result.isLoading).toBe(false);
  });
  it.each(['stale', 'denied', 'unavailable', 'timeout', 'idle'] as GeolocationStatus[])('demotes immediately on %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply())); const location = fix();
    await render(location); expect(result.evaluationState).toBe('CLEAR');
    await render(location, status); expect(result.evaluationState).toBe('UNKNOWN'); expect(result.alerts).toEqual([]); expect(result.isLoading).toBe(false);
  });
  it('expires a result without another GPS event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply())); await render(fix());
    await advance(29999); expect(result.evaluationState).toBe('CLEAR');
    await advance(1); expect(result.evaluationState).toBe('UNKNOWN'); expect(result.alerts).toEqual([]);
  });
  it.each([{ timestamp: Date.parse('2026-10-03T11:00:00Z') }, { accuracy: 250 }, { accuracy: NaN }, { timestamp: Date.parse('2026-10-04T12:00:00Z') }])('rejects unusable fix %j', async edit => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await render(fix(edit));
    expect(fetch).not.toHaveBeenCalled(); expect(result.evaluationState).toBe('UNKNOWN');
  });
  it('keeps a stationary in-flight request alive and schedules the latest trailing fix', async () => {
    let resolve!: (value: ReturnType<typeof reply>) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(reply('APPROACHING'));
    vi.stubGlobal('fetch', fetch); await render(fix()); const signal = fetch.mock.calls[0][1].signal;
    await advance(100); const latest = fix(); await render(latest);
    expect(signal.aborted).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve(reply())); expect(result.evaluationState).toBe('CLEAR');
    await advance(2400); expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body).timestamp).toBe(latest.timestamp);
    expect(result.evaluationState).toBe('APPROACHING'); expect(result.isLoading).toBe(false);
  });
  it('evaluates small movement on the trailing timer even without another GPS update', async () => {
    const fetch = vi.fn().mockResolvedValue(reply()); vi.stubGlobal('fetch', fetch); await render(fix());
    await advance(100); await render(fix({ latitude: 15.40001 }));
    expect(result.evaluationState).toBe('UNKNOWN'); await advance(2400);
    expect(fetch).toHaveBeenCalledTimes(2); expect(result.isLoading).toBe(false);
  });
  it('ignores a superseded response even when the mock transport ignores abort', async () => {
    let old!: (value: ReturnType<typeof reply>) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(r => { old = r; })).mockResolvedValue(reply('INSIDE'));
    vi.stubGlobal('fetch', fetch); await render(fix()); await render(fix({ latitude: 15.5 }));
    expect(result.evaluationState).toBe('INSIDE'); await act(async () => old(reply()));
    expect(result.evaluationState).toBe('INSIDE');
  });
  it('late replies cannot restore a result after expiry', async () => {
    let resolve!: (value: ReturnType<typeof reply>) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })));
    await render(fix()); await advance(30000); await act(async () => resolve(reply()));
    expect(result.evaluationState).toBe('UNKNOWN'); expect(result.isLoading).toBe(false);
  });
  it('fails closed on HTTP failure and unmount cancels outstanding work', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }); vi.stubGlobal('fetch', fetch);
    await render(fix()); expect(result.evaluationState).toBe('UNKNOWN'); expect(result.isLoading).toBe(false);
    const signal = fetch.mock.calls[0][1].signal; act(() => tree!.unmount()); tree = undefined;
    expect(signal.aborted).toBe(true); await advance(30000); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
