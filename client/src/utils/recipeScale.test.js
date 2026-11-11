import test from "node:test";
import assert from "node:assert/strict";
import { scaleQuantity, scaleItems, withBase, totalFromPerServing } from "./recipeScale.js";

test("scaling down and back up returns to the original amounts", () => {
  const items = withBase([{ foodName: "Rice", quantity: 300 }, { foodName: "Ghee", quantity: 2 }, { foodName: "Salt", quantity: null }]);
  const half = scaleItems(items, 4, 2);
  assert.deepEqual(half.map((i) => i.quantity), [150, 1, null]);
  assert.deepEqual(scaleItems(half, 4, 4).map((i) => i.quantity), [300, 2, null]);
  assert.deepEqual(scaleItems(half, 4, 6).map((i) => i.quantity), [450, 3, null]);
});
test("odd values round sensibly and bad input is left alone", () => {
  assert.equal(scaleQuantity(1.5, 2, 3), 2.3); assert.equal(scaleQuantity(333, 3, 2), 222); assert.equal(scaleQuantity(5, 0, 2), 5);
});
test("per-serving macros are fixed, totals follow the servings", () => {
  assert.deepEqual(totalFromPerServing({ calories: 250, protein: 10.5 }, 4), { calories: 1000, protein: 42 });
});
