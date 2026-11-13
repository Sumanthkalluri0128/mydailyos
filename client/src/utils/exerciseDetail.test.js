import test from "node:test";
import assert from "node:assert/strict";
import { sortExercises, detailFor, slotFor, defaultsFor, pickerList } from "./exerciseDetail.js";
import { libraryList } from "../data/workoutPlan.js";
import { GYM_CATALOG } from "./gymCatalog.js";
import { lookupExercise } from "./exerciseLookup.js";
import { customToDays, newPlan, addItem } from "./customPlans.js";

test("sort: boosted first, then muscle group order, then A-Z", () => {
  const l = [{ id: "a", name: "Zebra", cat: "legs" }, { id: "b", name: "Alpha", cat: "legs" }, { id: "c", name: "Row", cat: "back" }, { id: "d", name: "Press", cat: "chest" }];
  assert.deepEqual(sortExercises(l).map((e) => e.id), ["d", "c", "b", "a"]);
  assert.deepEqual(sortExercises(l, { boost: ["a"] }).map((e) => e.id)[0], "a");
});
test("every catalogue exercise gets muscles, steps and sensible sets", () => {
  for (const c of GYM_CATALOG) {
    const d = detailFor({ ...c, cat: c.cat.toLowerCase() });
    assert.ok(d.targets.length && d.steps.length >= 3, c.name);
    assert.ok(d.sets >= 1 && d.reps, c.name);
  }
});
test("slots and defaults", () => {
  assert.equal(slotFor("Triceps Kickback"), "tri");
  assert.equal(slotFor("Barbell Back Squat"), "squat");
  assert.equal(defaultsFor({ name: "Plank", unit: "sec" }).label, "3 × 30 s");
  assert.equal(defaultsFor({ name: "Treadmill", unit: "min", cat: "cardio" }).sets, 1);
});
test("picker list is big, unique and sorted by group", () => {
  const l = sortExercises(pickerList(libraryList(), GYM_CATALOG));
  assert.ok(l.length > 150);
  assert.equal(new Set(l.map((e) => e.name.toLowerCase())).size, l.length);
  assert.equal(l[0].cat, "chest");
});
test("a plan with a catalogue and a typed exercise opens with steps; timed flag survives", () => {
  let plans = [newPlan("t")];
  const id = plans[0].id;
  plans = addItem(plans, id, 1, { id: "gc-flat-barbell-bench-press", name: "Flat Barbell Bench Press", sets: 3, reps: "8-12" });
  plans = addItem(plans, id, 1, { id: "custom:wall-sit", name: "Wall sit", sets: 3, reps: "30" });
  const plank = libraryList().find((e) => /plank/i.test(e.name));
  plans = addItem(plans, id, 1, { id: plank.id, name: plank.name, sets: 3, reps: "30" });
  const day = customToDays(plans[0], lookupExercise)[0];
  const items = day.blocks[0].items;
  assert.ok(items[0].steps.length && items[1].steps.length);
  assert.equal(items[2].timed, !!plank.timed);
});
