// The energy model is shared by the server, the web app and the mobile app. These tests pin it to a fixture file that the
// other two projects also run, so a change in one place that is not mirrored in the others fails loudly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./fixtures/energy-fixtures.json');
const E = require('../lib/energy');

for (const c of fx.plans) {
  test(`plan ${c.name}`, () => {
    const got = E.expectedEnergy(c.profile);
    for (const [k, v] of Object.entries(c.expect)) assert.equal(got[k], v, `${k}`);
  });
}

for (const c of fx.targets) test(`target: ${c.name}`, () => assert.equal(E.dailyTarget(c.profile), c.expect));

test('incomplete profile has no plan (clients ask the person to finish their profile)', () => {
  assert.equal(E.expectedEnergy({ age: 30, currentWeightKg: 70 }), null);
  assert.equal(E.expectedEnergy(null), null);
});

for (const c of fx.balances) {
  test(`balance: ${c.name}`, () => {
    const got = E.dayBalance(fx.plans[c.plan].profile, c.day);
    for (const [k, v] of Object.entries(c.expect)) assert.equal(got[k], v, `${k}`);
  });
}

test(`balance: ${fx.balanceWithoutPlan.name}`, () => {
  const got = E.dayBalance(fx.balanceWithoutPlan.profile, fx.balanceWithoutPlan.day);
  for (const [k, v] of Object.entries(fx.balanceWithoutPlan.expect)) assert.equal(got[k], v, `${k}`);
});

for (const c of fx.steps) {
  test(`steps ${c.steps} @ ${c.weightKg}kg`, () => {
    assert.equal(E.stepCalories(c.steps, c.weightKg), c.kcal);
    assert.equal(E.stepDistanceKm(c.steps), c.km);
  });
}
for (const c of fx.water) test(`water target ${c.weightKg}kg`, () => assert.equal(E.waterTargetMl(c.weightKg), c.ml));

test('pace changes the target (the web used to ignore it)', () => {
  const base = { ...fx.plans[0].profile };
  const slow = E.expectedEnergy({ ...base, goals: { ...base.goals, weeklyPaceKg: 0.25 } }).calorieTarget;
  const fast = E.expectedEnergy({ ...base, goals: { ...base.goals, weeklyPaceKg: 0.75 } }).calorieTarget;
  assert.ok(slow > 2160 && 2160 > fast, `${slow} > 2160 > ${fast}`);
});

test('macros add up to the calorie target (within rounding)', () => {
  const m = E.macroTargets(2160, 80, 'lose', null);
  const kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  assert.ok(Math.abs(kcal - 2160) <= 8, `${kcal}`);
});

test('weeksToGoal', () => {
  assert.equal(E.weeksToGoal(80, 72, 0.5), 16);
  assert.equal(E.weeksToGoal(80, 79.8, 0.5), null);
  assert.equal(E.weeksToGoal(null, 72, 0.5), null);
});
