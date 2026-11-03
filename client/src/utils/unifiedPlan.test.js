import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAYS, SMART_ID } from "../data/workoutPlan.js";
import { newActive, finishActive, streak, suggestNext } from "./workoutStore.js";
import { altsOf, findInDays, mergeLibrary, programToDays, sessionPayload, smartPhase, smartProgression, smartStrip, smartUsable, stripStatus, toStrength, variantDay } from "./unifiedPlan.js";

// A real plan from server/lib (body plan + adapt): beginner, 4 days, gym and home, Tuesday 3 Nov 2026.
const fx = JSON.parse(readFileSync(new URL("./fixtures/smart-both4.json", import.meta.url), "utf8"));
const program = fx.plan.training.program;
const TODAY = "2026-11-03";
const days = programToDays(program, { weightKg: 78, adapt: fx.plan.adapt });
const strengthExercises = (d) => d.blocks.filter((b) => b.type === "sets").flatMap((b) => b.items);

test("7 days, Monday first, one per weekday, ids unique", () => {
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.short), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.equal(new Set(days.map((d) => d.id)).size, 7);
  // Monday's slot already passed (the plan starts today), so its session is NOT listed again: it slides to Tuesday
  assert.equal(days[0].missed, true);
  assert.equal(days[0].kind, "rest");
  const lifts = days.filter((d) => d.kind === "strength");
  assert.equal(lifts.length, 3);
  assert.equal(new Set(lifts.map((d) => d.sessionId)).size, lifts.length, "a session appears on two days");
});

test("a lifting day has the same shape as the fixed plan: warm-up, main sets, cool-down, picture ids, steps", () => {
  const d = days.find((x) => x.kind === "strength");
  assert.deepEqual(d.blocks.map((b) => b.id), ["warm", "main", "cool"]);
  assert.ok(d.minutes && d.kcal > 0 && d.focus && d.muscles.length);
  for (const e of strengthExercises(d)) {
    assert.ok(e.id && e.name && e.sets >= 1 && e.repsMin > 0 && e.repsMax >= e.repsMin, e.id);
    assert.equal(e.fig, e.id);
    assert.ok(e.steps.length >= 2, `${e.id} steps`);
    assert.ok(Array.isArray(e.alts));
  }
});

test("no exercise is listed twice in a day, and an alternative is never the exercise itself", () => {
  for (const d of days) for (const way of Object.values(d.ways || {})) {
    const ids = way.blocks.filter((b) => b.type === "sets").flatMap((b) => b.items.map((i) => i.id));
    assert.equal(new Set(ids).size, ids.length, `${d.id} repeats an exercise`);
  }
  for (const e of program.sessions.flatMap((s) => s.exercises)) {
    const alts = altsOf(e);
    assert.ok(!alts.some((a) => a.id === e.id), e.id);
    assert.equal(new Set(alts.map((a) => a.id)).size, alts.length, `${e.id} repeats an alternative`);
    for (const a of alts) { assert.equal(a.alt, true); assert.equal(a.parent, e.id); }
  }
});

test("gym / home / quick: three ways per day, quick is a tick-off circuit, unknown way falls back to gym", () => {
  const d = days.find((x) => x.kind === "strength");
  assert.deepEqual(d.wayList.map(([id]) => id), ["gym", "home", "quick"]);
  const q = variantDay(d, "quick");
  assert.equal(q.way, "quick"); assert.equal(q.blocks.length, 1); assert.equal(q.blocks[0].type, "check");
  assert.ok(q.blocks[0].items.length >= 3 && Number(q.minutes) <= 25);
  const h = variantDay(d, "home");
  assert.equal(h.way, "home"); assert.ok(strengthExercises(h).length > 0);
  assert.equal(variantDay(d, "nope").way, "gym");
  assert.equal(variantDay(days.find((x) => x.kind === "rest"), "home").kind, "rest");
});

