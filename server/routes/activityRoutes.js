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
const { planImport, FALLBACK } = require('../lib/hcImport');
const { planSync } = require('../lib/gymSync');

const mongoose = require('mongoose');
const { parseCursor, applyCursor, pageSize, finishPage } = require('../lib/paginate');
const { s, body } = require('../lib/schema');
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
    const limit = pageSize(req.query.limit, 1000, 1000);
    const cur = parseCursor(req.query.cursor); if (cur === false) throw new HttpError(400, 'cursor is not valid');
    const rows = await ActivityLog.find(applyCursor({ userId: req.user.id, date: { $gte: from, $lte: to } }, cur, mongoose.Types.ObjectId)).sort({ date: -1, _id: -1 }).limit(limit + 1).lean();
    const { page, hasMore, nextCursor } = finishPage(rows, limit);
    return res.json({ success: true, logs: page, hasMore, nextCursor });
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

// Import exercise sessions read from Health Connect on the phone. Safe to repeat: the same session never imports twice.
router.post('/import', body(s.object({ sessions: s.array(s.object({}, { passthrough: true }), { max: 2000 }) })), wrap(async (req, res) => {
  const raw = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  if (!raw.length) return res.json({ success: true, imported: 0, skipped: [], logs: [] });
  const dates = raw.map((r) => String(r?.date || '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const existing = dates.length
    ? await ActivityLog.find({ userId: req.user.id, source: 'healthconnect', date: { $gte: dates[0], $lte: dates[dates.length - 1] } }).select('clientId startMs endMs').lean()
    : [];
  const { fresh, skipped } = planImport(raw, existing);
  const weight = Number((await Profile.findOne({ userId: req.user.id }).lean())?.currentWeightKg || 70);
  const acts = await Activity.find({ name: { $in: [...new Set(fresh.map((f) => f.activityName))] } }).lean();
  const byName = new Map(acts.map((a) => [a.name, a]));
  const logs = [];
  for (const f of fresh) {
    const a = byName.get(f.activityName) || byName.get(FALLBACK);
    if (!a) { skipped.push({ clientId: f.clientId, reason: 'no-activity' }); continue; }
    const { doc, duplicate } = await createOnce(ActivityLog, req.user.id, f.clientId, {
      activityId: a._id, date: f.date, activityName: a.name, category: a.category, durationMinutes: f.durationMinutes, weightKg: weight, met: a.met,
      caloriesBurned: (a.met * 3.5 * weight / 200) * f.durationMinutes, caloriesSource: 'estimated',
      source: 'healthconnect', sourceApp: f.sourceApp, startMs: f.startMs, endMs: f.endMs, avgHeartRate: f.avgHeartRate ?? undefined, maxHeartRate: f.maxHeartRate ?? undefined,
      notes: f.title ? `Imported: ${f.title}` : 'Imported from Health Connect',
    });
    if (duplicate) skipped.push({ clientId: f.clientId, reason: 'already-imported' }); else logs.push(doc);
  }
  res.status(201).json({ success: true, imported: logs.length, skipped, logs });
}));

// Gym log -> Exercise log. The Gym log keeps sets x reps x weight on the device; this puts each logged exercise (with the minutes and
// calories the device worked out) into the day's activity, so Exercise and Home count it. Safe to repeat: one row per gym entry,
// updated in place when the entry is edited, removed when it is deleted.
router.post('/gym-sync', wrap(async (req, res) => {
  const { entries, removeIds } = planSync(req.body);
  if (!entries.length && !removeIds.length) return res.json({ success: true, synced: [], removed: 0 });
  const profileKg = Number((await Profile.findOne({ userId: req.user.id }).select('currentWeightKg').lean())?.currentWeightKg) || 70;
  const names = [...new Set(entries.map((e) => e.catalogueName))];
  const acts = await Activity.find({ name: { $in: names } }).lean();
  const byName = new Map(acts.map((a) => [a.name, a]));
  const synced = [];
  for (const e of entries) {
    const a = byName.get(e.catalogueName) || byName.get(FALLBACK);
    if (!a) continue;
    const fields = {
      activityId: a._id, date: e.date, activityName: e.activityName, category: e.category, durationMinutes: e.durationMinutes,
      weightKg: e.weightKg || profileKg, met: a.met, caloriesBurned: e.caloriesBurned, caloriesSource: 'estimated',
      sets: e.sets, source: 'gymlog', notes: e.notes,
    };
    const write = () => ActivityLog.findOneAndUpdate({ userId: req.user.id, clientId: e.clientId }, { $set: fields }, { upsert: true, new: true, setDefaultsOnInsert: true });
    try { await write(); } catch (err) { if (err && err.code === 11000) await write(); else throw err; } // two syncs racing: the second just updates
    synced.push(e.clientId.slice(4));
  }
  let removed = 0;
  if (removeIds.length) removed = (await ActivityLog.deleteMany({ userId: req.user.id, source: 'gymlog', clientId: { $in: removeIds } })).deletedCount || 0;
  res.json({ success: true, synced, removed });
}));

router.delete('/logs/:id', wrap(async (req, res) => {
  await ActivityLog.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  res.json({ success: true });
}));

module.exports = router;
