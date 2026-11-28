// The Gym log belongs to the signed-in account: no leaking to the next account, and the old phone-wide log is adopted once.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';

const ent = (id: string) => ({ id, date: '2026-11-01', exId: 'bench', name: 'Bench', cat: 'Chest', unit: 'reps', sets: [{ kg: 40, reps: 10 }], at: 1 });
const legacy = { v: 1, entries: [ent('old1'), ent('old2')], body: [], goal: null, profile: { unit: 'kg' } };
const signIn = (email: string) => (email ? AsyncStorage.setItem('ff.cacheOwner', email) : AsyncStorage.removeItem('ff.cacheOwner'));
const fresh = () => { let S: any; jest.isolateModules(() => { S = require('../gymStore'); }); return S; };   // a new app start
const ids = (S: any) => S.getGym().entries.map((e: any) => e.id).sort();

describe('gym store per account', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('the first account to open the log takes over the old phone-wide log, once', async () => {
    await AsyncStorage.setItem('flexfit_gymlog_v1', JSON.stringify(legacy));
    await signIn('alice@x.dev');
    const S = fresh(); await S.loadGym();
    expect(ids(S)).toEqual(['old1', 'old2']);
    expect(await AsyncStorage.getItem('flexfit_gymlog_v1')).toBeNull();           // gone: nobody else can take it
    expect(await AsyncStorage.getItem('flexfit_gymlog_v2:alice@x.dev')).not.toBeNull();
  });

  it("another account on the same phone sees an empty log, and alice's stays hers", async () => {
    await AsyncStorage.setItem('flexfit_gymlog_v1', JSON.stringify(legacy));
    await signIn('alice@x.dev');
    const S = fresh(); await S.loadGym();
    await signIn('bob@x.dev'); await S.rebindGym();
    expect(ids(S)).toEqual([]);
    expect(S.gymOwner()).toBe('bob@x.dev');
    S.saveEntry(ent('bob1')); await S.flushGym();
    await signIn('alice@x.dev'); await S.rebindGym();
    expect(ids(S)).toEqual(['old1', 'old2']);
    expect(String(await AsyncStorage.getItem('flexfit_gymlog_v2:alice@x.dev'))).not.toContain('bob1');
    expect(String(await AsyncStorage.getItem('flexfit_gymlog_v2:bob@x.dev'))).toContain('bob1');
  });

  it('signed out: an empty log, and nothing is written', async () => {
    const S = fresh(); await S.loadGym();
    S.saveEntry(ent('ghost')); await S.flushGym();
    expect(S.gymOwner()).toBe('');
    expect((await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('flexfit_gymlog'))).toEqual([]);
  });

  it("changes from other devices are applied in one update and kept for the account", async () => {
    await AsyncStorage.setItem('flexfit_gymlog_v1', JSON.stringify(legacy));
    await signIn('alice@x.dev');
    const S = fresh(); await S.loadGym();
    await S.applyRemote([{ kind: 'entry', rid: 'r1', data: ent('r1') }, { kind: 'goal', rid: 'goal', data: { startDate: '2026-11-01', weightKg: 70, sites: {} } }], [{ kind: 'entry', rid: 'old2' }]);
    expect(ids(S)).toEqual(['old1', 'r1']);
    expect(S.getGym().goal.weightKg).toBe(70);
    expect(String(await AsyncStorage.getItem('flexfit_gymlog_v2:alice@x.dev'))).toContain('r1');
  });

  it('clearing on purpose is flagged for the sync, once', async () => {
    await signIn('alice@x.dev');
    const S = fresh(); await S.loadGym();
    await S.clearGym();
    expect(S.consumeBulkRecords()).toBe(true);
    expect(S.consumeBulkRecords()).toBe(false);
  });
});
