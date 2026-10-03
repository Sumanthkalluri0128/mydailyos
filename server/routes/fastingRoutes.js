const express = require('express');
const Fast = require('../models/Fast');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const hours = (f) => (((f.endedAt || new Date()) - f.startedAt) / 3600000);

router.get('/', wrap(async (req, res) => {
  const [current, history] = await Promise.all([
    Fast.findOne({ userId: req.user.id, endedAt: null }).sort({ startedAt: -1 }).lean(),
    Fast.find({ userId: req.user.id, endedAt: { $ne: null } }).sort({ startedAt: -1 }).limit(30).lean(),
  ]);
  res.json({ success: true, current, history: history.map((f) => ({ ...f, hours: Math.round(hours(f) * 10) / 10 })) });
}));

router.post('/start', wrap(async (req, res) => {
  if (await Fast.exists({ userId: req.user.id, endedAt: null })) throw new HttpError(409, 'You already have a fast in progress');
  const targetHours = v.number(req.body?.targetHours, 'targetHours', { min: 1, max: 72, required: false, def: 16 });
  let startedAt = new Date();
  if (req.body?.startedAt) {
    startedAt = new Date(req.body.startedAt);
    if (Number.isNaN(+startedAt) || startedAt > new Date() || new Date() - startedAt > 72 * 3600000) throw new HttpError(400, 'startedAt must be within the last 72 hours');
  }
  res.status(201).json({ success: true, fast: await Fast.create({ userId: req.user.id, startedAt, targetHours }) });
}));

router.post('/end', wrap(async (req, res) => {
  const fast = await Fast.findOne({ userId: req.user.id, endedAt: null });
  if (!fast) throw new HttpError(404, 'No fast in progress');
  fast.endedAt = new Date();
  await fast.save();
  res.json({ success: true, fast, hours: Math.round(hours(fast) * 10) / 10, reachedGoal: hours(fast) >= fast.targetHours });
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await Fast.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Fast not found');
  res.json({ success: true });
}));

module.exports = router;
