const express = require('express');
const WeightLog = require('../models/WeightLog');
const Profile = require('../models/Profile');
const { refreshStoredTarget } = require('../lib/profileEnergy');
const CoachState = require('../models/CoachState');
const { markCoachDirty, markDailyDirty } = require('../lib/coachDirty');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const v = require('../lib/validate');
const mongoose = require('mongoose');
const { parseCursor, applyCursor, pageSize, finishPage } = require('../lib/paginate');
const W = require('../lib/weightScales');
const { scalesOf, latestWeightKg, relearn } = require('../lib/weightData');

const router = express.Router();
router.use(requireAuth);

// Analysis always reads calibrated weights (lib/weightData.js). Anything that changes a reading, a scale or an offset ends here:
// the profile's current weight follows the newest calibrated weigh-in, the calorie plan and both coaches re-read.
async function syncProfileWeight(userId) {
  const latest = await latestWeightKg(userId);
  const profile = await Profile.findOneAndUpdate({ userId }, { $set: { currentWeightKg: latest } }, { upsert: true, new: true });
  await refreshStoredTarget(Profile, profile); // a new weight moves the calorie plan
  await markCoachDirty(CoachState, userId);    // the weekly coach re-reads its signals (a fast trend is re-checked today, not next week)
  await markDailyDirty(CoachState, userId);    // ... and today's daily decision is re-worked from the new trend
}

const saveScales = (uid, scales, referenceId) => Profile.updateOne({ userId: uid }, { $set: { weightScales: scales, referenceScaleId: referenceId } }, { upsert: true });
const mainFilter = (id) => (id === W.MAIN_ID ? { $in: ['', W.MAIN_ID, null] } : id);
const sidFilter = (id) => ({ scaleId: mainFilter(id) });
const view = (log, scales) => W.calibrate([log.toObject ? log.toObject() : log], scales)[0];
const scalePayload = (s) => ({ scales: s.scales, referenceId: s.referenceId });

/** The scale a request means. Missing or unknown (deleted on another device while this write waited offline) = the reference scale. */
function pickScale(raw, cur) {
  const id = raw === undefined || raw === null ? '' : String(raw);
  return cur.scales.some((s) => s.id === id) ? id : cur.referenceId;
}

// ---------------------------------------------------------------- scales
router.get('/scales', wrap(async (req, res) => {
  const cur = await scalesOf(req.user.id);
  const rows = await WeightLog.aggregate([{ $match: { userId: new mongoose.Types.ObjectId(String(req.user.id)) } }, { $group: { _id: '$scaleId', n: { $sum: 1 }, last: { $max: '$date' } } }]);
  const counts = {};
  for (const r of rows) { const id = r._id || W.MAIN_ID; counts[id] = { n: (counts[id]?.n || 0) + r.n, last: [counts[id]?.last, r.last].filter(Boolean).sort().pop() }; }
  res.json({ success: true, ...scalePayload(cur), scales: cur.scales.map((s) => ({ ...s, entries: counts[s.id]?.n || 0, lastUsed: counts[s.id]?.last || null })) });
}));

router.post('/scales', wrap(async (req, res) => {
  const cur = await scalesOf(req.user.id);
  if (cur.scales.length >= W.MAX_SCALES) throw new HttpError(400, `You can keep up to ${W.MAX_SCALES} scales.`);
  const name = W.cleanName(v.string(req.body?.name, 'name', { max: 40, required: true }));
  if (!name) throw new HttpError(400, 'Give the scale a name.');
  if (cur.scales.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `You already have a scale called "${name}".`);
  const manual = req.body?.offsetKg !== undefined && req.body?.offsetKg !== null && req.body?.offsetKg !== '';
  const scale = { id: W.newId(), name, mode: manual ? 'manual' : 'auto', offsetKg: manual ? v.number(req.body.offsetKg, 'offsetKg', { min: -50, max: 50 }) : 0, learnedKg: null, samples: 0 };
  const next = W.normalizeScales([...cur.scales, scale], cur.referenceId);
  await saveScales(req.user.id, next.scales, next.referenceId);
  res.status(201).json({ success: true, scale: next.scales.find((s) => s.id === scale.id), ...scalePayload(next) });
}));

