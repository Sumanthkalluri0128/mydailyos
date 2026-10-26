import test from "node:test";
import assert from "node:assert/strict";
import { createUndoQueue } from "./undoCore.js";

function fake() { let t = 0; const jobs = new Map(); return { setTimer: (f, ms) => { jobs.set(++t, [f, ms]); return t; }, clearTimer: (id) => jobs.delete(id), fire: () => { for (const [id, [f]] of [...jobs]) { jobs.delete(id); f(); } }, count: () => jobs.size }; }

test("window ends without undo -> delete goes ahead", async () => {
  const k = fake(); const q = createUndoQueue(k); const g = q.gate(5000);
  assert.equal(q.size(), 1); k.fire();
  assert.equal(await g.promise, true); assert.equal(q.size(), 0);
});
test("undo inside the window cancels the delete", async () => {
  const k = fake(); const q = createUndoQueue(k); const g = q.gate();
  assert.equal(g.undo(), true); assert.equal(await g.promise, false); assert.equal(k.count(), 0);
  assert.equal(g.undo(), false);   // second tap does nothing
});
test("undo after the window has closed does nothing", async () => {
  const k = fake(); const q = createUndoQueue(k); const g = q.gate(); k.fire(); await g.promise;
  assert.equal(g.undo(), false);
});
test("two deletes are independent; flushAll commits the open ones", async () => {
  const k = fake(); const q = createUndoQueue(k); const a = q.gate(); const b = q.gate();
  a.undo(); q.flushAll();
  assert.equal(await a.promise, false); assert.equal(await b.promise, true); assert.equal(q.size(), 0);
});
test("default window is five seconds", () => {
  let ms; const q = createUndoQueue({ setTimer: (f, d) => { ms = d; return 1; }, clearTimer() {} }); q.gate(); assert.equal(ms, 5000);
});
