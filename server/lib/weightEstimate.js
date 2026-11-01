// Estimated weight change from what was LOGGED, for the analysis only.
//
// Problem this solves: the scale is the only thing the analysis used to look at. If you ate heavy for a week and did not weigh in,
// the app saw "no change" and said things like "your weight is not going up" or "on track". Food and activity logs say something
// too, so when weigh-ins are missing or old we add what the food log implies since the last real weigh-in.
//
// Rules (kept deliberately cautious):
//  - The scale always wins. The estimate only covers the days AFTER the last weigh-in, and disappears the moment a new weigh-in lands.
//  - It is never drawn on a chart and never written to the weight log. Graphs and "kg lost" keep using real weigh-ins only.
//  - Days with almost nothing logged count as UNKNOWN (assumed neutral), never as a deficit. Today is left out (still being logged).
//  - Balance = eaten minus (maintenance + earned activity), ~7700 kcal per kg. Capped, because water, salt and glycogen swing the scale
//    far more than fat does over a few days, and an estimate must not claim more than a week of food can really add.
//  - Safety checks (rapid-loss alerts, rewards) do NOT use it: those need real measurements.
const { addDays, diffDays } = require('./dates');
const { expectedEnergy, dayBalance } = require('./energy');

const KCAL_PER_KG = 7700;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

const RULES = {
  maxWindowDays: 28,        // beyond four weeks without a weigh-in we stop pretending
  unloggedBelow: 0.4,       // a day under 40% of maintenance is "not really logged": unknown, assumed neutral
  maxKgPerWeek: 1,          // an estimate never claims more than this per week
  maxTotalKg: 3,            // ...or more than this in total
  minLoggedDays: 3,         // fewer logged days than this: no estimate
  staleAfterDays: 4,        // a weigh-in older than this no longer describes "now"
  noiseKg: 0.2,             // smaller than this is not worth mentioning
};

/**
 * @param o.days      ascending [{date, calories, caloriesBurned?}] (the app's history rows)
 * @param o.weights   weigh-ins [{date, weightKg}] any order
 * @param o.profile   profile (for maintenance calories and the no-weigh-in fallback weight)
 * @param o.today     YYYY-MM-DD
 * @returns null when there is nothing sensible to say, else
 *   { deltaKg, estimatedKg, ratePerWeek, fromDate, windowDays, loggedDays, unloggedDays, avgNetKcal, anchorKg, anchorDate, anchorAgeDays,
 *     hasAnchor, stale, confidence, basis: 'estimate' }
 */
function estimateWeight({ days = [], weights = [], profile = null, today, anchorKg: anchorKgIn = null, anchorDate: anchorDateIn = null } = {}) {
  if (!today || !profile) return null;
  const e = expectedEnergy(profile);
  if (!e) return null; // without a body profile there is no honest maintenance number

  const real = (weights || []).filter((w) => w && w.date && w.date <= today && num(w.weightKg) > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = real.length ? real[real.length - 1] : null;
  const anchorDate = last ? last.date : anchorDateIn;
  const anchorKg = last ? num(last.weightKg) : (num(anchorKgIn) > 0 ? num(anchorKgIn) : null);
  const anchorAgeDays = anchorDate ? diffDays(anchorDate, today) : null;

  // The window starts the day after the last weigh-in (or 14 days back when there never was one), and stops before today.
  let from = anchorDate ? addDays(anchorDate, 1) : addDays(today, -14);
  const earliest = addDays(today, -RULES.maxWindowDays);
  if (from < earliest) from = earliest;
  const to = addDays(today, -1);
  if (from > to) return null; // weighed in today or yesterday: the scale already says it

  let netSum = 0, logged = 0, unlogged = 0, windowDays = 0;
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    windowDays += 1;
    const row = byDate.get(d);
    const eaten = Math.max(0, num(row && row.calories));
    if (!row || eaten < RULES.unloggedBelow * e.tdee) { unlogged += 1; continue; }
    const b = dayBalance(profile, { eaten, workout: Math.max(0, num(row.caloriesBurned)) });
    if (b.net === null) { unlogged += 1; continue; }
    netSum += -b.net; // positive = ate more than burned
    logged += 1;
  }
  if (logged < RULES.minLoggedDays) return null;

  // Unlogged days add nothing (neutral), so the estimate is a minimum when many days are missing.
  const rawKg = netSum / KCAL_PER_KG;
  const cap = Math.min(RULES.maxTotalKg, (RULES.maxKgPerWeek * windowDays) / 7);
  const deltaKg = r2(Math.max(-cap, Math.min(cap, rawKg)));
  const ratePerWeek = r2(Math.max(-RULES.maxKgPerWeek, Math.min(RULES.maxKgPerWeek, (netSum / windowDays) * 7 / KCAL_PER_KG)));
  const share = logged / windowDays;
  const confidence = share >= 0.8 && logged >= 5 ? 'medium' : 'low'; // never 'high': it is an estimate from a formula
  const hasAnchor = anchorKg !== null;
  return {
    basis: 'estimate', deltaKg, ratePerWeek, fromDate: from, windowDays, loggedDays: logged, unloggedDays: unlogged,
    avgNetKcal: Math.round(netSum / logged), anchorKg: anchorKg === null ? null : r1(anchorKg), anchorDate: anchorDate || null, anchorAgeDays,
    hasAnchor, estimatedKg: hasAnchor ? r1(anchorKg + deltaKg) : null,
    stale: anchorAgeDays === null || anchorAgeDays > RULES.staleAfterDays, confidence,
    meaningful: Math.abs(deltaKg) >= RULES.noiseKg,
  };
}

/**
 * The kg/week the ANALYSIS should use. A fresh scale trend wins; a stale one is not allowed to say "flat" about days it never saw.
 * @returns {ratePerWeek, source: 'scale'|'estimate'|null}
 */
function analysisRate({ measuredRate = null, lastWeighIn = null, today, estimate = null }) {
  const age = lastWeighIn ? diffDays(lastWeighIn, today) : null;
  const fresh = age !== null && age <= RULES.staleAfterDays;
  if (measuredRate !== null && measuredRate !== undefined && fresh) return { ratePerWeek: measuredRate, source: 'scale' };
  if (estimate && estimate.loggedDays >= RULES.minLoggedDays) return { ratePerWeek: estimate.ratePerWeek, source: 'estimate' };
  return { ratePerWeek: null, source: null };
}

/** One kind sentence for the person; null when the estimate is too small to mention. */
function estimateNote(est, { direction = 'lose' } = {}) {
  if (!est || !est.meaningful) return null;
  const kg = Math.abs(est.deltaKg);
  const up = est.deltaKg > 0;
  const since = est.anchorAgeDays !== null ? `since your last weigh-in ${est.anchorAgeDays} day${est.anchorAgeDays === 1 ? '' : 's'} ago` : 'over the last two weeks';
  const lead = `Your food log ${since} adds up to about ${up ? '+' : '-'}${r1(kg)} kg${up ? ' above' : ' below'} where you were`;
  const water = up ? ' Part of that is usually water and salt.' : '';
  const ask = ' This is an estimate from your log, not a measurement. A weigh-in will settle it.';
  if (up && direction === 'lose') return `${lead}.${water}${ask}`;
  return `${lead}.${ask}`;
}

module.exports = { estimateWeight, analysisRate, estimateNote, RULES, KCAL_PER_KG };
