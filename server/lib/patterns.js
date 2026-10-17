// Personal pattern insights: correlations in the person's OWN data. Needs enough samples on each side before saying anything.
const { weekday } = require('./dates');
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r10 = (x) => Math.round(x / 10) * 10;

/**
 * @param days   [{date, calories, steps, waterMl}] ascending
 * @param sleep  {date: hours}
 * @param meals  [{date, mealType}] food entries (to know which days had breakfast)
 */
function buildPatterns({ days, sleep = {}, meals = [], target = null, minSamples = 3 }) {
  const logged = days.filter((d) => d.calories > 0);
  const out = [];

  // Short sleep -> eat more (same date: Health Connect assigns the night to the morning you woke up)
  const short = logged.filter((d) => sleep[d.date] > 0 && sleep[d.date] < 6), okSleep = logged.filter((d) => sleep[d.date] >= 7);
  if (short.length >= minSamples && okSleep.length >= minSamples) {
    const diff = avg(short.map((d) => d.calories)) - avg(okSleep.map((d) => d.calories));
    if (Math.abs(diff) >= 120) out.push({ id: 'sleep', icon: '😴', title: diff > 0 ? `After under 6 h of sleep you eat about ${r10(diff)} kcal more` : `You eat about ${r10(-diff)} kcal less after short sleep`, detail: `Based on ${short.length} short-sleep days and ${okSleep.length} well-rested days.${diff > 0 ? ' Protein at breakfast and an earlier bedtime both help.' : ''}`, effectKcal: Math.round(diff), n: short.length + okSleep.length });
  }

  // Skipping breakfast
  const hadBreakfast = new Set(meals.filter((m) => m.mealType === 'breakfast').map((m) => m.date));
  const noB = logged.filter((d) => !hadBreakfast.has(d.date)), withB = logged.filter((d) => hadBreakfast.has(d.date));
  if (noB.length >= minSamples && withB.length >= minSamples) {
    const diff = avg(noB.map((d) => d.calories)) - avg(withB.map((d) => d.calories));
    const overNo = target ? noB.filter((d) => d.calories > target * 1.08).length : null;
    if (diff >= 120) out.push({ id: 'breakfast', icon: '🌅', title: `Days with no breakfast logged run about ${r10(diff)} kcal higher`, detail: `${overNo !== null ? `${overNo} of ${noB.length} of those days ended over your target. ` : ''}A simple protein breakfast (eggs, curd, besan chilla) tends to steady the rest of the day.`, effectKcal: Math.round(diff), n: noB.length + withB.length });
  }

  // Low steps -> higher intake? (only when it is clear)
  const stepped = logged.filter((d) => d.steps > 0);
  const lowSteps = stepped.filter((d) => d.steps < 4000), highSteps = stepped.filter((d) => d.steps >= 8000);
  if (lowSteps.length >= minSamples && highSteps.length >= minSamples) {
    const diff = avg(lowSteps.map((d) => d.calories)) - avg(highSteps.map((d) => d.calories));
    if (diff >= 150) out.push({ id: 'steps', icon: '👟', title: `On quiet, low-step days you eat about ${r10(diff)} kcal more`, detail: 'A short walk on desk-bound days seems to help with appetite too.', effectKcal: Math.round(diff), n: lowSteps.length + highSteps.length });
  }

  // Weekdays: which day of the week is highest
  const byDow = new Map();
  for (const d of logged) { const k = weekday(d.date); (byDow.get(k) || byDow.set(k, []).get(k)).push(d.calories); }
  const base = avg(logged.map((d) => d.calories));
  let best = null;
  for (const [k, v] of byDow) if (v.length >= 3 && (!best || avg(v) > best.mean)) best = { k, mean: avg(v), n: v.length };
  if (best && base > 0 && best.mean - base >= 200) out.push({ id: 'weekday', icon: '📅', title: `${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][best.k]} run about ${r10(best.mean - base)} kcal above your average`, detail: 'Knowing your highest day lets you plan for it ahead of time.', effectKcal: Math.round(best.mean - base), n: best.n });

  out.sort((a, b) => Math.abs(b.effectKcal) - Math.abs(a.effectKcal));
  return out;
}
module.exports = { buildPatterns };
