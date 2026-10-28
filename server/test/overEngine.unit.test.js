const test = require('node:test');
const assert = require('node:assert/strict');
const { analyseOverDays, walkKcal, RULES } = require('../lib/overEngine');
const { intakeAdvice, targetForDate } = require('../lib/intakeAdvice');
const { addDays } = require('../lib/dates');

// Male, 80 kg, light activity, losing 0.5 kg/week: daily target 1860 kcal, floor 1500 (same fixture as the phone app's overEngine tests).
const profile = { age: 30, sex: 'male', heightCm: 175, currentWeightKg: 80, activityLevel: 'light', goals: { targetWeightKg: 72, weeklyPaceKg: 0.5 } };
const TARGET = 1860; const TODAY = '2026-10-28';
const week = (kcal, burned = []) => kcal.map((calories, i) => ({ date: addDays(TODAY, i - 6), calories, caloriesBurned: burned[i] || 0 }));
const run = (kcal, o = {}) => analyseOverDays({ profile, days: week(kcal, o.burned), today: TODAY, hour: 22, ...o });

test('nothing to say when on budget, and small overshoots are noise', () => {
  assert.equal(run([1860, 1800, 1900, 1860, 1850, 1860, 1870]).level, 'none');
  assert.equal(run([1860, 1860, 1860, 1860, 1860, 1860, 1990]).level, 'none'); // +130 is inside the 8 % line (149)
});
test('one heavy day: SMALL spread trim, a share not all, tomorrow is lighter, today (already over) is untouched', () => {
  const r = run([1860, 1860, 1860, 1860, 1860, 1860, 2600]);
  assert.equal(r.tier, 'single'); assert.equal(r.skipCut, false);
  assert.ok(r.perDay <= 220); assert.ok(r.ledger.recovered < r.ledger.unpaid);
  assert.equal(r.tomorrowTarget, TARGET - r.perDay); assert.equal(r.todayTarget, TARGET);
  assert.equal(r.startDate, '2026-10-29');
});
test('lighter days earlier in the week bank credit: no cut when the week is still under budget', () => {
  const r = run([1500, 1500, 1500, 1500, 1600, 1500, 2500]);
  assert.equal(r.skipCut, true); assert.equal(r.ledger.unpaid, 0); assert.equal(r.adjusted.length, 0);
});
test('credit from very light days is capped, so under-logging cannot hide a real surplus', () => {
  const r = run([700, 700, 700, 700, 700, 700, 3500]);
  assert.ok(r.ledger.weekNet > 3500 - TARGET - Math.round(RULES.creditCap * TARGET) * 6 - 1);
});
test('unlogged days are unknown, not zero-calorie days', () => {
  const r = run([0, 0, 0, 0, 1860, 1860, 2500]);
  assert.equal(r.ledger.unloggedDays, 4); assert.equal(r.ledger.loggedDays, 3); assert.equal(r.ledger.confidence, 'low');
  assert.equal(r.ledger.weekNet, 640); assert.match(r.detail, /no food logged/);
});
test('restrict -> overeat: no second cut, eat regular meals', () => {
  const r = run([1860, 1860, 1860, 1860, 1860, 1000, 2900]);
  assert.equal(r.cause, 'undereating_cycle'); assert.equal(r.skipCut, true); assert.match(r.headline, /regular meals/);
});
test('several heavy days: capped, never under the floor, honest leftover and delay', () => {
  const r = run([1860, 1860, 1860, 1860, 3000, 3200, 3100]);
  assert.equal(r.runDays, 3); assert.ok(['streak', 'week'].includes(r.tier));
  assert.ok(r.perDay <= 250 && r.days <= 5);
  r.adjusted.forEach((a) => assert.ok(a.target >= 1500));
  assert.ok(r.ledger.leftover > 0 && r.ledger.delayDays > 0);
});
test('a whole week over is a review and suggests an easier pace on an aggressive plan', () => {
  const r = run([2900, 2800, 3000, 2800, 3200, 3000, 3300]);
  assert.equal(r.tier, 'week'); assert.equal(r.needsEasierPace, true); assert.equal(r.cause, 'pace_too_aggressive');
});
test('weight NOT rising after a heavy week: the numbers are probably off, so no cut', () => {
  const r = run([1860, 1860, 1860, 2800, 2900, 3000, 3100], { weightTrendPerWeek: -0.1 });
  assert.equal(r.skipCut, true); assert.equal(r.cause, 'target_or_log');
  assert.equal(run([1860, 1860, 1860, 2800, 2900, 3000, 3100], { weightTrendPerWeek: 0.3 }).skipCut, false);
});
test('target already at the safe minimum: never trims', () => {
  const low = { ...profile, sex: 'female', heightCm: 150, currentWeightKg: 50, age: 45, activityLevel: 'sedentary', goals: { targetWeightKg: 45, weeklyPaceKg: 1 } };
  const r = analyseOverDays({ profile: low, days: week([1400, 1400, 1400, 1400, 1400, 1400, 2600]), today: TODAY, hour: 22 });
  assert.equal(r.skipCut, true); assert.equal(r.adjusted.length, 0);
});
test('gain goal never gets a cut', () => {
  const gain = { ...profile, goals: { targetWeightKg: 90, weeklyPaceKg: 0.3 } };
  assert.equal(analyseOverDays({ profile: gain, days: week([2600, 2600, 2600, 2600, 2600, 2600, 3600]), today: TODAY, hour: 22 }).level, 'none');
});
test('a workout day earns extra food (judged against its own budget)', () => {
  assert.equal(run([1860, 1860, 1860, 1860, 1860, 1860, 2400], { burned: [0, 0, 0, 0, 0, 0, 900] }).level, 'none');
});
test('today still open and under budget: plans around yesterday, can start the trim today', () => {
  const r = analyseOverDays({ profile, days: week([1860, 1860, 1860, 1860, 1860, 3000, 400]), today: TODAY, hour: 12 });
  assert.ok(r.todayTarget < TARGET); assert.equal(r.adjusted[0].date, TODAY);
});
test('trim starts tomorrow once today has eaten through the trimmed amount', () => {
  const r = analyseOverDays({ profile, days: week([1860, 1860, 1860, 1860, 1860, 3000, 1800]), today: TODAY, hour: 19 });
  assert.equal(r.adjusted[0].date, '2026-10-29');
});
test('works with no profile (target only) and across a month boundary', () => {
  const r = intakeAdvice({ days: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((date, i) => ({ date, calories: i === 6 ? 2700 : 1800 })), target: 1800, floor: 1200, today: '2026-11-05' });
  assert.notEqual(r.level, 'none'); assert.equal(r.startDate, '2026-11-06');
  assert.equal(targetForDate(r, r.startDate, 1800), 1800 - r.perDay);
});
test('walkKcal scales with weight', () => { assert.equal(walkKcal(80), 75); assert.ok(walkKcal(55) < walkKcal(80)); assert.ok(walkKcal(null) > 0); });
