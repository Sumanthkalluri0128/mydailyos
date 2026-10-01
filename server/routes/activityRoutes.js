const express = require('express');
const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const v = require('../lib/validate');

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

router.get('/logs', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  res.json({ success: true, logs: await ActivityLog.find({ userId: req.user.id, date }).sort({ createdAt: -1 }).lean() });
}));

router.get('/summary', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  const logs = await ActivityLog.find({ userId: req.user.id, date }).lean();
  res.json({
    success: true,
    summary: {
      caloriesBurned: logs.reduce((s, x) => s + x.caloriesBurned, 0),
      totalMinutes: logs.reduce((s, x) => s + x.durationMinutes, 0),
    },
  });
}));

router.post('/logs', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const duration = v.number(req.body?.durationMinutes, 'durationMinutes', { min: 1, max: 1440 });
  const clientId = v.clientId(req.body?.clientId);
  const activity = await Activity.findById(v.objectId(String(req.body?.activityId || ''), 'activityId'));
  if (!activity) throw new HttpError(404, 'Activity not found');

  let weight = v.number(req.body?.weightKg, 'weightKg', { min: 1, max: 700, required: false, def: 0 });
  if (!weight) weight = Number((await Profile.findOne({ userId: req.user.id }).lean())?.currentWeightKg || 70);

  const { doc, duplicate } = await createOnce(ActivityLog, req.user.id, clientId, {
    activityId: activity._id, date, activityName: activity.name, category: activity.category,
    durationMinutes: duration, weightKg: weight, met: activity.met,
    caloriesBurned: (activity.met * 3.5 * weight / 200) * duration,
    notes: v.string(req.body?.notes, 'notes', { max: 300 }),
  });
  res.status(duplicate ? 200 : 201).json({ success: true, log: doc, duplicate });
}));

router.delete('/logs/:id', wrap(async (req, res) => {
  await ActivityLog.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  res.json({ success: true });
}));

module.exports = router;
