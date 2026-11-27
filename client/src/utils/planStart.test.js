import test from "node:test";
import assert from "node:assert/strict";
import { GYM_CATALOG } from "./gymCatalog.js";
import { libraryList } from "../data/workoutPlan.js";
import { canStart, isComplete, matchExercise, nextStep, normalize, progress, stepsFor } from "./planStart.js";

const name = (n) => matchExercise(n, GYM_CATALOG)?.name ?? null;

test("names are compared ignoring case, punctuation, plurals and the usual abbreviations", () => {
  assert.equal(normalize("Bench-Press!"), "bench press");
  assert.equal(normalize("Push-ups"), "push up");
  assert.equal(normalize("DB Curl"), "dumbbell curl");
  assert.equal(normalize("BB Row"), "barbell row");
  assert.equal(normalize("Press"), "press", "a word ending in ss is not a plural");
  assert.equal(normalize(null), "");
});

test("a planned name finds the Gym log exercise it means (real catalogue)", () => {
  assert.equal(name("Flat Barbell Bench Press"), "Flat Barbell Bench Press", "exact");
  assert.equal(name("flat barbell bench press"), "Flat Barbell Bench Press", "case");
  assert.equal(name("Barbell Bench Press"), "Flat Barbell Bench Press", "the plain variant is what it means");
  assert.equal(name("DB Shoulder Press"), "Standing Dumbbell Shoulder Press", "abbreviation + a harmless extra word");
  assert.equal(name("Face Pull (Cable / Band)"), "Face Pull", "a note in brackets is not part of the name");
  assert.equal(name("Hanging Knee Raise / Knee Raise"), "Hanging Knee Raise", "the first of two alternatives");
  assert.equal(name("Machine Chest Press"), "Chest Press Machine", "word order");
});

test("it does NOT guess a variant that differs by a real qualifier, or pick between equals", () => {
  assert.equal(name("Cycling (Stationary)"), null, "was wrongly matched to Outdoor Cycling");
  assert.equal(name("Calf Raise"), null, "only the seated one exists: a different exercise");
  assert.equal(name("Triceps Pushdown"), null, "rope variant");
  assert.equal(name("Lat Pulldown"), null, "several grips tie");
  assert.equal(name("Unicorn Lift"), null);
  assert.equal(name(""), null);
  assert.equal(matchExercise("Squat", undefined), null);
  assert.equal(matchExercise("Squat", [null, {}, { id: "x" }]), null, "junk in the catalogue is ignored");
});

test("whatever is matched really contains every word that was asked for (all 73 library names)", () => {
  for (const x of libraryList()) {
    const m = matchExercise(x.name, GYM_CATALOG);
    if (!m) continue;
    const words = normalize(x.name.replace(/\([^)]*\)/g, " ").split("/")[0]).split(" ");
    const got = normalize(m.name).split(" ");
    assert.ok(words.every((w) => got.some((g) => g.startsWith(w))), `${x.name} -> ${m.name}`);
  }
});

const entries = (...ids) => ids.map((exId) => ({ exId }));
const cat = [{ id: "bench", name: "Bench Press", cat: "Chest", unit: "reps" }, { id: "plank", name: "Plank", cat: "Core", unit: "sec" }, { id: "run", name: "Treadmill Run", cat: "Cardio", unit: "min" }];

test("the walk-through: planned numbers, with sensible defaults and limits", () => {
  const s = stepsFor([{ name: "bench press", sets: 4, reps: 8, kg: 60 }, { name: "Plank" }, { name: "treadmill run", sets: 1, kg: 20 }, { name: "Zercher Squat", sets: 99, reps: 99999, kg: 1.239 }], cat, []);
  assert.deepEqual(s.map((x) => [x.name, x.sets, x.reps, x.kg, x.unit, x.custom]), [
    ["Bench Press", 4, 8, 60, "reps", false],
    ["Plank", 3, 30, 0, "sec", false],
    ["Treadmill Run", 1, 20, 0, "min", false],
    ["Zercher Squat", 12, 5000, 1.24, "reps", true],
  ]);
  assert.equal(s[0].exId, "bench"); assert.equal(s[3].exId, "custom:zercher-squat"); assert.equal(s[3].cat, "other");
  assert.equal(new Set(s.map((x) => x.key)).size, 4, "unique keys");
  assert.ok(s.every((x) => !x.done));
});

