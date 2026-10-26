// Strength and training: progression, programs ("training arcs"), today's suggestion, guided sessions, quick workouts.
// The rules live in lib/strength, lib/programs, lib/workoutSuggest and lib/guided; this file only reads and writes data.
const express = require('express');
const Activity = require('../models/Activity');
const ActivityLog = require('../models/ActivityLog');
const HealthLog = require('../models/HealthLog');
const Profile = require('../models/Profile');
const TrainingProgram = require('../models/TrainingProgram');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const S = require('../lib/strength');
const P = require('../lib/programs');
const G = require('../lib/guided');
const { suggestWorkout } = require('../lib/workoutSuggest');
const { buildLogs } = require('../lib/workoutBuild');
const { recordsBroken } = require('../lib/trainingData');
const { computeRecords } = require('../lib/records');

const router = express.Router();
router.use(requireAuth);

const profileOf = (userId) => Profile.findOne({ userId }).select('currentWeightKg goals').lean();
const weightOf = (p) => Number(p?.currentWeightKg) || 70;
const catalogueMap = async () => new Map((await Activity.find({ muscles: { $exists: true, $ne: [] } }).select('name muscles').lean()).map((a) => [a.name, a]));

// Everything the strength screen needs in one call: power level, lifts, weekly muscle volume, deload hints.
router.get('/overview', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  const from = S.addDays(date, -90);
  const logs = await ActivityLog.find({ userId: req.user.id, date: { $gte: from, $lte: date } }).select('activityName category date sets').lean();
  const cat = await catalogueMap();
  const records = computeRecords(logs);
  const lifts = records.filter((r) => r.best1RM > 0).slice(0, 30).map((r) => {
    const history = S.exerciseHistory(logs, r.activityName);
    return { ...r, deload: S.deloadStatus(history, date).status, sessions: history.length };
  });
  res.json({
    success: true, date, powerLevel: S.powerLevel(records), lifts,
    muscleVolume: S.weeklyMuscleVolume(logs, date, cat), safety: S.SAFETY_NOTE, formulas: S.FORMULAS,
  });
}));

// One lift: history, both 1RM estimates with their formulas, beat-last-time hint, deload status.
router.get('/progress', wrap(async (req, res) => {
  const name = v.string(req.query.name, 'name', { max: 120, required: true });
  const date = v.date(req.query.date);
  const logs = await ActivityLog.find({ userId: req.user.id, activityName: name, date: { $lte: date } }).sort({ date: -1 }).limit(200).select('activityName date sets').lean();
  const history = S.exerciseHistory(logs, name);
  const last = history.length ? logs.find((l) => l.date === history[history.length - 1].date && (l.sets || []).length) : null;
  const lastSets = last ? last.sets : [];
  const best = history.reduce((b, h) => (h.best1RM > (b?.best1RM || 0) ? h : b), null);
  const recentBestKg = history.slice(-4).reduce((m, h) => Math.max(m, h.bestWeightKg), 0);
  res.json({
    success: true, name, history: history.slice(-30),
    best: best ? { ...best, estimate: S.estimate1RM(best.bestWeightKg, best.bestReps) } : null,
    beat: S.beatLastTime(lastSets), lastSets, recentBestKg, maxJumpPct: S.MAX_JUMP_PCT,
    deload: S.deloadStatus(history, date), safety: S.SAFETY_NOTE,
  });
}));

// Last session's sets and the "beat last time" hint for several exercises at once (prefills workout mode).
router.get('/last-sets', wrap(async (req, res) => {
  const names = String(req.query.names || '').split('|').map((n) => n.trim()).filter(Boolean).slice(0, 30);
  const date = v.date(req.query.date);
  const out = {};
  await Promise.all(names.map(async (name) => {
    const last = await ActivityLog.findOne({ userId: req.user.id, activityName: name, date: { $lte: date }, 'sets.0': { $exists: true } }).sort({ date: -1, createdAt: -1 }).select('date sets').lean();
    const recent = await ActivityLog.find({ userId: req.user.id, activityName: name, date: { $lte: date }, 'sets.0': { $exists: true } }).sort({ date: -1 }).limit(8).select('date sets').lean();
    out[name] = last ? { date: last.date, sets: last.sets.map((x) => ({ reps: x.reps, weightKg: x.weightKg })), beat: S.beatLastTime(last.sets), recentBestKg: recent.reduce((m, l) => Math.max(m, ...l.sets.map((x) => x.weightKg || 0)), 0) } : null;
  }));
  res.json({ success: true, lastSets: out, maxJumpPct: S.MAX_JUMP_PCT, safety: S.SAFETY_NOTE });
}));

