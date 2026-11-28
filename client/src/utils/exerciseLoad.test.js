import test from "node:test";
import assert from "node:assert/strict";
import { convertWeight, detectMode, est1RM, kgPerRep, liftPayload, loadOf, loadText, movedText, setFields, setVolume } from "./exerciseLoad.js";
import { GYM_CATALOG } from "./gymCatalog.js";
import { libraryList } from "../data/workoutPlan.js";
import { finishActive, newActive, volumeOf } from "./workoutStore.js";

test("dumbbell moves ask for ONE dumbbell and count both hands", () => {
  const l = loadOf({ name: "Dumbbell Biceps Curl", gear: "Dumbbell" });
  assert.equal(l.mode, "each");
  assert.equal(l.hands, 2);
  assert.equal(kgPerRep(l, 12), 24);
  assert.equal(setVolume(l, 12, 10), 240);
  assert.equal(loadText(l, 12), "12 kg each");
  assert.match(movedText(l, 12), /24 kg in all/);
});
test("one-arm moves count one dumbbell; goblet squat is one total weight", () => {
  const row = loadOf({ name: "One-Arm Dumbbell Row", gear: "Dumbbell" });
  assert.deepEqual([row.mode, row.hands], ["each", 1]);
  assert.equal(kgPerRep(row, 20), 20);
  assert.equal(loadOf({ name: "Goblet Squat" }).mode, "total");
});
test("barbell, machine and cable are total weight", () => {
  for (const n of ["Barbell Bench Press", "Leg Press (45°)", "Lat Pulldown", "Seated Cable Row", "Trap Bar Deadlift"]) assert.equal(loadOf({ name: n }).mode, "total", n);
});
test("body weight moves: nothing to type, extra is optional, volume uses your body", () => {
  const l = loadOf({ name: "Push-Up", gear: "Bodyweight" });
  assert.equal(l.mode, "bw");
  assert.equal(l.extra, true);
  assert.equal(kgPerRep(l, 0, 70), 70);
  assert.equal(kgPerRep(l, 10, 70), 80);
  assert.equal(loadText(l, 0), "BW");
  assert.equal(loadText(l, 10), "BW + 10 kg");
});
test("assisted machine subtracts the help, never below zero", () => {
  const l = loadOf({ name: "Assisted Pull-Up Machine" });
  assert.equal(l.mode, "assist");
  assert.equal(kgPerRep(l, 20, 70), 50);
  assert.equal(kgPerRep(l, 100, 70), 0);
});
test("cardio and bands have no weight", () => {
  assert.equal(loadOf({ name: "Treadmill Run", cat: "Cardio", unit: "min" }).asks, false);
  assert.equal(loadOf({ name: "Banded Glute Bridge", gear: "Band" }).mode, "none");
  assert.equal(loadOf({ name: "Face Pull (Cable / Band)", kind: "cable" }).mode, "total");
  assert.deepEqual(setFields(loadOf({ name: "Treadmill Run", unit: "min" }), 5, 70), {});
});
test("the person can override, and each <-> total converts", () => {
  const each = loadOf({ name: "Dumbbell Bench Press", gear: "Dumbbell" });
  const total = loadOf({ name: "Dumbbell Bench Press", gear: "Dumbbell" }, "total");
  assert.equal(total.mode, "total");
  assert.equal(convertWeight(each, total, 20), 40);
  assert.equal(convertWeight(total, each, 40), 20);
  assert.equal(convertWeight(each, loadOf({ name: "x" }, "bw"), 20), 0);
  assert.equal(loadOf({ name: "Push-Up" }, "nonsense").mode, "bw");
});
test("every exercise in the app gets a sensible mode (no crashes, cardio has none)", () => {
  for (const e of [...libraryList(), ...GYM_CATALOG]) {
    const d = detectMode(e);
    assert.ok(["each", "total", "bw", "assist", "none"].includes(d.mode), e.name);
    if (String(e.unit) === "min") assert.equal(d.mode, "none", e.name);
  }
});
test("est1RM", () => { assert.equal(est1RM(60, 10), 80); assert.equal(est1RM(0, 5), 0); });

test("a finished workout stores what each weight meant, volume counts both dumbbells, and the lift payload carries it", () => {
  const curl = { id: "c1", name: "Dumbbell Biceps Curl", gear: "Dumbbell", sets: 2, reps: "10", repsMin: 10, repsMax: 10, rest: 60, targets: ["arms"], alts: [] };
  const push = { id: "p1", name: "Push-Up", gear: "Bodyweight", bw: true, sets: 1, reps: "10", repsMin: 10, repsMax: 10, rest: 60, targets: ["chest"], alts: [] };
  const day = { id: "d1", n: 1, title: "Test", kind: "strength", blocks: [{ id: "main", type: "sets", title: "Main", items: [curl, push] }] };
  const a = newActive(day, { week: 1, sessions: [], swaps: {}, today: "2026-11-28" });
  a.sets.c1 = [{ w: 12, r: 10, done: true }, { w: 12, r: 8, done: true }];
  a.sets.p1 = [{ w: 0, r: 15, done: true }];
  const rec = finishActive(a, day, { swaps: {}, weightKg: 70, feel: "good", notes: "" });
  const c = rec.exercises.find((e) => e.id === "c1"), p = rec.exercises.find((e) => e.id === "p1");
  assert.equal(c.mode, "each");
  assert.equal(c.hands, 2);
  assert.deepEqual(c.sets.map((s) => s.tk), [24, 24]);
  assert.equal(p.mode, "bw");
  assert.equal(p.sets[0].tk, 70);
  assert.equal(volumeOf(rec), 24 * 10 + 24 * 8 + 70 * 15);
  assert.deepEqual(c.muscles, ["biceps"]);
  const body = liftPayload(rec, 70);
  assert.equal(body.sessionId, rec.id);
  assert.equal(body.exercises.length, 2);
  assert.deepEqual(body.exercises[0].sets[0], { reps: 10, seconds: 0, weightKg: 12, totalKg: 24 });
});
test("the weight meaning you picked is remembered and converts the suggested weight", () => {
  const press = { id: "b1", name: "Dumbbell Bench Press", gear: "Dumbbell", sets: 1, reps: "8", repsMin: 8, repsMax: 8, rest: 60, targets: ["chest"], alts: [] };
  const day = { id: "d1", n: 1, title: "T", kind: "strength", blocks: [{ id: "main", type: "sets", title: "Main", items: [press] }] };
  const past = [{ id: "s0", date: "2026-11-20", startedAt: 1, exercises: [{ id: "b1", name: press.name, mode: "each", hands: 2, sets: [{ w: 20, r: 6, done: true }] }] }];
  const same = newActive(day, { week: 1, sessions: past, swaps: {}, today: "2026-11-28" });
  assert.equal(same.sets.b1[0].w, 20);
  const asTotal = newActive(day, { week: 1, sessions: past, swaps: {}, today: "2026-11-28", modes: { b1: "total" } });
  assert.equal(asTotal.sets.b1[0].w, 40);
  assert.equal(asTotal.modes.b1, "total");
});
test("liftPayload is null when there is nothing to track", () => {
  assert.equal(liftPayload({ id: "x", date: "2026-11-28", exercises: [] }, 70), null);
  assert.equal(liftPayload(null, 70), null);
});
