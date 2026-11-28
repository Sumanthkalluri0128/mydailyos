// Deleting a finished workout on the phone must also remove its server entry (or the day's burn stays inflated), but only AFTER the Undo window,
// never when Undo was pressed, safely offline, and never while the workout's own send is still running.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockWrite = jest.fn();
const mockRead = jest.fn();
const mockSetPlan = jest.fn();
jest.mock('../offline', () => ({ write: (...a: any[]) => mockWrite(...a), read: (...a: any[]) => mockRead(...a) }));
jest.mock('../smartPlanStore', () => ({ setSmartPlan: (...a: any[]) => mockSetPlan(...a) }));
jest.mock('../../config/api', () => {
  class ApiError extends Error { status: number; data: any; network: boolean; constructor(m: string, status = 0, data: any = {}, network = false) { super(m); this.status = status; this.data = data; this.network = network; } }
  return { ApiError, today: () => '2026-11-23' };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

const T0 = 1_800_000_000_000;
let now = T0;
const session = (id: string, over: any = {}) => ({
  id, date: '2026-11-23', dayN: 1, title: 'Day 1', short: 'Upper', kind: 'strength', startedAt: 1, endedAt: 2, durationSec: 2400, kcal: 250, volumeKg: 1000, setsDone: 3,
  exercises: [{ baseId: 'bench', exId: 'bench', sets: [{ kg: 40, reps: 8, done: true }], restSec: 90, targetReps: '8', unit: 'reps', hint: '' }], feel: 'good', note: '', warmDone: 0, coolDone: 0, synced: true, ...over,
});
const fresh = async (state: any = {}) => {
  let S: any, Y: any;
  jest.isolateModules(() => { S = require('../workoutStore'); Y = require('../workoutSync'); });
  await S.loadWorkout();
  S.setWorkout(state);
  return { S, Y };
};
const deletes = () => mockWrite.mock.calls.filter((c) => c[0] === 'DELETE').map((c) => c[1]);

beforeEach(async () => {
  await AsyncStorage.clear();
  mockWrite.mockReset(); mockRead.mockReset(); mockSetPlan.mockReset();
  mockWrite.mockResolvedValue({ queued: false, data: {} });
  now = T0; jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('delete a finished workout: server entry goes too', () => {
  it('removes it here at once and puts the server delete on a saved list, held back for the Undo window', async () => {
    const { S, Y } = await fresh({ sessions: [session('a', { plan: 'smart' }), session('b')] });
    S.deleteSessionEverywhere(S.getWorkout().sessions[0]);
    expect(S.getWorkout().sessions.map((x: any) => x.id)).toEqual(['b']);
    const p = S.getWorkout().pendingDeletes;
    expect(p).toEqual([{ clientId: 'wp-a', kind: 'smart', at: T0, after: T0 + S.UNDO_WINDOW_MS }]);
    expect(String(await AsyncStorage.getItem('flexfit_workout_v1'))).toContain('wp-a');   // saved straight away, so closing the app loses nothing
    await Y.flushSessionDeletes();
    expect(deletes()).toEqual([]);                                                          // still inside the Undo window
  });

  it('Smart workouts use the body-plan route (with wp-<id> and the person\'s day), classic ones the exercise-entry route (ws-<id>)', async () => {
    const { S, Y } = await fresh({ sessions: [session('a', { plan: 'smart' }), session('b')] });
    S.deleteSessionEverywhere(S.getWorkout().sessions[0]); S.deleteSessionEverywhere(S.getWorkout().sessions[0]);
    now = T0 + S.UNDO_WINDOW_MS + 1;
    mockWrite.mockResolvedValueOnce({ queued: false, data: { plan: { ready: true, marker: 1 } } }).mockResolvedValueOnce({ queued: false, data: {} });
    await Y.flushSessionDeletes();
    expect(deletes()).toEqual(['/api/body-plan/session?clientId=wp-a&date=2026-11-23', '/api/activities/logs?clientId=ws-b']);
    expect(S.getWorkout().pendingDeletes).toEqual([]);
    expect(mockSetPlan).toHaveBeenCalledWith({ ready: true, marker: 1 });
  });

  it('Undo brings the workout back and nothing is ever sent', async () => {
    const { S, Y } = await fresh({ sessions: [session('a', { plan: 'smart' })] });
    const s = S.getWorkout().sessions[0];
    S.deleteSessionEverywhere(s);
    S.undoSessionDelete(s);
    expect(S.getWorkout().sessions.map((x: any) => x.id)).toEqual(['a']);
    expect(S.getWorkout().pendingDeletes).toEqual([]);
    now = T0 + 60_000; await Y.flushSessionDeletes();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('closing the app inside the Undo window loses nothing: the delete is sent the next time the tab opens', async () => {
    const a = await fresh({ sessions: [session('a')] });
    a.S.deleteSessionEverywhere(a.S.getWorkout().sessions[0]);
    await a.S.flushWorkout();
    now = T0 + 3_600_000;                                                                   // much later: a new app start
    const b = await fresh();
    const saved = JSON.parse(String(await AsyncStorage.getItem('flexfit_workout_v1')));
    expect(saved.pendingDeletes.map((d: any) => d.clientId)).toEqual(['ws-a']);
    jest.isolateModules(() => { b.S = require('../workoutStore'); b.Y = require('../workoutSync'); });
    await b.S.loadWorkout();
    expect(b.S.getWorkout().pendingDeletes.length).toBe(1);
    await b.Y.flushSessionDeletes();
    expect(deletes()).toEqual(['/api/activities/logs?clientId=ws-a']);
    expect(b.S.getWorkout().pendingDeletes).toEqual([]);
  });

  it('offline: the phone\'s own queue takes the delete (it replays in order), so it leaves the list', async () => {
    const { S, Y } = await fresh({ sessions: [session('a')] });
    S.deleteSessionEverywhere(S.getWorkout().sessions[0]); now = T0 + 9000;
    mockWrite.mockResolvedValue({ queued: true, data: null });
    await Y.flushSessionDeletes();
    expect(deletes().length).toBe(1);
    expect(S.getWorkout().pendingDeletes).toEqual([]);
  });

  it('no connection at all (the request never left): it stays on the list and is tried again, once', async () => {
    const { S, Y } = await fresh({ sessions: [session('a')] });
    const { ApiError } = require('../../config/api');
    S.deleteSessionEverywhere(S.getWorkout().sessions[0]); now = T0 + 9000;
    mockWrite.mockRejectedValueOnce(new ApiError('offline', 0, {}, true));
    await Y.flushSessionDeletes();
    expect(S.getWorkout().pendingDeletes.length).toBe(1);
    await Y.flushSessionDeletes();
    expect(deletes().length).toBe(2);
    expect(S.getWorkout().pendingDeletes).toEqual([]);
  });

  it('a server error keeps it; a refusal for good (400) drops it so it cannot loop for ever', async () => {
    const { S, Y } = await fresh({ sessions: [session('a'), session('b')] });
    const { ApiError } = require('../../config/api');
    S.deleteSessionEverywhere(S.getWorkout().sessions[0]); S.deleteSessionEverywhere(S.getWorkout().sessions[0]); now = T0 + 9000;
    mockWrite.mockRejectedValueOnce(new ApiError('boom', 500));
    await Y.flushSessionDeletes();
    expect(S.getWorkout().pendingDeletes.length).toBe(2);                                   // stopped at the first failure; the rest wait
    mockWrite.mockRejectedValueOnce(new ApiError('bad', 400)).mockResolvedValueOnce({ queued: false, data: {} });
    await Y.flushSessionDeletes();
    expect(S.getWorkout().pendingDeletes).toEqual([]);
  });

  it('a rest-day entry never reached the server, so nothing is queued for it', async () => {
    const { S } = await fresh({ sessions: [session('r', { kind: 'rest' })] });
    S.deleteSessionEverywhere(S.getWorkout().sessions[0]);
    expect(S.getWorkout().pendingDeletes).toEqual([]);
    expect(S.getWorkout().sessions).toEqual([]);
  });

  it('an older saved state without the list loads fine; a damaged list is ignored', async () => {
    await AsyncStorage.setItem('flexfit_workout_v1', JSON.stringify({ v: 1, sessions: [session('x')] }));
    let S: any; jest.isolateModules(() => { S = require('../workoutStore'); }); await S.loadWorkout();
    expect(S.getWorkout().pendingDeletes).toEqual([]);
    await AsyncStorage.setItem('flexfit_workout_v1', JSON.stringify({ v: 1, sessions: [], pendingDeletes: 'junk' }));
    jest.isolateModules(() => { S = require('../workoutStore'); }); await S.loadWorkout();
    expect(S.getWorkout().pendingDeletes).toEqual([]);
  });
});

describe('races with the workout\'s own send', () => {
  it('a delete waits for that workout\'s send to finish, so the send cannot bring it back', async () => {
    const { S, Y } = await fresh({ sessions: [session('a', { plan: 'smart', synced: false })] });
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const order: string[] = [];
    mockWrite.mockImplementation(async (method: string, path: string) => { if (method === 'POST') { await gate; order.push('POST'); return { queued: false, data: {} }; } order.push('DELETE'); return { queued: false, data: {} }; });
    const sending = Y.syncSessionToLog(S.getWorkout().sessions[0]);                          // in progress, stuck
    S.deleteSessionEverywhere(S.getWorkout().sessions[0]); now = T0 + 9000;
    await Y.flushSessionDeletes();
    expect(order).toEqual([]);                                                              // the delete did not overtake the send
    release(); await sending; await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['POST', 'DELETE']);
    expect(S.getWorkout().pendingDeletes).toEqual([]);
  });

  it('a workout deleted while an earlier one is being sent is not sent at all afterwards', async () => {
    const { S, Y } = await fresh({ sessions: [session('first', { plan: 'smart', synced: false }), session('second', { plan: 'smart', synced: false })] });
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const posted: string[] = [];
    mockWrite.mockImplementation(async (method: string, _p: string, body: any) => { if (method === 'POST') { await gate; posted.push(body.clientId); } return { queued: false, data: {} }; });
    const run = Y.retryUnsynced();
    await new Promise((r) => setTimeout(r, 0));
    S.deleteSessionEverywhere(S.getWorkout().sessions.find((x: any) => x.id === 'second'));
    release(); await run;
    expect(posted).toEqual(['wp-first']);
  });
});
