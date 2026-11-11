// The numbers every screen shows about the saved profile, worked out ONCE here (targets) and in the shared energy model (progress).
// GET and PATCH /api/profile return them beside the profile, so Home, Progress, My Plan, the widget and the coach read the same values.
const { resolveTargets, weightProgress } = require('./energy');
const { planTrendKg } = require('./trendWeight');

/** Weight progress: from the plan's start (else your first weigh-in) to the plan's goal weight (else the goal weight in your profile). */
function progressView(profile, weightRows = []) {
  const rows = (weightRows || []).filter((w) => w && w.date && Number(w.weightKg) > 0).map((w) => ({ date: String(w.date).slice(0, 10), weightKg: Number(w.weightKg) })).sort((a, b) => a.date.localeCompare(b.date));
  const plan = profile?.plan || {};
  const onPlan = !!(plan.active && plan.startKg > 0 && plan.targetKg > 0);
  const last = rows.length ? rows[rows.length - 1].weightKg : null;
  const startKg = onPlan ? plan.startKg : (rows.length ? rows[0].weightKg : Number(profile?.currentWeightKg) || null);
  const currentKg = onPlan ? planTrendKg(plan, rows, last) : last;
  const targetKg = onPlan ? plan.targetKg : profile?.goals?.targetWeightKg;
  const wp = weightProgress({ startKg, currentKg, targetKg, paceKgPerWeek: onPlan && plan.paceKg > 0 ? plan.paceKg : profile?.goals?.weeklyPaceKg });
  if (!wp) return null;
  const { exact, ...out } = wp;
  return { ...out, onPlan };
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

module.exports = { progressView, profileViews, profileWithViews };
