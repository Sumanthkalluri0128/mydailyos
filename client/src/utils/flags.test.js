import test from "node:test";
import assert from "node:assert/strict";
import { parseFlags, flagsFresh, flagOn, FLAGS_TTL_MS } from "./flags.js";
import { makeReporter } from "./telemetry.js";

test("parseFlags keeps only booleans and survives junk", () => {
  assert.deepEqual(parseFlags({ a: true, b: false, c: "yes", d: 1, e: null }), { a: true, b: false });
  for (const bad of [null, undefined, "x", 5, [true]]) assert.deepEqual(parseFlags(bad), {});
});
test("flagsFresh: cache freshness window", () => {
  const now = 1_000_000_000;
  assert.equal(flagsFresh({ at: now - 1000 }, now), true);
  assert.equal(flagsFresh({ at: now - FLAGS_TTL_MS }, now), false);
  assert.equal(flagsFresh({ at: now + 5000 }, now), false); // clock went backwards: ask again
  assert.equal(flagsFresh(null, now), false); assert.equal(flagsFresh({ at: "x" }, now), false);
});
test("flagOn: unknown flags are off unless a fallback says otherwise", () => {
  assert.equal(flagOn({ a: true }, "a"), true); assert.equal(flagOn({ a: false }, "a", true), false);
  assert.equal(flagOn({}, "new"), false); assert.equal(flagOn({}, "new", true), true); assert.equal(flagOn(null, "x"), false);
});
test("telemetry reporter batches, sums, sends once, and sends nothing when empty", async () => {
  const sent = []; let fire;
  const r = makeReporter({ send: (b) => { sent.push(b); return Promise.resolve(); }, setTimer: (fn) => { fire = fn; return 1; } });
  assert.equal(r.flush(), false);
  r.report({ syncFailed: 1 }); r.report({ syncFailed: 2, writesDropped: 3 }); r.report({ wakeMs: 4000 }); r.report({ wakeMs: 9000.4 });
  fire();
  assert.deepEqual(sent, [{ syncFailed: 3, writesDropped: 3, wakeMs: 9000 }]);
  r.report({ syncFailed: -5 }); fire(); assert.equal(sent.length, 1); // negatives are ignored
});
test("telemetry reporter never throws when sending fails", () => {
  const r = makeReporter({ send: () => { throw new Error("offline"); }, setTimer: () => 1 });
  r.report({ writesDropped: 1 }); assert.doesNotThrow(() => r.flush());
  const r2 = makeReporter({ send: () => Promise.reject(new Error("x")), setTimer: () => 1 });
  r2.report({ syncFailed: 1 }); assert.doesNotThrow(() => r2.flush());
});
