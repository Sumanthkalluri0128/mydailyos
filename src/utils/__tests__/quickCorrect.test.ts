import { correctQuick } from '../quickCorrect';
import { applyPending, PendingOp } from '../optimistic';

const D = '2026-10-03';
const entry = (over: any = {}) => ({ _id: 'q1', quick: true, date: D, foodName: 'Burger and fries', servings: 1, notes: 'Estimate 600–900 kcal +10% buffer',
  nutritionPerServing: { calories: 825, protein: 30, carbohydrates: 70.5, fat: 40 }, nutritionTotal: { calories: 825, protein: 30, carbohydrates: 70.5, fat: 40 }, ...over });

function harness(opts: { failWrite?: boolean } = {}) {
  const writes: any[] = []; const shown: any[] = []; const undos: { message: string; undo: () => Promise<void> }[] = []; let reloads = 0;
  const deps = {
    write: async (method: any, path: string, body: any, label: string, meta?: any) => { if (opts.failWrite) throw new Error('refused'); writes.push({ method, path, body, label, meta }); return {}; },
    showSaved: (p: any) => shown.push(p),
    offerUndo: (message: string, undo: () => Promise<void>) => undos.push({ message, undo }),
    reload: async () => { reloads++; },
  };
  return { deps, writes, shown, undos, reloads: () => reloads };
}

describe('correctQuick', () => {
  it('sends only what changed, with the day and the movement of each total as meta', async () => {
    const h = harness();
    await correctQuick(entry(), { calories: 700, fat: 30 }, h.deps);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/food-logs/q1', body: { calories: 700, fat: 30 }, label: 'Correct Burger and fries', meta: { date: D, delta: { calories: -125, fat: -10 } } });
  });

  it('shows the corrected entry at once and offers Undo with a line saying what changed', async () => {
    const h = harness();
    await correctQuick(entry(), { foodName: 'Veg burger', calories: 700 }, h.deps);
    expect(h.shown).toEqual([{ foodName: 'Veg burger', per: { calories: 700 } }]);
    expect(h.undos).toHaveLength(1);
    expect(h.undos[0].message).toBe('Veg burger is now 700 kcal');
  });

  it('Undo sends the old values and the old note back, with the opposite movement, then reloads', async () => {
    const h = harness();
    await correctQuick(entry(), { calories: 700, fat: 30 }, h.deps);
    await h.undos[0].undo();
    expect(h.writes).toHaveLength(2);
    expect(h.writes[1].body).toEqual({ calories: 825, fat: 40, notes: 'Estimate 600–900 kcal +10% buffer' });
    expect(h.writes[1].meta).toEqual({ date: D, delta: { calories: 125, fat: 10 } });
    expect(h.reloads()).toBe(1);
  });

  it('a refused write throws and nothing is shown or offered', async () => {
    const h = harness({ failWrite: true });
    let err = ''; try { await correctQuick(entry(), { calories: 700 }, h.deps); } catch (e: any) { err = e.message; }
    expect(err).toBe('refused');
    expect(h.shown).toHaveLength(0); expect(h.undos).toHaveLength(0);
  });

  it('a failed Undo write does not throw; the list is reloaded to show what the server has', async () => {
    const h = harness();
    await correctQuick(entry(), { calories: 700 }, h.deps);
    h.deps.write = async () => { throw new Error('refused'); };      // the Undo write fails
    await h.undos[0].undo();                                           // must not throw
    expect(h.reloads()).toBe(1);
  });
});

describe('offline round trip: correct, see it everywhere at once, Undo', () => {
  it('queued correction and queued Undo leave the day, the list and History exactly as they were', async () => {
    const ops: PendingOp[] = [];
    const h = harness(); h.deps.write = async (method: any, path: string, body: any, _l: string, meta?: any) => { ops.push({ method, path, body, meta, createdAt: ops.length + 1 }); return {}; };
    const x = entry();
    await correctQuick(x, { calories: 700, protein: 35 }, h.deps);
    const day: any = { date: D, food: [x], exercise: [], water: [], weight: [], tasks: [], habits: [], summary: { calories: 825, protein: 30, carbohydrates: 70.5, fat: 40, meals: { lunch: 825 }, waterMl: 0, exerciseMinutes: 0, workoutCalories: 0, stepCalories: 0, caloriesBurned: 0, steps: 0, weightKg: null } };
    const hist = (): any => ({ days: [{ date: D, waterMl: 0, calories: 2000, protein: 100, carbohydrates: 200, fat: 60, fiber: 0, sugar: 0, exerciseMinutes: 0, caloriesBurned: 0, steps: 0, tasksTotal: 0, tasksCompleted: 0, habitsCompleted: 0 }], totals: {} });

    expect(applyPending(`/api/food-logs?date=${D}`, { logs: [x] }, ops).logs[0].nutritionTotal.calories).toBe(700);
    expect(applyPending(`/api/progress/day?date=${D}`, day, ops).summary.protein).toBe(35);
    expect(applyPending('/api/progress/history?from=2026-10-03&to=2026-10-03', hist(), ops).days[0].calories).toBe(1875);

    await h.undos[0].undo();
    expect(ops).toHaveLength(2);
    expect(applyPending(`/api/food-logs?date=${D}`, { logs: [x] }, ops).logs[0].nutritionTotal.calories).toBe(825);
    expect(applyPending(`/api/progress/day?date=${D}`, day, ops).summary.protein).toBe(30);
    expect(applyPending('/api/progress/history?from=2026-10-03&to=2026-10-03', hist(), ops).days[0].calories).toBe(2000);
  });
});
