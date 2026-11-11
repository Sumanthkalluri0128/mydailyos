const express = require('express');
const WeightLog = require('../models/WeightLog');
const Profile = require('../models/Profile');
const { refreshStoredTarget } = require('../lib/profileEnergy');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const v = require('../lib/validate');
const mongoose = require('mongoose');
const { parseCursor, applyCursor, pageSize, finishPage } = require('../lib/paginate');

const router = express.Router();
router.use(requireAuth);

async function syncProfileWeight(userId) {
  const latest = await WeightLog.findOne({ userId }).sort({ date: -1, createdAt: -1 }).lean();
  const profile = await Profile.findOneAndUpdate({ userId }, { $set: { currentWeightKg: latest ? latest.weightKg : null } }, { upsert: true, new: true });
  await refreshStoredTarget(Profile, profile); // a new weight moves the calorie plan
}

router.get('/', wrap(async (req, res) => {
  const filter = { userId: req.user.id };
  if (req.query.date) filter.date = v.date(req.query.date);
  else if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = v.date(req.query.from, 'from');
    if (req.query.to) filter.date.$lte = v.date(req.query.to, 'to');
  }
  const limit = pageSize(req.query.limit, 1500, 5000);
  const cur = parseCursor(req.query.cursor); if (cur === false) throw new HttpError(400, 'cursor is not valid');
  const rows = await WeightLog.find(applyCursor(filter, cur, mongoose.Types.ObjectId)).sort({ date: -1, _id: -1 }).limit(limit + 1).lean();
  const { page, hasMore, nextCursor } = finishPage(rows, limit);
  res.json({ success: true, logs: page, hasMore, nextCursor });
}));

router.get('/date/:date', wrap(async (req, res) => {
  const logs = await WeightLog.find({ userId: req.user.id, date: v.date(req.params.date) }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, logs, log: logs[0] || null });
}));

// One weigh-in per day: saving again on the same date updates that entry rather than adding a duplicate.
router.post('/', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const weightKg = Math.round(v.number(req.body?.weightKg, 'weightKg', { min: 1, max: 700 }) * 100) / 100;
  const notes = v.string(req.body?.notes, 'notes', { max: 300 });
  const clientId = v.clientId(req.body?.clientId);

  if (clientId) {
    const replay = await WeightLog.findOne({ userId: req.user.id, clientId });
    if (replay) return res.json({ success: true, log: replay, duplicate: true });
  }

  const existing = await WeightLog.find({ userId: req.user.id, date }).sort({ createdAt: -1 });
  let log;
  let updated = false;
  if (existing.length) {
    log = existing[0];
    log.weightKg = weightKg;
    if (req.body?.notes !== undefined) log.notes = notes;
    if (clientId) log.clientId = clientId;
    await log.save();
    if (existing.length > 1) await WeightLog.deleteMany({ _id: { $in: existing.slice(1).map((x) => x._id) } });
    updated = true;
  } else {
    ({ doc: log } = await createOnce(WeightLog, req.user.id, clientId, { date, weightKg, notes }));
  }
  await syncProfileWeight(req.user.id);
  res.status(updated ? 200 : 201).json({ success: true, log, updated });
}));

router.delete('/:id', wrap(async (req, res) => {
  const log = await WeightLog.findOneAndDelete({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!log) throw new HttpError(404, 'Weight log not found');
  await syncProfileWeight(req.user.id);
  res.json({ success: true });
}));

module.exports = router;
