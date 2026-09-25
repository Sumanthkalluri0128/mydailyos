const express = require('express');
const { requireAuth } = require('../middleware/auth');
const FoodLog = require('../models/FoodLog');
const ActivityLog = require('../models/ActivityLog');
const WaterLog = require('../models/WaterLog');
const WeightLog = require('../models/WeightLog');
const Task = require('../models/Task');
const HabitLog = require('../models/HabitLog');
const StepLog = require('../models/StepLog');

const router = express.Router();
router.use(requireAuth);

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDate(value) {
  if (!validDate(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) return null;
  return value;
}

function enumerateDates(from, to) {
  const result = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cursor <= end) {
    result.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function emptyDay(date) {
  return {
    date,
    weightKg: null,
    calories: 0,
    protein: 0,
    carbohydrates: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    waterMl: 0,
    exerciseMinutes: 0,
    caloriesBurned: 0,
    tasksTotal: 0,
    tasksCompleted: 0,
    habitsCompleted: 0,
    steps: 0,
  };
}

async function buildHistory(userId, from, to) {
  const dates = enumerateDates(from, to);
  const [foods, activities, water, weights, priorWeight, tasks, habits, steps] = await Promise.all([
    FoodLog.find({ userId, date: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean(),
    ActivityLog.find({ userId, date: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean(),
    WaterLog.find({ userId, date: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean(),
    WeightLog.find({ userId, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean(),
    WeightLog.findOne({ userId, date: { $lt: from } }).sort({ date: -1, createdAt: -1 }).lean(),
    Task.find({ userId, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean(),
    HabitLog.find({ userId, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean(),
    StepLog.find({ userId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean(),
  ]);

  const dayMap = new Map(dates.map((date) => [date, emptyDay(date)]));

  for (const log of foods) {
    const day = dayMap.get(log.date);
    if (!day) continue;
    const n = log.nutritionTotal || {};
    day.calories += Number(n.calories || 0);
    day.protein += Number(n.protein || 0);
    day.carbohydrates += Number(n.carbohydrates || 0);
    day.fat += Number(n.fat || 0);
    day.fiber += Number(n.fiber || 0);
    day.sugar += Number(n.sugar || 0);
  }

  for (const log of activities) {
    const day = dayMap.get(log.date);
    if (!day) continue;
    day.exerciseMinutes += Number(log.durationMinutes || 0);
    day.caloriesBurned += Number(log.caloriesBurned || 0);
  }

  for (const log of water) {
    const day = dayMap.get(log.date);
    if (day) day.waterMl += Number(log.amountMl || 0);
  }

  for (const task of tasks) {
    const day = dayMap.get(task.date);
    if (!day) continue;
    day.tasksTotal += 1;
    if (task.completed) day.tasksCompleted += 1;
  }

  for (const habit of habits) {
    const day = dayMap.get(habit.date);
    if (day && habit.completed) day.habitsCompleted += 1;
  }

  for (const step of steps) {
    const day = dayMap.get(step.date);
    if (day) day.steps = Number(step.steps || 0);
  }

  const weightByDate = new Map();
  for (const weight of weights) {
    weightByDate.set(weight.date, Number(weight.weightKg));
  }

  let lastWeight = priorWeight ? Number(priorWeight.weightKg) : null;
  for (const date of dates) {
    if (weightByDate.has(date)) lastWeight = weightByDate.get(date);
    if (lastWeight !== null) weightByDate.set(date, lastWeight);
  }

  for (const [date, day] of dayMap) {
    day.weightKg = weightByDate.has(date) ? weightByDate.get(date) : null;
  }

  const days = dates.map((date) => dayMap.get(date));
  const totals = days.reduce(
    (acc, day) => {
      acc.calories += day.calories;
      acc.protein += day.protein;
      acc.waterMl += day.waterMl;
      acc.exerciseMinutes += day.exerciseMinutes;
      acc.caloriesBurned += day.caloriesBurned;
      acc.tasksCompleted += day.tasksCompleted;
      acc.tasksTotal += day.tasksTotal;
      acc.habitsCompleted += day.habitsCompleted;
      acc.steps += day.steps;
      return acc;
    },
    {
      calories: 0,
      protein: 0,
      waterMl: 0,
      exerciseMinutes: 0,
      caloriesBurned: 0,
      tasksCompleted: 0,
      tasksTotal: 0,
      habitsCompleted: 0,
      steps: 0,
    }
  );

  return { from, to, days, totals, rangeDays: days.length };
}

async function getDayDetails(userId, date) {
  const [food, exercise, water, weight, tasks, habits, steps] = await Promise.all([
    FoodLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    ActivityLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    WaterLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    WeightLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    Task.find({ userId, date }).sort({ completed: 1, priority: -1, time: 1, createdAt: 1 }).lean(),
    HabitLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    StepLog.find({ userId, date }).sort({ syncedAt: -1 }).lean(),
  ]);

  return {
    date,
    food,
    exercise,
    water,
    weight,
    tasks,
    habits,
    steps: steps.length ? Number(steps[0].steps || 0) : 0,
    summary: {
      calories: food.reduce((sum, x) => sum + Number(x.nutritionTotal?.calories || 0), 0),
      protein: food.reduce((sum, x) => sum + Number(x.nutritionTotal?.protein || 0), 0),
      waterMl: water.reduce((sum, x) => sum + Number(x.amountMl || 0), 0),
      exerciseMinutes: exercise.reduce((sum, x) => sum + Number(x.durationMinutes || 0), 0),
      caloriesBurned: exercise.reduce((sum, x) => sum + Number(x.caloriesBurned || 0), 0),
      weightKg: weight.length ? Number(weight[0].weightKg) : null,
      steps: steps.length ? Number(steps[0].steps || 0) : 0,
    },
  };
}

router.get('/history', async (req, res) => {
  try {
    const from = normalizeDate(String(req.query.from || ''));
    const to = normalizeDate(String(req.query.to || ''));
    if (!from || !to || from > to) {
      return res.status(400).json({ success: false, message: 'Valid from and to dates are required (YYYY-MM-DD).' });
    }

    const history = await buildHistory(req.user.id, from, to);
    return res.json({ success: true, ...history, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Progress history failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to build progress history.' });
  }
});

// Canonical single-day history endpoint. All clients should use this for detail views.
router.get('/day', async (req, res) => {
  try {
    const date = normalizeDate(String(req.query.date || ''));
    if (!date) return res.status(400).json({ success: false, message: 'A valid date is required (YYYY-MM-DD).' });
    return res.json({ success: true, ...(await getDayDetails(req.user.id, date)) });
  } catch (error) {
    console.error('Daily history failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load daily history.' });
  }
});

// Backward-compatible aliases so older clients never receive a 404 for history.
router.get('/history/day', async (req, res) => {
  try {
    const date = normalizeDate(String(req.query.date || ''));
    if (!date) return res.status(400).json({ success: false, message: 'A valid date is required (YYYY-MM-DD).' });
    return res.json({ success: true, ...(await getDayDetails(req.user.id, date)) });
  } catch (error) {
    console.error('Daily history failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load daily history.' });
  }
});
router.get('/day/:date', async (req, res) => {
  try {
    const date = normalizeDate(req.params.date);
    if (!date) return res.status(400).json({ success: false, message: 'A valid date is required (YYYY-MM-DD).' });
    return res.json({ success: true, ...(await getDayDetails(req.user.id, date)) });
  } catch (error) {
    console.error('Daily history failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load daily history.' });
  }
});

module.exports = router;