// Today's suggested workout, with reasons.
router.get('/suggest', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  const minutes = P_minutes(req.query.minutes);
  const equipment = req.query.equipment === 'gym' ? 'gym' : 'none';
  const yest = S.addDays(date, -1);
  const [logs, health, profile, active] = await Promise.all([
    ActivityLog.find({ userId: req.user.id, date: { $gte: S.addDays(date, -28), $lte: date } }).select('activityName category date sets durationMinutes').lean(),
    HealthLog.find({ userId: req.user.id, type: { $in: ['sleep', 'steps'] }, date: { $gte: yest, $lte: date } }).select('type date value').lean(),
    profileOf(req.user.id), TrainingProgram.findOne({ userId: req.user.id }).lean(),
  ]);
  const cat = await catalogueMap();
  const sleepRow = health.filter((h) => h.type === 'sleep').sort((a, b) => b.date.localeCompare(a.date))[0];
  const stepsRow = health.find((h) => h.type === 'steps' && h.date === yest);
  const yLogs = logs.filter((l) => l.date === yest);
  const yesterday = yLogs.length ? { minutes: yLogs.reduce((t, l) => t + (l.durationMinutes || 0), 0), strengthSets: yLogs.reduce((t, l) => t + (l.sets || []).length, 0) } : null;
  const history = logs.filter((l) => (l.sets || []).length);
  const worst = ['ok', 'watch', 'deload'][Math.max(0, ...[...new Set(history.map((l) => l.activityName))].map((n) => ['ok', 'watch', 'deload'].indexOf(S.deloadStatus(S.exerciseHistory(history, n), date).status)))];
  let programSession = null;
  if (active) {
    const prog = P.getProgram(active.programId);
    const week = prog ? P.weekOn(active.startDate, date, prog.weeksCount) : 0;
    if (prog && week >= 1 && week <= prog.weeksCount) programSession = P.nextSession(prog, week, active.done);
  }
  const suggestion = suggestWorkout({
    minutes, equipment, sleepHours: sleepRow ? sleepRow.value : null, yesterday, yesterdaySteps: stepsRow ? stepsRow.value : null,
    daysSince: S.daysSinceTrained(history, date, cat), weekly: S.weeklyMuscleVolume(history, date, cat), programSession, deload: worst,
  });
  res.json({ success: true, suggestion, safety: S.SAFETY_NOTE });
}));

function P_minutes(raw) { const n = Number(raw); return n >= 40 ? 40 : n >= 20 ? 20 : 10; }

// ---- Programs ("training arcs") ----
router.get('/programs', wrap(async (req, res) => {
  res.json({ success: true, programs: P.listPrograms() });
}));

async function activeState(userId, date) {
  const a = await TrainingProgram.findOne({ userId }).lean();
  if (!a) return null;
  const prog = P.getProgram(a.programId);
  if (!prog) return null;
  const profile = await profileOf(userId);
  const week = P.weekOn(a.startDate, date, prog.weeksCount);
  const cur = prog.weeks[Math.min(Math.max(week, 1), prog.weeksCount) - 1];
  return {
    programId: a.programId, title: prog.title, startDate: a.startDate, week, weeksCount: prog.weeksCount,
    finished: week > prog.weeksCount, notStarted: week < 1,
    episode: cur.episode, rest: cur.rest, sessions: cur.sessions, done: a.done,
    next: week >= 1 && week <= prog.weeksCount ? P.nextSession(prog, week, a.done) : null,
    stepGoal: P.stepGoalForWeek(Math.max(1, Math.min(week, prog.weeksCount)), a.baseSteps, profile?.goals?.stepsTarget),
    stepCap: profile?.goals?.stepsTarget || 10000, baseSteps: a.baseSteps,
  };
}

router.get('/programs/active', wrap(async (req, res) => {
  res.json({ success: true, active: await activeState(req.user.id, v.date(req.query.date)) });
}));

router.get('/programs/:id', wrap(async (req, res) => {
  const p = P.getProgram(req.params.id);
  if (!p) throw new HttpError(404, 'Program not found');
  res.json({ success: true, program: p });
}));

