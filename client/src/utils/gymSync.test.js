import test from "node:test";
import assert from "node:assert/strict";
import * as G from "./gymMath";
import { SAFE_AUTO_REMOVE, SYNC_DAYS, applyResult, fingerprint, hasWork, planGymSync, toPayload } from "./gymSync";

const TODAY = "2026-11-12";
const E = (id, date, sets, o = {}) => ({ id, date, exId: id, name: "Bench Press", cat: "chest", unit: "reps", sets: sets.map(([kg, reps]) => ({ kg, reps })), at: Number(id.replace(/\D/g, "")) || 0, ...o });
const B = (date, kg) => ({ id: `b${date}`, date, sites: {}, at: 1, weightKg: kg });

test("the payload carries the same minutes and kcal the Gym screen shows", () => {
  const e = E("e1", TODAY, [[40, 10], [40, 8]]);
  const p = toPayload(e, [B(TODAY, 80)]);
  assert.equal(p.kcal, G.entryKcal(e, 80)); assert.equal(p.minutes, Math.max(1, Math.round(G.entryMinutes(e)))); assert.equal(p.bodyKg, 80);
  assert.ok(p.kcal > 0, "logging sets must burn something");
});
test("no body weight logged: assumes 70 kg and sends none", () => {
  const e = E("e1", TODAY, [[40, 10]]); const p = toPayload(e, []);
  assert.equal(p.kcal, G.entryKcal(e, G.DEFAULT_BODY_KG)); assert.equal(p.bodyKg, undefined);
});
test("a new entry is sent once, then nothing until it changes", () => {
  const e = E("e1", TODAY, [[40, 10]]);
  const first = planGymSync([e], [], { synced: {} }, TODAY);
  assert.deepEqual(first.upsert.map((p) => p.id), ["e1"]);
  const mem = applyResult({ synced: {} }, first.upsert, ["e1"], []);
  assert.equal(hasWork(planGymSync([e], [], mem, TODAY)), false);
  assert.equal(planGymSync([E("e1", TODAY, [[40, 10], [40, 9]])], [], mem, TODAY).upsert.length, 1);
  assert.equal(planGymSync([e], [B(TODAY, 90)], mem, TODAY).upsert.length, 1, "new body weight changes the calories");
});
test("an entry the server rejected is not marked as synced", () => {
  const e = E("e1", TODAY, [[40, 10]]);
  const plan = planGymSync([e], [], { synced: {} }, TODAY);
  assert.deepEqual(applyResult({ synced: {} }, plan.upsert, [], []).synced, {});
});
test("deleted entries are removed from the server; a read error or empty restore does not wipe it", () => {
  const p = planGymSync([], [], { synced: { gone1: "x" } }, TODAY);
  assert.deepEqual(p.removeIds, ["gone1"]);
  const synced = {}; for (let i = 0; i < SAFE_AUTO_REMOVE + 5; i++) synced[`e${i}`] = "x";
  assert.equal(planGymSync([], [], { synced }, TODAY).removeIds.length, 0);
  assert.equal(planGymSync([], [], { synced }, TODAY, true).removeIds.length, SAFE_AUTO_REMOVE + 5, "clearing on purpose may remove them all");
});
test("old history is left alone and empty entries are skipped", () => {
  const old = E("e1", G.shiftDate(TODAY, -(SYNC_DAYS + 1)), [[40, 10]]);
  assert.equal(planGymSync([old, E("e2", TODAY, [[40, 0]])], [], { synced: {} }, TODAY).upsert.length, 0);
});
test("the fingerprint changes with anything that changes the numbers", () => {
  const a = toPayload(E("e1", TODAY, [[40, 10]]), []);
  assert.equal(fingerprint(a), fingerprint({ ...a })); assert.notEqual(fingerprint(a), fingerprint({ ...a, kcal: a.kcal + 1 }));
});
