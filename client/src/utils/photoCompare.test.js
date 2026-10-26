import test from "node:test";
import assert from "node:assert/strict";
import { initialPair, movePair, spanText, daysBetween } from "./photoCompare.js";
const P = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-10-01"].map((date, i) => ({ id: `p${i}`, date }));

test("starts with first vs latest; empty list is safe", () => {
  assert.deepEqual(initialPair(P), { before: 0, after: 3 }); assert.deepEqual(initialPair([]), { before: -1, after: -1 });
});
test("sliders never cross", () => {
  let pair = initialPair(P);
  pair = movePair(P, pair, "before", 2); assert.deepEqual(pair, { before: 2, after: 3 });
  pair = movePair(P, pair, "after", 0); assert.deepEqual(pair, { before: 2, after: 2 });
  pair = movePair(P, pair, "before", 99); assert.equal(pair.before, 2);
  assert.deepEqual(movePair([], { before: -1, after: -1 }, "after", 3), { before: -1, after: -1 });
});
test("span wording", () => {
  assert.equal(daysBetween("2026-06-01", "2026-06-11"), 10);
  assert.equal(spanText(P[0], P[1]), "4 weeks apart"); assert.equal(spanText(P[0], P[3]), "4 months apart"); assert.equal(spanText(P[0], P[0]), "Same day");
});
