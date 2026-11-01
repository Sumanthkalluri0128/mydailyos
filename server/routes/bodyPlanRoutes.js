// Body plan: GET builds the plan for the body goal the person picked (or previews another one); POST /apply saves that goal so every
// calorie / macro / quest number in the app follows it. Both take the person's training setup (place, level, days, minutes, equipment,
// limits, focus): GET previews it without saving, POST /apply saves it with the body goal.
const express = require('express');
const Profile = require('../models/Profile');
const HealthLog = require('../models/HealthLog');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const v = require('../lib/validate');
const { bodyPlan, TYPES, TYPE_IDS } = require('../lib/bodyPlan');
const { sanitizePrefs, TRAINING_OPTIONS } = require('../lib/trainingPlan');

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

async function build(userId, wanted, override) {
  const [profile, measures] = await Promise.all([Profile.findOne({ userId }).lean(), latestMeasures(userId)]);
  const chosen = profile?.goals?.bodyType || '';
  const type = wanted || chosen;
  const prefs = prefsFor(profile, override);
  return { profile: profile || {}, measures, chosen, plan: bodyPlan({ profile: profile || {}, type, measures, prefs }) };
}

router.get('/', wrap(async (req, res) => {
  const wanted = req.query.type ? v.oneOf(req.query.type, 'type', TYPE_IDS) : '';
  const override = {};
  for (const k of PREF_KEYS) if (req.query[k] !== undefined) override[k] = req.query[k];
  const { measures, chosen, plan } = await build(req.user.id, wanted, override);
  res.json({ success: true, types: typeList(), chosen, measures, plan, trainingOptions: TRAINING_OPTIONS });
}));

router.post('/apply', wrap(async (req, res) => {
  const type = v.oneOf(req.body?.type, 'type', TYPE_IDS);
  const sentTraining = req.body?.training && typeof req.body.training === 'object' ? sanitizePrefs(req.body.training) : null;
  const { profile, measures, plan } = await build(req.user.id, type, sentTraining || undefined);
  if (!plan.ready) return res.status(400).json({ success: false, message: plan.message, plan });
  const trainingSet = sentTraining ? { training: sentTraining } : {};
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

module.exports = router;
