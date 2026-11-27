import test from "node:test";
import assert from "node:assert/strict";
import { PENDING_MAX, PENDING_MAX_AGE_MS, addPending, classify, cleanPending, deletePath, deleteRequest, queuedCreateOf, removePending, runPending } from "./sessionDelete.js";

const NOW = 1_800_000_000_000;
const req = (id, smart = false) => deleteRequest(id, { smart });

test("the request uses the id the app gave the server (wp-<id>), smart or not", () => {
  assert.deepEqual(req("ws-abc"), { clientId: "wp-ws-abc", kind: "activity" });
  assert.deepEqual(req("ws-abc", true), { clientId: "wp-ws-abc", kind: "smart" });
  assert.equal(deleteRequest("", {}), null);
  assert.equal(deleteRequest(undefined, {}), null);
  assert.equal(deleteRequest("has space", {}), null, "an id the server would refuse is never sent");
  assert.equal(deleteRequest("x".repeat(90), {}), null);
});

test("paths: smart removes the body-plan session (with the person's own day), others remove the exercise entry", () => {
  assert.equal(deletePath({ clientId: "wp-ws-1", kind: "smart" }, "2026-11-23"), "/api/body-plan/session?clientId=wp-ws-1&date=2026-11-23");
  assert.equal(deletePath({ clientId: "wp-ws-1", kind: "smart" }, ""), "/api/body-plan/session?clientId=wp-ws-1");
  assert.equal(deletePath({ clientId: "wp-ws-1", kind: "smart" }, "nonsense"), "/api/body-plan/session?clientId=wp-ws-1", "a bad date is left out, not sent");
  assert.equal(deletePath({ clientId: "wp-ws-1", kind: "activity" }, "2026-11-23"), "/api/activities/logs?clientId=wp-ws-1");
});

test("adding: the same session twice is one entry; the old list is not changed", () => {
  const a = addPending([], req("s1"), NOW);
  const b = addPending(a, req("s1"), NOW + 5);
  assert.equal(b.length, 1);
  assert.equal(a.length, 1);
  const c = addPending(b, req("s2", true), NOW + 9);
  assert.deepEqual(c.map((x) => [x.clientId, x.kind]), [["wp-s1", "activity"], ["wp-s2", "smart"]]);
  assert.equal(b.length, 1, "unchanged");
  assert.deepEqual(addPending(undefined, null), []);
});

test("the list is capped so a long offline spell cannot grow without limit", () => {
  let l = [];
  for (let i = 0; i < PENDING_MAX + 25; i++) l = addPending(l, req(`s${i}`), NOW + i);
  assert.equal(l.length, PENDING_MAX);
  assert.equal(l[l.length - 1].clientId, `wp-s${PENDING_MAX + 24}`, "newest kept");
});

test("reading back from storage: malformed entries, repeats and stale ones are dropped", () => {
  const old = NOW - PENDING_MAX_AGE_MS - 1;
  const l = cleanPending([{ clientId: "wp-a", kind: "smart", at: NOW }, { clientId: "wp-a", kind: "activity", at: NOW }, null, { kind: "smart" }, { clientId: 5 }, { clientId: "wp-old", at: old }, { clientId: "wp-b", kind: "weird" }], NOW);
  assert.deepEqual(l.map((x) => [x.clientId, x.kind]), [["wp-a", "smart"], ["wp-b", "activity"]]);
  assert.deepEqual(cleanPending("not a list", NOW), []);
});

test("what an answer means: gone, try later, or never going to work", () => {
  for (const s of [200, 201, 204, 404]) assert.equal(classify(s), "done", String(s));
  for (const s of [0, undefined, 401, 408, 425, 429, 500, 502, 503, 504]) assert.equal(classify(s), "keep", String(s));
  for (const s of [400, 403, 405, 409, 422]) assert.equal(classify(s), "drop", String(s));
});

test("everything reaches the server: finished entries leave the list, and a rebuilt plan comes back", async () => {
  const sent = [];
  const list = [addPending([], req("s1", true), NOW)[0], ...addPending([], req("s2"), NOW)];
  const r = await runPending(list, async (e) => { sent.push(e.clientId); return { ok: true, status: 200, plan: e.kind === "smart" ? { ready: true } : undefined }; }, NOW);
  assert.deepEqual(sent, ["wp-s1", "wp-s2"], "oldest first");
  assert.deepEqual(r.done, ["wp-s1", "wp-s2"]);
  assert.deepEqual(r.remaining, []);
  assert.deepEqual(r.plan, { ready: true });
});

test("offline: nothing is lost, and it stops at the first failure instead of hammering a dead connection", async () => {
  let calls = 0;
  const list = ["a", "b", "c"].reduce((l, id) => addPending(l, req(id), NOW), []);
  const r = await runPending(list, async () => { calls++; throw new TypeError("Failed to fetch"); }, NOW);
  assert.equal(calls, 1);
  assert.deepEqual(r.remaining.map((x) => x.clientId), ["wp-a", "wp-b", "wp-c"]);
  assert.deepEqual(r.done, []);
  // the app's fetch wrapper answers 503 when offline (it never throws): same result
  calls = 0;
  const r2 = await runPending(list, async () => { calls++; return { ok: false, status: 503 }; }, NOW);
  assert.equal(calls, 1); assert.equal(r2.remaining.length, 3);
});