test("a home-only plan has no separate home way", () => {
  const home = JSON.parse(JSON.stringify(program)); home.place = "home";
  const d = programToDays(home).find((x) => x.kind === "strength");
  assert.deepEqual(d.wayList.map(([id]) => id), ["gym", "quick"]);
  assert.equal(d.wayList[0][1], "🏠 Home");
});

test("rest and easy-cardio days are tick lists, never empty", () => {
  for (const d of days.filter((x) => x.kind !== "strength")) {
    assert.ok(["recovery", "rest"].includes(d.kind));
    assert.ok(d.blocks.every((b) => b.type === "check" && b.items.length > 0), d.id);
  }
});

test("today's target from the server wins over what the browser remembers", () => {
  const ex = strengthExercises(days.find((x) => x.kind === "strength"))[0];
  assert.equal(ex.next.action, "start");
  const s = suggestNext(ex, []);
  assert.equal(s.first, true); assert.equal(s.r, ex.repsMin);
  const heavier = suggestNext({ ...ex, next: { action: "addWeight", weightKg: 42.5, reps: 8, note: "Go heavier." } }, []);
  assert.equal(heavier.w, 42.5); assert.equal(heavier.up, true); assert.equal(heavier.note, "Go heavier.");
});

test("the set count the server worked out for today is used, and weeks do not add a set on top", () => {
  const d = days.find((x) => x.kind === "strength");
  const a = newActive(d, { week: 9, sessions: [], swaps: {}, today: TODAY });
  for (const e of strengthExercises(d)) assert.equal(a.sets[e.id].length, e.sets, e.id);
  assert.equal(a.day.id, d.id); // the session keeps its own copy of a smart day
  assert.equal(newActive(DAYS[0], { week: 1, sessions: [], swaps: {}, today: TODAY }).day, undefined);
});

test("week strip follows the server's statuses and today's cell is marked", () => {
  const strip = smartStrip(program, days, [], TODAY);
  assert.equal(strip.length, 7);
  assert.equal(strip.filter((c) => c.isToday).length, 1);
  assert.equal(strip.find((c) => c.isToday).day.short, "Tue");
  assert.equal(strip.find((c) => c.isToday).status, "today");
  // a workout saved on this device but not yet known to the server still shows as done
  const rec = { id: "x", date: TODAY, planId: SMART_ID };
  assert.equal(smartStrip(program, days, [rec], TODAY).find((c) => c.isToday).status, "done");
});

test("status mapping", () => {
  assert.equal(stripStatus("done", "strength", "2026-11-02", TODAY), "done");
  assert.equal(stripStatus("extra", "recovery", "2026-11-02", TODAY), "done");
  assert.equal(stripStatus("notdone", "strength", "2026-11-02", TODAY), "missed");
  assert.equal(stripStatus("skipped", "strength", "2026-11-02", TODAY), "missed");
  assert.equal(stripStatus("past", "strength", "2026-11-02", TODAY), "rest-past");
  assert.equal(stripStatus("upcoming", "recovery", "2026-11-02", TODAY), "rest-past");
  assert.equal(stripStatus("planned", "strength", "2026-11-05", TODAY), "upcoming");
  assert.equal(stripStatus("upcoming", "strength", TODAY, TODAY), "today");
});

test("streak: easy-cardio and rest days do not break it in the smart plan", () => {
  const done = (date) => ({ id: date, date });
  // Fri, Sat (cardio), Sun (rest), Mon: Sat and Sun are not lifting days, so the chain holds
  assert.equal(streak([done("2026-10-30"), done("2026-11-02")], "2026-11-02", days, ["rest", "recovery"]) >= 1, true);
  assert.equal(streak([done("2026-11-02")], "2026-11-03", days, ["rest", "recovery"]), 1);
  assert.equal(streak([done("2026-10-30"), done("2026-11-02")], "2026-11-03", days, ["rest", "recovery"]) >= 2, true);
  assert.equal(streak([], "2026-11-03", days, ["rest", "recovery"]), 0);
});

