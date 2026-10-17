// A graded 0–100 "fat-loss score" instead of pass/fail days. It weights calories, protein, steps, water and sleep, and is judged on
// the WEEKLY average against a weekly calorie budget (7 × target), so one heavy day is absorbed rather than counted as a failure.
const { addDays, weekday } = require('./dates');

const WEIGHTS = { calories: 35, protein: 25, steps: 15, water: 15, sleep: 10 };
const LABELS = { calories: 'Calories', protein: 'Protein', steps: 'Steps', water: 'Water', sleep: 'Sleep' };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** 0..1. An over day still earns partial credit (floor 0.15): the score shows "how close", not "pass or fail". */
function gradeCalories(calories, target, direction = 'lose') {
  const c = Number(calories), t = Number(target);
  if (!(t > 0) || !(c > 0)) return null;
  const ratio = c / t;
  if (direction === 'gain') return ratio >= 0.92 ? 1 : clamp01(0.2 + ((ratio - 0.6) / 0.32) * 0.8);
  if (ratio > 1.05) return Math.max(0.15, 1 - (ratio - 1.05) / 0.45);
  if (ratio >= 0.9) return 1;
  if (ratio >= 0.6) return 0.4 + ((ratio - 0.6) / 0.3) * 0.6;
  return 0.2; // very low intake is never rewarded
}
const gradeProtein = (p, t) => (t > 0 ? clamp01((Number(p) || 0) / (t * 0.9)) : null);
const gradeRatio = (v, t) => (t > 0 ? clamp01((Number(v) || 0) / t) : null);
function gradeSleep(h) {
  const x = Number(h);
  if (!(x > 0)) return null;
  if (x >= 7 && x <= 9) return 1;
  if (x < 7) return clamp01(x / 7);
  return clamp01(1 - (x - 9) / 3);
}

/** Components for one day, each 0..1 or null when there is nothing to judge. `sleepH` comes from Health Connect or manual entries. */
function dayComponents(day, t = {}, sleepH = null) {
  const d = day || {};
  return {
    calories: gradeCalories(d.calories, t.calories, t.direction),
    protein: d.calories > 0 ? gradeProtein(d.protein, t.protein) : null,
    steps: t.steps > 0 && (d.steps > 0 || d.calories > 0) ? gradeRatio(d.steps, t.steps) : null,
    water: t.waterMl > 0 && (d.waterMl > 0 || d.calories > 0) ? gradeRatio(d.waterMl, t.waterMl) : null,
    sleep: gradeSleep(sleepH),
  };
}
const combine = (comps) => {
  let sum = 0, w = 0;
  for (const k of Object.keys(WEIGHTS)) if (comps[k] !== null && comps[k] !== undefined) { sum += comps[k] * WEIGHTS[k]; w += WEIGHTS[k]; }
  return w ? Math.round((sum / w) * 100) : null;
};

/** One day's score (null when nothing was logged: an empty day is "no data", not a zero). */
function dayScore(day, t, sleepH = null) {
  if (!day || !(day.calories > 0 || day.waterMl > 0 || day.steps > 0)) return null;
  return combine(dayComponents(day, t, sleepH));
}

const label = (s) => (s === null ? 'No data yet' : s >= 80 ? 'Excellent week' : s >= 65 ? 'Good week' : s >= 45 ? 'Building momentum' : 'A fresh start');

/**
 * @param days   [{date, calories, protein, steps, waterMl}] ascending
 * @param t      {calories, direction, protein, steps, waterMl}
 * @param sleep  {date: hours}
 */
function weeklyScore(days, t, today, sleep = {}) {
  const week = days.filter((d) => d.date > addDays(today, -7) && d.date <= today);
  const logged = week.filter((d) => d.calories > 0);
  const per = week.map((d) => ({ date: d.date, score: dayScore(d, t, sleep[d.date] ?? null) }));
  const comps = { calories: [], protein: [], steps: [], water: [], sleep: [] };
  for (const d of week) {
    const c = dayComponents(d, t, sleep[d.date] ?? null);
    for (const k of Object.keys(comps)) if (c[k] !== null && c[k] !== undefined) comps[k].push(c[k]);
  }
  // Calories are judged on the WEEK: average intake of logged days against the target (so a heavy day is balanced by lighter ones).
  const weekCal = logged.length >= 2 ? gradeCalories(avg(logged.map((d) => d.calories)), t.calories, t.direction) : (comps.calories[0] ?? null);
  const final = { calories: weekCal, protein: comps.protein.length ? avg(comps.protein) : null, steps: comps.steps.length ? avg(comps.steps) : null, water: comps.water.length ? avg(comps.water) : null, sleep: comps.sleep.length ? avg(comps.sleep) : null };
  const score = logged.length ? combine(final) : null;
  const components = Object.keys(WEIGHTS).map((k) => ({ id: k, label: LABELS[k], weight: WEIGHTS[k], score: final[k] === null ? null : Math.round(final[k] * 100) }));
  return { score, label: label(score), loggedDays: logged.length, components, days: per, budget: weekBudgetAbsorb(days, t, today) };
}

/** Mon–Sun budget = 7 × target. Unlogged days before today count at the target, never as spare calories. `absorbed` = heavy days the week can still carry. */
function weekBudgetAbsorb(days, t, today) {
  if (!(t.calories > 0)) return null;
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  let used = 0; let heavy = 0; let daysCounted = 0;
  for (let d = monday; d <= today; d = addDays(d, 1)) {
    const row = days.find((x) => x.date === d);
    const cal = row && row.calories > 0 ? row.calories : (d < today ? t.calories : 0);
    used += cal; daysCounted += 1;
    if (row && row.calories > t.calories * 1.08) heavy += 1;
  }
  const budget = Math.round(t.calories * 7);
  const daysLeft = 7 - daysCounted;
  const left = Math.round(budget - used);
  return { budget, used: Math.round(used), left, heavyDays: heavy, absorbed: heavy > 0 && left >= 0, perDayLeft: daysLeft > 0 ? Math.round(left / daysLeft) : null, daysLeft };
}

/** Budget use for a fit-check: Mon–Sun budget, what was eaten BEFORE today (unlogged past days count at the target), and the days left including today. */
function weekUsage(days, target, today) {
  if (!(target > 0)) return null;
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  let used = 0; let n = 0;
  for (let d = monday; d < today; d = addDays(d, 1)) { const row = days.find((x) => x.date === d); used += row && row.calories > 0 ? row.calories : target; n += 1; }
  return { budget: Math.round(target * 7), usedBeforeToday: Math.round(used), daysLeft: 7 - n };
}

module.exports = { weekUsage, gradeCalories, gradeSleep, dayScore, dayComponents, weeklyScore, weekBudgetAbsorb, WEIGHTS };
