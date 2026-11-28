// Workout planner: plan workouts for any day, a week or a month ahead, repeat a week, move or skip a day, and see what was done.
// Mirrors the meal planner (dated items, copy a week). A planned workout counts as done when the person's own exercise log covers it
// (Gym log, Workout tab, Exercise page, watch), or when they mark it done; nothing is logged twice and no calories are added by planning.
const express = require('express');
const WorkoutPlanItem = require('../models/WorkoutPlanItem');
const ActivityLog = require('../models/ActivityLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const { diffDays, addDays, todayUtc } = require('../lib/dates');
const v = require('../lib/validate');
const P = require('../lib/workoutPlanner');

const router = express.Router();
router.use(requireAuth);

const MAX_RANGE = 93;
const todayOf = (x) => (x ? v.date(x, 'today') : null);
// Plans can only be made for today and later (past days show what was logged). `today` is the person's own date; without it only days that are
// clearly over in every time zone are refused.
function assertNotPast(date, today) {
  const floor = today || addDays(todayUtc(), -1);
  if (date < floor) throw new HttpError(400, 'That day is over. Past days show what you logged and cannot be planned.');
}
function range(req) {
  const from = v.date(req.query.from, 'from'), to = v.date(req.query.to, 'to');
  if (from > to || diffDays(from, to) > MAX_RANGE) throw new HttpError(400, `Range must be 1–${MAX_RANGE} days`);
  return { from, to };
}
const present = (it, matched) => ({ _id: it._id, date: it.date, kind: it.kind, title: it.title, minutes: it.minutes, exercises: it.exercises || [], note: it.note || '', status: it.status, movedFrom: it.movedFrom || '', seriesId: it.seriesId || '', matched: !!matched, done: it.status === 'done' || !!matched });

async function guardCap(uid, adding) {
  if ((await WorkoutPlanItem.countDocuments({ userId: uid })) + adding > P.MAX_ITEMS_PER_PERSON) throw new HttpError(400, 'Your plan is full. Delete some old workouts first.');
}

router.get('/', wrap(async (req, res) => {
  const { from, to } = range(req);
  const items = await WorkoutPlanItem.find({ userId: req.user.id, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean();
  const logs = items.length ? await ActivityLog.find({ userId: req.user.id, date: { $gte: from, $lte: to } }).select('date category durationMinutes').lean() : [];
  const matched = P.matchItems(items.map((i) => ({ id: i._id, date: i.date, kind: i.kind, minutes: i.minutes, status: i.status })), logs);
  const out = items.map((i) => present(i, matched.has(String(i._id))));
  const days = {};
  for (const i of out) {
    const d = (days[i.date] = days[i.date] || { planned: 0, done: 0, skipped: 0, rest: 0 });
    if (i.kind === 'rest') d.rest += 1;
    else if (i.status === 'skipped') d.skipped += 1;
    else if (i.done) d.done += 1;
    else d.planned += 1;
  }
  res.json({ success: true, items: out, days });
}));

router.post('/', wrap(async (req, res) => {
  const date = v.date(req.body?.date, 'date');
  assertNotPast(date, todayOf(req.body?.today));
  const fields = P.cleanItem(req.body);
  await guardCap(req.user.id, 1);
  const { doc, duplicate } = await createOnce(WorkoutPlanItem, req.user.id, v.clientId(req.body?.clientId), { ...fields, date });
  res.status(duplicate ? 200 : 201).json({ success: true, item: present(doc, false) });
}));

// Repeat a week: [{dow 1..7, kind, title, minutes, exercises}] for 1..12 weeks from the week of `from`. The same request twice adds nothing twice.
router.post('/repeat', wrap(async (req, res) => {
  const from = v.date(req.body?.from, 'from');
  const today = todayOf(req.body?.today);
  const items = P.expandPattern({ pattern: req.body?.pattern, from, weeks: req.body?.weeks, today });
  const seriesId = v.clientId(req.body?.clientId) || `s-${Date.now().toString(36)}`;
  await guardCap(req.user.id, items.length);
  const have = new Set((await WorkoutPlanItem.find({ userId: req.user.id, seriesId }).select('clientId').lean()).map((x) => x.clientId));
  let created = 0;
  for (const it of items) {
    const cid = `${seriesId}:${it.date}:${it.slot}`;
    if (have.has(cid)) continue;
    const { slot, ...fields } = it;
    const { duplicate } = await createOnce(WorkoutPlanItem, req.user.id, cid, { ...fields, seriesId });
    if (!duplicate) created += 1;
  }
  res.status(created ? 201 : 200).json({ success: true, created, seriesId });
}));

// Copy one week's workouts onto another week. What is already there (same day + kind + title) is not added again.
router.post('/copy-week', wrap(async (req, res) => {
  const fromStart = v.date(req.body?.fromStart, 'fromStart'), toStart = v.date(req.body?.toStart, 'toStart');
  if (fromStart === toStart) throw new HttpError(400, 'Choose a different week to copy into');
  const uid = req.user.id, shift = diffDays(fromStart, toStart);
  const src = await WorkoutPlanItem.find({ userId: uid, date: { $gte: fromStart, $lte: addDays(fromStart, 6) } }).lean();
  const floor = todayOf(req.body?.today) || addDays(todayUtc(), -1);
  const wanted = src.map(({ _id, createdAt, updatedAt, __v, clientId, doneAt, ...rest }) => ({ ...rest, date: addDays(rest.date, shift), status: 'planned', movedFrom: '', seriesId: '' })).filter((d) => d.date >= floor);
  const have = await WorkoutPlanItem.find({ userId: uid, date: { $gte: toStart, $lte: addDays(toStart, 6) } }).select('date kind title').lean();
  const keyOf = (i) => `${i.date}|${i.kind}|${i.title}`;
  const taken = new Set(have.map(keyOf));
  const docs = wanted.filter((d) => !taken.has(keyOf(d)));
  await guardCap(uid, docs.length);
  if (docs.length) await WorkoutPlanItem.insertMany(docs);
  res.status(docs.length ? 201 : 200).json({ success: true, copied: docs.length, alreadyThere: wanted.length - docs.length, past: src.length - wanted.length });
}));

// Copy or move workouts onto one or many days at once: { ids: [..], dates: [..], mode: "copy" | "move", today }.
// Copy: every chosen workout is added to every chosen day (what is already there, same day + kind + title, is not added twice).
// Move: the workout goes to the first chosen day (kept as the same item, so "moved from" shows) and is copied to the others.
router.post('/transfer', wrap(async (req, res) => {
  const uid = req.user.id, today = todayOf(req.body?.today);
  const mode = v.oneOf(req.body?.mode || 'copy', 'mode', ['copy', 'move']);
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [], rawDates = Array.isArray(req.body?.dates) ? req.body.dates : [];
  if (!rawIds.length || rawIds.length > 50) throw new HttpError(400, 'Choose 1–50 workouts');
  if (!rawDates.length || rawDates.length > 62) throw new HttpError(400, 'Choose 1–62 days');
  const ids = [...new Set(rawIds.map((x) => String(v.objectId(x, 'id'))))];
  const dates = [...new Set(rawDates.map((d) => v.date(d, 'date')))].sort();
  for (const d of dates) assertNotPast(d, today);
  const src = await WorkoutPlanItem.find({ userId: uid, _id: { $in: ids } }).sort({ date: 1, createdAt: 1 });
  if (!src.length) throw new HttpError(404, 'Workouts not found');
  const lo = dates[0], hi = dates[dates.length - 1];
  const have = await WorkoutPlanItem.find({ userId: uid, date: { $gte: lo, $lte: hi } }).select('date kind title').lean();
  const keyOf = (i) => `${i.date}|${i.kind}|${i.title}`;
  const taken = new Set(have.map(keyOf));
  const docs = [], toMove = [];
  let skipped = 0;
  for (const it of src) {
    const targets = dates.filter((d) => d !== it.date);
    const open = targets.filter((d) => !taken.has(keyOf({ date: d, kind: it.kind, title: it.title })));
    skipped += targets.length - open.length;
    let rest = open;
    if (mode === 'move' && open.length) { toMove.push({ it, date: open[0] }); taken.add(keyOf({ date: open[0], kind: it.kind, title: it.title })); rest = open.slice(1); }
    for (const d of rest) {
      taken.add(keyOf({ date: d, kind: it.kind, title: it.title }));
      docs.push({ userId: uid, date: d, kind: it.kind, title: it.title, minutes: it.minutes, exercises: (it.exercises || []).map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, kg: e.kg })), note: it.note || '', status: 'planned', movedFrom: '', seriesId: '' });
    }
  }
  await guardCap(uid, docs.length);
  for (const { it, date } of toMove) { if (!it.movedFrom) it.movedFrom = it.date; it.date = date; await it.save(); }
  if (docs.length) await WorkoutPlanItem.insertMany(docs);
  res.status(docs.length || toMove.length ? 201 : 200).json({ success: true, copied: docs.length, moved: toMove.length, skipped });
}));

