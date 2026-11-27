// The sync algorithm end to end: two devices and a simulated server that follows the real server's rules (newest edit wins, a tie keeps the server's copy).
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_MEMORY, applyPulled, applyPushed, dropDuplicateDays, hashOf, keyOf, planPush, syncRound } from "./recordSync.js";
import { applyRecords, gymToRecords } from "./gymRecords.js";

const EMPTY = { v: 1, entries: [], body: [], goal: null, profile: { unit: "kg" } };
const ent = (id, at, extra = {}) => ({ id, date: "2026-11-01", exId: "bench", name: "Bench", cat: "Chest", unit: "reps", sets: [{ kg: 40, reps: 10 }], at, ...extra });
const bod = (id, date, at, weightKg = 70) => ({ id, date, weightKg, sites: {}, at });

function makeServer() {
  const rows = new Map(); let seq = 0;
  return {
    rows,
    async push(records) {
      const kept = [];
      for (const r of records) {
        const k = keyOf(r.kind, r.rid), ex = rows.get(k);
        if (ex && !(r.updatedAt > ex.updatedAt)) { kept.push({ ...ex }); continue; }
        rows.set(k, { kind: r.kind, rid: r.rid, data: r.deleted ? null : r.data, updatedAt: r.updatedAt, deleted: !!r.deleted, seq: (seq += 1) });
      }
      return { kept };
    },
    async pull(since, limit = 500) {
      const all = [...rows.values()].filter((x) => x.seq > since).sort((a, b) => a.seq - b.seq);
      const page = all.slice(0, limit);
      return { records: page.map((x) => ({ ...x })), seq: page.length ? page[page.length - 1].seq : since, more: all.length > limit };
    },
  };
}
function makeDevice(server, state = EMPTY, opts = {}) {
  const d = { state, mem: { ...EMPTY_MEMORY, known: {} }, pushLog: [] };
  d.io = {
    current: () => gymToRecords(d.state), memory: () => d.mem, save: (m) => { d.mem = m; },
    push: async (recs) => { d.pushLog.push(recs.length); if (opts.failOnPush && d.pushLog.length === opts.failOnPush) throw new Error("offline"); return server.push(recs); },
    pull: (since) => server.pull(since, opts.pageSize || 500),
    apply: (u, r) => { d.state = applyRecords(d.state, u, r); },
  };
  d.sync = (o = {}) => syncRound(d.io, o);
  return d;
}
const ids = (d) => d.state.entries.map((e) => e.id).sort();

test("hashOf ignores key order and undefined fields", () => {
  assert.equal(hashOf({ a: 1, b: [1, { c: 2, d: undefined }] }), hashOf({ b: [1, { c: 2 }], a: 1 }));
  assert.notEqual(hashOf({ a: 1 }), hashOf({ a: 2 }));
});

test("a record made on one device reaches the other; a second round sends nothing", async () => {
  const s = makeServer(), A = makeDevice(s, { ...EMPTY, entries: [ent("e1", 100), ent("e2", 101)] }), B = makeDevice(s);
  assert.equal((await A.sync({ now: 1000 })).pushed, 2);
  const r = await B.sync({ now: 1001 });
  assert.equal(r.added, 2); assert.deepEqual(ids(B), ["e1", "e2"]);
  assert.equal((await A.sync({ now: 1002 })).pushed, 0);
  assert.equal((await B.sync({ now: 1003 })).pushed, 0, "what was just received is not sent back");
});

test("first sync with data on both devices adds up, and nothing is lost", async () => {
  const s = makeServer(), A = makeDevice(s, { ...EMPTY, entries: [ent("a1", 1), ent("a2", 2)] }), B = makeDevice(s, { ...EMPTY, entries: [ent("b1", 3)] });
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 }); await A.sync({ now: 1002 });
  assert.deepEqual(ids(A), ["a1", "a2", "b1"]); assert.deepEqual(ids(B), ["a1", "a2", "b1"]);
});

test("the same exercise edited on both devices: the later edit wins everywhere", async () => {
  const s = makeServer(), A = makeDevice(s, { ...EMPTY, entries: [ent("x", 1)] }), B = makeDevice(s);
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 });
  A.state = { ...A.state, entries: [ent("x", 1, { note: "from A" })] };      // edited at 2000 (the time it is noticed)
  B.state = { ...B.state, entries: [ent("x", 1, { note: "from B" })] };      // edited later, at 3000
  await A.sync({ now: 2000 }); await B.sync({ now: 3000 }); await A.sync({ now: 3001 });
  assert.equal(A.state.entries[0].note, "from B"); assert.equal(B.state.entries[0].note, "from B");
});

