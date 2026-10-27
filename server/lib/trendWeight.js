// Trend weight (not scale weight): a smoothed line inside an expected-pace corridor.
// The scale moves 1–2 kg a day from water, salt and food in the gut; the trend line removes that noise, and the corridor says
// where the plan expects you to be. We reward "you are inside your corridor this week" — never "the scale dropped today".
const { diffDays, addDays } = require('./dates');

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/** The fastest loss we encourage: about 1% of body weight a week (and never above 1 kg). */
function maxSafeWeeklyLossKg(weightKg) {
  const w = Number(weightKg);
  if (!(w > 0)) return 1;
  return Math.min(1, r2(w * 0.01));
}

/**
 * Time-aware exponential moving average. A weigh-in after a long gap pulls the line further than one the next day.
 * @param points [{date, weightKg}] any order; several on a day -> the last one wins
 * @param tauDays how many days it takes the line to move ~63% of the way to a new level
 */
function smoothTrend(points, tauDays = 5) {
  const byDate = new Map();
  for (const p of points || []) if (p && p.date && Number(p.weightKg) > 0) byDate.set(p.date, Number(p.weightKg));
  const dates = [...byDate.keys()].sort();
  const out = [];
  let trend = null; let prev = null;
  for (const date of dates) {
    const w = byDate.get(date);
    if (trend === null) trend = w;
    else trend += (1 - Math.exp(-Math.max(1, diffDays(prev, date)) / tauDays)) * (w - trend);
    prev = date;
    out.push({ date, weightKg: r1(w), trendKg: r2(trend) });
  }
  return out;
}

/** Where the plan expects you to be on `date`, and the corridor around it (it widens a little over time). */
function corridorAt({ startKg, targetKg, startDate, paceKgPerWeek }, date) {
  const s = Number(startKg), g = Number(targetKg);
  const pace = Number(paceKgPerWeek) > 0 ? Number(paceKgPerWeek) : 0.5;
  const weeks = Math.max(0, diffDays(startDate, date) / 7);
  const dir = g < s ? -1 : g > s ? 1 : 0;
  let expected = s + dir * pace * weeks;
  if (dir < 0) expected = Math.max(expected, g); else if (dir > 0) expected = Math.min(expected, g);
  const half = Math.min(1.5, 0.6 + 0.05 * weeks);
  return { expected: r2(expected), low: r2(expected - half), high: r2(expected + half), half: r2(half), direction: dir < 0 ? 'lose' : dir > 0 ? 'gain' : 'maintain' };
}

/** 'inside' | 'ahead' (moving faster than planned) | 'behind' (slower than planned) */
function corridorStatus(trendKg, c) {
  if (trendKg >= c.low && trendKg <= c.high) return 'inside';
  const below = trendKg < c.low;
  if (c.direction === 'lose') return below ? 'ahead' : 'behind';
  if (c.direction === 'gain') return below ? 'behind' : 'ahead';
  return 'behind';
}

/** kg per week from the trend line over the last `days` days (null when there is not enough to say). */
function trendRate(series, today, days = 14) {
  const pts = series.filter((p) => diffDays(p.date, today) >= 0 && diffDays(p.date, today) <= days);
  if (pts.length < 2) return null;
  const span = diffDays(pts[0].date, pts[pts.length - 1].date);
  if (span < 7) return null;
  return r2(((pts[pts.length - 1].trendKg - pts[0].trendKg) / span) * 7);
}

/**
 * @param weights [{date, weightKg}]
 * @param plan    {startKg, targetKg, startDate, paceKgPerWeek}
 */
function buildTrend({ weights, plan, today, windowDays = 84 }) {
  const smooth = smoothTrend(weights);
  const from = addDays(today, -windowDays);
  const visible = smooth.filter((p) => p.date >= from && p.date <= today);
  const hasPlan = !!(plan && Number(plan.startKg) > 0 && Number(plan.targetKg) > 0 && plan.startDate);
  const series = visible.map((p) => (hasPlan ? { ...p, ...pick(corridorAt(plan, p.date)) } : p));
  const last = smooth.filter((p) => p.date <= today).slice(-1)[0] || null;
  const rate = trendRate(smooth.filter((p) => p.date <= today), today);

  let current = null; let week = null;
  if (last) {
    const c = hasPlan ? corridorAt(plan, today) : null;
    current = { date: last.date, trendKg: last.trendKg, scaleKg: last.weightKg, ratePerWeek: rate, corridor: c ? { expected: c.expected, low: c.low, high: c.high } : null, status: c ? corridorStatus(last.trendKg, c) : null };
  }
  if (hasPlan) {
    // For each of the last 7 days: carry the trend forward from the latest weigh-in on or before it and compare with that day's corridor.
    let inside = 0; let counted = 0;
    for (let i = 6; i >= 0; i -= 1) {
      const d = addDays(today, -i);
      const t = smooth.filter((p) => p.date <= d).slice(-1)[0];
      if (!t) continue;
      counted += 1;
      const s = corridorStatus(t.trendKg, corridorAt(plan, d));
      if (s === 'inside' || s === 'ahead') inside += 1; // faster than planned is fine unless it is *too* fast (see safety.js)
    }
    const weighIns = smooth.filter((p) => diffDays(p.date, today) >= 0 && diffDays(p.date, today) < 7).length;
    week = { insideDays: inside, days: counted, weighIns, rewarded: counted >= 5 && inside >= 5 && weighIns >= 2 };
  }
  return { series, current, week, hasPlan };
}
const pick = (c) => ({ expected: c.expected, low: c.low, high: c.high });

/**
 * Where you are NOW, measured for the CURRENT plan. The all-time trend line starts at the very first weigh-in ever, so after an
 * older, heavier weight it can sit above the plan's start weight and progress read "0 kg done" for ever. This line starts at the
 * plan's own start weight (on its start date) and follows only the weigh-ins made since. Without an active plan: the all-time trend.
 * @returns kg (smoothed) or null
 */
function planTrendKg(plan, weights, fallbackKg = null) {
  const startKg = Number(plan && plan.startKg), startDate = plan && plan.startDate;
  if (!(plan && plan.active && startKg > 0 && startDate)) return fallbackKg;
  const since = (weights || []).filter((w) => w && w.date >= startDate).map((w) => ({ date: w.date, weightKg: Number(w.weightKg) }));
  const line = smoothTrend([{ date: startDate, weightKg: startKg }, ...since]);
  return line.length ? line[line.length - 1].trendKg : fallbackKg;
}

module.exports = { planTrendKg, smoothTrend, corridorAt, corridorStatus, trendRate, buildTrend, maxSafeWeeklyLossKg };
