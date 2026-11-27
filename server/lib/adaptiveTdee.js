// "What does your body actually burn?" Compares what you logged with how your weight really moved.
// maintenance ≈ average intake − (weight change per day × 7700 kcal/kg). Needs a few weeks of both food logs and weigh-ins.
//
// THE ONE maintenance estimator. The calorie target (measuredMaintenance), the daily coach, the weekly coach and the body view
// (bodyAnalysis.calibratedMaintenance) all call this, so the same food log and the same weigh-ins give the same number everywhere.
const { diffDays } = require('./dates');
const { dropOutliers } = require('./robustWeights');
const { KCAL_PER_KG } = require('./energy');

// The least data that gives an estimate at all, and how sure we then are. The error range (below) is what decides "high".
const MIN = { weighIns: 4, spanDays: 14, loggedDays: 10 };
const HIGH = { share: 0.8, weighIns: 8, spanDays: 21, half: 250 };   // ± kcal/day the true value could sit from the estimate
const MEDIUM = { share: 0.6, half: 400 };                             // wider than this and the scale is too noisy to steer the target

/** Least-squares line through {x: day number, y: kg}: slope in kg/day and its standard error (how much the noise in the weights moves it). */
function fitLine(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const sxy = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const slope = sxx ? sxy / sxx : 0;
  const rss = points.reduce((s, p) => s + (p.y - (my + slope * (p.x - mx))) ** 2, 0);
  const se = n > 2 && sxx ? Math.sqrt(rss / (n - 2) / sxx) : 0.05; // kg per day
  return { slope, se };
}

/** The shared first step: which days count, which weigh-ins are real, how many days were really logged. */
function prepare(days, expected, o = {}) {
  // Today is still being filled in: a half-logged day would read as "ate little", so a complete-days-only window is used when `today` is given.
  const usable = (days || []).filter((d) => !(o.today && d.date >= o.today));
  const base = Number(o.target) > 0 ? Number(o.target) : (Number(expected) > 0 ? Number(expected) * 0.8 : 0);
  const loggedMin = Math.max(1, 0.35 * base);
  const first = usable.length ? usable[0].date : null;
  // History rows carry the last weight forward between weigh-ins (for charts) and say so with weighIn:false. Those are not measurements.
  const raw = usable.filter((d) => d.weighIn !== false && d.weightKg != null && Number(d.weightKg) > 0).map((d) => ({ date: d.date, weightKg: Number(d.weightKg) }));
  const weights = first ? dropOutliers(raw).kept.map((p) => ({ x: diffDays(first, p.date), y: p.weightKg })) : [];
  const logged = usable.filter((d) => d.calories >= loggedMin);
  const spanDays = weights.length ? weights[weights.length - 1].x - weights[0].x : 0;
  return { usable, weights, logged, spanDays };
}

/** What is still missing, for the "keep logging" message. */
function maintenanceNeed(days, expected, o = {}) {
  const { weights, logged, spanDays } = prepare(days, expected, o);
  return { weighIns: Math.max(0, MIN.weighIns - weights.length), spanDays: Math.max(0, MIN.spanDays - spanDays), loggedDays: Math.max(0, MIN.loggedDays - logged.length) };
}

/**
 * @param days ascending [{date, calories, weightKg, weighIn?}] covering up to ~5 weeks; @param expected  the app's formula estimate (optional)
 * @param o.target the calorie target used for the "was this day really logged" test (a day under 35 % of it is a skipped meal, not a day).
 *   Same rule as the weekly decision (lib/weeklyDecision.js). Without it the threshold comes from `expected`.
 * @param o.today  the person's today (YYYY-MM-DD). Days from today on are left out: today is not finished, so its food is not a full day.
 * Weigh-ins go through the same outlier filter as the weekly decision, so one salty-dinner reading never tilts the slope.
 * Returns the estimate with a range (low..high) from how noisy the weights were, and a confidence that depends on that range:
 * a handful of weigh-ins on a jumpy scale is never "high".
 */
function adaptiveMaintenance(days, expected = null, o = {}) {
  if (!days || !days.length) return null;
  const { usable, weights, logged, spanDays } = prepare(days, expected, o);
  if (!usable.length || weights.length < MIN.weighIns || spanDays < MIN.spanDays || logged.length < MIN.loggedDays) return null;
  const { slope, se } = fitLine(weights);
  const avgIntake = logged.reduce((s, d) => s + d.calories, 0) / logged.length;
  const estimate = Math.round((avgIntake - slope * KCAL_PER_KG) / 10) * 10;
  const loggedShare = logged.length / usable.length;
  const half = Math.max(100, Math.round((1.64 * se * KCAL_PER_KG + 0.05 * avgIntake) / 10) * 10); // weight noise + ~5 % food-logging error (90 % range)
  const confidence = loggedShare >= HIGH.share && weights.length >= HIGH.weighIns && spanDays >= HIGH.spanDays && half <= HIGH.half ? 'high'
    : loggedShare >= MEDIUM.share && half <= MEDIUM.half ? 'medium' : 'low';
  const diff = expected ? Math.round((estimate - expected) / 10) * 10 : null;
  return { estimate, low: estimate - half, high: estimate + half, expected: expected ? Math.round(expected) : null, diff, avgIntake: Math.round(avgIntake),
    kgPerWeek: Math.round(slope * 7 * 100) / 100, loggedDays: logged.length, loggedShare: Math.round(loggedShare * 100) / 100, weighIns: weights.length, spanDays, confidence };
}
module.exports = { adaptiveMaintenance, maintenanceNeed, MIN };