test("a deletion reaches the other device and stays deleted", async () => {
  const s = makeServer(), A = makeDevice(s, { ...EMPTY, entries: [ent("d1", 1), ent("keep", 2)] }), B = makeDevice(s);
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 });
  A.state = { ...A.state, entries: A.state.entries.filter((e) => e.id !== "d1") };
  await A.sync({ now: 2000 });
  const r = await B.sync({ now: 2001 });
  assert.equal(r.removed, 1); assert.deepEqual(ids(B), ["keep"]);
  await B.sync({ now: 2002 }); await A.sync({ now: 2003 });
  assert.deepEqual(ids(A), ["keep"]); assert.deepEqual(ids(B), ["keep"]);
});

test("delete on one device, edit on the other: whichever came later wins", async () => {
  const s = makeServer(), A = makeDevice(s, { ...EMPTY, entries: [ent("r", 1)] }), B = makeDevice(s);
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 });
  A.state = { ...A.state, entries: [] };                                        // deleted at 2000
  B.state = { ...B.state, entries: [ent("r", 1, { note: "edited later" })] };   // edited at 3000
  await A.sync({ now: 2000 }); await B.sync({ now: 3000 }); await A.sync({ now: 3001 });
  assert.deepEqual(ids(A), ["r"]); assert.equal(A.state.entries[0].note, "edited later"); assert.deepEqual(ids(B), ["r"]);
});

test("a device that lost its log (cleared browser data) does not delete the server copy: it gets everything back", async () => {
  const s = makeServer(); const many = Array.from({ length: 30 }, (_, i) => ent(`e${i}`, i + 1));
  const A = makeDevice(s, { ...EMPTY, entries: many }), B = makeDevice(s);
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 });
  A.state = EMPTY;                                                              // the log is gone, the sync memory survived
  const r = await A.sync({ now: 2000 });
  assert.equal(r.heldBack, 30); assert.equal(r.added, 30); assert.equal(ids(A).length, 30);
  assert.equal([...s.rows.values()].filter((x) => !x.deleted).length, 30, "nothing was deleted on the server");
  await B.sync({ now: 2001 }); assert.equal(ids(B).length, 30);
});

test("a device that lost both its log and its memory is simply a new device", async () => {
  const s = makeServer(); const A = makeDevice(s, { ...EMPTY, entries: Array.from({ length: 25 }, (_, i) => ent(`e${i}`, i + 1)) });
  await A.sync({ now: 1000 });
  const fresh = makeDevice(s); const r = await fresh.sync({ now: 2000 });
  assert.equal(r.added, 25); assert.equal(r.pushed, 0);
});

test("clearing the whole log on purpose is sent, a few deletions never need that", async () => {
  const s = makeServer(), many = Array.from({ length: 30 }, (_, i) => ent(`e${i}`, i + 1));
  const A = makeDevice(s, { ...EMPTY, entries: many }), B = makeDevice(s);
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 });
  A.state = { ...A.state, entries: many.slice(3) };                              // 3 deleted: normal
  assert.equal((await A.sync({ now: 2000 })).heldBack, 0);
  await B.sync({ now: 2001 }); assert.equal(ids(B).length, 27);
  A.state = EMPTY;                                                               // "Clear all", confirmed by the person
  const r = await A.sync({ now: 3000, allowBulkDelete: true });
  assert.equal(r.heldBack, 0); await B.sync({ now: 3001 }); assert.equal(ids(B).length, 0);
});

test("an interrupted sync keeps its progress and finishes next time", async () => {
  const s = makeServer(), many = Array.from({ length: 1200 }, (_, i) => ent(`m${i}`, i + 1));
  const A = makeDevice(s, { ...EMPTY, entries: many }, { failOnPush: 2 });
  await assert.rejects(() => A.sync({ now: 1000 }), /offline/);
  assert.equal(s.rows.size, 500, "the first batch of 500 arrived and was remembered");
  A.io.push = (recs) => { A.pushLog.push(recs.length); return s.push(recs); };
  const r = await A.sync({ now: 2000 });
  assert.equal(r.pushed, 700, "only the rest is sent"); assert.equal(s.rows.size, 1200);
});

