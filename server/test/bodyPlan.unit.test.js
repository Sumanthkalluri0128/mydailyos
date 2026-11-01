const test = require('node:test');
const assert = require('node:assert/strict');
const { bodyPlan, TYPE_IDS } = require('../lib/bodyPlan');
const { SHAME } = require('../lib/safety');
const E = require('../lib/energy');

const woman = { sex: 'female', age: 30, heightCm: 162, currentWeightKg: 74, activityLevel: 'light', goals: {} };
const man = { sex: 'male', age: 28, heightCm: 178, currentWeightKg: 82, activityLevel: 'moderate', goals: {} };

test('every body goal gives a ready plan with a safe pace and a target above a healthy BMI', () => {
  for (const type of TYPE_IDS) {
    const p = bodyPlan({ profile: woman, type, measures: { waist: 88, neck: 31, hips: 104 } });
    assert.equal(p.ready, true);
    assert.equal(p.mode, 'lose');
    assert.ok(p.goal.weeklyPaceKg <= 0.01 * woman.currentWeightKg + 1e-9, 'pace within 1% of body weight a week');
    assert.ok(p.goal.targetWeightKg / ((woman.heightCm / 100) ** 2) >= 18.5);
    assert.ok(p.calories >= 1200);
    assert.equal(p.bodyFatSource, undefined);
    assert.equal(p.body.bodyFatSource, 'tape');
  }
});

test('muscular is slower and eats more than lean; protein follows the body goal', () => {
  const lean = bodyPlan({ profile: man, type: 'lean' }), mus = bodyPlan({ profile: man, type: 'muscular' });
  assert.ok(mus.goal.weeklyPaceKg < lean.goal.weeklyPaceKg);
  assert.ok(mus.calories >= lean.calories);
  assert.ok(mus.protein.gPerKg >= lean.protein.gPerKg);
});

test('the macros in the plan are what the rest of the app computes for that body goal', () => {
  const p = bodyPlan({ profile: man, type: 'athletic' });
  const direct = E.macroTargets(p.calories, man.currentWeightKg, 'lose', null, 'athletic');
  assert.deepEqual(p.macros, direct);
  assert.equal(p.macros.protein * 4 + p.macros.carbs * 4 + p.macros.fat * 9 <= p.calories + 12, true);
});

test('no body goal keeps the old macro defaults', () => {
  assert.deepEqual(E.macroTargets(1800, 80, 'lose', null), E.macroTargets(1800, 80, 'lose', null, ''));
  assert.equal(E.macroTargets(1800, 80, 'lose', null).fat, Math.round((1800 * 0.27) / 9));
});

test('adults only, and a missing profile asks for what is missing', () => {
  assert.equal(bodyPlan({ profile: { ...man, age: 16 }, type: 'lean' }).reason, 'adult-only');
  assert.deepEqual(bodyPlan({ profile: {}, type: 'lean' }).missing, ['currentWeightKg', 'heightCm', 'age', 'sex']);
  assert.equal(bodyPlan({ profile: man, type: 'nope' }).ready, false);
});

test('an underweight body never gets a weight-loss target', () => {
  const p = bodyPlan({ profile: { ...man, currentWeightKg: 50 }, type: 'lean' });
  assert.equal(p.mode, 'build');
  assert.equal(p.goal.lossKg, 0);
  assert.ok(p.safety.some((s) => s.id === 'underweight'));
});

test('someone already in range gets a recomposition plan at steady weight', () => {
  const p = bodyPlan({ profile: { ...man, currentWeightKg: 70 }, type: 'balanced' });
  assert.notEqual(p.mode, 'lose');
  assert.equal(p.goal.targetWeightKg, 70);
});

test('iron is a priority for women and not forced on men; wording passes the tone check', () => {
  const f = bodyPlan({ profile: woman, type: 'lean' }), m = bodyPlan({ profile: man, type: 'lean' });
  assert.ok(f.microPriority.some((x) => x.id === 'iron'));
  assert.ok(!m.microPriority.some((x) => x.id === 'iron'));
  const text = JSON.stringify(f);
  assert.equal(SHAME.test(text), false, 'no shaming words in the plan copy');
});
