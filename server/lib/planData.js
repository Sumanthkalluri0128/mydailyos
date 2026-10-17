// Loads what the plan / fat-loss endpoints share: profile, daily history, weigh-ins, sleep, strength days and targets.
const Profile = require('../models/Profile');
const WeightLog = require('../models/WeightLog');
const HealthLog = require('../models/HealthLog');
const ActivityLog = require('../models/ActivityLog');
const { buildHistory } = require('./progress');
const { targetsFor } = require('./journeyData');
const { dailyTarget, expectedEnergy, macroRanges } = require('./energy');
const { addDays } = require('./dates');

async function loadCore(uid, today, { historyDays = 60 } = {}) {
  const from = addDays(today, -(historyDays - 1));
  const [profile, history, weightRows, sleepRows, strengthRows] = await Promise.all([
    Profile.findOne({ userId: uid }).lean(),
    buildHistory(uid, from, today),
    WeightLog.find({ userId: uid }).sort({ date: 1, createdAt: 1 }).select('date weightKg').lean(),
    HealthLog.find({ userId: uid, type: 'sleep', date: { $gte: from, $lte: today } }).select('date value').lean(),
    ActivityLog.find({ userId: uid, date: { $gte: from, $lte: today }, 'sets.0': { $exists: true } }).select('date').lean(),
  ]);
  const p = profile || {};
  const targets = targetsFor(p);
  const e = expectedEnergy(p);
  return {
    profile: p, days: history.days, weights: weightRows.map((w) => ({ date: w.date, weightKg: Number(w.weightKg) })),
    sleep: Object.fromEntries(sleepRows.map((r) => [r.date, Number(r.value)])),
    strengthDates: new Set(strengthRows.map((r) => r.date)),
    targets, energy: e, target: dailyTarget(p), direction: e?.direction || 'maintain',
    ranges: e ? macroRanges(dailyTarget(p), p.currentWeightKg, e.direction, p.goals?.proteinTarget) : null,
    floor: p.sex === 'male' ? 1500 : 1200,
  };
}

/** The corridor plan object trendWeight expects, from the stored plan (or null when there is none). */
function corridorPlan(profile) {
  const pl = profile?.plan;
  if (!pl || !pl.active || !(pl.startKg > 0) || !(pl.targetKg > 0)) return null;
  return { startKg: pl.startKg, targetKg: pl.targetKg, startDate: pl.startDate, paceKgPerWeek: pl.paceKg || profile.goals?.weeklyPaceKg || 0.5 };
}

module.exports = { loadCore, corridorPlan };
