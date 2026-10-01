const express = require('express');
const Habit = require('../models/Habit');
const HabitLog = require('../models/HabitLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { computeStreak } = require('../lib/achievements');
const { addDays, diffDays, todayUtc, toStr } = require('../lib/dates');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const FREQUENCIES = ['daily', 'weekdays', 'weekly'];

function parseHabit(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('name')) out.name = v.string(body.name, 'name', { max: 200, required: true });
  if (!partial || has('description')) out.description = v.string(body.description, 'description', { max: 500 });
  if (!partial || has('category')) out.category = v.string(body.category, 'category', { max: 60, def: 'General' }) || 'General';
  if (!partial || has('frequency')) out.frequency = v.oneOf(body.frequency, 'frequency', FREQUENCIES, 'daily');
  if (!partial || has('target')) out.target = v.number(body.target, 'target', { min: 1, max: 100000, required: false, def: 1 });
  if (!partial || has('unit')) out.unit = v.string(body.unit, 'unit', { max: 30, def: 'times' }) || 'times';
  if (!partial || has('notes')) out.notes = v.string(body.notes, 'notes', { max: 500 });
  return out;
}

router.get('/', wrap(async (req, res) => {
  res.json({ success: true, habits: await Habit.find({ userId: req.user.id, isActive: true }).sort({ createdAt: 1 }).lean() });
}));

router.post('/', wrap(async (req, res) => {
  if ((await Habit.countDocuments({ userId: req.user.id, isActive: true })) >= 100) throw new HttpError(400, 'You can track up to 100 habits');
  const habit = await Habit.create({ userId: req.user.id, ...parseHabit(req.body) });
  res.status(201).json({ success: true, habit });
}));

// ---- logs (declared before /:id routes so "logs" is never mistaken for an id)
router.get('/logs', wrap(async (req, res) => {
  const filter = { userId: req.user.id };
  if (req.query.date) filter.date = v.date(req.query.date);
  else if (req.query.from && req.query.to) filter.date = { $gte: v.date(req.query.from, 'from'), $lte: v.date(req.query.to, 'to') };
  else throw new HttpError(400, 'date (or from & to) is required');
  res.json({ success: true, logs: await HabitLog.find(filter).lean() });
}));

// Upsert: one log per habit per day, so replaying an offline tap is harmless.
router.post('/logs', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const habit = await Habit.findOne({ _id: v.objectId(String(req.body?.habitId || ''), 'habitId'), userId: req.user.id });
  if (!habit) throw new HttpError(404, 'Habit not found');
  const value = v.number(req.body?.completedValue, 'completedValue', { min: 0, max: 1000000, required: false, def: 0 });
  const log = await HabitLog.findOneAndUpdate(
    { userId: req.user.id, habitId: habit._id, date },
    {
      $set: { habitName: habit.name, target: habit.target, unit: habit.unit, completedValue: value, completed: value >= habit.target, notes: v.string(req.body?.notes, 'notes', { max: 300 }) },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true, log });
}));

router.get('/:id/stats', wrap(async (req, res) => {
  const habit = await Habit.findOne({ _id: v.objectId(req.params.id), userId: req.user.id }).lean();
  if (!habit) throw new HttpError(404, 'Habit not found');
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();

  const logs = await HabitLog.find({ userId: req.user.id, habitId: habit._id }).select('date completed').lean();
  const done = new Set(logs.filter((l) => l.completed).map((l) => l.date));
  const { current, best } = computeStreak(done, today);

  // Completion rate over the last 30 days (or since the habit was created, if that's more recent).
  const created = toStr(new Date(habit.createdAt));
  const windowDays = Math.min(30, Math.max(1, diffDays(created, today) + 1));
  let inWindow = 0;
  for (let i = 0; i < windowDays; i++) if (done.has(addDays(today, -i))) inWindow++;

  res.json({
    success: true,
    stats: {
      currentStreak: current,
      bestStreak: best,
      totalCompleted: done.size,
      totalLogged: logs.length,
      completionRate: Math.round((inWindow / windowDays) * 100),
    },
  });
}));

router.patch('/:id', wrap(async (req, res) => {
  const habit = await Habit.findOneAndUpdate(
    { _id: v.objectId(req.params.id), userId: req.user.id, isActive: true },
    { $set: parseHabit(req.body, { partial: true }) },
    { new: true, runValidators: true }
  );
  if (!habit) throw new HttpError(404, 'Habit not found');
  res.json({ success: true, habit });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = v.objectId(req.params.id);
  await Habit.updateOne({ _id: id, userId: req.user.id }, { $set: { isActive: false } });
  await HabitLog.deleteMany({ habitId: id, userId: req.user.id });
  res.json({ success: true });
}));

module.exports = router;
