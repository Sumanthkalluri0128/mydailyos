import test from "node:test";
import assert from "node:assert/strict";
import { FAILED_MAX, SYNC_WINDOW_DAYS, cleanFailed, outcomeOf, pickToSync, reasonFor, runSync } from "./syncRun.js";

const S = (id, date, over = {}) => ({ id, date, ...over });
const NOW = 1_800_000_000_000;

test("what an answer means: sent, try later, or refused for good", () => {
  for (const s of [200, 201, 202, 204]) assert.equal(outcomeOf(s), "ok", String(s));
  for (const s of [0, undefined, null, 401, 408, 425, 429, 500, 502, 503, 504]) assert.equal(outcomeOf(s), "offline", String(s));
  for (const s of [400, 403, 404, 409, 413, 422]) assert.equal(outcomeOf(s), "rejected", String(s));
});

test("a reason the person can read: the server's own words when short, otherwise a plain sentence", () => {
  assert.equal(reasonFor(400, "  Duration must be between 1 and 1440  "), "Duration must be between 1 and 1440");
  assert.match(reasonFor(400, ""), /could not accept/);
  assert.match(reasonFor(403), /not allowed/);
  assert.match(reasonFor(404), /could not find/);
  assert.match(reasonFor(413), /too large/);
  assert.match(reasonFor(418), /\(418\)/);
  assert.match(reasonFor(0), /refused/);
  assert.match(reasonFor(400, "x".repeat(200)), /could not accept/, "a long server message is not shown raw");
});

test("which workouts are sent: oldest first, nothing skipped by the caller, and up to 60 days back (not 14 / not the last five)", () => {
  const today = "2026-11-23";
  const list = [S("new", "2026-11-22"), S("old", "2026-10-01"), S("sent", "2026-11-20", { synced: true }), S("rest", "2026-11-21", { kind: "rest" }), S("ancient", "2026-08-01"), S("same-day-b", "2026-11-22")];
  const got = pickToSync(list, { today, skip: (s) => s.synced || s.kind === "rest" });
  assert.deepEqual(got.map((s) => s.id), ["old", "new", "same-day-b"], "ancient (115 days) stays on the device; same-day keeps its order");
  assert.equal(SYNC_WINDOW_DAYS, 60);
  assert.deepEqual(pickToSync([S("edge", "2026-09-24")], { today }).map((s) => s.id), ["edge"], "exactly 60 days back is included");
  assert.deepEqual(pickToSync([S("edge", "2026-09-23")], { today }), [], "61 days is not");
});

test("twenty unsent workouts are ALL attempted (the phone used to look at the last five)", () => {
  const list = Array.from({ length: 20 }, (_, i) => S(`s${i}`, `2026-11-${String(i + 1).padStart(2, "0")}`));
  assert.equal(pickToSync(list, { today: "2026-11-23" }).length, 20);
});

test("robust to junk input", () => {
  assert.deepEqual(pickToSync(undefined, { today: "2026-11-23" }), []);
  assert.deepEqual(pickToSync([null, {}, S("", "2026-11-22")], { today: "2026-11-23" }), []);
  assert.deepEqual(pickToSync([S("a", "2026-11-22")], { today: "nonsense" }).map((s) => s.id), ["a"], "an unreadable today does not hide everything");
});

test("all sent: every one is done", async () => {
  const r = await runSync([S("a"), S("b")], async () => ({ outcome: "ok" }), { now: NOW });
  assert.deepEqual(r.done, ["a", "b"]); assert.deepEqual(r.failed, {}); assert.equal(r.stopped, false);
});

test("THE PHONE BUG: one workout the server refuses no longer blocks the ones after it", async () => {
  const sent = [];
  const r = await runSync([S("a"), S("stuck"), S("c")], async (s) => { sent.push(s.id); return s.id === "stuck" ? { outcome: "rejected", reason: "Bad duration" } : { outcome: "ok" }; }, { now: NOW });
  assert.deepEqual(sent, ["a", "stuck", "c"], "c was still tried");
  assert.deepEqual(r.done, ["a", "c"]);
  assert.deepEqual(r.failed, { stuck: { reason: "Bad duration", at: NOW } }, "and the refusal is remembered with its reason");
  assert.equal(r.stopped, false);
});

test("THE WEB BUG: a refused workout is reported as failed, never as sent", async () => {
  const r = await runSync([S("smart")], async () => ({ outcome: "rejected", reason: reasonFor(400) }), { now: NOW });
  assert.deepEqual(r.done, []);
  assert.equal(Object.keys(r.failed).length, 1);
});

test("no connection: stops at once (nothing is lost, the rest would fail the same way) and nothing is called failed", async () => {
  let calls = 0;
  const r = await runSync([S("a"), S("b"), S("c")], async () => { calls++; return { outcome: "offline" }; }, { now: NOW });
  assert.equal(calls, 1); assert.deepEqual(r.done, []); assert.deepEqual(r.failed, {}); assert.equal(r.stopped, true);
  calls = 0;
  const t = await runSync([S("a"), S("b")], async () => { calls++; throw new TypeError("Failed to fetch"); }, { now: NOW });
  assert.equal(calls, 1); assert.equal(t.stopped, true); assert.deepEqual(t.failed, {});
});

test("connection drops half way: what was sent stays sent, the rest wait", async () => {
  const r = await runSync([S("a"), S("b"), S("c")], async (s) => (s.id === "b" ? { outcome: "offline" } : { outcome: "ok" }), { now: NOW });
  assert.deepEqual(r.done, ["a"]); assert.equal(r.stopped, true);
});

test("a workout deleted during the run is never sent", async () => {
  const sent = [];
  const r = await runSync([S("a"), S("gone"), S("c")], async (s) => { sent.push(s.id); return { outcome: "ok" }; }, { stillWanted: (s) => s.id !== "gone", now: NOW });
  assert.deepEqual(sent, ["a", "c"]); assert.deepEqual(r.done, ["a", "c"]);
});

test("answers carry extras (the rebuilt plan, highlights) back to the caller", async () => {
  const r = await runSync([S("a")], async () => ({ outcome: "ok", plan: { ready: true }, highlights: ["PR"] }), { now: NOW });
  assert.deepEqual(r.extras.a.plan, { ready: true });
});

test("empty or missing list sends nothing", async () => {
  let calls = 0;
  for (const l of [[], undefined, null]) await runSync(l, async () => { calls++; return { outcome: "ok" }; });
  assert.equal(calls, 0);
});

test("the remembered refusals are cleaned when read back, and capped", () => {
  assert.deepEqual(cleanFailed(null), {}); assert.deepEqual(cleanFailed([]), {}); assert.deepEqual(cleanFailed("x"), {});
  assert.deepEqual(cleanFailed({ a: { reason: "no", at: 5 }, b: { reason: "" }, c: null, d: { at: 1 }, e: "str" }), { a: { reason: "no", at: 5 } });
  const big = Object.fromEntries(Array.from({ length: FAILED_MAX + 20 }, (_, i) => [`k${i}`, { reason: "r", at: i + 1 }]));
  const c = cleanFailed(big);
  assert.equal(Object.keys(c).length, FAILED_MAX);
  assert.ok(!("k0" in c) && `k${FAILED_MAX + 19}` in c, "the newest are kept");
});