router.post('/programs/start', wrap(async (req, res) => {
  const prog = P.getProgram(String(req.body.programId || ''));
  if (!prog) throw new HttpError(404, 'Program not found');
  const date = v.date(req.body.date);
  const steps = await HealthLog.find({ userId: req.user.id, type: 'steps', date: { $gte: S.addDays(date, -14), $lte: date } }).select('value').lean();
  const baseSteps = P.baseStepsFrom(steps.map((s) => s.value));
  await TrainingProgram.findOneAndUpdate({ userId: req.user.id }, { programId: prog.id, startDate: date, baseSteps, done: [] }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.status(201).json({ success: true, active: await activeState(req.user.id, date) });
}));

router.delete('/programs/active', wrap(async (req, res) => {
  await TrainingProgram.deleteOne({ userId: req.user.id });
  res.json({ success: true });
}));

// Mark a program session done (called after the workout is saved).
router.post('/programs/done', wrap(async (req, res) => {
  const date = v.date(req.body.date);
  const week = Math.round(v.number(req.body.week, 'week', { min: 1, max: 12 }));
  const day = Math.round(v.number(req.body.day, 'day', { min: 1, max: 7 }));
  const a = await TrainingProgram.findOne({ userId: req.user.id });
  if (!a) throw new HttpError(404, 'No active program');
  if (!a.done.some((d) => d.week === week && d.day === day)) a.done.push({ week, day, date });
  await a.save();
  res.json({ success: true, active: await activeState(req.user.id, date) });
}));

// ---- Quick workout (suggestion, program session, or any list of exercises) ----
router.post('/workout/log', wrap(async (req, res) => {
  const date = v.date(req.body.date);
  const clientId = v.clientId(req.body.clientId);
  const name = v.string(req.body.name, 'name', { max: 80 }) || 'Workout';
  if (clientId) {
    const existing = await ActivityLog.find({ userId: req.user.id, clientId: new RegExp(`^${v.escapeRegex(clientId)}#`) }).lean();
    if (existing.length) return res.json({ success: true, logs: existing, records: [], duplicate: true });
  }
  const list = Array.isArray(req.body.exercises) ? req.body.exercises.slice(0, 30) : [];
  if (!list.length) throw new HttpError(400, 'Add at least one exercise');
  const acts = await Activity.find({ name: { $in: list.map((e) => String(e.activityName || '')) } }).lean();
  const byName = new Map(acts.map((a) => [a.name, a]));
  const items = list.map((e) => {
    const a = byName.get(String(e.activityName));
    if (!a) throw new HttpError(404, `Unknown exercise: ${String(e.activityName).slice(0, 60)}`);
    return { activityId: a._id, activityName: a.name, category: a.category, met: a.met, durationMinutes: e.durationMinutes, sets: e.sets };
  });
  const weight = weightOf(await profileOf(req.user.id));
  const built = buildLogs({ userId: req.user.id, items, date, weightKg: weight, label: `Workout: ${name}`, clientId });
  const records = await recordsBroken(req.user.id, built.map((b) => ({ activityName: b.activityName, sets: b.sets })));
  const logs = await ActivityLog.insertMany(built);
  res.status(201).json({
    success: true, logs, records,
    totals: { minutes: logs.reduce((s, l) => s + l.durationMinutes, 0), caloriesBurned: Math.round(logs.reduce((s, l) => s + l.caloriesBurned, 0)) },
  });
}));

// ---- Guided meditate / stretch ----
router.get('/guided', wrap(async (req, res) => {
  res.json({ success: true, session: G.buildGuided(req.query.kind, req.query.minutes) });
}));

router.post('/guided/log', wrap(async (req, res) => {
  const kind = req.body.kind === 'stretch' ? 'stretch' : 'meditate';
  const date = v.date(req.body.date);
  const clientId = v.clientId(req.body.clientId);
  const minutes = G.clampMinutes(req.body.minutes);
  if (clientId) {
    const existing = await ActivityLog.findOne({ userId: req.user.id, clientId }).lean();
    if (existing) return res.json({ success: true, log: existing, duplicate: true });
  }
  const a = await Activity.findOne({ name: G.ACTIVITY_NAME[kind] }).lean();
  if (!a) throw new HttpError(404, 'Activity not found');
  const weight = weightOf(await profileOf(req.user.id));
  const log = await ActivityLog.create({
    userId: req.user.id, activityId: a._id, date, activityName: a.name, category: a.category, durationMinutes: minutes, weightKg: weight,
    met: a.met, caloriesBurned: (a.met * 3.5 * weight / 200) * minutes, notes: `Guided ${kind}`, clientId,
  });
  res.status(201).json({ success: true, log });
}));

module.exports = router;