test("blank names are dropped and nothing crashes on junk", () => {
  assert.deepEqual(stepsFor([{ name: "  " }, null, {}], cat), []);
  assert.deepEqual(stepsFor(undefined, cat), []);
  assert.equal(stepsFor([{ name: "x".repeat(200) }], cat)[0].name.length, 60);
});

test("what is already logged today counts, one entry per step, so a half-done workout can be resumed", () => {
  const planned = [{ name: "Bench Press" }, { name: "Bench Press" }, { name: "Plank" }];
  const s = stepsFor(planned, cat, entries("bench", "plank"));
  assert.deepEqual(s.map((x) => x.done), [true, false, true], "one bench entry satisfies one bench step");
  assert.deepEqual(progress(s), { done: 2, total: 3 });
  assert.equal(nextStep(s).name, "Bench Press");
  assert.equal(stepsFor([{ name: "Zercher Squat" }], cat, entries("custom:zercher-squat"))[0].done, true, "custom exercises count too");
});

test("next step, skipping, and when the workout is complete", () => {
  const s = stepsFor([{ name: "Bench Press" }, { name: "Plank" }], cat, []);
  assert.equal(nextStep(s).key, s[0].key);
  assert.equal(nextStep(s, [s[0].key]).key, s[1].key, "skipped steps are passed over");
  assert.equal(isComplete(s), false);
  assert.equal(isComplete(s, [s[0].key, s[1].key]), true, "everything done or skipped");
  assert.equal(isComplete(stepsFor([{ name: "Bench Press" }], cat, entries("bench"))), true);
  assert.equal(isComplete([]), false, "an empty plan is not a finished one");
  assert.equal(nextStep(undefined), null);
});

test("which planned workouts can be started", () => {
  const item = { date: "2026-11-23", kind: "strength", status: "planned", exercises: [{ name: "Bench Press" }] };
  assert.equal(canStart(item, "2026-11-23"), true, "today");
  assert.equal(canStart(item, "2026-11-25"), true, "a missed day can still be done");
  assert.equal(canStart(item, "2026-11-22"), false, "not before its day");
  assert.equal(canStart({ ...item, status: "done" }, "2026-11-23"), false);
  assert.equal(canStart({ ...item, status: "skipped" }, "2026-11-23"), false);
  assert.equal(canStart({ ...item, done: true }, "2026-11-23"), false, "already matched by your log");
  assert.equal(canStart({ ...item, kind: "rest" }, "2026-11-23"), false);
  assert.equal(canStart({ ...item, exercises: [] }, "2026-11-23"), false, "nothing to walk through");
  assert.equal(canStart({ ...item, exercises: [{ name: " " }] }, "2026-11-23"), false);
  assert.equal(canStart(null, "2026-11-23"), false);
  assert.equal(canStart({ ...item, date: "" }, "2026-11-23"), false);
});

test("the everyday spellings of a bodyweight exercise find the catalogue's one", () => {
  for (const [typed, real] of [["pushups", "Push-Up"], ["Push-ups", "Push-Up"], ["push up", "Push-Up"], ["Pull ups", "Pull-Up"], ["pullups", "Pull-Up"], ["Dips", "Dip"]]) {
    if (!GYM_CATALOG.some((e) => e.name === real)) continue;          // only where the catalogue really has that exercise
    assert.equal(name(typed), real, typed);
  }
  assert.ok(GYM_CATALOG.some((e) => e.name === "Push-Up") && GYM_CATALOG.some((e) => e.name === "Pull-Up"), "the test really ran against both");
});
