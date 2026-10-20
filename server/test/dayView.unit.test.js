const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOGUE } = require('../lib/foodCatalogue');
const { buildPool, buildSmartPlan } = require('../lib/smartPlan');
const { analyzeHabits } = require('../lib/autoPlan');
const { macroRanges, limitTargets, dayBalance } = require('../lib/energy');
const D = require('../lib/dayView');

const TODAY = '2026-10-20';
const ranges = macroRanges(1800, 78, 'lose');
const cat = CATALOGUE.map((f, i) => ({ ...f, _id: `f${i}`, sodium: 100 }));
const habits = analyzeHabits([], TODAY);
const pool = buildPool({ foods: new Map(), catalogue: cat, habits, diet: 'v' });

const log = (id, mealType, foodName, kcal, protein = 0, fiber = 0, extra = {}) => ({
  _id: id, date: TODAY, mealType, foodId: extra.foodId || `lf-${id}`, foodName, consumedQuantity: 100, servingUnit: 'g',
  nutritionTotal: { calories: kcal, protein, fiber, carbohydrates: extra.carbs || 0, fat: extra.fat || 0 },
});
const plan = (id, mealType, foodName, kcal, protein = 0, fiber = 0, extra = {}) => ({
  _id: id, date: extra.date || TODAY, mealType, foodId: extra.foodId || `pf-${id}`, foodName, quantity: 1, servingUnit: 'bowl',
  calories: kcal, protein, fiber, carbohydrates: 0, fat: 0, logged: !!extra.logged, logId: extra.logId || null, auto: true,
});

// ------------------------------------------------------------------------------------------------ 1. merge
test('merge: logged and planned foods of a meal come together, logged first, with their own labels and numbers', () => {
  const day = D.mergeDay({
    date: TODAY, today: TODAY,
    logs: [log('l1', 'breakfast', 'Poha', 300, 8, 3), log('l2', 'lunch', 'Dal tadka', 180, 9, 4)],
    plans: [plan('p1', 'lunch', 'Roti', 120, 4, 2), plan('p2', 'dinner', 'Paneer bhurji', 260, 18, 2)],
  });
  const lunch = day.meals.lunch.items;
  assert.deepEqual(lunch.map((i) => [i.foodName, i.status]), [['Dal tadka', 'logged'], ['Roti', 'planned']]);
  assert.deepEqual([day.meals.lunch.logged.calories, day.meals.lunch.planned.calories, day.meals.lunch.total.calories], [180, 120, 300]);
  assert.equal(day.meals.dinner.items[0].status, 'planned');
  assert.equal(day.meals.dinner.items[0].protein, 18);
  assert.equal(day.logged.calories, 480);
  assert.equal(day.planned.calories, 380);
  assert.equal(day.total.calories, 860);
  assert.equal(day.kind, 'today');
  assert.equal(day.readOnly, false);
});

test('merge: past days show logged history only and are read-only; future days show plans', () => {
  const past = D.mergeDay({ date: '2026-10-18', today: TODAY, logs: [{ ...log('l1', 'lunch', 'Dal', 200, 10), date: '2026-10-18' }], plans: [plan('p1', 'dinner', 'Old plan', 300, 10, 0, { date: '2026-10-18' })] });
  assert.equal(past.readOnly, true);
  assert.equal(past.kind, 'past');
  assert.deepEqual(past.meals.lunch.items.map((i) => i.status), ['logged']);
  assert.equal(past.meals.dinner.items.length, 0, 'a plan that was never eaten is not history');
  assert.equal(past.total.calories, 200);

  const future = D.mergeDay({ date: '2026-10-22', today: TODAY, logs: [], plans: [plan('p1', 'dinner', 'Khichdi', 350, 12, 5, { date: '2026-10-22' })] });
  assert.equal(future.kind, 'future');
  assert.equal(future.meals.dinner.items[0].status, 'planned');
  assert.equal(future.planned.calories, 350);
});

