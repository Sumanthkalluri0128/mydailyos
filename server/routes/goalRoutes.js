// Goals & journey: the person's own short / long-term goals plus XP, daily quests, weekly missions and milestones.
const express = require('express');
const Goal = require('../models/Goal');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { loadJourney } = require('../lib/journeyData');
const { loadSimple } = require('../lib/simpleData');
const { checkTargetChange } = require('../lib/simpleGoals');
const { GOAL_METRICS } = require('../lib/journey');
const { todayUtc } = require('../lib/dates');

const router = express.Router();
router.use(requireAuth);

const METRICS = Object.keys(GOAL_METRICS);

function parseGoal(body = {}, today, { partial = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('title')) out.title = v.string(body.title, 'title', { max: 120, required: true });
  if (!partial || has('kind')) out.kind = v.oneOf(body.kind, 'kind', ['short', 'long'], 'short');
  if (!partial || has('metric')) out.metric = v.oneOf(body.metric, 'metric', METRICS, 'custom');
  if (!partial || has('target')) out.target = v.number(body.target, 'target', { min: 0.01, max: 10000000 });
  if (has('startValue') && body.startValue !== null && body.startValue !== '') out.startValue = v.number(body.startValue, 'startValue', { min: 1, max: 700 });
  if (has('manualValue')) out.manualValue = v.number(body.manualValue, 'manualValue', { min: 0, max: 10000000, required: false, def: 0 });
  if (!partial || has('unit')) out.unit = v.string(body.unit, 'unit', { max: 20 });
  if (!partial || has('startDate')) out.startDate = body.startDate ? v.date(body.startDate, 'startDate') : today;
  if (!partial || has('deadline')) out.deadline = body.deadline ? v.date(body.deadline, 'deadline') : '';
  if (has('note')) out.note = v.string(body.note, 'note', { max: 300 });
  if (has('done')) out.done = body.done === true;
  return out;
}

// GET /api/goals/journey?today=YYYY-MM-DD — level, quests, missions, streak, weekly chapter, weight journey and my goals with live progress.
router.get('/journey', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  res.json({ success: true, ...(await loadJourney(req.user.id, today)) });
}));

// GET /api/goals/simple?today=  the whole simplified screen: one goal, today's quests, one level, weekly score, badge shelves, targets, recap.
router.get('/simple', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  res.json({ success: true, ...(await loadSimple(req.user.id, today)) });
}));

// POST /api/goals/check-target { key, value }  runs the app's safety rules on a typed target before it is saved.
router.post('/check-target', wrap(async (req, res) => {
  const profile = await Profile.findOne({ userId: req.user.id }).lean();
  const floor = profile?.sex === 'male' ? 1500 : 1200;
  res.json({ success: true, ...checkTargetChange(String(req.body?.key || ''), req.body?.value, { profile: profile || {}, floor }) });
}));

router.get('/', wrap(async (req, res) => {
  res.json({ success: true, goals: await Goal.find({ userId: req.user.id }).sort({ done: 1, deadline: 1, createdAt: -1 }).lean() });
}));

router.post('/', wrap(async (req, res) => {
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();
  if ((await Goal.countDocuments({ userId: req.user.id, done: false })) >= 30) throw new HttpError(400, 'You can have up to 30 active goals — finish or delete one first');
  const data = parseGoal(req.body, today);
  if (data.deadline && data.deadline < data.startDate) throw new HttpError(400, 'The deadline must be after the start date');
  if (data.metric === 'weight' && !data.startValue) {
    const profile = await Profile.findOne({ userId: req.user.id }).select('currentWeightKg').lean();
    data.startValue = profile?.currentWeightKg || null;
    if (!data.startValue) throw new HttpError(400, 'Add your current weight first so we can measure progress');
  }
  const goal = await Goal.create({ userId: req.user.id, ...data });
  res.status(201).json({ success: true, goal });
}));

router.patch('/:id', wrap(async (req, res) => {
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();
  const goal = await Goal.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!goal) throw new HttpError(404, 'Goal not found');
  const data = parseGoal(req.body, today, { partial: true });
  Object.assign(goal, data);
  if (data.done === true && !goal.doneAt) goal.doneAt = today;
  if (data.done === false) goal.doneAt = '';
  if (goal.deadline && goal.deadline < goal.startDate) throw new HttpError(400, 'The deadline must be after the start date');
  await goal.save();
  res.json({ success: true, goal });
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await Goal.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Goal not found');
  res.json({ success: true });
}));

module.exports = router;
