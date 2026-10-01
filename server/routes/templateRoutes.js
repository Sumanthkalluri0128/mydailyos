// Workout templates: save a routine ("Push day") and log all of it in one tap.
const express = require('express');
const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const Profile = require('../models/Profile');
const WorkoutTemplate = require('../models/WorkoutTemplate');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

async function parseTemplate(body) {
  const name = v.string(body.name, 'name', { max: 80, required: true });
  const notes = v.string(body.notes, 'notes', { max: 500 });
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
    throw new HttpError(400, 'A template needs 1–30 exercises');
  }
  const ids = body.items.map((i) => v.objectId(String(i.activityId || ''), 'activityId'));
  const acts = await Activity.find({ _id: { $in: ids } }).lean();
  const byId = new Map(acts.map((a) => [String(a._id), a]));
  const items = body.items.map((i) => {
    const a = byId.get(String(i.activityId));
    if (!a) throw new HttpError(404, 'One of the activities no longer exists');
    return {
      activityId: a._id, activityName: a.name, category: a.category, met: a.met,
      durationMinutes: v.number(i.durationMinutes, 'durationMinutes', { min: 1, max: 1440 }),
    };
  });
  return { name, notes, items };
}

router.get('/', wrap(async (req, res) => {
  res.json({ success: true, templates: await WorkoutTemplate.find({ userId: req.user.id }).sort({ name: 1 }).lean() });
}));

router.post('/', wrap(async (req, res) => {
  if ((await WorkoutTemplate.countDocuments({ userId: req.user.id })) >= 50) throw new HttpError(400, 'You can save up to 50 templates');
  const t = await WorkoutTemplate.create({ userId: req.user.id, ...(await parseTemplate(req.body || {})) });
  res.status(201).json({ success: true, template: t });
}));

router.put('/:id', wrap(async (req, res) => {
  const t = await WorkoutTemplate.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!t) throw new HttpError(404, 'Template not found');
  Object.assign(t, await parseTemplate(req.body || {}));
  await t.save();
  res.json({ success: true, template: t });
}));

router.delete('/:id', wrap(async (req, res) => {
  await WorkoutTemplate.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  res.json({ success: true });
}));

// Log every exercise in the template for a date, in one request.
router.post('/:id/log', wrap(async (req, res) => {
  const date = v.date(req.body.date);
  const clientId = v.clientId(req.body.clientId);
  const t = await WorkoutTemplate.findOne({ _id: v.objectId(req.params.id), userId: req.user.id }).lean();
  if (!t) throw new HttpError(404, 'Template not found');

  if (clientId) {
    const existing = await ActivityLog.find({ userId: req.user.id, clientId: new RegExp(`^${v.escapeRegex(clientId)}#`) }).lean();
    if (existing.length) return res.json({ success: true, logs: existing, duplicate: true });
  }

  let weight = v.number(req.body.weightKg, 'weightKg', { min: 1, max: 500, required: false, def: 0 });
  if (!weight) weight = Number((await Profile.findOne({ userId: req.user.id }).lean())?.currentWeightKg || 70);

  const logs = await ActivityLog.insertMany(t.items.map((i, idx) => ({
    userId: req.user.id, activityId: i.activityId, date, activityName: i.activityName, category: i.category,
    durationMinutes: i.durationMinutes, weightKg: weight, met: i.met,
    caloriesBurned: (i.met * 3.5 * weight / 200) * i.durationMinutes,
    notes: `From template: ${t.name}`,
    clientId: clientId ? `${clientId}#${idx}` : undefined,
  })));
  res.status(201).json({
    success: true, logs,
    totals: { minutes: logs.reduce((s, l) => s + l.durationMinutes, 0), caloriesBurned: Math.round(logs.reduce((s, l) => s + l.caloriesBurned, 0)) },
  });
}));

module.exports = router;
