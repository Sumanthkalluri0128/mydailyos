import * as G from '../gymMath';
import { SAFE_AUTO_REMOVE, SYNC_DAYS, applyResult, fingerprint, hasWork, planGymSync, toPayload } from '../gymSync';

const E = (id: string, date: string, sets: [number, number][], over: Partial<G.GymEntry> = {}): G.GymEntry =>
  ({ id, date, exId: id, name: 'Bench Press', cat: 'chest', unit: 'reps', sets: sets.map(([kg, reps]) => ({ kg, reps })), at: Number(id.replace(/\D/g, '')) || 0, ...over });
const B = (date: string, kg: number): G.BodyEntry => ({ id: `b${date}`, date, sites: {}, at: 1, weightKg: kg });
const TODAY = '2026-11-12';

describe('payload', () => {
  it('uses the same minutes and kcal the Gym screen shows', () => {
    const e = E('e1', TODAY, [[40, 10], [40, 8]]);
    const p = toPayload(e, [B(TODAY, 80)]);
    expect(p.kcal).toBe(G.entryKcal(e, 80));
    expect(p.minutes).toBe(Math.max(1, Math.round(G.entryMinutes(e))));
    expect(p.bodyKg).toBe(80);
    expect(p.sets).toEqual([{ kg: 40, reps: 10 }, { kg: 40, reps: 8 }]);
  });
  it('assumes 70 kg (and sends no body weight) when none is logged', () => {
    const e = E('e1', TODAY, [[40, 10]]);
    const p = toPayload(e, []);
    expect(p.kcal).toBe(G.entryKcal(e, G.DEFAULT_BODY_KG));
    expect(p.bodyKg).toBeUndefined();
  });
});

describe('plan', () => {
  it('sends a new entry once, then nothing until it changes', () => {
    const e = E('e1', TODAY, [[40, 10]]);
    const first = planGymSync([e], [], { synced: {} }, TODAY);
    expect(first.upsert.map((p) => p.id)).toEqual(['e1']);
    const mem = applyResult({ synced: {} }, first.upsert, ['e1'], []);
    expect(hasWork(planGymSync([e], [], mem, TODAY))).toBe(false);
    const edited = E('e1', TODAY, [[40, 10], [40, 9]]);
    expect(planGymSync([edited], [], mem, TODAY).upsert).toHaveLength(1);
  });
  it('re-sends when the body weight changes the calories', () => {
    const e = E('e1', TODAY, [[40, 10]]);
    const mem = applyResult({ synced: {} }, planGymSync([e], [], { synced: {} }, TODAY).upsert, ['e1'], []);
    expect(planGymSync([e], [B(TODAY, 90)], mem, TODAY).upsert).toHaveLength(1);
  });
  it('removes what the server has but the log no longer holds', () => {
    const mem = { synced: { gone1: 'x' } };
    const p = planGymSync([], [], mem, TODAY);
    expect(p.removeIds).toEqual(['gone1']);
    expect(applyResult(mem, [], [], p.removeIds).synced).toEqual({});
  });
  it('does not mass-delete on a read error, but does when the person cleared the log', () => {
    const synced: Record<string, string> = {};
    for (let i = 0; i < SAFE_AUTO_REMOVE + 5; i++) synced[`e${i}`] = 'x';
    const quiet = planGymSync([], [], { synced }, TODAY);
    expect(quiet.removeIds).toHaveLength(0); expect(quiet.skippedRemovals).toBe(SAFE_AUTO_REMOVE + 5);
    expect(planGymSync([], [], { synced }, TODAY, true).removeIds).toHaveLength(SAFE_AUTO_REMOVE + 5);
  });
  it('leaves old history alone and skips entries with no valid set', () => {
    const old = E('e1', G.shiftDate(TODAY, -(SYNC_DAYS + 1)), [[40, 10]]);
    const empty = E('e2', TODAY, [[40, 0]]);
    expect(planGymSync([old, empty], [], { synced: {} }, TODAY).upsert).toHaveLength(0);
  });
  it('the fingerprint changes with anything that changes the numbers', () => {
    const a = toPayload(E('e1', TODAY, [[40, 10]]), []);
    expect(fingerprint(a)).toBe(fingerprint({ ...a }));
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, kcal: a.kcal + 1 }));
  });
});
