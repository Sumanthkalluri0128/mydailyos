// Body plan: GET builds the plan for the body goal the person picked (or previews another one); POST /apply saves that goal so every
// calorie / macro / quest number in the app follows it. Both take the person's training setup (place, level, days, minutes, equipment,
// limits, focus): GET previews it without saving, POST /apply saves it with the body goal.
const express = require('express');
const Profile = require('../models/Profile');
const HealthLog = require('../models/HealthLog');
const WeightLog = require('../models/WeightLog');
const ActivityLog = require('../models/ActivityLog');
const Activity = require('../models/Activity');
const BodyPlanSession = require('../models/BodyPlanSession');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { bodyPlan, TYPES, TYPE_IDS } = require('../lib/bodyPlan');
const { sanitizePrefs, TRAINING_OPTIONS, maxDaysFor } = require('../lib/trainingPlan');
const { adapt, applyAdapt, sessionHighlights } = require('../lib/bodyPlanAdapt');
const { addDays, todayUtc } = require('../lib/dates');

const router = express.Router();
router.use(requireAuth);

const TAPE = ['waist', 'neck', 'hips', 'chest', 'arm', 'thigh'];

// Latest reading of each tape measurement (cm).
async function latestMeasures(userId) {
  const rows = await HealthLog.find({ userId, type: { $in: TAPE } }).sort({ date: -1, createdAt: -1 }).limit(120).lean();
  const out = {};
  for (const r of rows) if (out[r.type] === undefined) out[r.type] = r.value;
  return out;
}

const typeList = () => TYPE_IDS.map((id) => ({ id, label: TYPES[id].label, blurb: TYPES[id].blurb }));

// Saved setup, with any preview values from the query on top (a query key that is present replaces the saved one, even when empty).
const PREF_KEYS = ['place', 'level', 'days', 'minutes', 'equipment', 'limits', 'focus'];
function prefsFor(profile, override) {
  const saved = profile?.training ? { ...profile.training } : {};
  if (override) for (const k of PREF_KEYS) if (override[k] !== undefined) saved[k] = override[k];
  return sanitizePrefs(saved);
}

// What the person actually did, for the adaptive plan: 26 weeks of Body plan sessions, other workouts, weigh-ins and waist readings.
async function history(userId, today) {
  const from = addDays(today, -182), fromW = addDays(today, -70);
  const [sessions, activity, weights, waists] = await Promise.all([
    BodyPlanSession.find({ userId, date: { $gte: from, $lte: today } }).sort({ date: 1, createdAt: 1 }).limit(500).lean(),
    ActivityLog.find({ userId, date: { $gte: from, $lte: today } }).select('date category durationMinutes sets clientId').limit(1500).lean(),
    WeightLog.find({ userId, date: { $gte: fromW, $lte: today } }).select('date weightKg').sort({ date: 1 }).limit(200).lean(),
    HealthLog.find({ userId, type: 'waist', date: { $gte: fromW, $lte: today } }).select('date value').sort({ date: 1 }).limit(60).lean(),
  ]);
  return { sessions, activity, weights, waists };
}

async function build(userId, wanted, override, date) {
  const today = date || todayUtc();
  const [profile, measures, hist] = await Promise.all([Profile.findOne({ userId }).lean(), latestMeasures(userId), history(userId, today)]);
  const chosen = profile?.goals?.bodyType || '';
  const type = wanted || chosen;
  const prefs = prefsFor(profile, override);
  const plan = bodyPlan({ profile: profile || {}, type, measures, prefs });
  if (plan.ready) {
    // Adapt to what was really done. Never throws into the plan: if anything is odd, the person still gets the base program.
    try {
      const a = adapt({
        program: plan.training.program, prefs: plan.training.prefs, mode: plan.mode, today,
        startedOn: profile?.goals?.bodyPlanStartedOn || '', paceKgPerWeek: plan.goal.weeklyPaceKg,
        maxDays: maxDaysFor(plan.training.prefs.level, profile?.age), ...hist,
      });
      if (a) { plan.training.program = applyAdapt(plan.training.program, a); plan.adapt = a; }
    } catch (e) { plan.adaptError = 'Your plan could not be adjusted just now, so the starting program is shown.'; }
  }
  return { profile: profile || {}, measures, chosen, plan, hist };
}