// ------------------------------------------------------------------------------------------------ 2. budget maths
test('budget: eaten matches Home (target + activity bonus), planned never changes eaten, remaining = budget - eaten', () => {
  const profile = { sex: 'female', age: 32, heightCm: 162, currentWeightKg: 78, activityLevel: 'light', goals: { calorieMode: 'manual', calorieTarget: 1800 } };
  const home = dayBalance(profile, { eaten: 700, workout: 0, steps: 0 });
  const b = D.dayBudget({ budget: home.budget, logged: { calories: 700 }, planned: { calories: 500 } });
  assert.equal(b.eaten, home.eaten);
  assert.equal(b.remaining, home.remaining, 'same "left" as Home');
  assert.equal(b.planned, 500);
  assert.equal(b.remainingAfterPlan, home.remaining - 500);
});

test('budget: activity bonus raises the budget the same way Home does, a lighter day lowers it, never below zero', () => {
  const profile = { sex: 'male', age: 30, heightCm: 175, currentWeightKg: 80, activityLevel: 'light', goals: { calorieMode: 'manual', calorieTarget: 2000 } };
  const active = dayBalance(profile, { eaten: 0, workout: 900, steps: 0 });
  assert.ok(active.bonus > 0);
  const b = D.dayBudget({ budget: active.budget, trim: 200, logged: { calories: 1000 }, planned: { calories: 0 } });
  assert.equal(b.homeBudget, active.budget);
  assert.equal(b.budget, active.budget - 200);
  assert.equal(b.remaining, active.budget - 200 - 1000);
  const over = D.dayBudget({ budget: 1500, logged: { calories: 1700 }, planned: { calories: 100 } });
  assert.equal(over.remaining, -200);
  assert.equal(over.remainingAfterPlan, -300);
  assert.equal(D.dayBudget({ budget: 100, trim: 500, logged: { calories: 0 }, planned: { calories: 0 } }).budget, 0);
});

test('planning around logged food: the plan only fills what is left (target - logged) in meals that are not logged yet', () => {
  const dates = [TODAY];
  const loggedLunch = { calories: 650, protein: 30, carbohydrates: 80, fat: 18, fiber: 8, sugar: 4, sodium: 500 };
  const out = buildSmartPlan({
    habits, foods: new Map(), catalogue: cat, dates, target: 1800, targets: { [TODAY]: 1800 }, floor: 1200, ranges, limits: limitTargets(1800), diet: 'v',
    occupied: { [`${TODAY}|lunch`]: true }, dayBase: { [TODAY]: loggedLunch },
  });
  assert.ok(!out.items.some((i) => i.mealType === 'lunch'), 'the logged lunch is left alone');
  const planned = out.items.reduce((s, i) => s + i.calories, 0);
  assert.ok(planned <= 1800 - 650 + 120, `planned ${planned} must fit the ${1800 - 650} kcal that are left`);
  assert.ok(out.days[0].totals.calories >= 650 + planned - 5, 'the day total counts the logged lunch exactly once');
  assert.ok(out.items.every((i) => ['breakfast', 'dinner', 'snacks'].includes(i.mealType)));
});

test('planning: a day that is already full gets no new meals', () => {
  const out = buildSmartPlan({
    habits, foods: new Map(), catalogue: cat, dates: [TODAY], target: 1800, targets: { [TODAY]: 1800 }, floor: 1200, ranges, limits: limitTargets(1800), diet: 'v',
    occupied: { [`${TODAY}|breakfast`]: true, [`${TODAY}|lunch`]: true }, dayBase: { [TODAY]: { calories: 1790, protein: 90, carbohydrates: 200, fat: 60, fiber: 25, sugar: 10, sodium: 800 } },
  });
  assert.equal(out.items.filter((i) => i.calories > 120).length, 0, 'no big meal is planned on top of a full day');
});

// ------------------------------------------------------------------------------------------------ 3. add-ons fill real gaps only
const proteinPoorLunch = [
  { foodName: 'Roti / Chapati', status: 'logged', calories: 240, protein: 7, fiber: 4 },
  { foodName: 'Mixed veg sabzi', status: 'logged', calories: 120, protein: 3, fiber: 5 },
];

