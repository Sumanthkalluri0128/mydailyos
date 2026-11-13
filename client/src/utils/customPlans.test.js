import test from "node:test";
import assert from "node:assert/strict";
import { DAYS, findExercise, libraryList } from "../data/workoutPlan.js";
import { weekStrip, streak, newActive, finishActive, suggestNext } from "./workoutStore.js";
import { findInDays } from "./unifiedPlan.js";
import { addItem, addPlan, cleanPlans, clearDay, customIdOf, customToDays, moveItem, newPlan, parseReps, planFromDays, removeItem, removePlan, renamePlan, setDayTitle, sourceFor, updateItem, MAX_ITEMS, MAX_PLANS } from "./customPlans.js";

const lib = libraryList();
const lookup = (id) => lib.find((x) => x.id === id) || null;

test("parseReps reads ranges, singles and junk", () => {
  assert.deepEqual(parseReps("8-12"), { lo: 8, hi: 12, label: "8-12" });
  assert.deepEqual(parseReps("10"), { lo: 10, hi: 10, label: "10" });
  assert.equal(parseReps("15 - 12").label, "12-15");
  assert.equal(parseReps("abc").label, "8");
  assert.equal(parseReps("").label, "8");
});

test("source ids round-trip", () => {
  assert.equal(customIdOf(sourceFor("cp-1")), "cp-1");
  assert.equal(customIdOf("classic"), "");
  assert.equal(customIdOf(undefined), "");
});

test("add and delete plans, with a cap", () => {
  let plans = [];
  const a = newPlan("Push", 1), b = newPlan("Legs", 2);
  plans = addPlan(addPlan(plans, a), b);
  assert.equal(plans.length, 2);
  plans = removePlan(plans, a.id);
  assert.deepEqual(plans.map((p) => p.name), ["Legs"]);
  assert.deepEqual(removePlan(plans, "nope"), plans);
  let many = [];
  for (let i = 0; i < MAX_PLANS + 3; i++) many = addPlan(many, newPlan(`P${i}`, i + 10));
  assert.equal(many.length, MAX_PLANS);
  assert.equal(renamePlan(plans, b.id, "  Leg day  ")[0].name, "Leg day");
});

test("add, edit, move, remove exercises; no duplicates in a day", () => {
  const p = newPlan("X", 5);
  let plans = [p];
  plans = addItem(plans, p.id, 1, { id: "a", name: "A", sets: 3, reps: "8-12" });
  plans = addItem(plans, p.id, 1, { id: "a", name: "A again", sets: 3, reps: "8-12" });
  plans = addItem(plans, p.id, 1, { id: "b", name: "B", sets: 99, reps: "x" });
  const d = plans[0].days[0];
  assert.deepEqual(d.items.map((i) => i.id), ["a", "b"]);
  assert.equal(d.items[1].sets, 10); // clamped
  plans = updateItem(plans, p.id, 1, "a", { sets: 4, reps: "6-8" });
  assert.deepEqual([plans[0].days[0].items[0].sets, plans[0].days[0].items[0].reps], [4, "6-8"]);
  plans = moveItem(plans, p.id, 1, "b", -1);
  assert.deepEqual(plans[0].days[0].items.map((i) => i.id), ["b", "a"]);
  plans = removeItem(plans, p.id, 1, "b");
  assert.deepEqual(plans[0].days[0].items.map((i) => i.id), ["a"]);
  plans = setDayTitle(plans, p.id, 1, "Push day");
  assert.equal(plans[0].days[0].title, "Push day");
  plans = clearDay(plans, p.id, 1);
  assert.deepEqual(plans[0].days[0], { dow: 1, title: "", items: [], warm: [], cool: [] });
  // the original was never mutated
  assert.equal(p.days[0].items.length, 0);
  let big = [p];
  for (let i = 0; i < MAX_ITEMS + 5; i++) big = addItem(big, p.id, 2, { id: `e${i}`, name: `E${i}`, sets: 3, reps: "10" });
  assert.equal(big[0].days[1].items.length, MAX_ITEMS);
});

