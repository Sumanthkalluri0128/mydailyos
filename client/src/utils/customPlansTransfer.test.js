import test from "node:test";
import assert from "node:assert/strict";
import { addItem, addKit, newPlan, setDayTitle, transferDay, transferItems, MAX_ITEMS } from "./customPlans.js";

const ex = (id) => ({ id, name: id.toUpperCase(), cat: "legs", unit: "reps", sets: 3, reps: "10" });
function base() {
  let ps = [newPlan("T", 1)]; const id = ps[0].id;
  for (const i of ["a", "b", "c"]) ps = addItem(ps, id, 1, ex(i));
  ps = addKit(ps, id, 1, "warm", { id: "w1", name: "Walk", dose: "3 min" });
  ps = setDayTitle(ps, id, 1, "Legs");
  return { ps, id };
}
const day = (ps, d) => ps[0].days.find((x) => x.dow === d);

test("copy two exercises to three days at once", () => {
  const { ps, id } = base();
  const r = transferItems(ps, id, 1, ["a", "b"], [3, 5, 6], "copy");
  assert.equal(r.added, 6);
  for (const d of [3, 5, 6]) assert.deepEqual(day(r.plans, d).items.map((x) => x.id), ["a", "b"]);
  assert.equal(day(r.plans, 3).title, "Legs");                   // empty target gets the day name + warm-up
  assert.equal(day(r.plans, 3).warm.length, 1);
  assert.equal(day(r.plans, 1).items.length, 3);                 // copy keeps the source
});
test("move takes them off the source", () => {
  const { ps, id } = base();
  const r = transferItems(ps, id, 1, ["b"], [2], "move");
  assert.deepEqual(day(r.plans, 1).items.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(day(r.plans, 2).items.map((x) => x.id), ["b"]);
});
test("moving everything leaves a clean rest day", () => {
  const { ps, id } = base();
  const r = transferItems(ps, id, 1, ["a", "b", "c"], [4], "move");
  const s = day(r.plans, 1); assert.equal(s.items.length, 0); assert.equal(s.warm.length, 0); assert.equal(s.title, "");
});
test("never doubles an exercise and never exceeds the cap; a move keeps what did not land", () => {
  let { ps, id } = base(); ps = addItem(ps, id, 2, ex("a"));
  let r = transferItems(ps, id, 1, ["a", "b"], [2], "copy"); assert.equal(r.skipped, 1); assert.deepEqual(day(r.plans, 2).items.map((x) => x.id), ["a", "b"]);
  for (let i = 0; i < MAX_ITEMS; i++) ps = addItem(ps, id, 7, ex(`z${i}`));
  r = transferItems(ps, id, 1, ["a"], [7], "move");
  assert.equal(day(r.plans, 7).items.length, MAX_ITEMS); assert.ok(day(r.plans, 1).items.some((x) => x.id === "a"));
});
test("bad input changes nothing", () => {
  const { ps, id } = base();
  assert.equal(transferItems(ps, id, 1, ["a"], [1], "copy").plans, ps);
  assert.equal(transferItems(ps, id, 1, [], [2], "copy").plans, ps);
  assert.equal(transferItems(ps, id, 1, ["a"], [9, 0, "x"], "copy").plans, ps);
});
test("whole day to many days, copy and move", () => {
  const { ps, id } = base();
  const c = transferDay(ps, id, 1, [2, 4], "copy");
  assert.equal(day(c, 2).items.length, 3); assert.equal(day(c, 4).warm.length, 1); assert.equal(day(c, 1).items.length, 3);
  const m = transferDay(ps, id, 1, [5], "move");
  assert.equal(day(m, 5).items.length, 3); assert.equal(day(m, 1).items.length, 0); assert.equal(day(m, 1).title, "");
  day(c, 2).items[0].sets = 9; assert.equal(day(c, 4).items[0].sets, 3);   // copies are independent
});
