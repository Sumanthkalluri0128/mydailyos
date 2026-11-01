// Body plan: GET builds the plan for the body goal the person picked (or previews another one); POST /apply saves that goal so every
// calorie / macro / quest number in the app follows it.
const express = require('express');
const Profile = require('../models/Profile');
const HealthLog = require('../models/HealthLog');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const v = require('../lib/validate');
const { bodyPlan, TYPES, TYPE_IDS } = require('../lib/bodyPlan');

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

async function build(userId, wanted) {
  const [profile, measures] = await Promise.all([Profile.findOne({ userId }).lean(), latestMeasures(userId)]);
  const chosen = profile?.goals?.bodyType || '';
  const type = wanted || chosen;
  return { profile: profile || {}, measures, chosen, plan: bodyPlan({ profile: profile || {}, type, measures }) };
}

router.get('/', wrap(async (req, res) => {
  const wanted = req.query.type ? v.oneOf(req.query.type, 'type', TYPE_IDS) : '';
  const { measures, chosen, plan } = await build(req.user.id, wanted);
  res.json({ success: true, types: typeList(), chosen, measures, plan });
}));

router.post('/apply', wrap(async (req, res) => {
  const type = v.oneOf(req.body?.type, 'type', TYPE_IDS);
  const { profile, measures, plan } = await build(req.user.id, type);
  if (!plan.ready) return res.status(400).json({ success: false, message: plan.message, plan });
  if (plan.safety.some((s) => s.id === 'underweight')) {
    // Underweight: save the body goal for macros but never set a weight-loss target.
    await Profile.updateOne({ userId: req.user.id }, { $set: { 'goals.bodyType': type, 'goals.targetWeightKg': null, 'goals.proteinTarget': null, 'goals.calorieMode': 'auto' } });
    return res.json({ success: true, applied: { bodyType: type, targetWeightKg: null }, measures, plan });
  }
  const set = {
    'goals.bodyType': type,
    'goals.calorieMode': 'auto',
    'goals.proteinTarget': null, // automatic: follows weight and body goal
    'goals.targetWeightKg': plan.mode === 'lose' ? plan.goal.targetWeightKg : null,
    'goals.stepsTarget': plan.steps,
  };
  if (plan.mode === 'lose') set['goals.weeklyPaceKg'] = plan.goal.weeklyPaceKg;
  await Profile.updateOne({ userId: req.user.id }, { $set: set });
  res.json({ success: true, applied: { bodyType: type, targetWeightKg: set['goals.targetWeightKg'], weeklyPaceKg: set['goals.weeklyPaceKg'] ?? null, stepsTarget: plan.steps }, measures, plan });
}));

module.exports = router;
