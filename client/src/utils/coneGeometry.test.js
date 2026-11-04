import test from "node:test";
import assert from "node:assert/strict";
import { coneGeometry } from "./coneGeometry.js";

const cone = Array.from({ length: 21 }, (_, i) => ({ date: `d${i}`, mid: Math.max(72.5, 77.6 - 0.23 * i), fast: Math.max(72.5, 77.6 - 0.33 * i), slow: Math.max(72.5, 77.6 - 0.05 * i) }));
const r = { status: "ok", goalKg: 72.5, cone, likelyDays: 105, likely: "2027-02-16", startDate: "2026-11-03", endDate: "2027-03-30" };

test("the middle line stops at the arrival instead of running along the goal", () => {
  const g = coneGeometry(r);
  const lastX = Number(g.mid.split(" ").pop().slice(1).split(",")[0]);
  assert.equal(lastX, g.arrival.x);
  assert.ok(g.arrival.x < g.W - g.P, "arrival is inside the chart, not at its right edge");
  assert.equal(g.arrival.y, g.goalY, "arrival dot sits on the goal line");
  assert.equal(g.arrival.date, "2027-02-16");
});

test("date labels never overlap and always start with today", () => {
  const g = coneGeometry(r);
  assert.equal(g.ticks[0].date, "2026-11-03");
  for (let i = 1; i < g.ticks.length; i += 1) assert.ok(g.ticks[i].x - g.ticks[i - 1].x >= 56);
});

test("goal label sits at the left, away from the line's arrival", () => {
  const g = coneGeometry(r);
  assert.equal(g.goalLabel.x, g.P);
  assert.equal(g.goalLabel.text, "Goal 72.5 kg");
});

test("nothing to draw without a cone", () => {
  assert.equal(coneGeometry({ goalKg: 70, cone: [] }), null);
  assert.equal(coneGeometry(null), null);
});
