import test from "node:test";
import assert from "node:assert/strict";
import * as V from "./workoutPlanView.js";

test("weeks start on Monday and cross month and year ends", () => {
  assert.equal(V.mondayOf("2026-11-17"), "2026-11-16");
  assert.equal(V.mondayOf("2026-11-22"), "2026-11-16");
  assert.equal(V.mondayOf("2027-01-01"), "2026-12-28");
  assert.deepEqual(V.weekDays("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(V.addDays("2026-02-28", 1), "2026-03-01"); assert.equal(V.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(V.diffDays("2026-11-16", "2026-11-23"), 7);
});

test("monthGrid: whole Monday-first weeks that contain the month", () => {
  const g = V.monthGrid("2026-11-17");
  assert.equal(g.month, "2026-11"); assert.equal(g.first, "2026-11-01"); assert.equal(g.last, "2026-11-30");
  assert.equal(g.gridStart, "2026-10-26"); assert.equal(g.gridEnd, "2026-12-06");
  assert.equal(g.weeks.length, 6); assert.ok(g.weeks.every((w) => w.length === 7));
  assert.equal(g.weeks[0][0], "2026-10-26"); assert.equal(g.weeks[5][6], "2026-12-06");
  const feb = V.monthGrid("2027-02-10");                    // Feb 2027 starts on a Monday and has 28 days: exactly 4 weeks
  assert.equal(feb.weeks.length, 4); assert.equal(feb.gridStart, "2027-02-01"); assert.equal(feb.gridEnd, "2027-02-28");
  assert.equal(V.monthGrid("2028-02-29").last, "2028-02-29");
  assert.equal(V.shiftMonth("2026-11-17", 1), "2026-12-01"); assert.equal(V.shiftMonth("2026-01-31", -1), "2025-12-01"); assert.equal(V.shiftMonth("2026-12-05", 1), "2027-01-01");
});

test("parseExercises: names with optional sets x reps and weight", () => {
  assert.deepEqual(V.parseExercises("Squat 3x8 @60\nBench press 4 x 6 80kg\nPlank\n\n   \nPull-ups 3×10"), [
    { name: "Squat", sets: 3, reps: 8, kg: 60 }, { name: "Bench press", sets: 4, reps: 6, kg: 80 },
    { name: "Plank", sets: 0, reps: 0, kg: 0 }, { name: "Pull-ups", sets: 3, reps: 10, kg: 0 },
  ]);
  assert.deepEqual(V.parseExercises("Dumbbell curl @12.5kg"), [{ name: "Dumbbell curl", sets: 0, reps: 0, kg: 12.5 }]);
  assert.deepEqual(V.parseExercises("21s curls"), [{ name: "21s curls", sets: 0, reps: 0, kg: 0 }], "a number in a name is not a weight");
  assert.deepEqual(V.parseExercises(""), []); assert.deepEqual(V.parseExercises(null), []);
  assert.equal(V.parseExercises(Array.from({ length: 50 }, (_, i) => `e${i}`).join("\n")).length, 30);
  assert.equal(V.parseExercises("Squat 99x999 @9999")[0].sets, 20);
});

test("exercisesToText turns back into what parseExercises reads", () => {
  const list = [{ name: "Squat", sets: 3, reps: 8, kg: 60 }, { name: "Plank", sets: 0, reps: 0, kg: 0 }, { name: "Curl", sets: 0, reps: 0, kg: 12.5 }];
  assert.equal(V.exercisesToText(list), "Squat 3x8 @60\nPlank\nCurl @12.5");
  assert.deepEqual(V.parseExercises(V.exercisesToText(list)), list);
  assert.equal(V.exercisesToText(null), "");
});

test("patternFromRows keeps only the days that have a workout", () => {
  const rows = [{ dow: 1, kind: "strength", title: " Push ", minutes: "45" }, { dow: 2, kind: "" }, { dow: 3, kind: "rest", minutes: "" }, null];
  assert.deepEqual(V.patternFromRows(rows), [{ dow: 1, kind: "strength", title: "Push", minutes: 45 }, { dow: 3, kind: "rest", title: "", minutes: 0 }]);
});

test("itemState, dayState and weekTotals", () => {
  const it = (o) => ({ date: "d", kind: "strength", status: "planned", done: false, minutes: 30, ...o });
  assert.equal(V.itemState(it({})), "planned"); assert.equal(V.itemState(it({ done: true })), "done");
  assert.equal(V.itemState(it({ status: "skipped" })), "skipped"); assert.equal(V.itemState(it({ kind: "rest" })), "rest");
  assert.equal(V.dayState(undefined), ""); assert.equal(V.dayState({ planned: 0, done: 0, skipped: 0, rest: 1 }), "rest");
  assert.equal(V.dayState({ planned: 0, done: 2, skipped: 0, rest: 0 }), "done"); assert.equal(V.dayState({ planned: 1, done: 1, skipped: 0, rest: 0 }), "part");
  assert.equal(V.dayState({ planned: 0, done: 0, skipped: 1, rest: 0 }), "skipped"); assert.equal(V.dayState({ planned: 2, done: 0, skipped: 0, rest: 0 }), "planned");
  assert.deepEqual(V.weekTotals([it({ done: true }), it({ minutes: 45 }), it({ status: "skipped" }), it({ kind: "rest", minutes: 0 })]), { planned: 3, done: 1, skipped: 1, minutes: 105 });
  assert.deepEqual(V.weekTotals(null), { planned: 0, done: 0, skipped: 0, minutes: 0 });
});

test("itemsOn: one day's items, rest days last", () => {
  const items = [{ date: "a", kind: "rest", id: 1 }, { date: "a", kind: "strength", id: 2 }, { date: "b", kind: "cardio", id: 3 }];
  assert.deepEqual(V.itemsOn(items, "a").map((i) => i.id), [2, 1]);
  assert.deepEqual(V.kindMeta("cardio"), { kind: "cardio", icon: "🏃", label: "Cardio" }); assert.equal(V.kindMeta("nope").kind, "custom");
});