router.patch('/scales/:id', wrap(async (req, res) => {
  const cur = await scalesOf(req.user.id);
  const id = String(req.params.id);
  const sc = cur.scales.find((s) => s.id === id);
  if (!sc) throw new HttpError(404, 'Scale not found');
  const next = { ...sc };
  if (req.body?.name !== undefined) {
    next.name = W.cleanName(v.string(req.body.name, 'name', { max: 40, required: true }));
    if (!next.name) throw new HttpError(400, 'Give the scale a name.');
    if (cur.scales.some((s) => s.id !== id && s.name.toLowerCase() === next.name.toLowerCase())) throw new HttpError(409, `You already have a scale called "${next.name}".`);
  }
  if (id !== cur.referenceId) { // the reference scale is the yardstick: its offset is always 0
    if (req.body?.mode === 'auto') next.mode = 'auto';
    if (req.body?.mode === 'manual' || (req.body?.offsetKg !== undefined && req.body?.offsetKg !== null && req.body?.offsetKg !== '')) {
      next.mode = 'manual';
      next.offsetKg = v.number(req.body.offsetKg !== undefined && req.body.offsetKg !== '' && req.body.offsetKg !== null ? req.body.offsetKg : sc.offsetKg, 'offsetKg', { min: -50, max: 50 });
    }
  }
  const list = W.normalizeScales(cur.scales.map((s) => (s.id === id ? next : s)), cur.referenceId);
  await saveScales(req.user.id, list.scales, list.referenceId);
  const learned = await relearn(req.user.id);
  await syncProfileWeight(req.user.id);
  res.json({ success: true, scale: learned.scales.find((s) => s.id === id), ...scalePayload(learned) });
}));

// Make this scale the yardstick. Nothing is rewritten: every offset is re-expressed against it, so all numbers move to its terms.
router.post('/scales/:id/reference', wrap(async (req, res) => {
  const cur = await scalesOf(req.user.id);
  const id = String(req.params.id);
  if (!cur.scales.some((s) => s.id === id)) throw new HttpError(404, 'Scale not found');
  const next = W.normalizeScales(W.rebase(cur.scales, id), id);
  await saveScales(req.user.id, next.scales, next.referenceId);
  const learned = await relearn(req.user.id);
  await syncProfileWeight(req.user.id);
  res.json({ success: true, ...scalePayload(learned) });
}));

// Delete a scale. Its weigh-ins are kept: each moves to the reference scale at its calibrated value, so no trend changes.
router.delete('/scales/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const cur = await scalesOf(uid);
  const id = String(req.params.id);
  const sc = cur.scales.find((s) => s.id === id);
  if (!sc) throw new HttpError(404, 'Scale not found');
  if (id === cur.referenceId) throw new HttpError(400, 'This is your main scale. Make another scale the main one first.');
  const rows = await WeightLog.find({ userId: uid, ...sidFilter(id) });
  let moved = 0, merged = 0;
  for (const l of rows) {
    const sameDay = await WeightLog.findOne({ userId: uid, date: l.date, ...sidFilter(cur.referenceId) });
    if (sameDay) { await l.deleteOne(); merged += 1; continue; }  // that day already has a main-scale reading: it is the better one
    l.weightKg = W.toReference(l.weightKg, id, cur.scales); l.scaleId = cur.referenceId; await l.save(); moved += 1;
  }
  const next = W.normalizeScales(cur.scales.filter((s) => s.id !== id), cur.referenceId);
  await saveScales(uid, next.scales, next.referenceId);
  const learned = await relearn(uid);
  await syncProfileWeight(uid);
  res.json({ success: true, moved, merged, ...scalePayload(learned) });
}));

