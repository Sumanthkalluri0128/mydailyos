const express = require('express');
const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const v = require('../lib/validate');
const { stepCalories, stepDistanceKm, stepsByDate, profileWeight } = require('../lib/steps');
const { computeRecords } = require('../lib/records');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const rx = new RegExp(v.escapeRegex(String(req.query.search).trim().slice(0, 60)), 'i');
    filter.$or = [{ name: rx }, { category: rx }];
  }
  if (req.query.category) filter.category = v.string(req.query.category, 'category', { max: 60 });
  res.json({ success: true, activities: await Activity.find(filter).sort({ name: 1 }).lean() });
}));

// ?date=YYYY-MM-DD for one day, or ?from=&to= for a range (used by the workout history list).
router.get('/logs', wrap(async (req, res) => {
  if (req.query.from || req.query.to) {
    const from = v.date(req.query.from, 'from');
    const to = v.date(req.query.to, 'to');
    if (from > to) throw new HttpError(400, 'from must be on or before to');
    const logs = await ActivityLog.find({ userId: req.user.id, date: { $gte: from, $lte: to } }).sort({ date: -1, createdAt: -1 }).limit(1000).lean();
    return res.json({ success: true, logs });
  }
  const date = v.date(req.query.date);
  res.json({ success: true, logs: await ActivityLog.find({ userId: req.user.id, date }).sort({ createdAt: -1 }).lean() });
}));

function parseSets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((s) => ({
    reps: Math.round(v.number(s?.reps, 'reps', { min: 1, max: 1000 })),
    weightKg: v.number(s?.weightKg, 'set weight', { min: 0, max: 1000, required: false, def: 0 }),
  }));
}

// Burned today = logged workouts + calories from the day's steps (counted automatically).
router.get('/summary', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  const [logs, steps, weight] = await Promise.all([
    ActivityLog.find({ userId: req.user.id, date }).lean(),
    stepsByDate(req.user.id, date, date),
    profileWeight(req.user.id),
  ]);
  const workoutCalories = logs.reduce((s, x) => s + x.caloriesBurned, 0);
  const stepCount = steps.get(date) || 0;
  const fromSteps = stepCalories(stepCount, weight);
  res.json({
    success: true,
    summary: {
      caloriesBurned: workoutCalories + fromSteps,
      workoutCalories,
      stepCalories: fromSteps,
      steps: stepCount,
      stepDistanceKm: stepDistanceKm(stepCount),
      totalMinutes: logs.reduce((s, x) => s + x.durationMinutes, 0),
    },
  });
}));

// Personal records from logged sets.
router.get('/records', wrap(async (req, res) => {
  const logs = await ActivityLog.find({ userId: req.user.id, 'sets.0': { $exists: true } }).select('activityName date sets').lean();
  res.json({ success: true, records: computeRecords(logs) });
}));

router.post('/logs', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const duration = v.number(req.body?.durationMinutes, 'durationMinutes', { min: 1, max: 1440 });
  const clientId = v.clientId(req.body?.clientId);
  const activity = await Activity.findById(v.objectId(String(req.body?.activityId || ''), 'activityId'));
  if (!activity) throw new HttpError(404, 'Activity not found');

  let weight = v.number(req.body?.weightKg, 'weightKg', { min: 1, max: 700, required: false, def: 0 });
  if (!weight) weight = Number((await Profile.findOne({ userId: req.user.id }).lean())?.currentWeightKg || 70);

  // Optional manual calories (e.g. from a smartwatch). Blank/absent -> estimate from MET x weight x time.
  const manual = v.number(req.body?.caloriesBurned, 'caloriesBurned', { min: 0, max: 20000, required: false, def: undefined });
  const hasManual = manual !== undefined;

  const { doc, duplicate } = await createOnce(ActivityLog, req.user.id, clientId, {
    activityId: activity._id, date, activityName: activity.name, category: activity.category,
    durationMinutes: duration, weightKg: weight, met: activity.met,
    caloriesBurned: hasManual ? manual : (activity.met * 3.5 * weight / 200) * duration,
    caloriesSource: hasManual ? 'manual' : 'estimated',
    sets: parseSets(req.body?.sets),
    notes: v.string(req.body?.notes, 'notes', { max: 300 }),
  });
  res.status(duplicate ? 200 : 201).json({ success: true, log: doc, duplicate });
}));

router.delete('/logs/:id', wrap(async (req, res) => {
  await ActivityLog.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  res.json({ success: true });
}));

module.exports = router;
