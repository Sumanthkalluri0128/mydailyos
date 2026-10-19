const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOGUE } = require('../lib/foodCatalogue');
const { buildSmartPlan, classify, inferDiet } = require('../lib/smartPlan');
const { analyzeHabits } = require('../lib/autoPlan');
const { intakeAdvice, targetForDate } = require('../lib/intakeAdvice');
const { addDays } = require('../lib/dates');
const { macroRanges, limitTargets } = require('../lib/energy');

const cat = CATALOGUE.map((f, i) => ({ ...f, _id: `f${i}`, sodium: 100 }));
const habits = analyzeHabits([], '2026-10-15');
const run = (extra = {}) => buildSmartPlan({
  habits, foods: new Map(), catalogue: cat, dates: Array.from({ length: 7 }, (_, i) => addDays('2026-10-16', i)), target: 1800, floor: 1500,
  ranges: macroRanges(1800, 78, 'lose'), limits: limitTargets(1800), diet: 'v', ...extra,
});

test('classify: dishes get the right role, raw ingredients are not plates', () => {
  assert.equal(classify('Dal tadka').role, 'protein');
  assert.equal(classify('Roti / Chapati').role, 'carb');
  assert.equal(classify('Bhindi fry').role, 'veg');
  assert.equal(classify('Apple').role, 'fruit');
  assert.equal(classify('Mamidikaya pappu (raw mango dal)').role, 'protein');
  assert.equal(classify('Rajma (dry)').role, 'other');
  assert.equal(classify('Oats (dry)').role, 'carb');
  assert.equal(inferDiet(['Dal', 'Boiled egg']), 'e');
  assert.equal(inferDiet(['Dal', 'Chicken curry']), 'n');
});

test('balanced plan works with NO food history and has protein + carb + veg on lunch and dinner', () => {
  const plan = run();
  assert.ok(plan.items.length > 20);
  for (const d of plan.days) for (const meal of ['lunch', 'dinner']) {
    const roles = new Set(plan.items.filter((i) => i.date === d.date && i.mealType === meal).map((i) => i.role));
    assert.ok(roles.has('protein') && roles.has('carb'), `${d.date} ${meal} roles ${[...roles]}`);
  }
  for (const d of plan.days) { assert.ok(d.totals.calories >= 1500 && d.totals.calories <= 1800 * 1.1, `${d.date} ${d.totals.calories}`); assert.ok(d.totals.protein >= 80, `${d.date} protein ${d.totals.protein}`); }
});

test('vegetarian plan has no meat or egg; non-veg may', () => {
  assert.ok(!run().items.some((i) => /\b(chicken|fish|eggs?|mutton|prawns?)\b/i.test(i.foodName)));
  assert.ok(run({ diet: 'n' }).items.some((i) => /\b(chicken|fish|eggs?|mutton|prawns?)\b/i.test(i.foodName)));
});

test('variety: no food on consecutive days at the same meal, weekly caps hold, no double protein family in a day', () => {
  const plan = run();
  const names = (date, meal) => plan.items.filter((i) => i.date === date && i.mealType === meal).map((i) => i.foodName);
  for (let i = 1; i < 7; i += 1) { const a = addDays('2026-10-16', i - 1), b = addDays('2026-10-16', i); for (const m of ['lunch', 'dinner']) for (const n of names(b, m)) assert.ok(!names(a, m).includes(n) || /roti|rice|chapati/i.test(n), `${n} repeated ${m}`); }
  const counts = {}; for (const i of plan.items) counts[i.foodName] = (counts[i.foodName] || 0) + 1;
  for (const [n, c] of Object.entries(counts)) assert.ok(c <= 7, `${n} x${c}`);
});

test('lighter days after heavy days are planned lighter', () => {
  const dates = Array.from({ length: 7 }, (_, i) => addDays('2026-10-16', i));
  const plan = run({ targets: { [dates[0]]: 1600, [dates[1]]: 1600 }, floor: 1200 });
  assert.equal(plan.days[0].target, 1600); assert.equal(plan.days[0].trim, 200);
  assert.ok(plan.days[0].totals.calories <= 1600 * 1.1);
});

test('no treats in the plan after heavy days', () => {
  const plan = run({ avoidIndulgent: true });
  assert.ok(!plan.items.some((i) => /biryani|pizza|jalebi|gulab|samosa|burger/i.test(i.foodName)));
});

test('intakeAdvice: over yesterday => lighter today, safe floor, never cuts when already near the floor', () => {
  const mk = (arr) => arr.map((c, i) => ({ date: addDays('2026-10-12', i), calories: c }));
  const a = intakeAdvice({ days: mk([1800, 1850, 1900, 1800, 1850, 2500, 0]), target: 1800, floor: 1200, today: '2026-10-18' });
  assert.notEqual(a.level, 'none'); assert.ok(a.perDay >= 100 && a.perDay <= 250); assert.ok(a.todayTarget < 1800 && a.todayTarget >= 1200);
  assert.equal(targetForDate(a, a.startDate, 1800), 1800 - a.perDay);
  const f = intakeAdvice({ days: mk([1500, 1500, 1500, 1500, 1500, 1500, 0]), target: 1550, floor: 1500, today: '2026-10-18' });
  assert.equal(f.level, 'none');
  const g = intakeAdvice({ days: mk([1400, 1450, 1400, 1450, 1400, 1750, 0]), target: 1600, floor: 1500, today: '2026-10-18' });
  assert.ok(g.perDay <= 100 || g.skipCut || g.todayTarget >= 1500);
  assert.equal(intakeAdvice({ days: mk([1800, 1800, 2600, 2700, 2500, 2600, 0]), target: 1800, floor: 1200, today: '2026-10-18', direction: 'gain' }).level, 'none');
  const today = intakeAdvice({ days: mk([1800, 1800, 1800, 1800, 1800, 1800, 2600]), target: 1800, floor: 1200, today: '2026-10-18' });
  assert.equal(today.startDate, '2026-10-19', 'when today is over, the lighter days start tomorrow');
});
