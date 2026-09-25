const express = require('express');
const { requireAuth } = require('../middleware/auth');
const FoodLog = require('../models/FoodLog');
const ActivityLog = require('../models/ActivityLog');
const WaterLog = require('../models/WaterLog');
const WeightLog = require('../models/WeightLog');
const Task = require('../models/Task');
const HabitLog = require('../models/HabitLog');

const router = express.Router();
router.use(requireAuth);

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function enumerateDates(from, to) {
  const result = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    result.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

router.get('/history', async (req, res) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');

    if (!validDate(from) || !validDate(to) || from > to) {
      return res.status(400).json({ success: false, message: 'Valid from and to dates are required (YYYY-MM-DD).' });
    }

    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59.999`);
    const userId = req.user.id;

    const [foods, activities, water, weights, tasks, habits] = await Promise.all([
      FoodLog.find({ userId, date: { $gte: from, $lte: to } }).lean(),
      ActivityLog.find({ userId, date: { $gte: from, $lte: to } }).lean(),
      WaterLog.find({ userId, date: { $gte: from, $lte: to } }).lean(),
      WeightLog.find({ userId, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean(),
      Task.find({ userId, date: { $gte: from, $lte: to } }).lean(),
      HabitLog.find({ userId, date: { $gte: from, $lte: to } }).lean(),
    ]);

    const dates = enumerateDates(from, to);
    const foodMap = new Map();
    const activityMap = new Map();
    const waterMap = new Map();
    const taskMap = new Map();
    const habitMap = new Map();

    for (const date of dates) {
      foodMap.set(date, { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0 });
      activityMap.set(date, { exerciseMinutes: 0, caloriesBurned: 0 });
      waterMap.set(date, 0);
      taskMap.set(date, { total: 0, completed: 0 });
      habitMap.set(date, 0);
    }

    for (const log of foods) {
      const target = foodMap.get(log.date);
      if (!target) continue;
      const n = log.nutritionTotal || {};
      target.calories += Number(n.calories || 0);
      target.protein += Number(n.protein || 0);
      target.carbohydrates += Number(n.carbohydrates || 0);
      target.fat += Number(n.fat || 0);
      target.fiber += Number(n.fiber || 0);
      target.sugar += Number(n.sugar || 0);
    }

    for (const log of activities) {
      const target = activityMap.get(log.date);
      if (!target) continue;
      target.exerciseMinutes += Number(log.durationMinutes || 0);
      target.caloriesBurned += Number(log.caloriesBurned || 0);
    }

    for (const log of water) {
      if (waterMap.has(log.date)) waterMap.set(log.date, waterMap.get(log.date) + Number(log.amountMl || 0));
    }

    for (const task of tasks) {
      const target = taskMap.get(task.date);
      if (!target) continue;
      target.total += 1;
      if (task.completed) target.completed += 1;
    }

    for (const habit of habits) {
      if (habit.completed && habitMap.has(habit.date)) habitMap.set(habit.date, habitMap.get(habit.date) + 1);
    }

    const weightByDate = new Map();
    for (const weight of weights) weightByDate.set(weight.date, Number(weight.weightKg));

    // Carry the most recent known weight forward so the weight trend is continuous.
    let lastWeight = null;
    for (const date of dates) {
      if (weightByDate.has(date)) lastWeight = weightByDate.get(date);
      if (lastWeight !== null) weightByDate.set(date, lastWeight);
    }

    const days = dates.map(date => ({
      date,
      weightKg: weightByDate.has(date) ? weightByDate.get(date) : null,
      ...foodMap.get(date),
      ...activityMap.get(date),
      waterMl: waterMap.get(date),
      tasksTotal: taskMap.get(date).total,
      tasksCompleted: taskMap.get(date).completed,
      habitsCompleted: habitMap.get(date),
    }));

    const totals = days.reduce((acc, day) => {
      acc.calories += day.calories;
      acc.protein += day.protein;
      acc.waterMl += day.waterMl;
      acc.exerciseMinutes += day.exerciseMinutes;
      acc.caloriesBurned += day.caloriesBurned;
      acc.tasksCompleted += day.tasksCompleted;
      acc.tasksTotal += day.tasksTotal;
      acc.habitsCompleted += day.habitsCompleted;
      return acc;
    }, { calories: 0, protein: 0, waterMl: 0, exerciseMinutes: 0, caloriesBurned: 0, tasksCompleted: 0, tasksTotal: 0, habitsCompleted: 0 });

    return res.json({ success: true, from, to, days, totals, generatedAt: new Date().toISOString(), rangeDays: dates.length, serverWindow: { start, end } });
  } catch (error) {
    console.error('Progress history failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to build progress history.' });
  }
});

module.exports = router;
