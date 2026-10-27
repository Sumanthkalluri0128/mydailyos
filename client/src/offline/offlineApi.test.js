import test from "node:test";
import assert from "node:assert/strict";

// A tiny browser: localStorage, window, navigator. (No indexedDB, so the store falls back to localStorage, as in private mode.)
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] ?? null };
globalThis.window = { location: { origin: "http://app.test" }, addEventListener() {}, dispatchEvent() {} };
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
const signIn = (email) => localStorage.setItem("mydailyos_user", JSON.stringify({ email }));

const api = await import("./offlineApi.js");
const reset = async () => { mem.clear(); await api.wipeAll(); };

test("only safe creates are queueable (POST to known paths)", () => {
  assert.equal(api.isQueueable("POST", "http://api/api/water"), true);
  assert.equal(api.isQueueable("post", "/api/food-logs"), true);
  assert.equal(api.isQueueable("POST", "/api/meal-plans/abc/log"), true);
  assert.equal(api.isQueueable("GET", "/api/water"), false);
  assert.equal(api.isQueueable("DELETE", "/api/water"), false);
  assert.equal(api.isQueueable("POST", "/api/account/delete"), false);
});

test("saved GET copy: kept per person, never shown to another", async () => {
  await reset(); signIn("a@x.com");
  await api.saveGet("/api/water?date=1", { total: 500 });
  assert.deepEqual((await api.savedGet("/api/water?date=1")).data, { total: 500 });
  signIn("b@x.com"); assert.equal(await api.savedGet("/api/water?date=1"), null);
  localStorage.removeItem("mydailyos_user"); assert.equal(await api.savedGet("/api/water?date=1"), null);
});

test("offline write: queued with a client id, nothing queued with nobody signed in", async () => {
  await reset(); localStorage.removeItem("mydailyos_user");
  assert.equal(await api.enqueue({ method: "POST", url: "/api/water", body: JSON.stringify({ amountMl: 250 }) }), false);
  signIn("a@x.com");
  assert.equal(await api.enqueue({ method: "POST", url: "/api/water", body: JSON.stringify({ amountMl: 250 }) }), true);
  const ops = await api.pendingOps();
  assert.equal(ops.length, 1); assert.ok(JSON.parse(ops[0].body).clientId, "a retry can never create a duplicate");
  assert.equal(api.getOfflineState().pending, 1);
});

test("flush: sends oldest first, empties the queue, reports what was sent", async () => {
  await reset(); signIn("a@x.com");
  for (const ml of [100, 200, 300]) await api.enqueue({ method: "POST", url: "/api/water", body: JSON.stringify({ amountMl: ml }) });
  const seen = [];
  const r = await api.flushQueue(async (op) => { seen.push(JSON.parse(op.body).amountMl); return { ok: true, status: 201 }; });
  assert.deepEqual(seen, [100, 200, 300]); assert.deepEqual(r, { sent: 3, dropped: 0 });
  assert.equal((await api.pendingOps()).length, 0); assert.equal(api.getOfflineState().pending, 0);
});

test("flush: a server error or lost connection stops and keeps the rest; a refusal drops only that change", async () => {
  await reset(); signIn("a@x.com");
  const add = (ml) => api.enqueue({ method: "POST", url: "/api/water", body: JSON.stringify({ amountMl: ml }) });
  const events = []; api.setTelemetry((e) => events.push(e));
  await add(1); await add(2); await add(3);
  let r = await api.flushQueue(async (op) => (JSON.parse(op.body).amountMl === 2 ? { ok: false, status: 503 } : { ok: true, status: 200 }));
  assert.deepEqual(r, { sent: 1, dropped: 0 }); assert.equal((await api.pendingOps()).length, 2);
  assert.deepEqual(events, [{ syncFailed: 1 }]);
  r = await api.flushQueue(async (op) => (JSON.parse(op.body).amountMl === 2 ? { ok: false, status: 400 } : { ok: true, status: 200 }));
  assert.deepEqual(r, { sent: 1, dropped: 1 }); assert.equal((await api.pendingOps()).length, 0);
  assert.match(api.getOfflineState().lastError, /1 offline change could not be saved/);
  assert.deepEqual(events[1], { writesDropped: 1 });
  await add(9); r = await api.flushQueue(async () => { throw new Error("network"); });
  assert.equal(r.sent, 0); assert.equal((await api.pendingOps()).length, 1, "still waiting");
  api.setTelemetry(null);
});

test("flush: 401 and 429 keep everything (sign-in expired / slow down); nothing is sent while offline", async () => {
  await reset(); signIn("a@x.com");
  await api.enqueue({ method: "POST", url: "/api/weight", body: JSON.stringify({ weightKg: 70 }) });
  for (const status of [401, 429]) { const r = await api.flushQueue(async () => ({ ok: false, status })); assert.deepEqual(r, { sent: 0, dropped: 0 }); }
  assert.equal((await api.pendingOps()).length, 1);
  navigator.onLine = false; let called = false;
  await api.flushQueue(async () => { called = true; return { ok: true }; }); assert.equal(called, false);
  navigator.onLine = true;
});

test("another person's waiting changes are never sent by this person, and are purged on sign-in", async () => {
  await reset(); signIn("a@x.com");
  await api.enqueue({ method: "POST", url: "/api/water", body: JSON.stringify({ amountMl: 111 }) });
  await api.saveGet("/api/water", { x: 1 });
  signIn("b@x.com"); const sent = [];
  await api.flushQueue(async (op) => { sent.push(op); return { ok: true, status: 200 }; }); assert.equal(sent.length, 0);
  await api.purgeOthers();
  assert.equal(await api.savedGet("/api/water"), null);
  signIn("a@x.com"); assert.equal((await api.pendingOps()).length, 0, "a's queue was purged for b's session");
});

test("queued changes older than a week are dropped, not replayed blindly", async () => {
  await reset(); signIn("a@x.com");
  await api.enqueue({ method: "POST", url: "/api/water", body: JSON.stringify({ amountMl: 5 }) });
  const key = [...mem.keys()].find((k) => k.endsWith("queue"));
  const q = JSON.parse(mem.get(key)); q[0].at = Date.now() - 8 * 24 * 3600 * 1000; mem.set(key, JSON.stringify(q));
  const sent = []; await api.flushQueue(async (op) => { sent.push(op); return { ok: true, status: 200 }; });
  assert.equal(sent.length, 0); assert.equal((await api.pendingOps()).length, 0);
});