router.get('/', wrap(async (req, res) => {
  const wanted = req.query.type ? v.oneOf(req.query.type, 'type', TYPE_IDS) : '';
  const override = {};
  for (const k of PREF_KEYS) if (req.query[k] !== undefined) override[k] = req.query[k];
  const date = req.query.date ? v.date(req.query.date) : undefined;
  const { measures, chosen, plan } = await build(req.user.id, wanted, override, date);
  res.json({ success: true, types: typeList(), chosen, measures, plan, trainingOptions: TRAINING_OPTIONS });
}));

router.post('/apply', wrap(async (req, res) => {
  const type = v.oneOf(req.body?.type, 'type', TYPE_IDS);
  const sentTraining = req.body?.training && typeof req.body.training === 'object' ? sanitizePrefs(req.body.training) : null;
  const date = req.body?.date ? v.date(req.body.date) : undefined;
  const { profile, measures, plan } = await build(req.user.id, type, sentTraining || undefined, date);
  if (!plan.ready) return res.status(400).json({ success: false, message: plan.message, plan });
  const trainingSet = sentTraining ? { training: sentTraining } : {};
  if (!profile?.goals?.bodyPlanStartedOn) trainingSet['goals.bodyPlanStartedOn'] = date || todayUtc(); // week counting starts the day the plan is first saved
  if (plan.safety.some((s) => s.id === 'underweight')) {
    // Underweight: save the body goal for macros but never set a weight-loss target.
    await Profile.updateOne({ userId: req.user.id }, { $set: { 'goals.bodyType': type, 'goals.targetWeightKg': null, 'goals.proteinTarget': null, 'goals.calorieMode': 'auto', ...trainingSet } });
    return res.json({ success: true, applied: { bodyType: type, targetWeightKg: null, training: !!sentTraining }, measures, plan });
  }
  const set = {
    'goals.bodyType': type,
    'goals.calorieMode': 'auto',
    'goals.proteinTarget': null, // automatic: follows weight and body goal
    'goals.targetWeightKg': plan.mode === 'lose' ? plan.goal.targetWeightKg : null,
    'goals.stepsTarget': plan.steps,
    ...trainingSet,
  };
  if (plan.mode === 'lose') set['goals.weeklyPaceKg'] = plan.goal.weeklyPaceKg;
  await Profile.updateOne({ userId: req.user.id }, { $set: set });
  res.json({ success: true, applied: { bodyType: type, targetWeightKg: set['goals.targetWeightKg'], weeklyPaceKg: set['goals.weeklyPaceKg'] ?? null, stepsTarget: plan.steps, training: !!sentTraining }, measures, plan });
}));

// ---------------------------------------------------------------- sessions: what the person did (the plan adapts to these)
const FEEL = ['', 'easy', 'good', 'hard'];
const REASONS = ['', 'tired', 'busy', 'sick', 'pain', 'travel', 'rest'];
const PAIN = ['knee', 'back', 'shoulder', 'wrist', 'elbow', 'other', 'dizzy'];
const WAYS = ['gym', 'home', 'quick'];
const PHASES = ['', 'learn', 'build', 'easy', 'back'];

/** Clean what the phone or browser sent. Unknown values are dropped; numbers are clamped; nothing here can write outside the schema. */
function cleanExercises(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 24).map((e) => {
    const id = String(e?.id || '').slice(0, 60);
    if (!/^[\w.-]+$/.test(id)) return null;
    const sets = (Array.isArray(e.sets) ? e.sets : []).slice(0, 12).map((x) => ({
      reps: Math.min(1000, Math.max(0, Math.round(Number(x?.reps) || 0))),
      weightKg: Math.min(1000, Math.max(0, Math.round((Number(x?.weightKg) || 0) * 100) / 100)),
      seconds: Math.min(7200, Math.max(0, Math.round(Number(x?.seconds) || 0))),
    })).filter((x) => x.reps > 0 || x.seconds > 0);
    return { id, name: String(e.name || '').slice(0, 120), slot: String(e.slot || '').slice(0, 20), done: e.done !== false && sets.length > 0, sets };
  }).filter(Boolean);
}

