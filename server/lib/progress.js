// Data-access helpers shared by /progress, /account/export and the achievements/weekly endpoints.
const mongoose = require('mongoose');
const FoodLog = require('../models/FoodLog');
const ActivityLog = require('../models/ActivityLog');
const WaterLog = require('../models/WaterLog');
const WeightLog = require('../models/WeightLog');
const Task = require('../models/Task');
const HabitLog = require('../models/HabitLog');
const { enumerate } = require('./dates');
const { stepCalories, stepsByDate, profileWeight } = require('./steps');

const VISIBLE_TASK = { skipped: { $ne: true } };

const emptyDay = (date) => ({
  date,
  weightKg: null,
  weighIn: false,
  calories: 0,
  protein: 0,
  carbohydrates: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  waterMl: 0,
  exerciseMinutes: 0,
  caloriesBurned: 0,
  steps: 0,
  stepCalories: 0,
  tasksTotal: 0,
  tasksCompleted: 0,
  habitsCompleted: 0,
});

/** One row per calendar day between `from` and `to` (inclusive), aggregated across every log type. */
async function buildHistory(userId, from, to) {
  const dates = enumerate(from, to);
  const range = { $gte: from, $lte: to };
  const [stepMap, fallbackWeight] = await Promise.all([stepsByDate(userId, from, to), profileWeight(userId)]);
  const [foods, activities, water, weights, priorWeight, tasks, habits] = await Promise.all([
    FoodLog.find({ userId, date: range }).select('date nutritionTotal').lean(),
    ActivityLog.find({ userId, date: range }).select('date durationMinutes caloriesBurned').lean(),
    WaterLog.find({ userId, date: range }).select('date amountMl').lean(),
    WeightLog.find({ userId, date: range }).sort({ date: 1, createdAt: 1 }).select('date weightKg').lean(),
    WeightLog.findOne({ userId, date: { $lt: from } }).sort({ date: -1, createdAt: -1 }).select('weightKg').lean(),
    Task.find({ userId, date: range, ...VISIBLE_TASK }).select('date completed').lean(),
    HabitLog.find({ userId, date: range }).select('date completed').lean(),
  ]);

  const dayMap = new Map(dates.map((d) => [d, emptyDay(d)]));

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
    day.sodium += Number(n.sodium || 0);
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
  for (const t of tasks) {
    const day = dayMap.get(t.date);
    if (!day) continue;
    day.tasksTotal += 1;
    if (t.completed) day.tasksCompleted += 1;
  }
  for (const h of habits) {
    const day = dayMap.get(h.date);
    if (day && h.completed) day.habitsCompleted += 1;
  }

  // Weight is carried forward between weigh-ins so charts have a continuous line,
  // while `weighIn` still tells you which days were real measurements.
  const measured = new Map();
  for (const w of weights) measured.set(w.date, Number(w.weightKg)); // last entry of the day wins
  let last = priorWeight ? Number(priorWeight.weightKg) : null;
  for (const d of dates) {
    const day = dayMap.get(d);
    if (measured.has(d)) {
      last = measured.get(d);
      day.weighIn = true;
    }
    day.weightKg = last;
  }
  // Steps are counted automatically: their calories are added to that day's total burned.
  for (const d of dates) {
    const day = dayMap.get(d);
    day.steps = stepMap.get(d) || 0;
    day.stepCalories = stepCalories(day.steps, day.weightKg || fallbackWeight);
    day.caloriesBurned += day.stepCalories;
  }

  const days = dates.map((d) => dayMap.get(d));
  const totals = days.reduce(
    (a, d) => {
      a.calories += d.calories;
      a.protein += d.protein;
      a.waterMl += d.waterMl;
      a.exerciseMinutes += d.exerciseMinutes;
      a.caloriesBurned += d.caloriesBurned;
      a.steps += d.steps;
      a.tasksCompleted += d.tasksCompleted;
      a.tasksTotal += d.tasksTotal;
      a.habitsCompleted += d.habitsCompleted;
      return a;
    },
    { calories: 0, protein: 0, waterMl: 0, exerciseMinutes: 0, caloriesBurned: 0, steps: 0, tasksCompleted: 0, tasksTotal: 0, habitsCompleted: 0 }
  );
  return { from, to, days, totals, rangeDays: days.length };
}

/** Everything logged on a single date, plus a summary — the one call the dashboards need. */
async function getDayDetails(userId, date) {
  const [stepMap, fallbackWeight] = await Promise.all([stepsByDate(userId, date, date), profileWeight(userId)]);
  const [food, exercise, water, weight, tasks, habits] = await Promise.all([
    FoodLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    ActivityLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    WaterLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    WeightLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
    Task.find({ userId, date, ...VISIBLE_TASK }).sort({ completed: 1, time: 1, createdAt: 1 }).lean(),
    HabitLog.find({ userId, date }).sort({ createdAt: -1 }).lean(),
  ]);
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const meals = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  for (const l of food) if (meals[l.mealType] !== undefined) meals[l.mealType] += Number(l.nutritionTotal?.calories || 0);

  return {
    date,
    food,
    exercise,
    water,
    weight,
    tasks,
    habits,
    summary: {
      calories: sum(food, (x) => x.nutritionTotal?.calories),
      protein: sum(food, (x) => x.nutritionTotal?.protein),
      carbohydrates: sum(food, (x) => x.nutritionTotal?.carbohydrates),
      fat: sum(food, (x) => x.nutritionTotal?.fat),
      fiber: sum(food, (x) => x.nutritionTotal?.fiber),
      sugar: sum(food, (x) => x.nutritionTotal?.sugar),
      meals,
      waterMl: sum(water, (x) => x.amountMl),
      exerciseMinutes: sum(exercise, (x) => x.durationMinutes),
      workoutCalories: sum(exercise, (x) => x.caloriesBurned),
      steps: stepMap.get(date) || 0,
      stepCalories: stepCalories(stepMap.get(date) || 0, weight.length ? Number(weight[0].weightKg) : fallbackWeight),
      caloriesBurned: sum(exercise, (x) => x.caloriesBurned) + stepCalories(stepMap.get(date) || 0, weight.length ? Number(weight[0].weightKg) : fallbackWeight),
      weightKg: weight.length ? Number(weight[0].weightKg) : null,
    },
  };
}

/** Lifetime counters that feed the "total" badges (10 tasks done, 50 workouts, 100 L of water…). */
async function lifetimeTotals(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const [tasksCompleted, workouts, foodEntries, weighIns, habitCompletions, water] = await Promise.all([
    Task.countDocuments({ userId, completed: true, ...VISIBLE_TASK }),
    ActivityLog.countDocuments({ userId }),
    FoodLog.countDocuments({ userId }),
    WeightLog.countDocuments({ userId }),
    HabitLog.countDocuments({ userId, completed: true }),
    WaterLog.aggregate([{ $match: { userId: uid } }, { $group: { _id: null, ml: { $sum: '$amountMl' } } }]),
  ]);
  return {
    tasksCompleted,
    workouts,
    foodEntries,
    weighIns,
    habitCompletions,
    waterLiters: Math.floor(((water[0] && water[0].ml) || 0) / 1000),
  };
}

module.exports = { buildHistory, getDayDetails, lifetimeTotals, VISIBLE_TASK, emptyDay };
