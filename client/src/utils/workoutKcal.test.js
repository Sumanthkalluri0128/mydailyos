// One burn formula: the Gym log, the Workout tab, the plan kit and energy.estimateBurn must agree for the same MET and minutes.
import test from "node:test";
import assert from "node:assert/strict";
import { estimateBurn, sessionMet, SESSION_MET, REST_MET } from "./energy.js";
import { estimateKcal } from "./workoutStore.js";
import { kitKcal, kitMinutes, WARM, COOL } from "./planKit.js";
import * as G from "./gymMath.js";

test("estimateBurn counts only what the exercise burns: (MET - 1) x 3.5 x kg / 200 per minute", () => {
  assert.equal(REST_MET, 1);
  assert.equal(estimateBurn(5, 80, 60), 336);               // 4 x 3.5 x 80 / 200 x 60
  assert.equal(estimateBurn(1, 80, 60), 0);                 // lying still burns nothing extra
  assert.equal(estimateBurn(0.5, 80, 60), 0);               // never negative
  assert.equal(estimateBurn(3.5, 70, 15), (2.5 * 3.5 * 70 / 200) * 15);
});

test("Workout tab: session types share one MET table, the phone's 'active' means recovery", () => {
  assert.deepEqual(SESSION_MET, { strength: 5, conditioning: 6, recovery: 3.5, rest: 2.5 });
  assert.equal(sessionMet("active"), sessionMet("recovery"));
  assert.equal(sessionMet("unknown kind"), 5);
  assert.equal(sessionMet(undefined), 5);
  for (const kind of Object.keys(SESSION_MET)) assert.equal(estimateKcal({ kind }, 60, 80), Math.round(estimateBurn(SESSION_MET[kind], 80, 60)), kind);
  assert.equal(estimateKcal({ kind: "strength" }, 60, 80), 336);
  assert.equal(estimateKcal({ kind: "strength" }, 0, 80), 0);
});

test("the Gym log gives the same kcal as the formula for the same MET and minutes", () => {
  const walk = { id: "w", date: "2026-11-12", exId: "w", name: "Walking", cat: "cardio", unit: "min", sets: [{ kg: 0, reps: 30 }], at: 1 };
  assert.equal(G.entryKcal(walk, 80), Math.round(estimateBurn(G.metFor("cardio", "Walking", "min"), 80, 30)));
  const squat = { id: "s", date: "2026-11-12", exId: "s", name: "Back Squat", cat: "legs", unit: "reps", sets: [{ kg: 60, reps: 10 }, { kg: 60, reps: 10 }], at: 1 };
  assert.equal(G.entryKcal(squat, 80), Math.round(estimateBurn(5, 80, G.entryMinutes(squat))));
  assert.equal(G.setKcal(squat, squat.sets[0], 80), Math.round(estimateBurn(5, 80, G.setMinutes("reps", squat.sets[0])) * 10) / 10);
});

test("a treadmill pace is a net figure too: walking at 5 km/h flat is 2.38 MET above rest", () => {
  const e = { id: "t", date: "2026-11-12", exId: "t", name: "Treadmill", cat: "cardio", unit: "min", sets: [{ kg: 0, reps: 60, pace: 12 }], at: 1 };
  // ACSM walking: VO2 = 0.1 x 83.3 m/min = 8.33 ml/kg/min above rest -> 2.38 MET net -> x 3.5 x 70 / 200 x 60
  assert.equal(G.entryKcal(e, 70), Math.round(2.381 * 3.5 * 70 / 200 * 60));
});

test("the plan kit (warm-up / cool-down) uses the same formula", () => {
  for (const lib of [...WARM, ...COOL].slice(0, 6)) {
    const item = { id: lib.id, dose: lib.dose || "5 min" };
    assert.equal(kitKcal(item, 80), Math.round(estimateBurn(lib.met, 80, kitMinutes(item))), lib.id);
  }
  assert.equal(kitMinutes({ dose: "10 min" }), 10);
  assert.equal(kitKcal({ id: "typed-by-the-person", dose: "10 min" }, 80), Math.round(estimateBurn(3, 80, 10)), "a move you typed yourself counts as MET 3");
});
