import test from "node:test";
import assert from "node:assert/strict";
import { attemptId, attemptDone, _resetAttempts } from "./attemptId.js";

const payload = { date: "2026-11-15", meal: "lunch", items: [{ foodId: "a", quantity: 100 }] };

test("same content keeps the same id until it succeeds (a retry after a timeout is the same request)", () => {
  _resetAttempts();
  assert.equal(attemptId("multi", payload), attemptId("multi", payload));
  assert.equal(attemptId("multi", payload), attemptId("multi", JSON.parse(JSON.stringify(payload))));
});

test("changed content gets a new id, so an edited selection is never swallowed by an earlier try", () => {
  _resetAttempts();
  const a = attemptId("multi", payload);
  const b = attemptId("multi", { ...payload, items: [{ foodId: "a", quantity: 150 }] });
  const c = attemptId("multi", { ...payload, meal: "dinner" });
  assert.notEqual(a, b); assert.notEqual(a, c); assert.notEqual(b, c);
});

test("after a success the next identical request is a new one", () => {
  _resetAttempts();
  const a = attemptId("multi", payload);
  attemptDone("multi", payload);
  assert.notEqual(attemptId("multi", payload), a);
});

test("ids are valid for the server (<= 80 chars, only letters digits . : _ -)", () => {
  _resetAttempts();
  const id = attemptId("multi", payload);
  assert.ok(id.length <= 80 && /^[\w.:-]+$/.test(id), id);
});

test("memory is bounded", () => {
  _resetAttempts();
  const first = attemptId("x", { n: 0 });
  for (let i = 1; i < 120; i += 1) attemptId("x", { n: i });
  assert.notEqual(attemptId("x", { n: 0 }), first, "the oldest entries are dropped, never an unbounded map");
});
