// Lift tracking: every exercise of every finished workout, with each set's weight and what the weight means (per dumbbell, total, body weight + extra, assist).
// The apps send a workout once it is finished (safe to send twice: one row per workout and exercise). The Smart program keeps using /api/body-plan/session
// to adapt; this is the place to LOOK at your lifts over time, whichever plan they came from.
const express = require('express');
const LiftEntry = require('../models/LiftEntry');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { summarize, MODES } = require('../lib/liftSummary');
const { addDays, todayUtc } = require('../lib/dates');

const router = express.Router();
router.use(requireAuth);

const MAX_EXERCISES = 40, MAX_SETS = 20;
const clamp = (x, lo, hi, dp = 2) => { const n = Number(x); if (!Number.isFinite(n)) return 0; const f = 10 ** dp; return Math.min(hi, Math.max(lo, Math.round(n * f) / f)); };
const cleanRpe = (x) => { const n = Math.round(Number(x)); return n >= 1 && n <= 10 ? n : null; };
const text = (x, max) => String(x == null ? '' : x).trim().slice(0, max);
const safeId = (x) => text(x, 80).replace(/[^\w.:-]/g, '-');

/** One exercise as it is stored: sets trimmed, totals worked out again so a bad client cannot store nonsense. */
function cleanExercise(e, ctx) {
  const id = safeId(e && e.id);
  if (!id) return null;
  const mode = MODES.includes(e.mode) ? e.mode : 'total';
  const sets = (Array.isArray(e.sets) ? e.sets : []).slice(0, MAX_SETS).map((x) => ({
    reps: clamp(x && x.reps, 0, 1000, 0),
    seconds: clamp(x && x.seconds, 0, 7200, 0),
    weightKg: clamp(x && x.weightKg, 0, 1000),
    totalKg: clamp(x && x.totalKg, 0, 3000),
    rpe: cleanRpe(x && x.rpe),
  })).filter((x) => x.reps > 0 || x.seconds > 0);
  if (!sets.length) return null;
  const topKg = mode === 'assist' ? Math.min(...sets.map((s) => s.weightKg)) : Math.max(...sets.map((s) => s.weightKg));
  const volumeKg = Math.round(sets.reduce((n, s) => n + s.totalKg * s.reps, 0));
  return {
    clientId: `${ctx.sessionId}:${id}`.slice(0, 140), sessionId: ctx.sessionId, date: ctx.date, planId: ctx.planId, title: ctx.title,
    exerciseId: id, name: text(e.name, 120), cat: text(e.cat, 30).toLowerCase(),
    muscles: (Array.isArray(e.muscles) ? e.muscles : []).slice(0, 24).map((m) => text(m, 30)).filter(Boolean),
    mode, hands: mode === 'each' ? Math.min(2, Math.max(1, Math.round(Number(e.hands) || 2))) : 0, timed: !!e.timed,
    bodyKg: ctx.bodyKg, sets, topKg, volumeKg,
  };
}

// POST /api/lifts   { sessionId, date, planId?, title?, bodyKg?, exercises: [{ id, name, cat?, muscles?, mode, hands?, timed?, sets: [{ reps, seconds?, weightKg, totalKg, rpe? }] }] }
router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const date = v.date(b.date);
  if (date > addDays(todayUtc(), 1)) throw new HttpError(400, 'A workout cannot be in the future');
  const sessionId = text(b.sessionId, 80).replace(/[^\w.:-]/g, '-');
  if (!sessionId) throw new HttpError(400, 'sessionId is required');
  const ctx = { sessionId, date, planId: text(b.planId, 60), title: v.string(b.title, 'title', { max: 80 }), bodyKg: clamp(b.bodyKg, 0, 500) };
  const rows = (Array.isArray(b.exercises) ? b.exercises : []).slice(0, MAX_EXERCISES).map((e) => cleanExercise(e || {}, ctx)).filter(Boolean);
  if (!rows.length) return res.json({ success: true, saved: 0 });
  await LiftEntry.bulkWrite(rows.map((row) => ({
    updateOne: { filter: { userId: req.user.id, clientId: row.clientId }, update: { $set: { ...row, userId: req.user.id } }, upsert: true },
  })), { ordered: false });
  res.status(201).json({ success: true, saved: rows.length });
}));

// GET /api/lifts/summary?days=180   one line per exercise: last time, best, trend, a short series for a chart
router.get('/summary', wrap(async (req, res) => {
  const days = Math.round(v.number(req.query.days, 'days', { min: 7, max: 730, required: false, def: 180 }));
  const today = req.query.date ? v.date(req.query.date) : todayUtc();
  const rows = await LiftEntry.find({ userId: req.user.id, date: { $gte: addDays(today, -days), $lte: today } })
    .select('exerciseId name cat muscles mode hands date sets volumeKg').sort({ date: -1 }).limit(4000).lean();
  res.json({ success: true, days, exercises: summarize(rows) });
}));

// GET /api/lifts?exercise=<id>&days=365   every stored entry of ONE exercise, newest first (the table under a chart)
router.get('/', wrap(async (req, res) => {
  const exercise = safeId(req.query.exercise);
  if (!exercise) throw new HttpError(400, 'exercise is required');
  const days = Math.round(v.number(req.query.days, 'days', { min: 7, max: 1095, required: false, def: 365 }));
  const today = req.query.date ? v.date(req.query.date) : todayUtc();
  const rows = await LiftEntry.find({ userId: req.user.id, exerciseId: exercise, date: { $gte: addDays(today, -days), $lte: today } }).sort({ date: -1, createdAt: -1 }).limit(200).lean();
  res.json({ success: true, entries: rows });
}));

// DELETE /api/lifts/session/:sessionId   the workout was deleted in the app: its lifts go too (safe to repeat)
router.delete('/session/:sessionId', wrap(async (req, res) => {
  const sessionId = text(req.params.sessionId, 80).replace(/[^\w.:-]/g, '-');
  if (!sessionId) throw new HttpError(400, 'sessionId is required');
  const r = await LiftEntry.deleteMany({ userId: req.user.id, sessionId });
  res.json({ success: true, deleted: r.deletedCount || 0 });
}));

module.exports = router;
