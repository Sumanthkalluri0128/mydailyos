import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_MS, a11yText, decoy, hideWeight, isWeightRevealed, revealWeight, rollText, runs, subscribeWeight, toggleWeight } from "./weightReveal.js";

const fresh = (t) => { t.mock.timers.enable({ apis: ["setTimeout"] }); hideWeight(); };

test("weight is blurred by default on every load", () => { assert.equal(isWeightRevealed(), false); });

test("reveal, then it re-blurs by itself after about 8 seconds", (t) => {
  fresh(t);
  assert.equal(REVEAL_MS, 8000);
  revealWeight();
  assert.equal(isWeightRevealed(), true);
  t.mock.timers.tick(7999);
  assert.equal(isWeightRevealed(), true);
  t.mock.timers.tick(2);
  assert.equal(isWeightRevealed(), false);
});

test("tapping again hides straight away; a second reveal restarts the window", (t) => {
  fresh(t);
  assert.equal(toggleWeight(), true);
  assert.equal(toggleWeight(), false);
  revealWeight(); t.mock.timers.tick(5000); revealWeight(); t.mock.timers.tick(5000);
  assert.equal(isWeightRevealed(), true);
  t.mock.timers.tick(3001);
  assert.equal(isWeightRevealed(), false);
});

test("leaving the page blurs again and subscribers are told once per change", (t) => {
  fresh(t);
  const calls = [];
  const off = subscribeWeight(() => calls.push(isWeightRevealed()));
  revealWeight(); revealWeight(); hideWeight(); hideWeight();
  off();
  assert.deepEqual(calls, [true, false]);
});

test("the hidden state never contains the real digits; screen readers get no number", () => {
  assert.equal(decoy("80.7 kg"), "88.8 kg");
  assert.doesNotMatch(decoy("80.7 kg"), /[0-79]/);
  assert.equal(a11yText("80.7 kg", false), "Weight hidden");
  assert.equal(a11yText("80.7 kg", true), "80.7 kg");
});

test("roll-up starts below the real value and lands exactly on it", () => {
  assert.equal(rollText("80.7 kg", 0, 79.9), "79.9 kg");
  assert.equal(rollText("80.7 kg", 1, 79.9), "80.7 kg");
  assert.equal(rollText("5.2 kg to go · target 76.0 kg", 1), "5.2 kg to go · target 76.0 kg");
  assert.deepEqual(runs("5.2 kg to go"), [{ t: "5.2", num: true }, { t: " kg to go", num: false }]);
});
