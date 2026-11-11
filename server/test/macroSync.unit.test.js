// Home, My Plan and the phone must show the SAME calories and macros for the same person.
const test = require('node:test');
const assert = require('node:assert/strict');
const { expectedEnergy, macroTargets } = require('../lib/energy');
const { bodyPlan } = require('../lib/bodyPlan');

const base = { sex: 'male', age: 30, heightCm: 175, currentWeightKg: 88, activityLevel: 'moderate' };

// What Home computes from the SAVED profile (HomeDashboard.jsx / mobile index.tsx).
function homeView(profile) {
  const e = expectedEnergy(profile);
  return { calories: e.calorieTarget, ...macroTargets(e.calorieTarget, e.weightKg, e.direction, profile.goals?.proteinTarget, profile.goals?.bodyType) };
}

for (const type of ['lean', 'athletic', 'muscular', 'balanced']) {
  test(`after saving the ${type} plan, Home shows the plan's numbers`, () => {
    const plan = bodyPlan({ profile: { ...base, goals: {} }, type, fresh: true });
    assert.ok(plan.ready);
    const saved = { ...base, goals: { bodyType: type, calorieMode: 'auto', proteinTarget: null, targetWeightKg: plan.mode === 'lose' ? plan.goal.targetWeightKg : null, weeklyPaceKg: plan.mode === 'lose' ? plan.goal.weeklyPaceKg : undefined } };
    const h = homeView(saved);
    assert.equal(h.calories, plan.calories);
    assert.equal(h.protein, plan.macros.protein);
    assert.equal(h.carbs, plan.macros.carbs);
    assert.equal(h.fat, plan.macros.fat);
  });
}

test('a pinned protein number (the old 140 default) is the cause of Home and My Plan disagreeing', () => {
  const plan = bodyPlan({ profile: { ...base, goals: {} }, type: 'athletic', fresh: true });
  const pinned = homeView({ ...base, goals: { bodyType: 'athletic', proteinTarget: 140, calorieMode: 'auto', targetWeightKg: plan.goal.targetWeightKg, weeklyPaceKg: plan.goal.weeklyPaceKg } });
  assert.notEqual(pinned.protein, plan.macros.protein, 'sanity: a pin of 140 differs from the plan');
  const auto = homeView({ ...base, goals: { bodyType: 'athletic', proteinTarget: null, calorieMode: 'auto', targetWeightKg: plan.goal.targetWeightKg, weeklyPaceKg: plan.goal.weeklyPaceKg } });
  assert.equal(auto.protein, plan.macros.protein);
});

test('body types change protein and fat as documented', () => {
  const m = (t) => macroTargets(2000, 80, 'maintain', null, t);
  assert.equal(m('balanced').protein, 128);  // 1.6 g/kg
  assert.equal(m('lean').protein, 144);      // 1.8 g/kg
  assert.equal(m('athletic').protein, 160);  // 2.0 g/kg
  assert.equal(m('muscular').protein, 175);  // 2.2 g/kg = 176, capped at 35% of 2000 kcal (175)
});