// ---------------------------------------------------------------- weigh-ins
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
  const [rows, sc] = await Promise.all([WeightLog.find(applyCursor(filter, cur, mongoose.Types.ObjectId)).sort({ date: -1, _id: -1 }).limit(limit + 1).lean(), scalesOf(req.user.id)]);
  const { page, hasMore, nextCursor } = finishPage(rows, limit);
  // `weightKg` = calibrated (main-scale terms, what every analysis uses); `rawKg` = what that scale showed.
  res.json({ success: true, logs: W.calibrate(page, sc.scales), hasMore, nextCursor, ...scalePayload(sc) });
}));

router.get('/date/:date', wrap(async (req, res) => {
  const [rows, sc] = await Promise.all([WeightLog.find({ userId: req.user.id, date: v.date(req.params.date) }).sort({ createdAt: -1 }).lean(), scalesOf(req.user.id)]);
  const logs = W.calibrate(rows, sc.scales);
  res.json({ success: true, logs, log: logs[0] || null, ...scalePayload(sc) });
}));

// One weigh-in per day PER SCALE: saving again for the same date and scale updates that entry. Weighing on two scales the same day keeps both
// (that pair is how the second scale's offset is learned); analysis then uses the day's calibrated mean.
router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const date = v.date(req.body?.date);
  const weightKg = Math.round(v.number(req.body?.weightKg, 'weightKg', { min: 1, max: 700 }) * 100) / 100;
  const notes = v.string(req.body?.notes, 'notes', { max: 300 });
  const clientId = v.clientId(req.body?.clientId);
  const cur = await scalesOf(uid);
  const scaleId = pickScale(req.body?.scaleId, cur);

  if (clientId) {
    const replay = await WeightLog.findOne({ userId: uid, clientId });
    if (replay) return res.json({ success: true, log: view(replay, cur.scales), duplicate: true, ...scalePayload(cur) });
  }

  const existing = await WeightLog.find({ userId: uid, date, ...sidFilter(scaleId) }).sort({ createdAt: -1 });
  let log;
  let updated = false;
  if (existing.length) {
    log = existing[0];
    log.weightKg = weightKg;
    log.scaleId = scaleId;
    if (req.body?.notes !== undefined) log.notes = notes;
    if (clientId) log.clientId = clientId;
    await log.save();
    if (existing.length > 1) await WeightLog.deleteMany({ _id: { $in: existing.slice(1).map((x) => x._id) } });
    updated = true;
  } else {
    ({ doc: log } = await createOnce(WeightLog, uid, clientId, { date, weightKg, notes, scaleId }));
  }
  const learned = await relearn(uid);
  await syncProfileWeight(uid);
  res.status(updated ? 200 : 201).json({ success: true, log: view(log, learned.scales), updated, ...scalePayload(learned) });
}));

// Fix an entry: which scale it was, the reading, or the note.
router.patch('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const log = await WeightLog.findOne({ _id: v.objectId(req.params.id), userId: uid });
  if (!log) throw new HttpError(404, 'Weight log not found');
  const cur = await scalesOf(uid);
  if (req.body?.weightKg !== undefined) log.weightKg = Math.round(v.number(req.body.weightKg, 'weightKg', { min: 1, max: 700 }) * 100) / 100;
  if (req.body?.notes !== undefined) log.notes = v.string(req.body.notes, 'notes', { max: 300 });
  if (req.body?.scaleId !== undefined) {
    const sid = String(req.body.scaleId);
    if (!cur.scales.some((s) => s.id === sid)) throw new HttpError(400, 'That scale does not exist.');
    const clash = await WeightLog.findOne({ userId: uid, date: log.date, _id: { $ne: log._id }, ...sidFilter(sid) });
    if (clash) throw new HttpError(409, 'That scale already has a weigh-in on this day.');
    log.scaleId = sid;
  }
  await log.save();
  const learned = await relearn(uid);
  await syncProfileWeight(uid);
  res.json({ success: true, log: view(log, learned.scales), ...scalePayload(learned) });
}));

router.delete('/:id', wrap(async (req, res) => {
  const log = await WeightLog.findOneAndDelete({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!log) throw new HttpError(404, 'Weight log not found');
  await relearn(req.user.id);
  await syncProfileWeight(req.user.id);
  res.json({ success: true });
}));

module.exports = router;
