// The nine fixes from the v69 gap review: shared model, fat floor, pace cap, measured maintenance, logged-day rule, one diet break, fibre, age, water.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/energy');
const { adaptiveMaintenance } = require('../lib/adaptiveTdee');
const { measuredFrom } = require('../lib/measuredMaintenance');
const { startBreak, endBreak } = require('../lib/planState');
const { calorieChange } = require('../lib/weeklyDecision');
const { maxSafeWeeklyLossKg } = require('../lib/trendWeight');
const { addDays } = require('../lib/dates');

const man = { sex: 'male', age: 30, heightCm: 175, currentWeightKg: 80, activityLevel: 'sedentary', goals: { targetWeightKg: 72, weeklyPaceKg: 0.5, bodyType: 'lean' } };

test('1: the shared source exports both the day-budget option and proteinRangeAt (no drift between copies)', () => {
  assert.equal(typeof E.proteinRangeAt, 'function');
  const base = E.resolveTargets(man), big = E.resolveTargets(man, { budget: base.calories + 500 });
  assert.ok(big.macros.carbs > base.macros.carbs); assert.equal(big.macros.protein, base.macros.protein); assert.equal(big.baseMacros.carbs, base.macros.carbs);
  assert.ok(E.proteinRangeAt(man, base.calories + 500).max >= base.ranges.protein.max);
});

test('2: fat is never under 0.6 g/kg, and the range floor follows', () => {
  const T = E.resolveTargets({ ...man, currentWeightKg: 100, goals: { ...man.goals, targetWeightKg: 100, weeklyPaceKg: 0.5 } });
  assert.ok(T.macros.fat >= 60); assert.ok(T.ranges.fat.min >= 60);
  assert.ok(E.macroTargets(1800, 100, 'lose').fat >= 60);
  assert.equal(E.macroTargets(1800, 60, 'lose').fat, Math.round(1800 * 0.27 / 9)); // percentage still wins when it is higher
});

test('3: loss pace is capped at 1 % of body weight a week', () => {
  const e = E.expectedEnergy({ ...man, goals: { ...man.goals, weeklyPaceKg: 1 } });
  assert.equal(e.paceAsked, 1); assert.equal(e.pace, 0.8); assert.equal(e.paceCapped, true);
  assert.equal(e.gap, Math.round((0.8 * 7700) / 7));
  assert.equal(maxSafeWeeklyLossKg(80), 0.8); assert.equal(maxSafeWeeklyLossKg(150), 1);
  assert.equal(E.expectedEnergy(man).paceCapped, false);
  assert.equal(E.resolveTargets({ ...man, goals: { ...man.goals, weeklyPaceKg: 1 } }).paceKgPerWeek, 0.8);
});

test('3b: the weekly coach never proposes a pace above the safe limit', () => {
  const e = E.expectedEnergy(man);
  assert.equal(calorieChange(e, e.calorieTarget, 1500, -(e.tdee - e.calorieTarget) - 400), null); // would be ~1.0 kg/wk
});

test('4: measured maintenance moves maintenance and the target; low confidence and wild ratios do not', () => {
  const plain = E.expectedEnergy(man), hi = E.expectedEnergy({ ...man, measuredTdee: { ratio: 0.9, confidence: 'high' } });
  assert.equal(hi.formulaTdee, plain.tdee); assert.ok(hi.tdee < plain.tdee); assert.ok(Math.abs(hi.tdee - plain.tdee * (1 - 0.6 * 0.1)) <= 1);
  assert.ok(hi.calorieTarget <= plain.calorieTarget);
  assert.equal(E.expectedEnergy({ ...man, measuredTdee: { ratio: 0.9, confidence: 'low' } }).tdee, plain.tdee);
  assert.equal(E.expectedEnergy({ ...man, measuredTdee: { ratio: null, confidence: 'none' } }).tdee, plain.tdee);
  const wild = E.expectedEnergy({ ...man, measuredTdee: { ratio: 3, confidence: 'high' } });
  assert.ok(Math.abs(wild.tdee - plain.tdee * (1 + 0.6 * 0.2)) <= 1); // clamped at +20 %
});

function series(days, f) { const out = []; for (let i = 0; i < days; i += 1) out.push({ date: addDays('2026-10-01', i), ...f(i) }); return out; }

