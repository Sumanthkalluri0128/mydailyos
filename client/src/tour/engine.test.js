import test from "node:test";
import assert from "node:assert/strict";
import { actionForRequest, back, checklistText, currentId, cutout, hintsFor, init, markLookDone, markSeen, next, onAction, pathFor, placeTooltip, progress, rectUsable, resume, skipAll, stepCopy, welcomeScreens, whatsNew, content } from "./engine.js";

const all = () => true;
const words = (s) => s.trim().split(/\s+/).length;

test("step engine: next, back, finish", () => {
  let st = init(pathFor("lose"));
  assert.equal(currentId(st), "water");
  st = next(st, all); assert.equal(currentId(st), "food");
  st = back(st, all); assert.equal(currentId(st), "water");
  st = back(st, all); assert.equal(currentId(st), "water", "back at the first step stays put");
  for (let i = 0; i < 4; i++) st = next(st, all);
  assert.equal(currentId(st), "goal");
  st = next(st, all);
  assert.equal(st.status, "finished");
  assert.equal(currentId(st), null);
});

test("skip keeps progress; resume starts at the first step that is not done", () => {
  let st = init(pathFor("lose"));
  st = onAction(st, "water_logged"); st = next(st, all); st = onAction(st, "food_logged");
  st = skipAll(st);
  assert.equal(st.status, "skipped"); assert.equal(currentId(st), null);
  st = resume(st, all);
  assert.equal(st.status, "active"); assert.equal(currentId(st), "weight"); assert.deepEqual(st.done, ["water", "food"]);
});

test("resume from saved state restores the position", () => {
  const st = init(pathFor("build"), { index: 2, done: ["water", "food"], status: "active" });
  assert.equal(currentId(st), "workout");
  assert.deepEqual(init(pathFor("build"), { index: 99, done: ["nope"] }).done, []);
  assert.equal(init(pathFor("build"), { index: 99 }).index, 0);
});

test("missing anchor: the step is skipped, never shown broken", () => {
  const noFood = (a) => a !== "food-search";
  let st = init(pathFor("lose"));
  st = next(st, noFood);
  assert.equal(currentId(st), "weight", "food step skipped");
  st = back(st, noFood);
  assert.equal(currentId(st), "water", "back also skips the missing one");
  const none = () => false;
  st = init(pathFor("lose")); st = next(st, none);
  assert.equal(st.status, "finished", "nothing left that can be shown = finished, not stuck");
});

test("resume skips steps whose anchor is gone", () => {
  let st = init(pathFor("lose"), { done: ["water"] });
  st = resume(st, (a) => a !== "food-search");
  assert.equal(currentId(st), "weight");
});

test("real actions complete the waiting step, including one done early", () => {
  let st = init(pathFor("lose"));
  st = onAction(st, "water_logged");
  assert.equal(st.justDone, "water"); assert.deepEqual(st.done, ["water"]);
  st = next(st, all);
  st = onAction(st, "weight_logged");
  assert.equal(st.justDone, null, "weight is a later step: done, but no cheer for the current step");
  assert.ok(st.done.includes("weight"));
  assert.equal(onAction(st, "unknown"), st);
  assert.equal(onAction(st, "weight_logged"), st, "idempotent");
});

test("look steps finish on Next", () => {
  let st = init(["goal"]);
  st = markLookDone(st);
  assert.deepEqual(st.done, ["goal"]);
  assert.equal(progress(st).of, 1);
});

test("goal-based paths: max 5 steps, different per goal, advanced swaps the last step", () => {
  for (const g of ["lose", "build", "healthy"]) assert.ok(pathFor(g).length <= 5);
  assert.ok(pathFor("build").includes("workout") && !pathFor("lose").includes("workout"));
  assert.ok(pathFor("lose").includes("weight") && !pathFor("healthy").includes("weight"));
  assert.ok(pathFor("healthy").includes("coach"));
  assert.ok(pathFor("lose", "advanced").includes("progress"));
  assert.deepEqual(pathFor("???"), pathFor("healthy"));
});

