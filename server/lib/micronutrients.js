// Daily and weekly micronutrient maths. Pure functions: routes pass in food logs + the foods they point to.
//
// Unknown is NOT zero. A food without a value for a nutrient adds nothing to that nutrient's total and also does not count
// as "covered". A nutrient is only judged when foods carrying its value account for at least MIN_COVERAGE of the day's calories;
// otherwise its status is 'unknown' (shown as "not enough data").
const { rdaFor, KEYS } = require('./rda');

const MIN_COVERAGE = 0.6;
const WEEK_MIN_LOGGED_DAYS = 4;
const r1 = (x) => Math.round(x * 10) / 10;
const has = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/**
 * @param logs   [{foodId, servings, nutritionTotal:{calories}}]
 * @param foodsById Map|Object of foodId(string) -> food doc with micronutrient fields
 * @returns {{calories:number, totals:Object, coverage:Object}} coverage[k] = share (0-1) of calories from foods that carry k
 */
function dayTotals(logs, foodsById) {
  const get = (id) => (foodsById instanceof Map ? foodsById.get(String(id)) : foodsById?.[String(id)]);
  const totals = Object.fromEntries(KEYS.map((k) => [k, 0]));
  const covered = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let calories = 0;
  for (const l of logs || []) {
    const kcal = Number(l?.nutritionTotal?.calories) || 0;
    const servings = Number(l?.servings) || 0;
    calories += kcal;
    const f = get(l.foodId);
    if (!f) continue;
    for (const k of KEYS) {
      if (!has(f[k])) continue;
      totals[k] += Number(f[k]) * servings;
      covered[k] += kcal;
    }
  }
  const coverage = Object.fromEntries(KEYS.map((k) => [k, calories > 0 ? covered[k] / calories : 0]));
  return { calories, totals: Object.fromEntries(KEYS.map((k) => [k, r1(totals[k])])), coverage };
}

function statusFor(value, target, coverage) {
  if (coverage < MIN_COVERAGE) return 'unknown';
  if (value < target.min) return 'low';
  if (target.max !== null && value > target.max) return 'high';
  return 'ok';
}

/** One day's card: each nutrient with value, range, % of RDA and status. */
function dailyCard({ logs, foodsById, profile }) {
  const rda = rdaFor(profile);
  if (!rda.ok) return { available: false, reason: rda.reason };
  const { calories, totals, coverage } = dayTotals(logs, foodsById);
  if (calories <= 0) return { available: true, loggedAnything: false, enoughData: false, nutrients: [], summary: { ok: 0, low: 0, high: 0, unknown: 0 } };
  const nutrients = rda.targets.map((t) => {
    const value = totals[t.key];
    const cov = coverage[t.key];
    const status = statusFor(value, t, cov);
    return {
      key: t.key, label: t.label, unit: t.unit, rda: t.rda, min: t.min, max: t.max,
      value: status === 'unknown' ? null : value,
      percentOfRda: status === 'unknown' ? null : Math.round((value / t.rda) * 100),
      coverage: Math.round(cov * 100) / 100,
      status,
    };
  });
  const summary = nutrients.reduce((a, n) => ((a[n.status] += 1), a), { ok: 0, low: 0, high: 0, unknown: 0 });
  return { available: true, loggedAnything: true, enoughData: summary.unknown < nutrients.length, nutrients, summary, mood: moodFor(summary) };
}

/** Which character mood the UI should show: 'victory' when most judged nutrients are in range, 'power' when about half, else 'support'. */
function moodFor(summary) {
  const judged = summary.ok + summary.low + summary.high;
  if (judged < 3) return 'unknown';
  const share = summary.ok / judged;
  return share >= 0.7 ? 'victory' : share >= 0.4 ? 'power' : 'support';
}

/**
 * Weekly insight: nutrients that were LOW (week average below the range minimum) in each of the last `weeks` weeks.
 * @param weeks [{loggedDays, averages:{k}, coverage:{k}}] oldest first; each needs >= WEEK_MIN_LOGGED_DAYS logged days to count.
 */
function lowStreaks(weeks, profile, need = 3) {
  const rda = rdaFor(profile);
  if (!rda.ok || !Array.isArray(weeks) || weeks.length < need) return [];
  const recent = weeks.slice(-need);
  if (recent.some((w) => (w.loggedDays || 0) < WEEK_MIN_LOGGED_DAYS)) return [];
  const out = [];
  for (const t of rda.targets) {
    const allLow = recent.every((w) => (w.coverage?.[t.key] ?? 0) >= MIN_COVERAGE && (w.averages?.[t.key] ?? Infinity) < t.min);
    if (allLow) out.push({ key: t.key, label: t.label, unit: t.unit, weeks: need, min: t.min, average: r1(recent.reduce((s, w) => s + w.averages[t.key], 0) / need) });
  }
  return out.sort((a, b) => a.average / a.min - b.average / b.min);
}

/** Average of a set of per-day results into a week row for lowStreaks. */
function weekRow(dayResults) {
  const logged = dayResults.filter((d) => d.calories > 0);
  const n = logged.length;
  const averages = {}; const coverage = {};
  for (const k of KEYS) {
    averages[k] = n ? r1(logged.reduce((s, d) => s + d.totals[k], 0) / n) : 0;
    const cal = logged.reduce((s, d) => s + d.calories, 0);
    coverage[k] = cal ? logged.reduce((s, d) => s + d.coverage[k] * d.calories, 0) / cal : 0;
  }
  return { loggedDays: n, averages, coverage };
}

/** Suggest foods for a low nutrient: the person's OWN logged foods first (best value per serving), then the shared catalogue.
 *  Only foods that actually carry a value for the nutrient are suggested. */
function suggestFoodsFor(key, { ownFoods = [], catalogue = [], limit = 3 } = {}) {
  const pick = (list) => list.filter((f) => has(f[key]) && Number(f[key]) > 0 && !f.hidden)
    .sort((a, b) => Number(b[key]) - Number(a[key]));
  const seen = new Set();
  const out = [];
  for (const [source, list] of [['yours', ownFoods], ['catalogue', catalogue]]) {
    for (const f of pick(list)) {
      const name = String(f.name).toLowerCase();
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ name: f.name, perServing: Number(f[key]), servingSize: f.servingSize, servingUnit: f.servingUnit, source });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

module.exports = { MIN_COVERAGE, WEEK_MIN_LOGGED_DAYS, dayTotals, dailyCard, moodFor, lowStreaks, weekRow, suggestFoodsFor };
