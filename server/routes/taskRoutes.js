const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const { materializeRecurring, materializeRange } = require('../lib/taskSeries');
const { addDays, todayUtc } = require('../lib/dates');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const PRIORITIES = ['low', 'medium', 'high'];
const RECURRENCES = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
const NOT_SKIPPED = { skipped: { $ne: true } };

/** Open tasks first; then timed tasks by time; then by priority; then oldest first. */
function sortTasks(tasks) {
  return tasks.sort((a, b) =>
    Number(a.completed) - Number(b.completed) ||
    (a.time ? 0 : 1) - (b.time ? 0 : 1) ||
    String(a.time).localeCompare(String(b.time)) ||
    (PRIORITY_WEIGHT[a.priority] ?? 1) - (PRIORITY_WEIGHT[b.priority] ?? 1) ||
    new Date(a.createdAt) - new Date(b.createdAt)
  );
}

router.get('/', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  await materializeRecurring(req.user.id, date);
  const tasks = await Task.find({ userId: req.user.id, date, ...NOT_SKIPPED }).lean();
  res.json({ success: true, tasks: sortTasks(tasks) });
}));

// Open tasks that have a due time, over the next N days — the mobile app schedules one
// notification per task from this list (and refreshes it whenever tasks change).
router.get('/upcoming', wrap(async (req, res) => {
  const from = req.query.from ? v.date(req.query.from, 'from') : todayUtc();
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 31);
  const to = addDays(from, days - 1);
  await materializeRange(req.user.id, from, to);
  const tasks = await Task.find({
    userId: req.user.id, date: { $gte: from, $lte: to }, completed: false, time: { $gt: '' }, ...NOT_SKIPPED,
  }).sort({ date: 1, time: 1 }).lean();
  res.json({ success: true, from, to, tasks });
}));

function parseTaskFields(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('title')) out.title = v.string(body.title, 'title', { max: 200, required: true });
  if (!partial || has('description')) out.description = v.string(body.description, 'description', { max: 1000 });
  if (!partial || has('time')) out.time = v.time(body.time);
  if (!partial || has('priority')) out.priority = v.oneOf(body.priority, 'priority', PRIORITIES, 'medium');
  if (!partial || has('category')) out.category = v.string(body.category, 'category', { max: 60, def: 'General' }) || 'General';
  if (!partial || has('recurrence')) out.recurrence = v.oneOf(body.recurrence, 'recurrence', RECURRENCES, 'none');
  if (!partial || has('notes')) out.notes = v.string(body.notes, 'notes', { max: 1000 });
  if (has('date')) out.date = v.date(body.date);
  return out;
}

router.post('/', wrap(async (req, res) => {
  const fields = parseTaskFields(req.body || {});
  fields.date = v.date(req.body?.date);
  const clientId = v.clientId(req.body?.clientId);
  const seriesId = fields.recurrence !== 'none' ? new mongoose.Types.ObjectId().toHexString() : '';
  const { doc, duplicate } = await createOnce(Task, req.user.id, clientId, { ...fields, seriesId });
  res.status(duplicate ? 200 : 201).json({ success: true, task: doc, duplicate });
}));

// Toggle — or, when `completed` is sent, set explicitly (so replaying an offline tap can't flip it back).
router.patch('/:id/toggle', wrap(async (req, res) => {
  const t = await Task.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!t) throw new HttpError(404, 'Task not found');
  t.completed = req.body && typeof req.body.completed === 'boolean' ? req.body.completed : !t.completed;
  t.completedAt = t.completed ? new Date() : null;
  await t.save();
  res.json({ success: true, task: t });
}));

router.patch('/:id', wrap(async (req, res) => {
  const t = await Task.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!t) throw new HttpError(404, 'Task not found');
  const body = req.body || {};
  const fields = parseTaskFields(body, { partial: true });
  const following = body.scope === 'following' && t.seriesId;

  if (following) {
    // "This and following": push template fields to every later instance in the series.
    const { date, ...template } = fields;
    if (Object.keys(template).length) {
      await Task.updateMany({ userId: req.user.id, seriesId: t.seriesId, date: { $gt: t.date } }, { $set: template });
    }
    if (template.recurrence === 'none') {
      await Task.deleteMany({ userId: req.user.id, seriesId: t.seriesId, date: { $gt: t.date }, completed: false });
    }
  }
  Object.assign(t, fields);
  if (fields.recurrence === 'none') t.seriesId = '';
  else if (fields.recurrence && !t.seriesId) t.seriesId = new mongoose.Types.ObjectId().toHexString();
  if (body.completed !== undefined) {
    t.completed = v.bool(body.completed, 'completed');
    t.completedAt = t.completed ? new Date() : null;
  }
  await t.save();
  res.json({ success: true, task: t });
}));

// DELETE /api/tasks/:id            -> just this task / occurrence
// DELETE /api/tasks/:id?scope=series -> this occurrence and everything after it (stops the repeat)
router.delete('/:id', wrap(async (req, res) => {
  const scope = v.oneOf(req.query.scope, 'scope', ['this', 'series'], 'this');
  const t = await Task.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!t) return res.json({ success: true });

  if (!t.seriesId) {
    await t.deleteOne();
    return res.json({ success: true });
  }
  if (scope === 'series') {
    await Task.deleteMany({ userId: req.user.id, seriesId: t.seriesId, date: { $gte: t.date } });
    const prev = await Task.findOne({ userId: req.user.id, seriesId: t.seriesId, date: { $lt: t.date } }).sort({ date: -1 });
    if (prev) { prev.recurrence = 'none'; await prev.save(); }
    return res.json({ success: true, ended: true });
  }
  // Single occurrence of a repeating task: keep a hidden marker so it isn't regenerated.
  t.skipped = true;
  t.completed = false;
  t.completedAt = null;
  await t.save();
  res.json({ success: true, skipped: true });
}));

module.exports = router;
