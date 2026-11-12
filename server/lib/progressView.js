// The numbers every screen shows about the saved profile, worked out ONCE here (targets) and in the shared energy model (progress).
// GET and PATCH /api/profile return them beside the profile, so Home, Progress, My Plan, the widget and the coach read the same values.
const { resolveTargets, weightProgress } = require('./energy');
const { planTrendKg, smoothTrend } = require('./trendWeight');

const cleanRows = (weightRows) => (weightRows || []).filter((w) => w && w.date && Number(w.weightKg) > 0).map((w) => ({ date: String(w.date).slice(0, 10), weightKg: Number(w.weightKg) })).sort((a, b) => a.date.localeCompare(b.date));

/** Goal weight and pace, the same everywhere: the active plan's, else the ones in the profile. No weigh-ins needed. */
function goalTargets(profile, e = null) {
  const plan = profile?.plan || {};
  const onPlan = !!(plan.active && plan.startKg > 0 && plan.targetKg > 0);
  return {
    onPlan,
    targetKg: onPlan ? plan.targetKg : (Number(profile?.goals?.targetWeightKg) || null),
    paceKg: onPlan && plan.paceKg > 0 ? plan.paceKg : ((e && e.pace) || Number(profile?.goals?.weeklyPaceKg) || null),
  };
}

/**
 * Start, "now", goal and pace for every weight-progress screen (goal card, Progress tab, journey, coach hub, goal range, taper).
 * now = the plan's trend (plan start + 7-day average) on a plan, else the smoothed trend, else the latest weigh-in, else the profile weight.
 */
function goalContext(profile, weightRows = [], e = null) {
  const rows = cleanRows(weightRows);
  const plan = profile?.plan || {};
  const g = goalTargets(profile, e);
  const last = rows.length ? rows[rows.length - 1].weightKg : null;
  let nowKg;
  if (g.onPlan) nowKg = planTrendKg(plan, rows, last);
  else { const tr = rows.length ? smoothTrend(rows) : []; nowKg = (tr.length ? tr[tr.length - 1].trendKg : null) || last; }
  nowKg = Number(nowKg) > 0 ? Number(nowKg) : (Number(profile?.currentWeightKg) || null);
  const startKg = g.onPlan ? plan.startKg : (rows.length ? rows[0].weightKg : Number(profile?.currentWeightKg) || null);
  return { ...g, startKg, nowKg, hasWeighIns: rows.length > 0 };
}

/** Weight progress: from the plan's start (else your first weigh-in) to the plan's goal weight (else the goal weight in your profile). */
function progressView(profile, weightRows = []) {
  const c = goalContext(profile, weightRows);
  const wp = weightProgress({ startKg: c.startKg, currentKg: c.nowKg, targetKg: c.targetKg, paceKgPerWeek: c.paceKg });
  if (!wp) return null;
  const { exact, ...out } = wp;
  return { ...out, onPlan: c.onPlan };
}

/** Everything extra that travels with the profile. `weightRows` = recent weigh-ins {date, weightKg}. */
function profileViews(profileDoc, weightRows) {
  const p = profileDoc && typeof profileDoc.toObject === 'function' ? profileDoc.toObject() : profileDoc;
  return { targets: resolveTargets(p), progress: progressView(p, weightRows) };
}

/** The profile as a plain object WITH `targets` and `progress` on it: clients that keep only `data.profile` still get them. */
function profileWithViews(profileDoc, weightRows) {
  const p = profileDoc && typeof profileDoc.toObject === 'function' ? profileDoc.toObject() : profileDoc;
  return { ...p, ...profileViews(p, weightRows) };
}

module.exports = { progressView, profileViews, profileWithViews, goalContext, goalTargets };