test("copy: three tones, max 20 words, {coach} filled", () => {
  for (const id of Object.keys(content.steps)) for (const t of ["cheer", "calm", "strict"]) assert.ok(words(stepCopy(id, t)) <= 20, `${id} ${t}`);
  assert.equal(stepCopy("water", "unknown-tone"), stepCopy("water", "cheer"));
});

test("welcome: known goal / coach become a confirmation, so nobody is asked twice", () => {
  const known = welcomeScreens({ goalKnown: true, coachKnown: true });
  assert.equal(known.length, 3);
  assert.deepEqual(known.map((w) => w.known), [false, true, true]);
  assert.deepEqual(welcomeScreens({}).map((w) => w.known), [false, false, false]);
});

test("request to action", () => {
  assert.equal(actionForRequest("POST", "https://api.x.com/api/water?x=1"), "water_logged");
  assert.equal(actionForRequest("POST", "/api/food-logs"), "food_logged");
  assert.equal(actionForRequest("POST", "/api/meal-plans/auto"), "plan_created");
  assert.equal(actionForRequest("POST", "/api/meal-plans/lock"), null);
  assert.equal(actionForRequest("GET", "/api/water"), null);
  assert.equal(actionForRequest("DELETE", "/api/water"), null);
});

test("tooltip placement flips and always fits a 360 x 640 phone", () => {
  const vp = { width: 360, height: 640 }, tip = { width: 320, height: 150 };
  assert.equal(placeTooltip({ x: 100, y: 100, width: 80, height: 40 }, tip, vp).placement, "bottom");
  const low = placeTooltip({ x: 100, y: 560, width: 80, height: 40 }, tip, vp);
  assert.equal(low.placement, "top"); assert.ok(low.top >= 8);
  const tall = placeTooltip({ x: 10, y: 20, width: 340, height: 600 }, tip, vp);
  assert.equal(tall.placement, "center");
  for (const r of [{ x: 0, y: 100, width: 40, height: 40 }, { x: 330, y: 100, width: 30, height: 40 }, null]) {
    const p = placeTooltip(r, tip, vp);
    assert.ok(p.left >= 8 && p.left + p.width <= vp.width - 8, "inside horizontally");
    assert.ok(p.top >= 8 && p.top + tip.height <= vp.height, "inside vertically");
  }
  assert.equal(placeTooltip(null, tip, vp).placement, "center");
});

test("cutout is clamped; unusable rects are detected", () => {
  const vp = { width: 360, height: 640 };
  assert.deepEqual(cutout({ x: 2, y: 2, width: 50, height: 50 }, vp, 6), { x: 0, y: 0, width: 58, height: 58 });
  assert.equal(cutout(null, vp), null);
  assert.equal(rectUsable({ x: 10, y: 10, width: 0, height: 20 }, vp), false);
  assert.equal(rectUsable({ x: 400, y: 10, width: 20, height: 20 }, vp), false);
  assert.equal(rectUsable({ x: 10, y: 10, width: 20, height: 20 }, vp), true);
});

test("coachmarks: shown once, replay shows all", () => {
  assert.equal(hintsFor("planner", []).length, 3);
  const seen = markSeen([], hintsFor("planner", []).map((h) => h.id));
  assert.deepEqual(hintsFor("planner", seen), []);
  assert.equal(hintsFor("planner", seen, true).length, 3);
  assert.deepEqual(hintsFor("nowhere", []), []);
  for (const s of ["log", "planner", "progress", "tasks", "profile"]) { const n = hintsFor(s, []).length; assert.ok(n >= 1 && n <= 3, s); }
});

test("what's new: by date and once", () => {
  assert.equal(whatsNew([], "2026-10-22").length, 2);
  assert.equal(whatsNew(["wn.sensei"], "2026-10-22").length, 1);
  assert.equal(whatsNew([], "2030-01-01").length, 0);
});

test("checklist text", () => assert.equal(checklistText({ doneCount: 3, total: 5 }), "3 of 5"));
