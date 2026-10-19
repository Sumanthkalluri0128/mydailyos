// Database glue for micronutrients (pure maths lives in micronutrients.js).
const FoodLog = require('../models/FoodLog');
const Food = require('../models/Food');
const { KEYS } = require('./rda');
const { dailyCard, dayTotals, weekRow, lowStreaks, suggestFoodsFor } = require('./micronutrients');
const { catalogueFoods } = require('./foodCache');
const { addDays } = require('./dates');

const SELECT = ['name', 'servingSize', 'servingUnit', 'hidden', ...KEYS].join(' ');

async function foodMap(logs) {
  const ids = [...new Set(logs.map((l) => String(l.foodId)))];
  if (!ids.length) return new Map();
  const foods = await Food.find({ _id: { $in: ids } }).select(SELECT).lean();
  return new Map(foods.map((f) => [String(f._id), f]));
}

async function microDay(userId, date, profile) {
  const logs = await FoodLog.find({ userId, date }).select('foodId servings nutritionTotal').lean();
  const card = dailyCard({ logs, foodsById: await foodMap(logs), profile });
  return { date, ...card };
}

/** Low-for-3-weeks insights for the weekly coach, each with suggestions from the person's own foods first. */
async function microInsights(userId, today, profile) {
  const from = addDays(today, -20);
  const logs = await FoodLog.find({ userId, date: { $gte: from, $lte: today } }).select('date foodId servings nutritionTotal').lean();
  if (!logs.length) return [];
  const fm = await foodMap(logs);
  const byDate = new Map();
  for (const l of logs) { if (!byDate.has(l.date)) byDate.set(l.date, []); byDate.get(l.date).push(l); }
  const weeks = [];
  for (let w = 2; w >= 0; w -= 1) { // oldest week first
    const days = [];
    for (let i = 0; i < 7; i += 1) { const d = addDays(today, -(w * 7 + i)); if (byDate.has(d)) days.push(dayTotals(byDate.get(d), fm)); }
    weeks.push(weekRow(days));
  }
  const lows = lowStreaks(weeks, profile, 3).slice(0, 2);
  if (!lows.length) return [];
  const ownIds = [...new Set(logs.map((l) => String(l.foodId)))];
  const own = ownIds.map((id) => fm.get(id)).filter(Boolean);
  const shared = (await catalogueFoods(Food)).filter((f) => !f.hidden);
  return lows.map((n) => ({ ...n, suggestions: suggestFoodsFor(n.key, { ownFoods: own, catalogue: shared }) }));
}

module.exports = { microDay, microInsights };
