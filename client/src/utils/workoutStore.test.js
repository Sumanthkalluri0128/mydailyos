import test from "node:test";
import assert from "node:assert/strict";
import { DAYS, findExercise, allItems, libraryList } from "../data/workoutPlan.js";
import { weekNumber, phaseFor, setsFor, suggestNext, weekStrip, streak, mondayOf, addDays, newActive, finishActive, personalBests, estimateKcal, summarize, inRange, volumeOf, elapsedSec } from "./workoutStore.js";

const MON = "2026-11-02"; // a Monday
const sess = (date, dayId, exs = []) => ({ id: `s-${date}-${dayId}`, date, dayId, exercises: exs, minutes: 50, kcal: 300, startedAt: 1 });
const ex = (id, sets) => ({ id, name: id, sets: sets.map(([w, r]) => ({ w, r, done: true })) });

test("plan data: 7 days, every strength exercise has steps and 3-4 alternatives, ids are unique", () => {
  assert.equal(DAYS.length, 7);
  assert.deepEqual(DAYS.map((d) => d.short), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  const ids = new Set();
  for (const d of DAYS) for (const b of d.blocks) {
    if (b.type !== "sets") continue;
    for (const e of b.items) {
      assert.ok(e.steps.length >= 3, `${e.id} steps`);
      assert.ok(e.alts.length >= 3 && e.alts.length <= 4, `${e.id} alts ${e.alts.length}`);
      assert.ok(e.repsMin > 0 && e.repsMax >= e.repsMin);
    }
  }
  for (const i of allItems()) { assert.ok(!ids.has(i.id), `duplicate id ${i.id}`); ids.add(i.id); }
});
test("plan data matches the sheet: Upper A has 6 lifts, Lower A 5, Upper B 6, Lower B 5", () => {
  const n = (id) => DAYS.find((d) => d.id === id).blocks.find((b) => b.id === "main").items.length;
  assert.deepEqual([n("d1"), n("d2"), n("d4"), n("d5")], [6, 5, 6, 5]);
});
test("findExercise resolves an alternative and inherits sets/reps from the original", () => {
  const alt = findExercise("incline-pushup--wall-push-up");
  assert.equal(alt.name, "Wall Push-up"); assert.equal(alt.sets, 3); assert.equal(alt.repsMax, 12); assert.equal(findExercise("nope"), null);
});
test("library lists each exercise once", () => {
  const names = libraryList().map((x) => x.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});
test("week number and phases", () => {
  assert.equal(weekNumber(MON, MON), 1); assert.equal(weekNumber(MON, "2026-11-08"), 1); assert.equal(weekNumber(MON, "2026-11-09"), 2);
  assert.equal(weekNumber("2026-11-05", "2026-11-09"), 2); // start mid-week -> that week's Monday
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((w) => phaseFor(w).id), ["learn", "learn", "build", "build", "progress", "progress"]);
});
test("extra set on main lifts only from week 5", () => {
  const sq = findExercise("bodyweight-squat"), cu = findExercise("db-biceps-curl");
  assert.equal(setsFor(sq, 4), 3); assert.equal(setsFor(sq, 5), 4); assert.equal(setsFor(cu, 6), 2);
});
test("progression: top of range everywhere -> heavier; otherwise +1 rep; first time -> light", () => {
  const press = findExercise("db-shoulder-press"); // 3 x 8-12, upper
  assert.equal(suggestNext(press, []).first, true);
  const up = suggestNext(press, [sess(MON, "d1", [ex("db-shoulder-press", [[20, 12], [20, 12], [20, 12]])])]);
  assert.deepEqual([up.w, up.r, !!up.up], [22, 8, true]);
  const more = suggestNext(press, [sess(MON, "d1", [ex("db-shoulder-press", [[20, 10], [20, 9], [20, 8]])])]);
  assert.deepEqual([more.w, more.r], [20, 11]);
  const leg = findExercise("leg-press");
  assert.equal(suggestNext(leg, [sess(MON, "d2", [ex("leg-press", [[40, 12], [40, 12], [40, 12]])])]).w, 44); // +10 % cap beats +5
  const bw = findExercise("bodyweight-squat");
  assert.equal(suggestNext(bw, [sess(MON, "d2", [ex("bodyweight-squat", [[0, 15], [0, 15], [0, 15]])])]).w, 0);
});
test("week strip marks done, today, missed, upcoming and the rest day", () => {
  const strip = weekStrip([sess(MON, "d1")], addDays(MON, 3)); // Thursday
  assert.deepEqual(strip.map((s) => s.status), ["done", "missed", "missed", "today", "upcoming", "upcoming", "upcoming"]);
  assert.equal(weekStrip([], addDays(MON, 6))[6].status, "today");
});
test("streak: Sunday never breaks it, a missed training day does, today still open does not", () => {
  const fri = "2026-10-30", sat = "2026-10-31", sun = "2026-11-01";
  assert.equal(streak([sess(fri, "d5"), sess(sat, "d6")], sun), 2);          // Sunday today, nothing yet
  assert.equal(streak([sess(fri, "d5"), sess(sat, "d6"), sess(MON, "d1")], MON), 3); // Sunday skipped over
  assert.equal(streak([sess(fri, "d5")], MON), 0);                            // Saturday missed
  assert.equal(streak([sess(fri, "d5")], sat), 1);                            // Saturday still open
});
test("newActive prefills from history and a swap; finishActive keeps only ticked sets under the swapped id", () => {
  const d1 = DAYS[0];
  const hist = [sess("2026-10-26", "d1", [ex("db-shoulder-press", [[20, 12], [20, 12], [20, 12]])])];
  const a = newActive(d1, { week: 6, sessions: hist, swaps: { "incline-pushup": "incline-pushup--knee-push-up" }, today: MON, now: 1000 });
  assert.equal(a.sets["db-shoulder-press"].length, 4);            // week 6: extra set on a main lift
  assert.deepEqual([a.sets["db-shoulder-press"][0].w, a.sets["db-shoulder-press"][0].r], [22, 8]);
  a.sets["incline-pushup"][0] = { w: 0, r: 10, done: true };
  a.checks.d1w1 = true;
  const rec = finishActive(a, d1, { swaps: { "incline-pushup": "incline-pushup--knee-push-up" }, weightKg: 78, feel: "good", notes: "x", now: 1000 + 50 * 60000 });
  assert.equal(rec.exercises.length, 1); assert.equal(rec.exercises[0].id, "incline-pushup--knee-push-up"); assert.equal(rec.exercises[0].from, "Incline Push-up");
  assert.equal(rec.minutes, 50); assert.equal(rec.checks, 1); assert.ok(rec.kcal > 150 && rec.kcal < 450);
});
test("personal bests need a history and a higher estimated 1RM", () => {
  const prev = sess("2026-10-26", "d1", [ex("lat-pulldown", [[40, 10]])]);
  const now = { ...sess(MON, "d4", [ex("lat-pulldown", [[45, 10]]), ex("face-pull", [[10, 12]])]), id: "new" };
  assert.deepEqual(personalBests(now, [prev, now]).map((p) => p.id), ["lat-pulldown"]);
});
test("kcal, summary, ranges, pause clock", () => {
  assert.equal(estimateKcal(DAYS[0], 60, 78), Math.round((5 - 1) * 3.5 * 78 / 200 * 60)); // lifting MET 5, net of the 1 MET of resting energy
  const list = [sess(MON, "d1", [ex("a", [[10, 10]])]), sess("2026-10-20", "d2")];
  assert.deepEqual(summarize(list), { workouts: 2, minutes: 100, kcal: 600, volume: 100 });
  assert.equal(inRange(list, "week", "2026-11-04").length, 1); assert.equal(inRange(list, "month", "2026-11-04").length, 1); assert.equal(inRange(list, "all", MON).length, 2);
  assert.equal(volumeOf(list[0]), 100);
  assert.equal(elapsedSec({ startedAt: 0, pausedMs: 10000, pausedAt: 0 }, 70000), 60);
  assert.equal(elapsedSec({ startedAt: 0, pausedMs: 0, pausedAt: 30000 }, 90000), 30);
  assert.equal(mondayOf("2026-11-08"), MON);
});

test("storage: the list of deletes still waiting for the server is kept, and an older saved state without it loads fine", async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const { loadState, saveState, emptyState } = await import("./workoutStore.js");
  assert.deepEqual(emptyState().pendingDeletes, []);
  assert.deepEqual(loadState("a@x.com").pendingDeletes, [], "nothing saved yet");
  mem.set("ff-wp-v1:old@x.com", JSON.stringify({ sessions: [], synced: {} }));          // saved before this list existed
  assert.deepEqual(loadState("old@x.com").pendingDeletes, []);
  const st = { ...emptyState(), pendingDeletes: [{ clientId: "wp-ws-1", kind: "smart", at: Date.now() }] };
  assert.equal(saveState("a@x.com", st), true);
  assert.deepEqual(loadState("a@x.com").pendingDeletes.map((x) => x.clientId), ["wp-ws-1"]);
  mem.set("ff-wp-v1:bad@x.com", JSON.stringify({ pendingDeletes: "garbage" }));
  assert.deepEqual(loadState("bad@x.com").pendingDeletes, [], "a damaged list is ignored, not a crash");
});