test("cleanPlans survives bad data", () => {
  assert.deepEqual(cleanPlans(null), []);
  assert.deepEqual(cleanPlans("x"), []);
  const out = cleanPlans([null, { id: "bad id!" }, { id: "ok", name: "", days: [{ dow: 9, items: [] }, { dow: 2, title: "T", items: [{ id: "a", name: "A", sets: "x", reps: "7" }, { id: "a", name: "dup" }, { name: "no id" }] }] }, { id: "ok", name: "twin" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "My plan");
  assert.equal(out[0].days.length, 7);
  assert.deepEqual(out[0].days[1].items, [{ id: "a", name: "A", cat: "", unit: "reps", sets: 3, reps: "7" }]);
});

test("customToDays: rest days, training days, shape the page expects", () => {
  const p = planFromDays("Copy", DAYS, 7);
  assert.ok(p.days[0].items.length > 0, "Monday copied");
  const days = customToDays(p, lookup);
  assert.equal(days.length, 7);
  assert.ok(days.every((d) => d.source === "custom" && d.planId === p.id && d.id.startsWith(p.id)));
  const mon = days[0];
  assert.equal(mon.kind, "strength");
  const main = mon.blocks.find((b) => b.type === "sets");
  assert.ok(main.items.length > 0);
  for (const it of main.items) assert.ok(it.repsMin >= 1 && it.repsMax >= it.repsMin && it.sets >= 1 && Array.isArray(it.alts));
  // a plan with nothing in it is seven rest days (no crash anywhere)
  const empty = customToDays(newPlan("Empty", 9), lookup);
  assert.ok(empty.every((d) => d.kind === "rest" && d.blocks[0].type === "check"));
  assert.equal(customToDays(null).length, 0);
});

test("the shared lookups and the week strip work on a personal plan", () => {
  let plans = [newPlan("Mine", 11)];
  const id = plans[0].id;
  plans = addItem(plans, id, 1, { id: "db-shoulder-press", name: "DB Shoulder Press", sets: 3, reps: "8-12" });
  const days = customToDays(plans[0], lookup);
  assert.equal(findInDays(days, "db-shoulder-press").name, "DB Shoulder Press");
  const strip = weekStrip([], "2026-11-04", days);
  assert.equal(strip.length, 7);
  assert.equal(strip[0].day.kind, "strength");
  assert.equal(streak([], "2026-11-04", days), 0);
});

test("a session on a personal day is saved with the plan's own id and keeps its own copy of the day", () => {
  let plans = addItem([newPlan("Mine", 12)], "x", 1, { id: "z", name: "Z", sets: 3, reps: "8-12" });
  plans = [newPlan("Mine", 12)];
  plans = addItem(plans, plans[0].id, 1, { id: "plank", name: "Plank", sets: 2, reps: "20-30" });
  const day = customToDays(plans[0], lookup)[0];
  const active = newActive(day, { week: 1, sessions: [], swaps: {}, today: "2026-11-02" });
  assert.ok(active.day, "the session keeps its own copy, so editing or deleting the plan mid-workout cannot break it");
  active.sets.plank = active.sets.plank.map((s) => ({ ...s, r: 25, done: true }));
  const rec = finishActive(active, day, { swaps: {}, weightKg: 70 });
  assert.equal(rec.planId, plans[0].id);
  assert.equal(rec.exercises.length, 1);
  // next time the usual rule steps it up
  assert.ok(suggestNext({ ...day.blocks[0].items[0] }, [rec]).r >= 20);
});

// ---- warm-up, main workout, cool-down and the calorie estimate
import { TEMPLATES, WARM, COOL, dayEstimate, doseMinutes, suggestWarmCool, templateDays } from "./planKit.js";
import { GYM_CATALOG } from "./gymCatalog.js";
import { addKit, copyDay, planFromTemplate, removeKit, setWarmCool, trainingDays, updateKit } from "./customPlans.js";

test("every template exercise exists in the catalogue, and every training day has warm-up, main and cool-down", () => {
  const names = new Set(GYM_CATALOG.map((c) => c.name));
  for (const t of TEMPLATES) {
    const days = templateDays(t);
    assert.ok(days.length >= 2, t.id);
    for (const d of days) {
      assert.ok(d.items.length >= 1 && d.warm.length >= 2 && d.cool.length >= 2, `${t.id} ${d.title}`);
      for (const it of d.items) assert.ok(names.has(it.name), `${t.id}: ${it.name} is not in the catalogue`);
    }
  }
});

test("planFromTemplate fills the week, and the day shape feeds Today with warm-up and cool-down blocks", () => {
  const p = planFromTemplate("t-legs", "My leg plan");
  assert.equal(p.name, "My leg plan");
  assert.equal(trainingDays(p).length, 2);
  const days = customToDays(p, () => null, 77);
  const mon = days.find((d) => d.dow === 1);
  assert.deepEqual(mon.blocks.map((b) => b.id), ["warm", "main", "cool"]);
  assert.ok(mon.kcal > 100 && Number(mon.minutes) > 20);
  assert.equal(days.find((d) => d.dow === 2).kind, "rest");
});

test("kit edits: add, change the dose, remove, auto-fill, copy a day", () => {
  let plans = [newPlan("X")];
  const id = plans[0].id;
  plans = addItem(plans, id, 1, { id: "a", name: "Back Squat", cat: "legs", sets: 3, reps: "8-10" });
  plans = addKit(plans, id, 1, "warm", { id: WARM[0].id, name: WARM[0].name, dose: WARM[0].dose });
  plans = addKit(plans, id, 1, "warm", { id: WARM[0].id, name: "dup", dose: "1 min" });
  assert.equal(plans[0].days[0].warm.length, 1);
  plans = updateKit(plans, id, 1, "warm", WARM[0].id, "5 min");
  assert.equal(plans[0].days[0].warm[0].dose, "5 min");
  plans = removeKit(plans, id, 1, "warm", WARM[0].id);
  assert.equal(plans[0].days[0].warm.length, 0);
  plans = setWarmCool(plans, id, 1, suggestWarmCool(plans[0].days[0].items));
  assert.ok(plans[0].days[0].warm.length >= 2 && plans[0].days[0].cool.length >= 2);
  plans = copyDay(plans, id, 1, 3);
  assert.deepEqual(plans[0].days[2].items.map((x) => x.id), ["a"]);
  assert.equal(plans[0].days[2].warm.length, plans[0].days[0].warm.length);
});

test("calorie estimate follows sets, reps and body weight", () => {
  const day = { items: [{ id: "a", name: "Back Squat", cat: "legs", unit: "reps", sets: 3, reps: "10" }], warm: [], cool: [] };
  const base = dayEstimate(day, 70).mainKcal;
  assert.ok(base > 0);
  assert.ok(dayEstimate({ ...day, items: [{ ...day.items[0], sets: 6 }] }, 70).mainKcal > base * 1.9);   // twice the sets, about twice the burn
  assert.ok(dayEstimate({ ...day, items: [{ ...day.items[0], reps: "20" }] }, 70).mainKcal > base);       // more reps, more time under tension
  assert.ok(dayEstimate(day, 90).mainKcal > base);                                                          // heavier body, more burn
  assert.equal(doseMinutes("3 min"), 3);
  assert.equal(doseMinutes("30 sec / side"), 1);
  assert.ok(COOL.every((c) => c.id.startsWith("cd-")) && WARM.every((w) => w.id.startsWith("wu-")));
});
