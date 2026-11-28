jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';

const item = { _id: 'p1', date: '2026-11-25', title: 'Push day', kind: 'strength', exercises: [{ name: 'Bench Press', sets: 4, reps: 8, kg: 60 }, { name: 'Plank', sets: 0, reps: 0, kg: 0 }] };
const fresh = () => { let M: any; jest.isolateModules(() => { M = require('../plannedStart'); }); return M; };
const as = async (email: string) => AsyncStorage.setItem('ff.cacheOwner', email);

beforeEach(async () => { await AsyncStorage.clear(); });

describe('a planned workout that was started', () => {
  it('begin, skip, end', async () => {
    await as('a@x.com'); const M = fresh();
    await M.loadPlannedStart();
    expect(M.getPlannedStart()).toBeNull();
    await M.beginPlannedStart(item);
    expect(M.getPlannedStart().item.id).toBe('p1'); expect(M.getPlannedStart().skipped).toEqual([]);
    M.skipPlannedStep('1:plank'); M.skipPlannedStep('1:plank');
    expect(M.getPlannedStart().skipped).toEqual(['1:plank']);
    M.endPlannedStart();
    expect(M.getPlannedStart()).toBeNull();
  });
  it('survives closing the app: a new start of the app reads it back', async () => {
    await as('a@x.com'); const A = fresh(); await A.beginPlannedStart(item); A.skipPlannedStep('0:bench');
    await new Promise((r) => setTimeout(r, 0));
    const B = fresh(); await B.loadPlannedStart();
    expect(B.getPlannedStart().item.title).toBe('Push day'); expect(B.getPlannedStart().skipped).toEqual(['0:bench']);
  });
  it('another account on the phone does not see it, and the first still has it after switching back', async () => {
    await as('a@x.com'); const A = fresh(); await A.beginPlannedStart(item); await new Promise((r) => setTimeout(r, 0));
    await as('b@x.com'); await A.loadPlannedStart();
    expect(A.getPlannedStart()).toBeNull();
    await as('a@x.com'); await A.loadPlannedStart();
    expect(A.getPlannedStart().item.id).toBe('p1');
  });
  it('ending it removes it from storage', async () => {
    await as('a@x.com'); const A = fresh(); await A.beginPlannedStart(item); A.endPlannedStart(); await new Promise((r) => setTimeout(r, 0));
    expect(await AsyncStorage.getItem('flexfit_planstart_v1:a@x.com')).toBeNull();
  });
  it('damaged or foreign saved data is ignored, and nothing happens with nobody signed in', async () => {
    await as('a@x.com'); await AsyncStorage.setItem('flexfit_planstart_v1:a@x.com', '{not json');
    const A = fresh(); await A.loadPlannedStart(); expect(A.getPlannedStart()).toBeNull();
    await AsyncStorage.clear(); const B = fresh(); await B.beginPlannedStart(item);   // no owner known
    expect(B.getPlannedStart().item.id).toBe('p1');                                  // still works in memory
    expect(await AsyncStorage.getAllKeys()).toEqual([]);                              // but is not written under no account
  });
});