// ---- two workouts on one day, and a workout done on a different day than planned (the Workout tab)
test("week strip, classic plan: a plan day counts as done wherever in the week it was trained (a catch-up on Wednesday fills Monday's slot)", async () => {
  const { weekStrip } = await import("./workoutStore.js");
  const WED = "2026-11-04";                       // Wednesday
  const s = (date, dayId) => ({ id: `${date}-${dayId}-${Math.random()}`, date, dayId, minutes: 40, kcal: 200, exercises: [] });
  const status = (list) => weekStrip(list, WED).map((c) => c.status);
  assert.deepEqual(status([]), ["missed", "missed", "today", "upcoming", "upcoming", "upcoming", "upcoming"], "nothing trained yet");
  // Day 1 (Monday's workout) made up on Wednesday: Monday's slot is done, today's own slot (Day 3) is still waiting
  const st = status([s(WED, "d1")]);
  assert.equal(st[0], "done"); assert.equal(st[2], "today"); assert.equal(st[1], "missed");
});

test("week strip: two workouts on one day: the same plan day twice is one done slot; two different plan days fill two slots", async () => {
  const { weekStrip } = await import("./workoutStore.js");
  const WED = "2026-11-04";
  const s = (date, dayId) => ({ id: `${date}-${dayId}-${Math.random()}`, date, dayId, minutes: 40, kcal: 200, exercises: [] });
  const twice = weekStrip([s(WED, "d3"), s(WED, "d3")], WED);
  assert.equal(twice.filter((c) => c.status === "done").length, 1, "the same day done twice is one day");
  const both = weekStrip([s(WED, "d1"), s(WED, "d2")], WED);
  assert.deepEqual(both.slice(0, 3).map((c) => c.status), ["done", "done", "today"], "Day 1 and Day 2 both made up today; today's own Day 3 still waits");
  const early = weekStrip([s(WED, "d4")], WED);
  assert.equal(early[3].status, "done", "Thursday's workout done early shows done before its date");
});

