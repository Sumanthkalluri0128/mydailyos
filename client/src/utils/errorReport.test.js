import test from "node:test";
import assert from "node:assert/strict";
import { reportError, setErrorSink, _queueLength } from "./errorReport.js";

test("crashes reported before Sentry is ready are kept, then delivered with their scope and name", () => {
  assert.equal(reportError(new Error("early"), { scope: "home-card", name: "StatCard:water" }), false);
  assert.equal(_queueLength(), 1);
  const got = [];
  setErrorSink((e, c) => got.push([e.message, c.scope, c.name]));
  assert.deepEqual(got, [["early", "home-card", "StatCard:water"]]);
  assert.equal(_queueLength(), 0);
  assert.equal(reportError(new Error("late"), { scope: "tab", name: "food" }), true);
  assert.deepEqual(got[1], ["late", "tab", "food"]);
});
test("a sink that throws never crashes the app", () => {
  setErrorSink(() => { throw new Error("sink broke"); });
  assert.doesNotThrow(() => reportError(new Error("x")));
});
test("the waiting queue is capped", () => {
  setErrorSink(null);
  for (let i = 0; i < 50; i += 1) reportError(new Error(`e${i}`));
  assert.ok(_queueLength() <= 20);
});