test('add-ons: a lunch that is short on protein gets add-ons that supply protein, with a readable line', () => {
  const r = D.addOnsFor({ mealType: 'lunch', items: proteinPoorLunch, ranges, remainingKcal: 900, pool });
  assert.ok(r.gaps.protein >= 8, `protein gap ${r.gaps.protein}`);
  assert.ok(r.suggestions.length >= 1 && r.suggestions.length <= 3);
  for (const s of r.suggestions) {
    assert.equal(s.gap, 'protein');
    assert.ok(s.protein >= 5, `${s.name} only has ${s.protein} g protein`);
    assert.ok((s.protein * 100) / s.calories >= 6, `${s.name} is not a dense protein top-up`);
    assert.ok(s.calories <= 900);
  }
  assert.match(r.text, /^add .+ for protein$/);
});

test('add-ons: nothing is suggested when the meal already has protein, fibre and vegetables', () => {
  const balanced = [
    { foodName: 'Dal tadka', calories: 240, protein: 22, fiber: 8 },
    { foodName: 'Roti / Chapati', calories: 200, protein: 6, fiber: 4 },
    { foodName: 'Bhindi sabzi', calories: 110, protein: 3, fiber: 5 },
  ];
  const r = D.addOnsFor({ mealType: 'lunch', items: balanced, ranges, remainingKcal: 900, pool });
  assert.equal(r.gaps.any, false);
  assert.deepEqual(r.suggestions, []);
  assert.deepEqual(r.more, []);
  assert.equal(r.text, '');
});

test('add-ons: nothing is suggested when the day has no calories left, or the meal is empty', () => {
  assert.equal(D.addOnsFor({ mealType: 'lunch', items: proteinPoorLunch, ranges, remainingKcal: 30, pool }).suggestions.length, 0);
  assert.equal(D.addOnsFor({ mealType: 'dinner', items: [], ranges, remainingKcal: 900, pool }).suggestions.length, 0, 'an empty meal is the planner\'s job, not an add-on');
});

test('add-ons: never repeat a food already in the meal, never exceed the calories left, no treats', () => {
  const have = [...proteinPoorLunch, { foodName: 'Paneer (cooked)', calories: 200, protein: 3, fiber: 0 }];
  const r = D.addOnsFor({ mealType: 'lunch', items: have, ranges, remainingKcal: 140, pool, more: 8 });
  for (const s of [...r.suggestions, ...r.more]) {
    assert.ok(s.calories <= 140, `${s.name} ${s.calories} kcal over the 140 left`);
    assert.ok(!/paneer \(cooked\)/i.test(s.name));
  }
});

test('add-ons: a lunch with no vegetables gets a vegetable add-on even when protein is fine', () => {
  const noVeg = [{ foodName: 'Dal tadka', calories: 240, protein: 24, fiber: 6 }, { foodName: 'Rice', calories: 260, protein: 5, fiber: 2 }];
  const r = D.addOnsFor({ mealType: 'lunch', items: noVeg, ranges, remainingKcal: 800, pool });
  assert.equal(r.gaps.veg, true);
  assert.ok(r.suggestions.length > 0);
  assert.ok(r.suggestions.some((s) => s.gap === 'veg'));
});

test('add-ons: at most 3 suggestions, the rest go to "show more"', () => {
  const r = D.addOnsFor({ mealType: 'dinner', items: [{ foodName: 'Rice', calories: 260, protein: 5, fiber: 2 }], ranges, remainingKcal: 900, pool, more: 5 });
  assert.ok(r.suggestions.length <= 3);
  assert.ok(r.more.length <= 5);
  const names = new Set(r.suggestions.map((s) => s.key));
  assert.ok(r.more.every((m) => !names.has(m.key)), 'show-more never repeats the first three');
});

