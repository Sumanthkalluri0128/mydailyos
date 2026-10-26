import test from "node:test";
import assert from "node:assert";
import { ageLabel, freshness, usableCopy, MIN, HOUR } from "./freshness.js";

const now = Date.UTC(2026, 9, 26, 12, 0, 0);
test("age label", () => {
  assert.strictEqual(ageLabel(now - 30 * 1000, now), "just now");
  assert.strictEqual(ageLabel(now - 5 * MIN, now), "5 min ago");
  assert.strictEqual(ageLabel(now - 3 * HOUR, now), "3 h ago");
  assert.strictEqual(ageLabel(now - 26 * HOUR, now), "yesterday");
  assert.strictEqual(ageLabel(now - 96 * HOUR, now), "4 days ago");
  assert.strictEqual(ageLabel(undefined, now), "");
  assert.strictEqual(ageLabel(now + 5 * MIN, now), "just now"); // clock skew never shows a negative age
});
test("freshness bands", () => {
  assert.strictEqual(freshness(now - MIN, now), "fresh");
  assert.strictEqual(freshness(now - 5 * HOUR, now), "recent");
  assert.strictEqual(freshness(now - 7 * HOUR, now), "old");
  assert.strictEqual(freshness(null, now), "unknown");
});
test("a saved copy is only used for the same person on the same day", () => {
  const saved = { date: "2026-10-26", owner: "a@x.com", food: {} };
  assert.strictEqual(usableCopy(saved, { date: "2026-10-26", owner: "a@x.com" }), saved);
  assert.strictEqual(usableCopy(saved, { date: "2026-10-27", owner: "a@x.com" }), null);
  assert.strictEqual(usableCopy(saved, { date: "2026-10-26", owner: "b@x.com" }), null);
  assert.strictEqual(usableCopy(null, { date: "2026-10-26", owner: "a@x.com" }), null);
});
