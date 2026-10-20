import test from "node:test";
import assert from "node:assert/strict";
import { QUOTES, dailyLine, dayNumber } from "./dailyLine.js";

test("same line all day, a different one on consecutive days, cycling through every quote", () => {
  assert.equal(dailyLine(new Date(2026, 9, 20, 0, 1)), dailyLine(new Date(2026, 9, 20, 23, 59)));
  const seen = new Set(); let prev = "";
  for (let i = 0; i < QUOTES.length; i++) { const l = dailyLine(new Date(2026, 0, 1 + i)); assert.notEqual(l, prev); prev = l; seen.add(l); }
  assert.equal(seen.size, QUOTES.length);
  assert.equal(dayNumber(new Date(2026, 9, 21)) - dayNumber(new Date(2026, 9, 20)), 1);
});
