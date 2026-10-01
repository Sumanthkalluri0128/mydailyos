const express = require('express');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const ACTIVITY = ['sedentary', 'light', 'moderate', 'very_active', 'extra_active'];

function parseUpdate(body = {}) {
  const set = {};
  if (body.name !== undefined) set.name = v.string(body.name, 'name', { max: 100 });
  if (body.age !== undefined) set.age = v.nullableNumber(body.age, 'age', { min: 1, max: 120 });
  if (body.sex !== undefined) set.sex = v.oneOf(body.sex, 'sex', ['male', 'female', 'other', ''], '');
  if (body.heightCm !== undefined) set.heightCm = v.nullableNumber(body.heightCm, 'heightCm', { min: 50, max: 250 });
  if (body.currentWeightKg !== undefined) set.currentWeightKg = v.nullableNumber(body.currentWeightKg, 'currentWeightKg', { min: 1, max: 700 });
  if (body.activityLevel !== undefined) set.activityLevel = v.oneOf(body.activityLevel, 'activityLevel', ACTIVITY);
  if (body.onboarded !== undefined) set.onboarded = v.bool(body.onboarded, 'onboarded');

  const g = body.goals;
  if (g && typeof g === 'object') {
    if (g.calorieTarget !== undefined) set['goals.calorieTarget'] = v.number(g.calorieTarget, 'calorieTarget', { min: 500, max: 20000 });
    if (g.proteinTarget !== undefined) set['goals.proteinTarget'] = v.number(g.proteinTarget, 'proteinTarget', { min: 1, max: 1000 });
    if (g.waterTargetMl !== undefined) set['goals.waterTargetMl'] = v.number(g.waterTargetMl, 'waterTargetMl', { min: 250, max: 20000 });
    if (g.stepsTarget !== undefined) set['goals.stepsTarget'] = v.number(g.stepsTarget, 'stepsTarget', { min: 1, max: 200000 });
    if (g.exerciseMinutesTarget !== undefined) set['goals.exerciseMinutesTarget'] = v.number(g.exerciseMinutesTarget, 'exerciseMinutesTarget', { min: 1, max: 1440 });
    if (g.targetWeightKg !== undefined) set['goals.targetWeightKg'] = v.nullableNumber(g.targetWeightKg, 'targetWeightKg', { min: 1, max: 700 });
  }
  const u = body.units;
  if (u && typeof u === 'object') {
    if (u.weight !== undefined) set['units.weight'] = v.oneOf(u.weight, 'units.weight', ['kg', 'lb']);
    if (u.energy !== undefined) set['units.energy'] = v.oneOf(u.energy, 'units.energy', ['kcal', 'kJ']);
    if (u.volume !== undefined) set['units.volume'] = v.oneOf(u.volume, 'units.volume', ['ml', 'oz']);
  }
  return set;
}

router.get('/', wrap(async (req, res) => {
  const profile = (await Profile.findOne({ userId: req.user.id })) || (await Profile.create({ userId: req.user.id }));
  res.json({ success: true, profile });
}));

router.patch('/', wrap(async (req, res) => {
  const set = parseUpdate(req.body);
  const profile = await Profile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: set },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  res.json({ success: true, profile });
}));

module.exports = router;
module.exports.parseUpdate = parseUpdate;
