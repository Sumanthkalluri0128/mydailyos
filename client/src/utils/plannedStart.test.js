import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
const store = () => ({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) });
globalThis.localStorage = store(); globalThis.sessionStorage = store();
const who = (email) => localStorage.setItem("mydailyos_user", JSON.stringify({ email }));
const { beginPlannedStart, endPlannedStart, readPlannedStart, skipPlannedStep } = await import("./plannedStart.js");

const item = { _id: "p1", date: "2026-11-23", title: "Push day", kind: "strength", exercises: [{ name: "Bench Press", sets: 4, reps: 8, kg: 60 }, { name: "Plank", sets: 0, reps: 0, kg: 0 }] };

test("begin, read, skip and end", () => {
  who("a@x.com"); endPlannedStart();
  assert.equal(readPlannedStart(), null);
  beginPlannedStart(item);
  const s = readPlannedStart();
  assert.equal(s.item.id, "p1"); assert.equal(s.item.title, "Push day"); assert.equal(s.item.exercises.length, 2); assert.deepEqual(s.skipped, []);
  assert.equal(readPlannedStart(), s, "the same object until something changes (React needs this)");
  skipPlannedStep("1:plank"); skipPlannedStep("1:plank");
  assert.deepEqual(readPlannedStart().skipped, ["1:plank"], "skipping twice is once");
  endPlannedStart();
  assert.equal(readPlannedStart(), null);
});

test("it is kept per account", () => {
  who("a@x.com"); beginPlannedStart(item);
  who("b@x.com"); assert.equal(readPlannedStart(), null, "another account does not see it");
  who("a@x.com"); assert.equal(readPlannedStart().item.id, "p1");
  endPlannedStart();
});

test("it survives a reload (read back from storage) and damaged or foreign data is ignored", () => {
  who("a@x.com"); beginPlannedStart(item);
  const raw = sessionStorage.getItem("ff-plan-start:a@x.com");
  assert.ok(raw && raw.includes("Push day"));
  mem.set("ff-plan-start:a@x.com", "{not json");
  assert.equal(readPlannedStart(), null);
  mem.set("ff-plan-start:a@x.com", JSON.stringify({ item: { title: "no id" } }));
  assert.equal(readPlannedStart(), null);
  mem.set("ff-plan-start:a@x.com", JSON.stringify({ item: { id: "z", title: "t".repeat(500), exercises: "nope" }, skipped: [1, "ok"] }));
  const s = readPlannedStart();
  assert.equal(s.item.title.length, 80); assert.deepEqual(s.item.exercises, []); assert.deepEqual(s.skipped, ["ok"]);
  endPlannedStart();
});