test("a flaky middle: the first is done, the failure and everything after it stay for next time", async () => {
  const list = ["a", "b", "c"].reduce((l, id) => addPending(l, req(id), NOW), []);
  const r = await runPending(list, async (e) => (e.clientId === "wp-b" ? { ok: false, status: 500 } : { ok: true, status: 200 }), NOW);
  assert.deepEqual(r.done, ["wp-a"]);
  assert.deepEqual(r.remaining.map((x) => x.clientId), ["wp-b", "wp-c"]);
});

test("a request the server refuses for good is dropped, so it cannot loop for ever, and the rest still go", async () => {
  const list = ["a", "b", "c"].reduce((l, id) => addPending(l, req(id), NOW), []);
  const r = await runPending(list, async (e) => (e.clientId === "wp-b" ? { ok: false, status: 400 } : { ok: true, status: 200 }), NOW);
  assert.deepEqual(r.dropped, ["wp-b"]);
  assert.deepEqual(r.done, ["wp-a", "wp-c"]);
  assert.deepEqual(r.remaining, []);
});

test("a repeated delete that finds nothing counts as done", async () => {
  const r = await runPending(addPending([], req("s1"), NOW), async () => ({ ok: false, status: 404 }), NOW);
  assert.deepEqual(r.done, ["wp-s1"]); assert.deepEqual(r.remaining, []);
});

test("an empty or missing list is fine and sends nothing", async () => {
  let calls = 0;
  for (const l of [[], undefined, null]) { const r = await runPending(l, async () => { calls++; return { status: 200 }; }, NOW); assert.deepEqual(r.remaining, []); }
  assert.equal(calls, 0);
});

test("a create still waiting in the offline queue for a deleted session is recognised (and nothing else is)", () => {
  const post = (url, clientId, method = "POST") => ({ method, url: `https://api.example.com${url}`, body: JSON.stringify({ clientId, title: "x" }) });
  const ids = new Set(["wp-ws-1"]);
  assert.equal(queuedCreateOf(post("/api/body-plan/session", "wp-ws-1"), ids), true, "smart create");
  assert.equal(queuedCreateOf(post("/api/activities/logs", "wp-ws-1"), ids), true, "classic create");
  assert.equal(queuedCreateOf(post("/api/body-plan/session", "wp-ws-2"), ids), false, "another session");
  assert.equal(queuedCreateOf(post("/api/water", "wp-ws-1"), ids), false, "another kind of entry that happens to share an id");
  assert.equal(queuedCreateOf(post("/api/activities/logs", "wp-ws-1", "DELETE"), ids), false, "only creates");
  assert.equal(queuedCreateOf({ method: "POST", url: "/api/activities/logs", body: "{broken" }, ids), false, "a damaged entry is left alone");
  assert.equal(queuedCreateOf(null, ids), false);
  assert.equal(queuedCreateOf(post("/api/activities/logs", "wp-ws-1"), ["wp-ws-1"]), true, "an array works too");
});

test("phone ids: a classic workout is ws-<id>, a Smart one is wp-<id> on both apps", () => {
  assert.deepEqual(deleteRequest("abc", { classicPrefix: "ws" }), { clientId: "ws-abc", kind: "activity" });
  assert.deepEqual(deleteRequest("abc", { smart: true, classicPrefix: "ws" }), { clientId: "wp-abc", kind: "smart" });
  assert.deepEqual(deleteRequest("abc"), { clientId: "wp-abc", kind: "activity" }, "the web default is unchanged");
});

test("Undo window: an entry with a delay is kept but not sent until it is due; Undo takes it off; others still go", async () => {
  let l = addPending([], req("held"), NOW, { delayMs: 6000 });
  l = addPending(l, req("ready"), NOW);
  assert.equal(l[0].after, NOW + 6000);
  assert.equal("after" in l[1], false, "no delay, no field");
  const sent = [];
  const early = await runPending(l, async (e) => { sent.push(e.clientId); return { ok: true, status: 200 }; }, NOW + 1000);
  assert.deepEqual(sent, ["wp-ready"], "the one still in its Undo window is not sent");
  assert.deepEqual(early.remaining.map((x) => x.clientId), ["wp-held"]);
  assert.equal(early.remaining[0].after, NOW + 6000, "its due time is kept");
  const late = await runPending(early.remaining, async (e) => { sent.push(e.clientId); return { ok: true, status: 200 }; }, NOW + 6001);
  assert.deepEqual(sent, ["wp-ready", "wp-held"]);
  assert.deepEqual(late.remaining, []);
  // Undo
  assert.deepEqual(removePending(l, "wp-held").map((x) => x.clientId), ["wp-ready"]);
  assert.deepEqual(removePending(undefined, "x"), []);
  assert.equal(l.length, 2, "the old list is not changed");
});

test("a held entry survives being saved and read back", () => {
  const l = cleanPending(JSON.parse(JSON.stringify(addPending([], req("held"), NOW, { delayMs: 6000 }))), NOW + 10);
  assert.equal(l[0].after, NOW + 6000);
});