// ------------------------------------------------------------------------------------------------ 4. no double counting
test('no double counting: a planned item that was logged through "Log" is counted once, as logged', () => {
  const plans = [plan('p1', 'lunch', 'Dal tadka', 180, 9, 4, { foodId: 'F1', logged: true, logId: 'l1' }), plan('p2', 'lunch', 'Roti', 120, 4, 2, { foodId: 'F2' })];
  const logs = [log('l1', 'lunch', 'Dal tadka', 180, 9, 4, { foodId: 'F1' })];
  const day = D.mergeDay({ date: TODAY, today: TODAY, logs, plans });
  assert.equal(day.logged.calories, 180);
  assert.equal(day.planned.calories, 120, 'only the roti is still planned');
  assert.equal(day.total.calories, 300);
  const dal = day.meals.lunch.items.find((i) => i.foodName === 'Dal tadka');
  assert.equal(dal.status, 'logged');
  assert.equal(dal.fromPlan, true);
  assert.equal(dal.planId, 'p1');
  assert.equal(day.meals.lunch.items.filter((i) => i.foodName === 'Dal tadka').length, 1);
});

test('no double counting: a food logged directly (not through the plan) marks the matching planned item done', () => {
  const plans = [plan('p1', 'dinner', 'Khichdi', 350, 12, 5, { foodId: 'K1' })];
  const logs = [log('l9', 'dinner', 'Khichdi', 340, 11, 5, { foodId: 'K1' })];
  const rec = D.reconcile(plans, logs);
  assert.equal(rec.pending.length, 0);
  assert.equal(rec.paired.get('p1'), 'l9');
  const day = D.mergeDay({ date: TODAY, today: TODAY, logs, plans });
  assert.equal(day.total.calories, 340, 'the log counts, the plan does not');
  assert.equal(day.planned.calories, 0);
});

test('no double counting: one log can only satisfy one planned item', () => {
  const plans = [plan('p1', 'snacks', 'Apple', 80, 0, 4, { foodId: 'A' }), plan('p2', 'snacks', 'Apple', 80, 0, 4, { foodId: 'A' })];
  const logs = [log('l1', 'snacks', 'Apple', 80, 0, 4, { foodId: 'A' })];
  const rec = D.reconcile(plans, logs);
  assert.equal(rec.pending.length, 1);
  assert.equal(D.mergeDay({ date: TODAY, today: TODAY, logs, plans }).total.calories, 160);
});

test('no double counting: a plan row marked eaten with no log id is hidden, the log is the truth', () => {
  const plans = [plan('p1', 'lunch', 'Dal', 180, 9, 4, { foodId: 'F1', logged: true })];
  const logs = [log('l1', 'lunch', 'Dal', 180, 9, 4, { foodId: 'F1' })];
  const day = D.mergeDay({ date: TODAY, today: TODAY, logs, plans });
  assert.equal(day.total.calories, 180);
  assert.equal(day.meals.lunch.items.length, 1);
});

test('no double counting: logging every planned item turns the day into logged-only with the same total', () => {
  const plans = [plan('p1', 'breakfast', 'Poha', 300, 8, 3, { foodId: 'P' }), plan('p2', 'lunch', 'Dal', 180, 9, 4, { foodId: 'D' })];
  const before = D.mergeDay({ date: TODAY, today: TODAY, logs: [], plans });
  assert.equal(before.total.calories, 480);
  // what the server does on "Log day": one log per item, each plan row gets logged + logId
  const logs = [log('l1', 'breakfast', 'Poha', 300, 8, 3, { foodId: 'P' }), log('l2', 'lunch', 'Dal', 180, 9, 4, { foodId: 'D' })];
  const after = D.mergeDay({ date: TODAY, today: TODAY, logs, plans: [{ ...plans[0], logged: true, logId: 'l1' }, { ...plans[1], logged: true, logId: 'l2' }] });
  assert.equal(after.total.calories, 480);
  assert.equal(after.logged.calories, 480);
  assert.equal(after.planned.calories, 0);
  assert.ok(after.meals.breakfast.items.every((i) => i.status === 'logged'));
});

