import test from "node:test";
import assert from "node:assert/strict";
import { movingAverage } from "./trend.js";

test("single point averages to itself", () => {
  assert.deepEqual(movingAverage([{ date: "2026-09-01", value: 80 }]), [{ date: "2026-09-01", value: 80, avg: 80 }]);
});

test("smooths a spike using only the trailing 7 calendar days", () => {
  const pts = [80, 80, 80, 82, 80, 80, 80, 80].map((value, i) => ({ date: `2026-09-0${i + 1}`, value }));
  const out = movingAverage(pts);
  assert.equal(Math.round(out[3].avg * 100) / 100, 80.5); // (80+80+80+82)/4
  assert.equal(Math.round(out[7].avg * 100) / 100, 80.29); // days 2..8 (7 days)
});

test("a gap in weigh-ins is measured in calendar days, not entries", () => {
  const out = movingAverage([
    { date: "2026-09-01", value: 90 },
    { date: "2026-09-20", value: 80 },
  ]);
  assert.equal(out[1].avg, 80); // the 9/1 reading is outside the 7-day window
});

test("duplicate days are averaged and unsorted input is handled", () => {
  const out = movingAverage([
    { date: "2026-09-02", value: 81 },
    { date: "2026-09-01", value: 80 },
    { date: "2026-09-01", value: 82 },
  ]);
  assert.deepEqual(out.map((o) => o.date), ["2026-09-01", "2026-09-02"]);
  assert.equal(out[0].value, 81);
  assert.equal(out[1].avg, 81);
});

test("ignores invalid values", () => {
  assert.equal(movingAverage([{ date: "2026-09-01", value: "abc" }, { date: "", value: 5 }]).length, 0);
});
