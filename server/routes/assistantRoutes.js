// The in-app assistant. It reads the person's own data and answers in plain language (see lib/assistant.js).
// Nothing leaves the server: no outside AI service, nothing paid.
const express = require('express');
const FoodLog = require('../models/FoodLog');
const Food = require('../models/Food');
const Habit = require('../models/Habit');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const { rateLimit } = require('../middleware/rateLimit');
const v = require('../lib/validate');
const { addDays, todayUtc } = require('../lib/dates');
const { loadCore } = require('../lib/planData');
const { loadJourney } = require('../lib/journeyData');
const { smoothTrend, trendRate } = require('../lib/trendWeight');
const { detectPlateau } = require('../lib/plateau');
const { weeksToGoal, limitTargets, dayBalance } = require('../lib/energy');
const { suggestFoods } = require('../lib/suggest');
const { answer, suggestionsFor } = require('../lib/assistant');

const router = express.Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 40, keyFn: (req) => req.user?.id || req.ip, message: 'One question at a time, please. Try again in a moment.' }));

const visible = (uid) => ({ $or: [{ userId: null }, { userId: { $exists: false } }, { userId: uid }] });
const nextMeal = (h) => (h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner');
const sum = (a) => a.reduce((x, y) => x + y, 0);

async function buildSnapshot(uid, today, hour) {
  const core = await loadCore(uid, today, { historyDays: 14 });
  const day = core.days.find((d) => d.date === today) || {};
  const week = core.days.filter((d) => d.date > addDays(today, -7));
  const [journey, logs, habitCount, recentLogs] = await Promise.all([
    loadJourney(uid, today).catch(() => null),
    FoodLog.find({ userId: uid, date: { $gt: addDays(today, -7), $lte: today } }).select('foodName nutritionTotal date').lean(),
    Habit.countDocuments({ userId: uid, isActive: true }),
    FoodLog.find({ userId: uid, date: { $gt: addDays(today, -30), $lte: today } }).select('foodId date').lean(),
  ]);
  const p = core.profile || {};
  const target = core.target || 0;

  // biggest calorie sources this week
  const byName = new Map();
  for (const l of logs) byName.set(l.foodName, (byName.get(l.foodName) || 0) + Number(l.nutritionTotal?.calories || 0));
  const topFoods = [...byName.entries()].map(([name, kcal]) => ({ name, kcal: Math.round(kcal) })).sort((a, b) => b.kcal - a.kcal).slice(0, 4);

  // weekends vs weekdays
  const eatenDays = core.days.filter((d) => d.calories > 0);
  const we = eatenDays.filter((d) => [0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay()));
  const wd = eatenDays.filter((d) => ![0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay()));
  let weekendSkew = '';
  if (we.length >= 2 && wd.length >= 4) {
    const a = sum(we.map((d) => d.calories)) / we.length, b = sum(wd.map((d) => d.calories)) / wd.length;
    if (a > b * 1.15) weekendSkew = `Weekends average ${Math.round(a)} kcal against ${Math.round(b)} on weekdays. That gap can erase a whole week's deficit.`;
  }

  // weight
  const series = core.weights.length ? smoothTrend(core.weights) : [];
  const latest = core.weights.length ? core.weights[core.weights.length - 1].weightKg : p.currentWeightKg || null;
  const g = p.goals || {};
  const rate = series.length >= 3 ? trendRate(series, today) : null;
  const pl = core.weights.length >= 3 ? detectPlateau({ weights: core.weights, profile: p, today, target }) : null;
  const weight = {
    latestKg: latest, trendKg: series.length ? series[series.length - 1].trendKg : null, targetKg: g.targetWeightKg || null, paceKg: g.weeklyPaceKg || null,
    ratePerWeek: Number.isFinite(rate) ? Math.round(rate * 100) / 100 : null,
    etaWeeks: latest && g.targetWeightKg ? weeksToGoal(latest, g.targetWeightKg, Math.abs(rate) > 0.1 ? Math.abs(rate) : g.weeklyPaceKg || 0.5) : null,
    plateau: pl && ['plateau', 'wrong_direction', 'drifting'].includes(pl.status) ? pl.message : '',
  };

  // "what should I eat next": foods from the person's own history that fit what is left
  const workoutKcal = Math.max(0, (day.caloriesBurned || 0) - (day.stepCalories || 0));
  const balance = dayBalance(p, { eaten: day.calories || 0, workout: workoutKcal, steps: day.stepCalories || 0 });
  const remaining = { calories: balance.remaining, protein: (core.ranges?.protein?.goal || 0) - (day.protein || 0), fiber: (core.ranges?.fiber?.goal || 0) - (day.fiber || 0) };
  const ids = [...new Set(recentLogs.map((l) => String(l.foodId)))].slice(0, 300);
  const recentIds = new Set(ids);
  let ideas = [];
  if (ids.length && remaining.calories > 40) {
    const foods = await Food.find({ _id: { $in: ids }, hidden: { $ne: true }, ...visible(uid) }).lean();
    ideas = suggestFoods(foods, remaining, { mealType: nextMeal(hour), recentIds, limit: 3 })
      .map((x) => ({ name: x.food.name, qty: `${x.food.servingSize} ${x.food.servingUnit}`, kcal: Math.round(x.food.calories), protein: Math.round(x.food.protein) }));
  }

  return {
    name: (p.name || '').split(' ')[0] || '', hour, balance: { target: balance.target, budget: balance.budget, bonus: balance.bonus, remaining: balance.remaining }, today: day, week, targets: { ...(journey?.targets || {}), calories: target }, ranges: core.ranges,
    limits: target ? limitTargets(balance.budget || target) : null, journey, streak: journey?.streak || null, weight, topFoods, weekendSkew, ideas, habitCount,
    steps7: week.length ? sum(week.map((d) => d.steps || 0)) / week.length : 0,
  };
}

// POST /api/assistant/ask { question, today?, hour? } -> { text, mood, actions, chips, topic }
router.post('/ask', wrap(async (req, res) => {
  const question = String(req.body?.question ?? '').slice(0, 300);
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();
  const hour = Number.isFinite(Number(req.body?.hour)) ? Math.min(23, Math.max(0, Number(req.body.hour))) : new Date().getUTCHours();
  const snap = await buildSnapshot(req.user.id, today, hour);
  res.json({ success: true, ...answer(question, snap) });
}));

// GET /api/assistant/chips?today=&hour= — starter questions that fit the moment.
router.get('/chips', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const hour = Number.isFinite(Number(req.query.hour)) ? Number(req.query.hour) : 12;
  const snap = await buildSnapshot(req.user.id, today, hour);
  res.json({ success: true, chips: suggestionsFor(snap), greeting: answer('hello', snap).text });
}));

module.exports = router;
module.exports.buildSnapshot = buildSnapshot;