// Edit, move (change `date`) or set the status (planned / done / skipped).
router.patch('/:id', wrap(async (req, res) => {
  const item = await WorkoutPlanItem.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!item) throw new HttpError(404, 'Workout not found');
  Object.assign(item, P.cleanItem(req.body, { partial: true }));
  if (req.body?.date !== undefined) {
    const date = v.date(req.body.date, 'date');
    if (date !== item.date) { assertNotPast(date, todayOf(req.body?.today)); if (!item.movedFrom) item.movedFrom = item.date; item.date = date; }
  }
  if (req.body?.status !== undefined) {
    const status = v.oneOf(req.body.status, 'status', ['planned', 'done', 'skipped']);
    item.status = status; item.doneAt = status === 'done' ? new Date() : null;
  }
  await item.save();
  res.json({ success: true, item: present(item, false) });
}));

router.delete('/series/:seriesId', wrap(async (req, res) => {
  const from = req.query.from ? v.date(req.query.from, 'from') : addDays(todayUtc(), -1);
  const r = await WorkoutPlanItem.deleteMany({ userId: req.user.id, seriesId: String(req.params.seriesId).slice(0, 80), date: { $gte: from } });
  res.json({ success: true, deleted: r.deletedCount });
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await WorkoutPlanItem.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Workout not found');
  res.json({ success: true });
}));

module.exports = router;
