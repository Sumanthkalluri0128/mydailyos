// Simple measurements: steps (auto-synced from the phone or typed), sleep, heart rate, blood pressure, glucose, body measurements.
const express = require('express');
const HealthLog = require('../models/HealthLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const { stepCalories, stepDistanceKm, profileWeight } = require('../lib/steps');
const v = require('../lib/validate');
const WeightLog = require('../models/WeightLog');
const { measureTrends, TYPES: BODY_TYPES } = require('../lib/measurements');
const { addDays, todayUtc } = require('../lib/dates');

const router = express.Router();
router.use(requireAuth);

const RANGES = {
  steps: [0, 200000], sleep: [0.1, 24], heartRate: [20, 250], bloodPressure: [50, 260], glucose: [20, 800],
  waist: [10, 300], chest: [10, 300], hips: [10, 300], arm: [5, 150], thigh: [10, 200], neck: [10, 100], oil: [0.25, 60],
};
const ONE_PER_DAY = new Set(['steps', 'sleep']); // re-saving the same day replaces the value (oil and measurements keep every entry)

router.get('/', wrap(async (req, res) => {
  const type = v.oneOf(req.query.type, 'type', HealthLog.TYPES);
  const q = { userId: req.user.id, type };
  if (req.query.from || req.query.to) q.date = { $gte: v.date(req.query.from || '0000-01-01', 'from'), $lte: v.date(req.query.to || '9999-12-31', 'to') };
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 120, 1), 1000);
  res.json({ success: true, logs: await HealthLog.find(q).sort({ date: -1, createdAt: -1 }).limit(limit).lean() });
}));

// Waist / hips / chest / arm / thigh trends next to weight (last `days` days, default 90).
router.get('/measure-trends', wrap(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 7), 730);
  const to = req.query.today ? v.date(req.query.today, 'today') : todayUtc(); const from = addDays(to, -days);
  const [logs, weights] = await Promise.all([
    HealthLog.find({ userId: req.user.id, type: { $in: BODY_TYPES }, date: { $gte: from, $lte: to } }).select('type date value createdAt').lean(),
    WeightLog.find({ userId: req.user.id, date: { $gte: from, $lte: to } }).select('date weightKg').lean(),
  ]);
  res.json({ success: true, from, to, ...measureTrends({ weights, logs: logs.map((l) => ({ ...l, at: l.createdAt && new Date(l.createdAt).toISOString() })) }) });
}));

// Latest reading of every type (for the Health overview).
router.get('/latest', wrap(async (req, res) => {
  const rows = await HealthLog.aggregate([
    { $match: { userId: new (require('mongoose').Types.ObjectId)(String(req.user.id)) } },
    { $sort: { date: -1, createdAt: -1 } },
    { $group: { _id: '$type', log: { $first: '$$ROOT' } } },
  ]);
  res.json({ success: true, latest: Object.fromEntries(rows.map((r) => [r._id, r.log])) });
}));

// Steps for one day with the calories and distance they represent.
router.get('/steps/day', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  const log = await HealthLog.findOne({ userId: req.user.id, type: 'steps', date }).lean();
  const steps = log ? log.value : 0;
  res.json({ success: true, steps, caloriesBurned: stepCalories(steps, await profileWeight(req.user.id)), distanceKm: stepDistanceKm(steps), source: log?.source || null });
}));

router.post('/', wrap(async (req, res) => {
  const type = v.oneOf(req.body?.type, 'type', HealthLog.TYPES);
  const date = v.date(req.body?.date);
  const [lo, hi] = RANGES[type];
  let value = v.number(req.body?.value, 'value', { min: lo, max: hi });
  if (type === 'steps') value = Math.round(value);
  let value2 = null;
  if (type === 'bloodPressure') {
    value2 = v.number(req.body?.value2, 'diastolic', { min: 30, max: 160 });
    if (value2 >= value) throw new HttpError(400, 'Systolic (top) must be higher than diastolic (bottom)');
  }
  const source = v.oneOf(req.body?.source, 'source', ['manual', 'device'], 'manual');
  const base = { type, date, value, value2, source, time: v.time(req.body?.time), notes: v.string(req.body?.notes, 'notes', { max: 300 }) };
  const clientId = v.clientId(req.body?.clientId);

  if (ONE_PER_DAY.has(type)) {
    // A reading imported from a device never overwrites one the person typed in themselves.
    if (source === 'device' && type === 'sleep') {
      const mine = await HealthLog.findOne({ userId: req.user.id, type, date, source: 'manual' }).lean();
      if (mine) return res.status(200).json({ success: true, log: mine, kept: 'manual' });
    }
    const log = await HealthLog.findOneAndUpdate(
      { userId: req.user.id, type, date },
      { $set: base, $setOnInsert: { userId: req.user.id, ...(clientId ? { clientId } : {}) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({ success: true, log });
  }
  const { doc, duplicate } = await createOnce(HealthLog, req.user.id, clientId, base);
  res.status(duplicate ? 200 : 201).json({ success: true, log: doc, duplicate });
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await HealthLog.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Entry not found');
  res.json({ success: true });
}));

module.exports = router;
