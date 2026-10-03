// Steps -> calories. ~0.0005 kcal per step per kg of body weight (10,000 steps at 70 kg ≈ 350 kcal).
const KCAL_PER_STEP_PER_KG = 0.0005;
const HealthLog = require('../models/HealthLog');
const Profile = require('../models/Profile');

const stepCalories = (steps, weightKg) => Math.round(Math.max(0, Number(steps) || 0) * (Number(weightKg) || 70) * KCAL_PER_STEP_PER_KG);
const stepDistanceKm = (steps) => Math.round((Math.max(0, Number(steps) || 0) * 0.762) / 10) / 100;

async function stepsByDate(userId, from, to) {
  const rows = await HealthLog.find({ userId, type: 'steps', date: { $gte: from, $lte: to } }).select('date value').lean();
  return new Map(rows.map((r) => [r.date, Number(r.value) || 0]));
}
async function profileWeight(userId) {
  return Number((await Profile.findOne({ userId }).select('currentWeightKg').lean())?.currentWeightKg) || 70;
}

module.exports = { stepCalories, stepDistanceKm, stepsByDate, profileWeight, KCAL_PER_STEP_PER_KG };