test("week strip: only THIS week counts", async () => {
  const { weekStrip } = await import("./workoutStore.js");
  const s = (date, dayId) => ({ id: `${date}-${dayId}`, date, dayId, minutes: 40, kcal: 200, exercises: [] });
  assert.equal(weekStrip([s("2026-10-28", "d1")], "2026-11-04")[0].status, "missed", "last week's Day 1 does not fill this week's slot");
});

test("smart strip: by DATE (any Smart session that day = done), one or two; another plan's session does not count", async () => {
  const { smartStrip } = await import("./unifiedPlan.js");
  const days = Array.from({ length: 7 }, (_, i) => ({ id: `sm-${i}`, kind: i === 6 ? "rest" : "strength", title: "t" }));
  const program = { week: [] };
  const s = (date, planId) => ({ id: `${date}-${planId}-${Math.random()}`, date, planId, dayId: "x" });
  const strip = (list) => smartStrip(program, days, list, "2026-11-04").map((c) => c.status);
  assert.equal(strip([s("2026-11-04", "smart")])[2], "done");
  assert.equal(strip([s("2026-11-04", "smart"), s("2026-11-04", "smart")])[2], "done", "two Smart workouts on one day: still one done day");
  assert.notEqual(strip([s("2026-11-04", "lean-toned-7")])[2], "done", "a classic-plan session does not mark a Smart day done");
  assert.notEqual(strip([s("2026-11-03", "smart")])[2], "done", "yesterday's does not mark today done");
});

test("the Done chip adds up several workouts of the day", async () => {
  const { totalsOfDay } = await import("./workoutStore.js");
  assert.deepEqual(totalsOfDay([{ minutes: 25, kcal: 120 }, { minutes: 35.4, kcal: 180.6 }]), { count: 2, minutes: 60, kcal: 301 });
  assert.deepEqual(totalsOfDay([{ minutes: "x" }]), { count: 1, minutes: 0, kcal: 0 });
  assert.deepEqual(totalsOfDay(undefined), { count: 0, minutes: 0, kcal: 0 });
});
