// Database side of the daily coach (lib/dailyCoach.js is pure). One place that loads what the guide needs and keeps the stored
// automatic activity reading fresh. Used by /api/coach/day-guide, /entry-check, /activity-level and by GET /api/profile.
const Profile = require('../models/Profile');
const FoodPreference = require('../models/FoodPreference');
const ActivityLog = require('../models/ActivityLog');
const { buildHistory } = require('./progress');
const { loadCore } = require('./planData');
const { refreshStoredTarget } = require('./profileEnergy');
const { addDays } = require('./dates');
const { isTrained, nextAutoActivity, CFG } = require('./dailyCoach');

async function strengthDatesIn(uid, from, to) {
  const rows = await ActivityLog.find({ userId: uid, date: { $gte: from, $lte: to }, 'sets.0': { $exists: true } }).select('date').lean();
  return new Set(rows.map((r) => r.date));
}

/** Keeps `profile.autoActivity` current (once a day, or when forced). Returns the (possibly updated) profile. No-op in manual mode. */
async function refreshAutoActivity(uid, today, { force = false } = {}) {
  let profile = await Profile.findOne({ userId: uid });
  if (!profile || profile.activityMode !== 'auto') return profile;
  if (!force && profile.autoActivity && profile.autoActivity.asOf === today && profile.autoActivity.windowDays != null) return profile; // an older reading (no 7-day average yet) is recomputed at once
  const [hist, strength] = await Promise.all([buildHistory(uid, addDays(today, -CFG.windowDays), addDays(today, -1)), strengthDatesIn(uid, addDays(today, -CFG.windowDays), addDays(today, -1))]);
  const pick = (date) => { const row = hist.days.find((d) => d.date === date); return row ? { row, trained: isTrained(row, strength) } : null; };
  const next = nextAutoActivity(profile.autoActivity, profile.toObject(), pick(addDays(today, -1)), pick(addDays(today, -2)), today, Array.from({ length: CFG.windowDays }, (_, i) => pick(addDays(today, -(i + 1)))));
  profile = await Profile.findOneAndUpdate({ userId: uid }, { $set: { autoActivity: next } }, { new: true });
  return (await refreshStoredTarget(Profile, profile)) || profile;
}

/** Profile, 35 days of history, strength days, targets and diet for the guide. `days` ends today. */
async function loadDaily(uid, today) {
  const core = await loadCore(uid, today, { historyDays: 35 });
  const [pref, strengthDates] = await Promise.all([FoodPreference.findOne({ userId: uid }).select('diet').lean(), strengthDatesIn(uid, addDays(today, -34), today)]);
  const proteinTarget = core.ranges ? core.ranges.protein.goal : Math.round(1.6 * (Number(core.profile.currentWeightKg) || 0));
  return { ...core, diet: pref?.diet || '', strengthDates, proteinTarget };
}

module.exports = { refreshAutoActivity, loadDaily, strengthDatesIn };
