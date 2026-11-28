// Sending finished workouts to the server (audit WORK-06 / XPLAT-02). Before: the phone looked only at the last five unsent workouts and stopped at the first
// failure, so one workout the server refused blocked every later one and older ones were never sent; a refusal was retried on every tab open for ever
// and the person was never told. Now: no connection stops the run (nothing is lost); a refused workout is flagged with its reason and the others still go.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockWrite = jest.fn();
const mockRead = jest.fn();
jest.mock('../offline', () => ({ write: (...a: any[]) => mockWrite(...a), read: (...a: any[]) => mockRead(...a) }));
jest.mock('../smartPlanStore', () => ({ setSmartPlan: jest.fn() }));
jest.mock('../../config/api', () => {
  class ApiError extends Error { status: number; data: any; network: boolean; constructor(m: string, status = 0, data: any = {}, network = false) { super(m); this.status = status; this.data = data; this.network = network; } }
  return { ApiError, today: () => '2026-11-23' };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

const dayAgo = (n: number) => new Date(Date.UTC(2026, 10, 23) - n * 86400000).toISOString().slice(0, 10);
const session = (id: string, over: any = {}) => ({
  id, date: dayAgo(1), dayN: 1, title: 'Day 1', short: 'Upper', kind: 'strength', startedAt: 1, endedAt: 2, durationSec: 2400, kcal: 250, volumeKg: 1000, setsDone: 3,
  exercises: [{ baseId: 'bench', exId: 'bench', sets: [{ kg: 40, reps: 8, done: true }], restSec: 90, targetReps: '8', unit: 'reps', hint: '' }], feel: 'good', note: '', warmDone: 0, coolDone: 0, synced: false, ...over,
});
const ACTIVITIES = [{ _id: 'act1', name: 'Strength Training', category: 'Strength' }, { _id: 'act2', name: 'Bodyweight circuit', category: 'General' }];
const fresh = async (state: any = {}) => {
  let S: any, Y: any; const { ApiError } = require('../../config/api');
  jest.isolateModules(() => { S = require('../workoutStore'); Y = require('../workoutSync'); });
  await S.loadWorkout(); S.setWorkout(state);
  return { S, Y, ApiError };
};
const posted = () => mockWrite.mock.calls.filter((c) => c[0] === 'POST').map((c) => c[2].clientId);
const byId = (S: any, id: string) => S.getWorkout().sessions.find((x: any) => x.id === id);

beforeEach(async () => {
  await AsyncStorage.clear(); mockWrite.mockReset(); mockRead.mockReset();
  mockRead.mockResolvedValue({ activities: ACTIVITIES });
  mockWrite.mockResolvedValue({ queued: false, data: {} });
});

describe('every unsent workout is tried, not just the last five', () => {
  it('seven unsent classic workouts: all seven are sent and marked sent', async () => {
    const { S, Y } = await fresh({ sessions: Array.from({ length: 7 }, (_, i) => session(`s${i}`, { date: dayAgo(7 - i) })) });
    expect(await Y.retryUnsynced()).toBe(0);
    expect(posted()).toEqual(Array.from({ length: 7 }, (_, i) => `ws-s${i}`));
    expect(S.getWorkout().sessions.every((x: any) => x.synced)).toBe(true);
  });
  it('up to 60 days back; anything older stays on the phone only', async () => {
    const { S, Y } = await fresh({ sessions: [session('d30', { date: dayAgo(30) }), session('d70', { date: dayAgo(70) })] });
    await Y.retryUnsynced();
    expect(posted()).toEqual(['ws-d30']);
    expect(byId(S, 'd70').synced).toBe(false); expect(byId(S, 'd70').syncFailed).toBeUndefined();
  });
});

describe('a workout the server refuses does not block the rest, and is not lost silently', () => {
  it('flags it with the server\'s reason, still sends the later ones, and tells how many were refused', async () => {
    const { S, Y, ApiError } = await fresh({ sessions: [session('a', { date: dayAgo(3) }), session('stuck', { date: dayAgo(2) }), session('c', { date: dayAgo(1) })] });
    mockWrite.mockImplementation(async (_m: string, _p: string, body: any) => { if (body.clientId === 'ws-stuck') throw new ApiError('Duration must be between 1 and 1440', 400); return { queued: false, data: {} }; });
    expect(await Y.retryUnsynced()).toBe(1);
    expect(posted()).toEqual(['ws-a', 'ws-stuck', 'ws-c']);
    expect(byId(S, 'a').synced).toBe(true); expect(byId(S, 'c').synced).toBe(true);
    expect(byId(S, 'stuck').synced).toBe(false);
    expect(byId(S, 'stuck').syncFailed.reason).toBe('Duration must be between 1 and 1440');
  });
  it('a flagged workout is not retried by itself (no loop), and "Try again" sends it once more', async () => {
    const { S, Y, ApiError } = await fresh({ sessions: [session('stuck')] });
    mockWrite.mockRejectedValueOnce(new ApiError('Nope', 422));
    await Y.retryUnsynced();
    mockWrite.mockClear();
    await Y.retryUnsynced(); await Y.retryUnsynced();
    expect(mockWrite).not.toHaveBeenCalled();                                   // not retried on every tab open
    S.retrySession('stuck');
    expect(byId(S, 'stuck').syncFailed).toBeUndefined();
    await Y.retryUnsynced();
    expect(posted()).toEqual(['ws-stuck']);
    expect(byId(S, 'stuck').synced).toBe(true); expect(byId(S, 'stuck').syncFailed).toBeUndefined();
  });
  it('a Smart workout the server refuses is flagged too (on the web it used to be marked as sent)', async () => {
    const { S, Y, ApiError } = await fresh({ sessions: [session('sm', { plan: 'smart' })] });
    mockWrite.mockRejectedValueOnce(new ApiError('Unknown exercise', 400));
    expect(await Y.retryUnsynced()).toBe(1);
    expect(byId(S, 'sm').synced).toBe(false); expect(byId(S, 'sm').syncFailed.reason).toBe('Unknown exercise');
  });
  it('the exercise type missing from a loaded list is a refusal with a plain reason; an empty list is just "not loaded yet"', async () => {
    const a = await fresh({ sessions: [session('x', { kind: 'conditioning' })] });
    mockRead.mockResolvedValue({ activities: [{ _id: 'z', name: 'Yoga', category: 'Flexibility' }] });
    expect(await a.Y.retryUnsynced()).toBe(1);
    expect(byId(a.S, 'x').syncFailed.reason).toMatch(/exercise type/i);
    const b = await fresh({ sessions: [session('y')] });
    mockRead.mockResolvedValue({ activities: [] });
    expect(await b.Y.retryUnsynced()).toBe(0);
    expect(byId(b.S, 'y').syncFailed).toBeUndefined(); expect(byId(b.S, 'y').synced).toBe(false);
  });
});

describe('no connection is not a failure', () => {
  it('stops at the first one, flags nothing, marks nothing sent, and the next run sends them all', async () => {
    const { S, Y, ApiError } = await fresh({ sessions: [session('a', { date: dayAgo(2) }), session('b', { date: dayAgo(1) })] });
    mockWrite.mockRejectedValue(new ApiError('offline', 0, {}, true));
    expect(await Y.retryUnsynced()).toBe(0);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(S.getWorkout().sessions.every((x: any) => !x.synced && !x.syncFailed)).toBe(true);
    mockWrite.mockReset(); mockWrite.mockResolvedValue({ queued: false, data: {} });
    await Y.retryUnsynced();
    expect(posted()).toEqual(['ws-a', 'ws-b']);
  });
  it('a busy or asleep server (500, 429) or being signed out (401) is also just "later"', async () => {
    for (const status of [500, 503, 429, 401]) {
      mockWrite.mockReset(); const { S, Y, ApiError } = await fresh({ sessions: [session('a')] });
      mockWrite.mockRejectedValueOnce(new ApiError('later', status));
      await Y.retryUnsynced();
      expect(byId(S, 'a').syncFailed).toBeUndefined();
      expect(byId(S, 'a').synced).toBe(false);
    }
  });
  it('the phone\'s own offline queue taking it counts as sent (it replays it, in order)', async () => {
    const { S, Y } = await fresh({ sessions: [session('a')] });
    mockWrite.mockResolvedValue({ queued: true, data: null });
    await Y.retryUnsynced();
    expect(byId(S, 'a').synced).toBe(true);
  });
  it('no cached exercise list and no signal: the read fails, so it is "later", not refused', async () => {
    const { S, Y, ApiError } = await fresh({ sessions: [session('a')] });
    mockRead.mockRejectedValue(new ApiError('offline', 0, {}, true));
    expect(await Y.retryUnsynced()).toBe(0);
    expect(byId(S, 'a').syncFailed).toBeUndefined(); expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe('right after finishing a workout', () => {
  it('syncAndRecord: sent -> marked sent; refused -> flagged with the reason; no connection -> left for later', async () => {
    const { S, Y, ApiError } = await fresh({ sessions: [session('a'), session('b'), session('c')] });
    expect(await Y.syncAndRecord(byId(S, 'a'))).toBe(true);
    expect(byId(S, 'a').synced).toBe(true);
    mockWrite.mockRejectedValueOnce(new ApiError('Bad data', 400));
    expect(await Y.syncAndRecord(byId(S, 'b'))).toBe(false);
    expect(byId(S, 'b').syncFailed.reason).toBe('Bad data');
    mockWrite.mockRejectedValueOnce(new ApiError('offline', 0, {}, true));
    expect(await Y.syncAndRecord(byId(S, 'c'))).toBe(false);
    expect(byId(S, 'c').syncFailed).toBeUndefined(); expect(byId(S, 'c').synced).toBe(false);
  });
  it('sending a flagged workout successfully clears its flag', async () => {
    const { S } = await fresh({ sessions: [session('a', { syncFailed: { reason: 'x', at: 1 } })] });
    S.markSynced('a');
    expect(byId(S, 'a').synced).toBe(true); expect(byId(S, 'a').syncFailed).toBeUndefined();
  });
  it('a flag is saved with the workout (survives closing the app) and never set on one that was already sent', async () => {
    const { S } = await fresh({ sessions: [session('a'), session('done', { synced: true })] });
    S.markSyncFailed('a', 'Bad data'); S.markSyncFailed('done', 'late');
    await S.flushWorkout();
    expect(String(await AsyncStorage.getItem('flexfit_workout_v1'))).toContain('Bad data');
    expect(byId(S, 'done').syncFailed).toBeUndefined();
  });
});