router.post('/session', wrap(async (req, res) => {
  const b = req.body || {};
  const date = v.date(b.date);
  const asOf = b.today ? v.date(b.today, 'today') : date >= todayUtc() ? date : undefined; // the person's own "today", for working out the new plan
  if (date > addDays(todayUtc(), 1)) throw new HttpError(400, 'A session cannot be in the future');
  const clientId = v.clientId(b.clientId);
  if (clientId) {
    const existing = await BodyPlanSession.findOne({ userId: req.user.id, clientId }).lean();
    if (existing) { const built = await build(req.user.id, '', undefined, asOf); return res.json({ success: true, duplicate: true, session: existing, highlights: [], plan: built.plan }); }
  }
  const status = v.oneOf(b.status, 'status', ['done', 'partial', 'skipped']);
  const exercises = status === 'skipped' ? [] : cleanExercises(b.exercises);
  if (status !== 'skipped' && !exercises.some((e) => e.done)) throw new HttpError(400, 'Add at least one set, or choose Skip today');
  const pain = [...new Set((Array.isArray(b.pain) ? b.pain : []).map(String).filter((x) => PAIN.includes(x)))];
  const doc = {
    userId: req.user.id, clientId, date, sessionId: String(b.sessionId || '').slice(0, 4), title: v.string(b.title, 'title', { max: 80 }),
    way: v.oneOf(b.way, 'way', WAYS, 'gym'), status,
    reason: status === 'skipped' ? v.oneOf(b.reason, 'reason', REASONS, '') : '',
    feel: status === 'skipped' ? '' : v.oneOf(b.feel, 'feel', FEEL, ''),
    pain: status === 'skipped' ? (b.reason === 'pain' ? ['other'] : []) : pain,
    phase: v.oneOf(b.phase, 'phase', PHASES, ''),
    minutes: Math.min(600, Math.max(0, Math.round(Number(b.minutes) || 0))),
    exercises, notes: v.string(b.notes, 'notes', { max: 300 }),
  };
  // Earlier sessions first (for "heaviest yet"), then save.
  const prior = await BodyPlanSession.find({ userId: req.user.id, date: { $lte: date } }).sort({ date: -1 }).limit(120).lean();
  const saved = await BodyPlanSession.create(doc);
  const highlights = status === 'skipped' ? [] : sessionHighlights(prior, { ...doc, exercises });

  // Count it in the day's exercise totals too (best effort: the session is already saved if this fails).
  if (status !== 'skipped') {
    try {
      const act = await Activity.findOne({ name: 'Strength Training' }).lean();
      const prof = await Profile.findOne({ userId: req.user.id }).select('currentWeightKg').lean();
      const kg = Number(prof?.currentWeightKg) || 70;
      const setsDone = exercises.reduce((t, e) => t + e.sets.length, 0);
      const minutes = Math.max(1, doc.minutes || Math.round(setsDone * 1.5));
      if (act) await ActivityLog.create({ userId: req.user.id, clientId: clientId ? `bp-${clientId}` : undefined, activityId: act._id, date, activityName: act.name, category: act.category, durationMinutes: minutes, weightKg: kg, met: act.met, caloriesBurned: (act.met * 3.5 * kg / 200) * minutes, notes: `Body plan: ${doc.title || 'workout'}` });
    } catch (e) { /* the session itself is saved; only the calorie entry is skipped */ }
  }
  const built = await build(req.user.id, '', undefined, asOf);
  res.status(201).json({ success: true, session: saved, highlights, plan: built.plan });
}));

router.get('/sessions', wrap(async (req, res) => {
  const days = Math.round(v.number(req.query.days, 'days', { min: 1, max: 182, required: false, def: 56 }));
  const today = req.query.date ? v.date(req.query.date) : todayUtc();
  const rows = await BodyPlanSession.find({ userId: req.user.id, date: { $gte: addDays(today, -days), $lte: today } }).sort({ date: -1, createdAt: -1 }).limit(120).lean();
  res.json({ success: true, sessions: rows });
}));

router.delete('/session/:id', wrap(async (req, res) => {
  const id = v.objectId(req.params.id);
  const row = await BodyPlanSession.findOneAndDelete({ _id: id, userId: req.user.id }).lean();
  if (!row) throw new HttpError(404, 'Session not found');
  if (row.clientId) await ActivityLog.deleteMany({ userId: req.user.id, clientId: `bp-${row.clientId}` });
  const built = await build(req.user.id, '', undefined, req.query.date ? v.date(req.query.date) : undefined);
  res.json({ success: true, plan: built.plan });
}));

module.exports = router;
