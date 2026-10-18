const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeHabits, buildAutoPlan } = require('../lib/autoPlan');
const { macroRanges, limitTargets } = require('../lib/energy');

const F = (id, name, kcal, p, c, fat, size = 100, unit = 'g', extra = {}) => ({ _id: id, name, calories: kcal, protein: p, carbohydrates: c, fat, fiber: extra.fiber || 2, sugar: extra.sugar || 1, sodium: extra.sodium || 100, servingSize: size, servingUnit: unit });
const foods = [
  F('a1', 'Oats with milk', 220, 9, 34, 6, 200), F('a2', 'Boiled egg', 78, 6, 1, 5, 50), F('a3', 'Idli', 60, 2, 12, 0.4, 40),
  F('l1', 'Roti', 100, 3, 18, 2, 40), F('l2', 'Dal tadka', 150, 8, 18, 5, 150), F('l3', 'Paneer bhurji', 230, 14, 5, 17, 100), F('l4', 'Mixed veg sabzi', 90, 3, 10, 4, 100),
  F('d1', 'Rice', 130, 2.5, 28, 0.3, 100), F('d2', 'Chicken curry', 220, 24, 6, 11, 150), F('d3', 'Curd', 60, 3.5, 5, 3, 100),
  F('s1', 'Roasted chana', 120, 7, 18, 2, 30), F('s2', 'Gulab jamun', 150, 2, 22, 6, 50, 'g', { sugar: 18 }),
];
const byId = new Map(foods.map((f) => [f._id, f]));
const log = (date, mealType, id, qty) => { const f = byId.get(id); const s = qty / f.servingSize; return { foodId: id, foodName: f.name, mealType, date, consumedQuantity: qty, servingUnit: f.servingUnit, nutritionTotal: { calories: f.calories * s, protein: f.protein * s, sugar: f.sugar * s } }; };
const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const logs = [];
days.forEach((d, i) => {
  logs.push(log(d, 'breakfast', i % 2 ? 'a1' : 'a2', i % 2 ? 200 : 100));
  logs.push(log(d, 'breakfast', 'a3', 80));
  logs.push(log(d, 'lunch', 'l1', 80)); logs.push(log(d, 'lunch', 'l2', 150)); if (i % 3 === 0) logs.push(log(d, 'lunch', 'l3', 100)); logs.push(log(d, 'lunch', 'l4', 100));
  logs.push(log(d, 'dinner', 'd1', 100)); logs.push(log(d, 'dinner', i % 2 ? 'd2' : 'l3', i % 2 ? 150 : 100)); logs.push(log(d, 'dinner', 'd3', 100));
  logs.push(log(d, 'snacks', 's1', 30)); if (i === 5) logs.push(log(d, 'snacks', 's2', 50));
});

test('analyzeHabits finds usual portions, weekly frequency and caps', () => {
  const h = analyzeHabits(logs, '2026-10-15');
  const idli = h.byMeal.breakfast.find((x) => x.name === 'Idli');
  assert.equal(idli.usualQty, 80); assert.equal(idli.perWeek, 7); assert.ok(idli.weeklyCap >= 7);
  const sweet = h.byMeal.snacks.find((x) => x.name === 'Gulab jamun');
  assert.ok(sweet.indulgent); assert.ok(sweet.weeklyCap <= 2, 'sweets stay capped');
});

test('auto plan only uses foods from history, honours weekly caps, and fits the day', () => {
  const habits = analyzeHabits(logs, '2026-10-15');
  const target = 1800;
  const ranges = macroRanges(target, 70, 'lose');
  const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${16 + i}`);
  const plan = buildAutoPlan({ habits, foods: byId, dates, target, floor: 1200, ranges, limits: limitTargets(target) });
  assert.ok(plan.items.length > 0);
  for (const it of plan.items) assert.ok(habits.byFood.has(it.foodId), `${it.foodName} must come from history`);
  const counts = {}; for (const it of plan.items) counts[it.foodId] = (counts[it.foodId] || 0) + 1;
  for (const [id, c] of Object.entries(counts)) assert.ok(c <= Math.max(7, habits.byFood.get(id).weeklyCap) + 1, `${id} used ${c}x`);
  const sweets = plan.items.filter((i) => i.foodId === 's2').length; assert.ok(sweets <= 2);
  for (const d of plan.days) {
    assert.ok(d.totals.calories <= target * 1.1, `day ${d.date} kcal ${d.totals.calories}`);
    assert.ok(d.totals.calories >= 1000, `day ${d.date} too low ${d.totals.calories}`);
  }
  for (const it of plan.items) { const h = habits.byFood.get(it.foodId); assert.ok(it.quantity <= h.maxQty * 1.1 + 1, `${it.foodName} qty ${it.quantity} above biggest ever ${h.maxQty}`); }
});

test('occupied meals are left alone and their calories count toward the day', () => {
  const habits = analyzeHabits(logs, '2026-10-15');
  const ranges = macroRanges(1800, 70, 'lose');
  const plan = buildAutoPlan({ habits, foods: byId, dates: ['2026-10-16'], target: 1800, floor: 1200, ranges, limits: limitTargets(1800), occupied: { '2026-10-16|lunch': true }, dayBase: { '2026-10-16': { calories: 700, protein: 30 } } });
  assert.ok(!plan.items.some((i) => i.mealType === 'lunch'));
  assert.ok(plan.days[0].totals.calories <= 1800 * 1.1);
});