// ------------------------------------------------------------------------------------------------ the whole response
test('buildDayViews: one response with the day bar, merged items, suggestions only under meals with food, and chef hints', () => {
  const logs = [log('l1', 'lunch', 'Roti / Chapati', 240, 7, 4, { foodId: 'R' }), log('l2', 'lunch', 'Mixed veg sabzi', 120, 3, 5, { foodId: 'V' })];
  const [day] = D.buildDayViews({ dates: [TODAY], today: TODAY, logs, plans: [], budgets: { [TODAY]: 1800 }, trims: {}, ranges, catalogue: cat, habits, diet: 'v' });
  assert.equal(day.budget.eaten, 360);
  assert.equal(day.budget.remaining, 1440);
  assert.equal(day.meals.lunch.hint.kind, 'partial');
  assert.ok(day.meals.lunch.suggestions.length > 0 && day.meals.lunch.suggestions.length <= 3);
  assert.ok(day.meals.lunch.suggestions.every((s) => s.status === 'suggested'));
  assert.equal(day.meals.dinner.suggestions.length, 0, 'an empty meal gets no add-ons');
  assert.equal(day.meals.dinner.hint.kind, 'open');
  assert.ok(day.meals.dinner.hint.kcal > 0 && day.meals.dinner.hint.protein > 0);
});

test('buildDayViews: past days have no suggestions and no hints', () => {
  const [day] = D.buildDayViews({ dates: ['2026-10-18'], today: TODAY, logs: [{ ...log('l1', 'lunch', 'Roti', 240, 7, 4), date: '2026-10-18' }], plans: [], budgets: { '2026-10-18': 1800 }, ranges, catalogue: cat, habits });
  assert.equal(day.readOnly, true);
  assert.deepEqual(day.meals.lunch.suggestions, []);
  assert.equal(day.meals.lunch.hint, null);
});

test('chef hint: an open dinner says how many kcal and how much protein are still free for it', () => {
  const [day] = D.buildDayViews({ dates: [TODAY], today: TODAY, logs: [log('l1', 'breakfast', 'Poha', 300, 8, 3), log('l2', 'lunch', 'Dal tadka', 600, 30, 9)], plans: [], budgets: { [TODAY]: 1800 }, ranges, catalogue: cat, habits });
  const h = day.meals.dinner.hint;
  assert.equal(h.kind, 'open');
  assert.equal(h.mealType, 'dinner');
  assert.ok(h.kcal > 300 && h.kcal <= 900, `dinner kcal ${h.kcal}`);
});

test('fixedSummary: logged meals are reported as fixed and only partly-logged meals with a real gap get add-ons', () => {
  const logs = [log('l1', 'lunch', 'Roti / Chapati', 240, 7, 4, { foodId: 'R' }), log('l2', 'lunch', 'Mixed veg sabzi', 120, 3, 5, { foodId: 'V' }),
    log('l3', 'breakfast', 'Dal tadka', 240, 24, 8, { foodId: 'D' }), log('l4', 'breakfast', 'Roti', 200, 8, 6, { foodId: 'R2' }), log('l5', 'breakfast', 'Bhindi sabzi', 120, 3, 5, { foodId: 'B' })];
  const out = D.fixedSummary({ dates: [TODAY], logs, plans: [], budgets: { [TODAY]: 1800 }, ranges, pool });
  assert.deepEqual(out.fixed[0].loggedMeals, ['breakfast', 'lunch']);
  assert.equal(out.fixed[0].eaten, 920);
  assert.equal(out.fixed[0].remaining, 880);
  assert.ok(out.addOns.some((a) => a.mealType === 'lunch'));
  assert.ok(!out.addOns.some((a) => a.mealType === 'dinner'), 'dinner is not logged, so it gets a plan, not an add-on');
});

// ------------------------------------------------------------------------------------------------ "Fix my day" / gentle day
const { rescueDay } = require('../lib/mealBuilder');
test('gentle day: meals that are already logged are left alone and the budget is what is left after them', () => {
  const foods = cat;
  const fresh = rescueDay({ foods, target: 1800, floor: 1200, ranges, trim: 200 });
  const around = rescueDay({ foods, target: 1800, floor: 1200, ranges, trim: 200, eaten: { calories: 600, protein: 25 }, fixedMeals: ['breakfast'] });
  assert.ok(!around.plan.some((p) => p.mealType === 'breakfast'), 'the logged breakfast is not planned again');
  assert.equal(around.remaining, fresh.goal - 600);
  assert.ok(around.totalCalories <= around.remaining + 60, `planned ${around.totalCalories} vs ${around.remaining} left`);
  assert.deepEqual(around.fixedMeals, ['breakfast']);
});
