// v72: calories vs macros agreement, macro basis wording, autopilot default.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/energy');
const H = require('../lib/coachHub');

test('macroMismatch: only a 15 %+ gap (40 kcal+) with at least two macros counts', () => {
  assert.equal(E.macroMismatch({ calories: 1700 }).mismatch, false);                                   // no macros: unknown, not wrong
  assert.equal(E.macroMismatch({ calories: 1700, protein: 0, carbs: 0, fat: 0 }).mismatch, false);
  assert.equal(E.macroMismatch({ calories: 720, protein: 48, carbs: 96, fat: 28.8 }).mismatch, true);    // 835 vs 720: 16 % and 115 kcal
});

test('macroMismatch: real rows from the export', () => {
  assert.equal(E.macroMismatch({ calories: 950, protein: 20, carbs: 100, fat: 40 }).mismatch, false);    // 840 vs 950: 12 %, label rounding
  assert.equal(E.macroMismatch({ calories: 420, protein: 12, carbs: 70, fat: 22 }).mismatch, true);      // 526 vs 420: 25 %
  assert.equal(E.macroMismatch({ calories: 200, protein: 6, carbs: 34, fat: 4 }).mismatch, false);       // 196 vs 200
  assert.equal(E.macroMismatch({ calories: 40, protein: 5, carbs: 5, fat: 0 }).mismatch, false);         // small absolute gap never counts
});

test('resolveTargets says which calories the macros are sized to', () => {
  const p = { age: 26, sex: 'male', heightCm: 173, currentWeightKg: 77.3, activityLevel: 'moderate', goals: { targetWeightKg: 71, weeklyPaceKg: 0.75, bodyType: 'lean' } };
  const base = E.resolveTargets(p);
  assert.equal(base.macroBasis, 'plan');
  assert.match(base.macroBasisNote, new RegExp(`plan's ${base.calories} kcal`));
  const day = E.resolveTargets(p, { budget: base.calories + 300 });
  assert.equal(day.macroBasis, 'today');
  assert.match(day.macroBasisNote, /today's \d+ kcal budget/);
  assert.equal(day.macros.protein, base.macros.protein);                                                 // protein never moves with the day
  assert.ok(day.macros.carbs > base.macros.carbs);
});

test('autopilot is on until the person switches it off themselves', () => {
  assert.equal(H.effectiveAuto({}), 'safe');
  assert.equal(H.effectiveAuto({ coachAuto: 'off' }), 'safe');                                           // an old stored default they never chose
  assert.equal(H.effectiveAuto({ coachAuto: 'off', coachAutoChosen: true }), 'off');
  assert.equal(H.effectiveAuto({ coachAuto: 'safe', coachAutoChosen: true }), 'safe');
  assert.equal(H.effectiveAuto(null), 'safe');
});
