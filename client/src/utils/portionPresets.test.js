import test from "node:test";
import assert from "node:assert/strict";
import { bump, usual, fracLabel, isHousehold, foodKey, MIN_USES } from "./portionPresets.js";

test("a one-off amount is not offered, a repeated one is", () => {
  let d = bump({}, "roti", 1.5);
  assert.equal(usual(d, "roti"), null);
  d = bump(d, "roti", 1.5);
  assert.equal(MIN_USES, 2);
  assert.equal(usual(d, "roti"), 1.5);
});
test("the most-used amount wins and bump never mutates", () => {
  const a = bump(bump(bump({}, "rice", 1), "rice", 1), "rice", 2);
  const b = bump(a, "rice", 2);
  assert.equal(usual(a, "rice"), 1);
  assert.equal(usual(b, "rice"), 2, "tie goes to the latest");
  assert.deepEqual(a.rice.n, { 1: 2, 2: 1 });
});
test("bad input is ignored", () => {
  assert.deepEqual(bump({}, "", 1), {});
  assert.deepEqual(bump({}, "x", 0), {});
  assert.equal(usual({}, "x"), null);
});
test("household units and labels", () => {
  assert.equal(isHousehold("roti"), true);
  assert.equal(isHousehold("Katori"), true);
  assert.equal(isHousehold("g"), false);
  assert.equal(fracLabel(1.5), "1½");
  assert.equal(fracLabel(0.5), "½");
  assert.equal(fracLabel(2), "2");
  assert.equal(fracLabel(2.3), "2.3");
  assert.equal(foodKey(null, " Dal Tadka "), "dal tadka");
  assert.equal(foodKey("abc", "x"), "abc");
});
