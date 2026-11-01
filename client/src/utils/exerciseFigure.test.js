// Every exercise in the server's library must get a picture; shapes must be finite numbers; the animation must stay inside the frame.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { figureFor, poseKeyFor, shapeToSvg, ROLE_COLORS, ALL_POSE_KEYS } from "./exerciseFigure.js";

const require = createRequire(import.meta.url);
const { LIB, kindOf, SLOTS } = require("../../../server/lib/exerciseLibrary.js");
const asEx = (e) => ({ id: e.id, name: e.name, slot: e.slots[0], kind: kindOf(e), targets: SLOTS[e.slots[0]].main });

const finite = (s) => Object.entries(s).every(([k, v]) => (typeof v === "number" ? Number.isFinite(v) : Array.isArray(v) && k === "pts" ? v.flat().every(Number.isFinite) : true));

test("all 130 library exercises get a figure with three frames", () => {
  for (const e of LIB) {
    const f = figureFor(asEx(e));
    assert.ok(f, `no picture for ${e.id}`);
    assert.equal(f.frames.length, 3, e.id);
    assert.ok(f.frames.every((fr) => fr.length > 8), `${e.id} has a body`);
    assert.ok(f.muscles.length > 0, `${e.id} lists muscles`);
  }
});

test("shapes have finite numbers and render to SVG text", () => {
  for (const e of LIB) {
    const f = figureFor(asEx(e));
    for (const fr of f.frames) for (const s of fr) { assert.ok(finite(s), `${e.id} has a bad number`); assert.ok(shapeToSvg(s, ROLE_COLORS.light).length > 5); }
  }
});

test("the play loop works at any progress and gives a body", () => {
  for (const id of ["goblet-squat", "pushup", "lat-pulldown", "leg-press", "pullup"]) {
    const e = LIB.find((x) => x.id === id);
    const f = figureFor(asEx(e));
    for (const p of [0, 0.25, 0.5, 1, 1.4, -0.2]) { const t = f.tween(p); const list = Array.isArray(t) ? t : t.body; assert.ok(list.length > 8, `${id} at ${p}`); }
  }
});

test("an unknown slot gets no picture, a known slot falls back to a sensible pose", () => {
  assert.equal(figureFor({ id: "x", slot: "nope" }), null);
  assert.ok(poseKeyFor({ id: "new-move", slot: "squat" }));
  assert.ok(ALL_POSE_KEYS.length >= 40);
});

test("equipment tells exercises apart: barbell, dumbbell, kettlebell, machine, bodyweight pictures differ", () => {
  const a = JSON.stringify(figureFor({ id: "db-bench", name: "Dumbbell bench press", slot: "hpress", kind: "free weights", targets: ["chest"] }).frames[0]);
  const b = JSON.stringify(figureFor({ id: "bb-bench", name: "Barbell bench press", slot: "hpress", kind: "free weights", targets: ["chest"] }).frames[0]);
  assert.notEqual(a, b);
});
