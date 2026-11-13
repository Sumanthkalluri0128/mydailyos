// Measured maintenance: what your food log and your weight trend say you really burn. It steers the calorie target (energy.blendTdee),
// so the plan follows your real progress instead of only the formula. The maths is pure (measuredFrom); refreshMeasuredTdee is the database side.
const { adaptiveMaintenance } = require('./adaptiveTdee');
const { expectedEnergy } = require('./energy');
const { addDays } = require('./dates');

/** @param days ascending history rows [{date, calories, weightKg, weighIn}]  @returns {ratio, kcal, confidence, asOf, loggedDays, weighIns} | null */
function measuredFrom(profile, days, today) {
  const e = expectedEnergy({ ...(profile || {}), measuredTdee: null }); // the pure formula: the reading must never feed on itself
  if (!e) return null;
  const hist = days.filter((d) => d.date <= today).slice(-35);
  const ad = adaptiveMaintenance(hist.map((d) => ({ date: d.date, calories: d.calories, weightKg: d.weighIn ? d.weightKg : null })), e.tdee, { target: e.calorieTarget });
  if (!ad || !(ad.estimate > 0)) return null;
  return { ratio: Math.round((ad.estimate / e.tdee) * 1000) / 1000, kcal: ad.estimate, confidence: ad.confidence, asOf: today, loggedDays: ad.loggedDays, weighIns: ad.weighIns };
}

/** Once a day (or when forced): recompute and store profile.measuredTdee. Returns the (possibly updated) profile. */
async function refreshMeasuredTdee(uid, today, { force = false } = {}) {
  const Profile = require('../models/Profile');
  const { buildHistory } = require('./progress');
  let profile = await Profile.findOne({ userId: uid });
  if (!profile) return profile;
  if (!force && profile.measuredTdee && profile.measuredTdee.asOf === today) return profile;
  const hist = await buildHistory(uid, addDays(today, -34), today);
  // No usable reading is stored too ({asOf, ratio: null}), so the history is read once a day, not on every call; blendTdee ignores it.
  const next = measuredFrom(profile.toObject(), hist.days, today) || { asOf: today, ratio: null, confidence: 'none', loggedDays: 0, weighIns: 0 };
  return (await Profile.findOneAndUpdate({ userId: uid }, { $set: { measuredTdee: next } }, { new: true })) || profile;
}

module.exports = { measuredFrom, refreshMeasuredTdee };
