// The Gym log belongs to the signed-in account: no leaking to the next account, and the old browser-wide log is adopted once.
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const signIn = (email) => (email ? mem.set("mydailyos_user", JSON.stringify({ email })) : mem.delete("mydailyos_user"));
const ent = (id) => ({ id, date: "2026-11-01", exId: "bench", name: "Bench", cat: "Chest", unit: "reps", sets: [{ kg: 40, reps: 10 }], at: 1 });
const legacy = { v: 1, entries: [ent("old1"), ent("old2")], body: [], goal: null, profile: { unit: "kg" } };

mem.set("flexfit_gymlog_v1", JSON.stringify(legacy));
signIn("alice@x.dev");
const S = await import("./gymStore.js");
const ids = () => S.getGym().entries.map((e) => e.id).sort();

test("the first account to open the log takes over the old browser-wide log, once", () => {
  assert.deepEqual(ids(), ["old1", "old2"]);
  assert.equal(mem.has("flexfit_gymlog_v1"), false, "the old copy is gone, so nobody else can take it");
  assert.ok(mem.has("flexfit_gymlog_v2:alice@x.dev"));
});

test("another account on the same browser sees an empty log, and alice's stays hers", () => {
  signIn("bob@x.dev");
  assert.deepEqual(ids(), [], "bob does not see alice's log");
  assert.equal(S.gymOwner(), "bob@x.dev");
  S.saveEntry(ent("bob1"));
  assert.deepEqual(ids(), ["bob1"]);
  signIn("alice@x.dev");
  assert.deepEqual(ids(), ["old1", "old2"], "alice gets hers back, without bob's");
  assert.ok(!mem.get("flexfit_gymlog_v2:alice@x.dev").includes("bob1"));
});

test("signed out: an empty log, and nothing is written", () => {
  signIn("");
  assert.deepEqual(ids(), []);
  const before = [...mem.keys()].sort().join();
  S.saveEntry(ent("ghost"));
  assert.equal([...mem.keys()].sort().join(), before, "no signed-in account, nothing stored");
  signIn("alice@x.dev");
  assert.ok(!ids().includes("ghost"));
});

test("changes from other devices are applied as one update and kept for the account", () => {
  signIn("alice@x.dev");
  S.applyRemote([{ kind: "entry", rid: "r1", data: ent("r1") }, { kind: "goal", rid: "goal", data: { startDate: "2026-11-01", weightKg: 70, sites: {} } }], [{ kind: "entry", rid: "old2" }]);
  assert.deepEqual(ids(), ["old1", "r1"]);
  assert.equal(S.getGym().goal.weightKg, 70);
  assert.ok(mem.get("flexfit_gymlog_v2:alice@x.dev").includes("r1"));
});

test("clearing on purpose is flagged for the sync, once", () => {
  S.clearGym();
  assert.equal(S.consumeBulkRecords(), true);
  assert.equal(S.consumeBulkRecords(), false);
  assert.deepEqual(ids(), []);
});
