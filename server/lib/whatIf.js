// What-if simulator: "If I have this biryani, when do I reach my goal?" with a projection cone.
const { addDays } = require('./dates');
const KCAL_PER_KG = 7700;
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * @param extraKcal    calories above plan
 * @param repeatsPerWeek how often (0 = a one-off)
 */
function whatIf({ currentKg, targetKg, paceKg = 0.5, extraKcal = 0, repeatsPerWeek = 0, today }) {
  const c = Number(currentKg), g = Number(targetKg), pace = Number(paceKg) > 0 ? Number(paceKg) : 0.5;
  if (!(c > 0) || !(g > 0) || Math.abs(c - g) < 0.4) return null;
  const lose = g < c;
  const total = Math.abs(c - g);
  const extra = Math.max(0, Number(extraKcal) || 0);
  const weeklyExtra = extra * Math.max(0, Number(repeatsPerWeek) || 0);

  const baseWeeks = total / pace;
  const eff = pace - weeklyExtra / KCAL_PER_KG; // kg/week left after the repeated extra
  const oneOffKg = repeatsPerWeek > 0 ? 0 : extra / KCAL_PER_KG;
  const stalled = eff <= 0.02;
  const newWeeks = stalled ? null : (total + oneOffKg) / eff;
  const delayDays = newWeeks === null ? null : Math.round((newWeeks - baseWeeks) * 7);

  const horizon = Math.min(60, Math.ceil(Math.max(baseWeeks, newWeeks ?? baseWeeks)) + 1);
  const series = Array.from({ length: horizon + 1 }, (_, w) => {
    const at = (p, once) => { const moved = Math.min(total, Math.max(0, p * w - (w >= 1 ? once : 0))); return r1(lose ? c - moved : c + moved); };
    return { week: w, date: addDays(today, w * 7), plan: at(pace, 0), withExtra: at(Math.max(0.02, eff), oneOffKg), low: at(Math.max(0.02, eff) * 0.7, oneOffKg), high: at(Math.max(0.02, eff) * 1.3, oneOffKg) };
  });
  return {
    baseDate: addDays(today, Math.ceil(baseWeeks * 7)),
    newDate: newWeeks === null ? null : addDays(today, Math.ceil(newWeeks * 7)),
    delayDays, stalled,
    extraKgEquivalent: r1(extra / KCAL_PER_KG * 100) / 100,
    message: stalled ? 'Doing this that often would cancel out your deficit. Once a week or less keeps you moving.' : delayDays <= 0 ? 'No real change to your date. One meal does not move a goal.' : `It pushes your goal date back by about ${delayDays} day${delayDays === 1 ? '' : 's'}. Not a big deal.`,
    series,
  };
}
module.exports = { whatIf };
