import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand as p } from "./quickCommand.js";

test("water: ml, litres, glasses", () => {
  assert.deepEqual(p("water 250"), { kind: "water", ml: 250 });
  assert.deepEqual(p("w 500 ml"), { kind: "water", ml: 500 });
  assert.deepEqual(p("water 1.5 l"), { kind: "water", ml: 1500 });
  assert.deepEqual(p("water 2 glasses"), { kind: "water", ml: 500 });
  assert.deepEqual(p("water 2"), { kind: "water", ml: 2000 });
});
test("weight and workout", () => {
  assert.deepEqual(p("weight 70,5"), { kind: "weight", kg: 70.5 });
  assert.deepEqual(p("kg 78kg"), { kind: "weight", kg: 78 });
  assert.deepEqual(p("workout 30"), { kind: "workout", minutes: 30, name: "" });
  assert.deepEqual(p("workout 45 min yoga"), { kind: "workout", minutes: 45, name: "yoga" });
});
test("food and go", () => {
  assert.deepEqual(p("food rice"), { kind: "food", query: "rice" });
  assert.deepEqual(p("go progress"), { kind: "goto", page: "progress" });
});
test("unclear input is never guessed", () => {
  for (const x of ["", "water", "water abc", "weight 5", "weight 900", "workout 0", "go nowhere", "dance 5", "water 99999"]) assert.equal(p(x), null, x);
});