test("the finished record becomes the body-plan session the server expects (and counts calories once)", () => {
  const d = variantDay(days.find((x) => x.kind === "strength"), "gym");
  const a = newActive(d, { week: 1, sessions: [], swaps: {}, today: TODAY, now: 1000 });
  const ex = strengthExercises(d);
  a.sets[ex[0].id] = [{ w: 40, r: 8, done: true }, { w: 40, r: 9, done: true }, { w: 40, r: 9, done: false }];
  a.pain = ["knee"];
  const rec = finishActive(a, d, { swaps: {}, weightKg: 78, feel: "challenging", notes: "ok", now: 1000 + 40 * 60000 });
  assert.equal(rec.planId, SMART_ID); assert.equal(rec.sessionId, d.sessionId); assert.equal(rec.way, "gym");
  const body = sessionPayload(rec, { today: TODAY, phase: "build" });
  assert.equal(body.status, "done"); assert.equal(body.feel, "hard"); assert.deepEqual(body.pain, ["knee"]);
  assert.equal(body.clientId, `wp-${rec.id}`);
  assert.equal(body.exercises.length, 1);
  assert.deepEqual(body.exercises[0].sets, [{ reps: 8, weightKg: 40, seconds: 0 }, { reps: 9, weightKg: 40, seconds: 0 }]);
  assert.equal(body.phase, "build"); assert.ok(body.minutes >= 39);
  assert.equal(sessionPayload({ ...rec, feel: "" }, {}).feel, "");
  assert.equal(sessionPayload({ ...rec }, { phase: "weird" }).phase, "");
});

test("timed exercises are sent as seconds", () => {
  const rec = { id: "t", date: TODAY, minutes: 5, exercises: [{ id: "plank", name: "Plank", timed: true, sets: [{ w: 0, r: 45, done: true }] }] };
  assert.deepEqual(sessionPayload(rec, {}).exercises[0].sets, [{ seconds: 45, reps: 0, weightKg: 0 }]);
});

test("library: each exercise name once, the plan's exercises added to the fixed library", () => {
  const base = [{ id: "a", name: "Lat Pulldown", alts: [] }, { id: "b", name: "Goblet Squat", alts: [] }];
  const lib = mergeLibrary(base, days);
  const names = lib.map((e) => e.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  assert.ok(lib.length > base.length);
  const dup = mergeLibrary([{ id: "z", name: "Chest press machine", alts: [] }], days);
  assert.equal(dup.filter((e) => e.name.toLowerCase() === "chest press machine").length, 1);
});

test("findInDays resolves an exercise by id (the sheet needs the original of an alternative)", () => {
  const ex = strengthExercises(days.find((x) => x.kind === "strength"))[0];
  assert.equal(findInDays(days, ex.id).name, ex.name);
  assert.equal(findInDays(days, "nope"), null);
  const alt = ex.alts[0];
  assert.equal(findInDays(days, alt.parent).id, ex.id);
});

test("phase and progression lists", () => {
  assert.equal(smartPhase(fx.plan.adapt).id, "build");
  assert.equal(smartPhase(null).id, "build");
  const p = smartProgression(program);
  assert.deepEqual(p.map((x) => x.phase), ["learn", "build", "easy"]);
  assert.ok(p.every((x) => x.weeks.startsWith("Week") && x.title && x.text));
});

test("the smart plan is only used when it is ready and worked out for this week", () => {
  assert.equal(smartUsable(fx, TODAY), true);
  assert.equal(smartUsable(fx, "2026-11-04"), true);
  assert.equal(smartUsable(fx, "2026-11-09"), false); // next Monday: an old saved copy is not used
  assert.equal(smartUsable({ plan: { ready: false } }, TODAY), false);
  assert.equal(smartUsable(null, TODAY), false);
  assert.equal(toStrength({ id: "x", name: "test lift", repsLo: 8, repsHi: 8, sets: 2, restSec: 60, unit: "reps" }).reps, "8");
});
