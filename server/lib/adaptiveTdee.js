// "What does your body actually burn?" Compares what you logged with how your weight really moved.
// maintenance ≈ average intake − (weight change per day × 7700 kcal/kg). Needs a few weeks of both food logs and weigh-ins.
const { diffDays } = require('./dates');
const { dropOutliers } = require('./robustWeights');

function slopeKgPerDay(points) {
  // least-squares slope of weight against day number
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den ? num / den : 0;
}

/**
 * @param days ascending [{date, calories, weightKg}] covering up to ~5 weeks; @param expected  the app's formula estimate (optional)
 * @param o.target the calorie target used for the "was this day really logged" test (a day under 35 % of it is a skipped meal, not a day).
 *   Same rule as the weekly decision (lib/weeklyDecision.js). Without it the threshold comes from `expected`.
 * Weigh-ins go through the same outlier filter as the weekly decision, so one salty-dinner reading never tilts the slope.
 */
function adaptiveMaintenance(days, expected = null, o = {}) {
  if (!days.length) return null;
  const first = days[0].date;
  const base = Number(o.target) > 0 ? Number(o.target) : (Number(expected) > 0 ? Number(expected) * 0.8 : 0);
  const loggedMin = Math.max(1, 0.35 * base);
  const raw = days.filter((d) => d.weightKg != null && Number(d.weightKg) > 0).map((d) => ({ date: d.date, weightKg: Number(d.weightKg) }));
  const weights = dropOutliers(raw).kept.map((p) => ({ x: diffDays(first, p.date), y: p.weightKg }));
  const logged = days.filter((d) => d.calories >= loggedMin);
  const spanDays = weights.length ? weights[weights.length - 1].x - weights[0].x : 0;
  if (weights.length < 4 || spanDays < 14 || logged.length < 10) return null;
  const slope = slopeKgPerDay(weights);
  const avgIntake = logged.reduce((s, d) => s + d.calories, 0) / logged.length;
  const estimate = Math.round((avgIntake - slope * 7700) / 10) * 10;
  const loggedShare = logged.length / days.length;
  const confidence = loggedShare >= 0.8 && weights.length >= 8 && spanDays >= 21 ? 'high' : loggedShare >= 0.6 ? 'medium' : 'low';
  const diff = expected ? Math.round((estimate - expected) / 10) * 10 : null;
  return { estimate, expected: expected ? Math.round(expected) : null, diff, avgIntake: Math.round(avgIntake), kgPerWeek: Math.round(slope * 7 * 100) / 100, loggedDays: logged.length, weighIns: weights.length, confidence };
}
module.exports = { adaptiveMaintenance };