test("pulling several pages gives the same result as one", async () => {
  const s = makeServer(), A = makeDevice(s, { ...EMPTY, entries: Array.from({ length: 95 }, (_, i) => ent(`p${i}`, i + 1)) }), B = makeDevice(s, EMPTY, { pageSize: 10 });
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 }); assert.equal(ids(B).length, 95);
});

test("an edit made here since the last sync is never overwritten by a pull", () => {
  const known = { [keyOf("entry", "x")]: { h: hashOf(ent("x", 1)), u: 100, d: false } };
  const current = { [keyOf("entry", "x")]: { kind: "entry", rid: "x", data: ent("x", 1, { note: "mine, not sent yet" }) } };
  const r = applyPulled(current, { ...EMPTY_MEMORY, known }, [{ kind: "entry", rid: "x", data: ent("x", 1, { note: "theirs" }), updatedAt: 500, deleted: false }]);
  assert.equal(r.upserts.length, 0);
});

test("a stale copy that arrives late (the overlap window) changes nothing", () => {
  const known = { [keyOf("entry", "x")]: { h: hashOf(ent("x", 1, { note: "new" })), u: 900, d: false } };
  const current = { [keyOf("entry", "x")]: { kind: "entry", rid: "x", data: ent("x", 1, { note: "new" }) } };
  const r = applyPulled(current, { ...EMPTY_MEMORY, known }, [{ kind: "entry", rid: "x", data: ent("x", 1, { note: "old" }), updatedAt: 100, deleted: false }]);
  assert.equal(r.upserts.length, 0); assert.equal(r.removals.length, 0);
});

test("one body measurement a day: two devices measuring the same day end with the newest, on both", async () => {
  const s = makeServer(), A = makeDevice(s, { ...EMPTY, body: [bod("bA", "2026-11-02", 100, 70)] }), B = makeDevice(s, { ...EMPTY, body: [bod("bB", "2026-11-02", 200, 71)] });
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 }); await A.sync({ now: 1002 }); await B.sync({ now: 1003 }); await A.sync({ now: 1004 });
  for (const d of [A, B]) { assert.equal(d.state.body.length, 1); assert.equal(d.state.body[0].id, "bB"); }
  assert.deepEqual(dropDuplicateDays([bod("1", "d", 5), bod("2", "d", 9), bod("3", "e", 1)]), ["1"]);
});

test("goal and profile travel only when set; unsetting them is a deletion", async () => {
  const s = makeServer(), A = makeDevice(s), B = makeDevice(s);
  assert.deepEqual(Object.keys(gymToRecords(EMPTY)), [], "defaults are not records");
  A.state = { ...EMPTY, profile: { unit: "lb" }, goal: { startDate: "2026-11-01", weightKg: 70, sites: {} } };
  await A.sync({ now: 1000 }); await B.sync({ now: 1001 });
  assert.equal(B.state.profile.unit, "lb"); assert.equal(B.state.goal.weightKg, 70);
  A.state = { ...A.state, goal: null }; await A.sync({ now: 2000 }); await B.sync({ now: 2001 });
  assert.equal(B.state.goal, null);
});

test("planPush: a record never sent keeps its own time, a changed one gets the current time", () => {
  const cur = { [keyOf("entry", "old")]: { kind: "entry", rid: "old", data: ent("old", 5), updatedAt: 5 }, [keyOf("entry", "chg")]: { kind: "entry", rid: "chg", data: ent("chg", 7, { note: "v2" }), updatedAt: 7 } };
  const mem = { ...EMPTY_MEMORY, known: { [keyOf("entry", "chg")]: { h: hashOf(ent("chg", 7)), u: 7, d: false } } };
  const { records } = planPush(cur, mem, 9999);
  assert.equal(records.find((r) => r.rid === "old").updatedAt, 5);
  assert.equal(records.find((r) => r.rid === "chg").updatedAt, 9999);
  const again = planPush(cur, applyPushed(mem, records), 10000);
  assert.equal(again.records.length, 0);
});

test("a bad record from the server cannot break the log", () => {
  const s = applyRecords({ ...EMPTY, entries: [ent("ok", 1)] }, [{ kind: "entry", rid: "bad", data: { nonsense: true } }, { kind: "entry", rid: "worse", data: null }, { kind: "body", rid: "b", data: { date: "not a date" } }], [{ kind: "entry", rid: "missing" }]);
  assert.deepEqual(s.entries.map((e) => e.id), ["ok"]); assert.equal(s.body.length, 0);
});
