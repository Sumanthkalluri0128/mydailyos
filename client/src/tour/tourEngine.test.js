import test from "node:test";
import assert from "node:assert/strict";
import content from "./tourContent.js";
import * as T from "./tourEngine.js";

test("copy rules: every step, hint, welcome and what's-new line is at most 20 words", () => {
  const all = [...Object.values(content.steps).flatMap((s) => [s.title, s.text, s.cheer]), ...content.welcome.map((w) => w.text), ...Object.values(content.hints).flat().map((h) => h.text), ...content.whatsNew.map((w) => w.text), content.checklistReward.text];
  for (const t of all) assert.ok(T.words(t) <= 20, `too long: ${t}`);
});
test("paths: at most 5 interactive steps, every id exists, goal-based order differs", () => {
  for (const g of ["lose", "build", "stay"]) {
    const p = T.pathFor(g);
    assert.ok(p.filter(T.isInteractive).length <= 5);
    assert.ok(p.every((id) => content.steps[id]));
  }
  assert.notDeepEqual(T.pathFor("lose"), T.pathFor("build"));
  assert.deepEqual(T.pathFor("nonsense"), T.pathFor("stay"));
  assert.ok(content.paths.lose.includes("goalcard") && content.paths.stay.includes("sensei"), "earlier-section features are taught");
  for (const h of Object.values(content.hints)) assert.ok(h.length >= 1 && h.length <= 3);
});
test("engine: next, back, skip, resume, dismiss, replay", () => {
  let s = T.start(T.init({ goal: "lose" }));
  assert.equal(s.status, "active"); assert.equal(T.current(s).id, "water");
  s = T.next(s); assert.equal(T.current(s).id, "food");
  s = T.back(s); assert.equal(T.current(s).id, "water");
  s = T.back(s); assert.equal(s.index, 0);
  s = T.next(s); s = T.skip(s); assert.equal(s.status, "paused"); assert.equal(T.current(s), null);
  s = T.resume(s); assert.equal(s.status, "active"); assert.equal(s.index, 0, "resumes at the first step not yet done");
  s = T.dismiss(s); assert.equal(T.start(s).status, "dismissed", "dismissed stays dismissed");
  s = T.replay(s); assert.equal(s.status, "active"); assert.equal(s.index, 0);
});
test("engine: finishing the last step ends the tour", () => {
  let s = T.start(T.init({ goal: "stay" }));
  for (let i = 0; i < s.path.length; i += 1) s = T.next(s);
  assert.equal(s.status, "done");
});
test("engine: a real action completes the step, cheers, and advances", () => {
  let s = T.start(T.init({ goal: "lose" }));
  let r = T.onEvent(s, "food.logged"); // out of order: remembered, not the current step
  assert.equal(r.completed, null); assert.ok(r.state.done.includes("food")); s = r.state;
  r = T.onEvent(s, "water.logged");
  assert.equal(r.completed, "water"); assert.match(r.cheer, /water/i); s = r.state;
  assert.equal(T.current(s).id, "food", "still shows food until Next/resume");
});
test("resume goes to the first step that is neither done nor skipped", () => {
  let s = T.start(T.init({ goal: "lose" }));
  s = T.onEvent(s, "water.logged").state; s = T.skip(s); s = T.resume(s);
  assert.equal(T.current(s).id, "food");
});
test("missing anchor: the step is skipped instead of breaking, and the tour can still finish", () => {
  let s = T.start(T.init({ goal: "stay" }));
  const first = T.current(s).id;
  s = T.skipMissing(s);
  assert.ok(s.skipped.includes(first)); assert.notEqual(T.current(s).id, first);
  for (let i = 0; i < 20 && s.status === "active"; i += 1) s = T.skipMissing(s);
  assert.equal(s.status, "done");
});
test("saved state: removed steps are dropped, index stays in range", () => {
  const s = T.init({ goal: "lose", saved: { path: ["water", "gone", "food"], index: 9, status: "paused", done: ["water"] } });
  assert.deepEqual(s.path, ["water", "food"]); assert.equal(s.index, 1);
});
test("events are detected from real API calls", () => {
  assert.equal(T.detectEvent("POST", "/api/water"), "water.logged");
  assert.equal(T.detectEvent("post", "https://x.example.com/api/food-logs/quick"), "food.logged");
  assert.equal(T.detectEvent("POST", "/api/meal-plans/auto"), "plan.created");
  assert.equal(T.detectEvent("POST", "/api/meal-plans/lock"), null);
  assert.equal(T.detectEvent("GET", "/api/water"), null);
  assert.equal(T.detectEvent("POST", "/api/assistant/ask"), "coach.met");
});
test("checklist: progress, order-free, reward at the end", () => {
  let c = T.checklistState([]); assert.equal(c.label, "0 of 5"); assert.equal(c.reward, null);
  c = T.checklistState(["coach.met", "water.logged", "food.logged"]); assert.equal(c.label, "3 of 5");
  c = T.checklistState(["coach.met", "water.logged", "food.logged", "weight.logged", "plan.created"]);
  assert.ok(c.complete); assert.match(c.reward.text, /Rookie/);
});
test("coachmarks show once: seen hints are not shown again, max 3", () => {
  assert.equal(T.hintsFor("log", []).length, 2);
  assert.equal(T.hintsFor("log", ["log-1"]).length, 1);
  assert.equal(T.hintsFor("log", ["log-1", "log-2"]).length, 0);
  assert.equal(T.hintsFor("unknown", []).length, 0);
  assert.equal(T.allHints("log").length, 2, "the ? icon can replay them");
});
test("what's new: shown once, never for a build that lacks the feature", () => {
  assert.equal(T.whatsNewFor([], 37).length, 1);
  assert.equal(T.whatsNewFor(["wn-simple-progress"], 37).length, 0);
  assert.equal(T.whatsNewFor([], 30).length, 0);
});
test("merge: nothing completed on either side is lost", () => {
  const m = T.mergeSaved({ done: ["water"], events: ["water.logged"], hintsSeen: ["log-1"], updatedAt: 1 }, { done: ["food"], events: ["food.logged"], hintsSeen: ["tasks-1"], status: "paused", updatedAt: 5 });
  assert.deepEqual(m.done.sort(), ["food", "water"]); assert.equal(m.hintsSeen.length, 2); assert.equal(m.status, "paused");
});
test("spotlight geometry: tooltip flips to fit and stays on screen (360x640 phone)", () => {
  const view = { w: 360, h: 640 }, tip = { w: 300, h: 140 };
  const top = T.placeTip({ x: 20, y: 40, w: 100, h: 40 }, view, tip);
  assert.equal(top.side, "below"); assert.ok(top.y + tip.h <= view.h);
  const bottom = T.placeTip({ x: 300, y: 580, w: 50, h: 40 }, view, tip);
  assert.equal(bottom.side, "above"); assert.ok(bottom.x + tip.w <= view.w && bottom.x >= 0);
  assert.equal(T.usableRect({ x: 0, y: 0, w: 0, h: 10 }, view), false);
  assert.equal(T.usableRect({ x: 0, y: 900, w: 50, h: 50 }, view), false);
  assert.equal(T.usableRect(null, view), false);
  assert.equal(T.usableRect({ x: 10, y: 10, w: 50, h: 50 }, view), true);
});