test('5: partly logged days do not drag maintenance down, and one odd weigh-in is ignored', () => {
  const clean = series(35, (i) => ({ calories: 2000, weightKg: i % 2 === 0 ? 80 - i * 0.02 : null }));
  const withHalfDays = clean.map((d, i) => (i % 5 === 0 ? { ...d, calories: 450 } : d)); // skipped meals
  const a = adaptiveMaintenance(clean, 2400, { target: 1900 }), b = adaptiveMaintenance(withHalfDays, 2400, { target: 1900 });
  assert.equal(b.avgIntake, 2000); assert.equal(b.loggedDays, clean.length - 7);
  assert.equal(a.estimate, b.estimate);
  const salty = clean.map((d, i) => (i === 20 ? { ...d, weightKg: 84 } : d));
  const c = adaptiveMaintenance(salty, 2400, { target: 1900 });
  assert.ok(Math.abs(c.estimate - a.estimate) <= 30, `${c.estimate} vs ${a.estimate}`);
});

test('4b: measuredFrom stores a ratio against the pure formula and needs real data', () => {
  assert.equal(measuredFrom(man, series(5, () => ({ calories: 2000, weightKg: 80, weighIn: true })), '2026-11-04'), null);
  const days = series(35, (i) => ({ calories: 1800, weightKg: 80 - i * 0.05, weighIn: i % 2 === 0 }));
  const m = measuredFrom({ ...man, measuredTdee: { ratio: 1.2, confidence: 'high' } }, days, '2026-11-04'); // an old reading must not feed the new one
  const f = E.expectedEnergy(man).tdee;
  assert.ok(m && m.ratio > 0 && Math.abs(m.kcal / f - m.ratio) < 0.01); assert.equal(m.asOf, '2026-11-04');
});

test('6: one diet break mechanism: a window in the coach state, never a changed calorie goal', () => {
  const r = startBreak(man, '2026-11-13');
  assert.deepEqual(r.window, { kind: 'plan-break', from: '2026-11-13', to: '2026-11-19' }); // 7 days by default, like the coach
  assert.deepEqual(r.set, { 'plan.breakUntil': '2026-11-19' });
  assert.ok(!Object.keys(r.set).some((k) => k.startsWith('goals.')));
  assert.equal(startBreak(man, '2026-11-13', 30).until, '2026-11-26'); // at most 14 days
  const legacy = endBreak({ plan: { breakUntil: '2026-11-01', breakPrev: { mode: 'auto', target: null } } }, '2026-11-13');
  assert.equal(legacy['goals.calorieMode'], 'auto'); // a break an older version started is still handed back
  assert.deepEqual(endBreak({ plan: { breakUntil: '2026-11-01' } }, '2026-11-13'), { 'plan.breakUntil': '', 'plan.lastBreakEnd': '2026-11-13' });
});

test('8: fibre has a daily floor (men 30 g, women 25 g) and still scales on big budgets', () => {
  assert.equal(E.macroTargets(1500, 80, 'lose', null, '', { sex: 'male' }).fiber, 30);
  assert.equal(E.macroTargets(1500, 80, 'lose', null, '', { sex: 'female' }).fiber, 25);
  assert.equal(E.macroTargets(3000, 80, 'gain', null, '', { sex: 'male' }).fiber, 42);
  assert.equal(E.resolveTargets(man).macros.fiber, 30);
});

test('10: age advances, water follows workouts, protein is not over-sized for a big gap to goal', () => {
  assert.equal(E.ageNow({ age: 30, ageSetAt: '2024-01-01' }, Date.parse('2026-11-13')), 32);
  assert.equal(E.ageNow({ age: 30 }), 30);
  assert.ok(E.waterTargetMl(70, 60) > E.waterTargetMl(70)); assert.equal(E.waterTargetMl(70), 2450);
  const big = { ...man, currentWeightKg: 110, goals: { ...man.goals, targetWeightKg: 80, weeklyPaceKg: 0.5, bodyType: '' } };
  assert.equal(E.proteinBasisKg(110, 80, 'lose'), 87.5);
  assert.ok(E.resolveTargets(big).macros.protein < Math.round(110 * 1.6) && E.resolveTargets(big).macros.protein >= Math.round(110 * 1.2));
  assert.equal(E.proteinBasisKg(80, 72, 'lose'), 80); // a small gap keeps full body weight
});
