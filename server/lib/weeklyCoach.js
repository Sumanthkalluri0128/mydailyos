// "What to change this week": 1–2 specific, kind suggestions from the last 7 logged days, a weekly "boss fight" challenge, and a
// short review (score + mood) for the animated weekly screen. Pure — the route supplies days, meal rows and targets.
const { addDays, weekday } = require('./dates');
const { swapFor } = require('./swaps');
const { adaptiveMaintenance } = require('./adaptiveTdee');

const WHO = ['gojo', 'goku', 'zoro', 'naruto', 'luffy', 'jinwoo'];
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r = (n) => Math.round(n);
const mondayOf = (d) => addDays(d, -((weekday(d) + 6) % 7));
const isWeekend = (d) => [0, 6].includes(weekday(d));

/**
 * @param days     [{date, calories, protein, waterMl, exerciseMinutes, steps}] ascending, covering at least the last 14 days
 * @param meals    [{date, mealType, calories}] food entries of the last 7 days
 * @param targets  {calories, protein, waterMl, exerciseMinutes, steps}
 */
function buildCoach({ days, meals = [], foods = [], targets = {}, today, expectedTdee = null }) {
  const week = days.filter((d) => d.date > addDays(today, -7) && d.date <= today);
  const logged = week.filter((d) => d.calories > 0);
  const tips = [];
  const add = (t) => tips.push(t);

  if (logged.length < 4) {
    add({ id: 'log-more', icon: '📒', title: 'Log a few more days', detail: `Only ${logged.length} of the last 7 days have food logged, so tips would be guesses. Aim for 5 days this week.`, impact: 100 });
  } else {
    const t = targets;
    const wd = logged.filter((d) => !isWeekend(d.date)); const we = logged.filter((d) => isWeekend(d.date));
    if (t.protein) {
      const pWd = avg(wd.map((d) => d.protein));
      if (wd.length >= 3 && pWd < t.protein * 0.85) add({ id: 'protein-weekdays', icon: '🥚', title: 'Protein is low on weekdays', detail: `You averaged ${r(pWd)} g against a ${r(t.protein)} g target${we.length ? ` (${r(avg(we.map((d) => d.protein)))} g at weekends)` : ''}. Add eggs, paneer, dal or curd to lunch.`, impact: (1 - pWd / t.protein) * 100 });
      else if (avg(logged.map((d) => d.protein)) < t.protein * 0.85) add({ id: 'protein-low', icon: '🥚', title: 'Protein is below target', detail: `Average ${r(avg(logged.map((d) => d.protein)))} g vs ${r(t.protein)} g. One extra protein food per meal closes most of the gap.`, impact: 60 });
    }
    const snackDays = {};
    for (const m of meals) if (m.mealType === 'snacks') snackDays[m.date] = (snackDays[m.date] || 0) + m.calories;
    const snackAvg = avg(Object.values(snackDays));
    if (Object.keys(snackDays).length >= 3 && snackAvg >= Math.max(200, (t.calories || 0) * 0.15)) add({ id: 'snacks', icon: '🍪', title: `Snacks add ~${r(snackAvg / 10) * 10} kcal a day`, detail: `That is about ${t.calories ? r((snackAvg / t.calories) * 100) : '—'}% of your target. Swapping one snack for fruit, roasted chana or buttermilk saves around ${r((snackAvg / 2) / 10) * 10} kcal.`, impact: 70 });
    const dinner = {}; for (const m of meals) if (m.mealType === 'dinner') dinner[m.date] = (dinner[m.date] || 0) + m.calories;
    const dAvg = avg(Object.values(dinner)); const cAvg = avg(logged.map((d) => d.calories));
    if (Object.keys(dinner).length >= 3 && cAvg > 0 && dAvg / cAvg > 0.45) add({ id: 'dinner-heavy', icon: '🌙', title: 'Dinner is your biggest meal', detail: `Dinner is ${r((dAvg / cAvg) * 100)}% of what you eat. Moving a roti or some rice to lunch makes evenings lighter and hunger steadier.`, impact: 55 });
    if (wd.length >= 3 && we.length >= 1 && avg(we.map((d) => d.calories)) > avg(wd.map((d) => d.calories)) * 1.2) add({ id: 'weekend', icon: '🎉', title: 'Weekends run higher', detail: `${r(avg(we.map((d) => d.calories)))} kcal on weekend days vs ${r(avg(wd.map((d) => d.calories)))} on weekdays. Plan one treat meal instead of a free-for-all day.`, impact: 65 });
    if (t.calories && cAvg < t.calories * 0.65) add({ id: 'under', icon: '⚠️', title: 'You may be eating too little', detail: `Logged days average ${r(cAvg)} kcal against a ${r(t.calories)} kcal target. Very low days often lead to binges; are some meals missing from the log?`, impact: 90 });
    if (t.waterMl && week.filter((d) => d.waterMl >= t.waterMl).length < 3) add({ id: 'water', icon: '💧', title: 'Water goal hit on few days', detail: `Goal reached ${week.filter((d) => d.waterMl >= t.waterMl).length} of 7 days. A glass with each meal gets you most of the way.`, impact: 45 });
    if (t.steps && avg(week.map((d) => d.steps || 0)) < t.steps * 0.6 && week.some((d) => d.steps)) add({ id: 'steps', icon: '👟', title: 'Steps are well below goal', detail: `${r(avg(week.map((d) => d.steps || 0)))} a day vs ${r(t.steps)}. A 15-minute walk after lunch adds about 1,500.`, impact: 40 });
  }
  // Biggest realistic swap among the foods eaten most often this week.
  if (logged.length >= 4) {
    const counts = new Map();
    for (const f of foods) { const e = counts.get(f.name) || { n: 0, kcal: 0 }; e.n += 1; e.kcal += f.calories; counts.set(f.name, e); }
    let best = null;
    for (const [name, e] of counts) { const sw = swapFor(name); if (!sw) continue; const weekly = sw.saves * Math.min(e.n, 4); if (!best || weekly > best.weekly) best = { name, sw, weekly, n: e.n }; }
    if (best && best.weekly >= 150) add({ id: 'swap', icon: '🔁', title: `Swap ${best.name}`, detail: `You logged it ${best.n}× this week. Try ${best.sw.to}: ${best.sw.why}, saving roughly ${best.sw.saves} kcal each time.`, impact: Math.min(80, best.weekly / 10) });
  }
  tips.sort((a, b) => b.impact - a.impact);

  // ---- boss fight: aim at last week's weakest area
  const monday = mondayOf(today);
  const thisWeek = days.filter((d) => d.date >= monday && d.date <= today);
  const lastWeek = days.filter((d) => d.date >= addDays(monday, -7) && d.date < monday);
  const goals = {
    workout: { title: 'Iron week', unit: 'workout days', target: 4, count: (set) => set.filter((d) => d.exerciseMinutes > 0).length },
    water: { title: 'Hydration trial', unit: 'water-goal days', target: 5, count: (set) => (targets.waterMl ? set.filter((d) => d.waterMl >= targets.waterMl).length : 0) },
    logging: { title: 'Log-it showdown', unit: 'days logged', target: 6, count: (set) => set.filter((d) => d.calories > 0).length },
  };
  const ratios = Object.entries(goals).map(([k, g]) => [k, g.count(lastWeek) / g.target]);
  const type = ratios.sort((a, b) => a[1] - b[1])[0][0];
  const g = goals[type];
  const progress = g.count(thisWeek);
  const weekNo = Math.floor(Date.UTC(+monday.slice(0, 4), +monday.slice(5, 7) - 1, +monday.slice(8, 10)) / (7 * 86400000));
  const daysLeft = 6 - ((weekday(today) + 6) % 7);
  const challenge = { type, title: g.title, who: WHO[weekNo % WHO.length], unit: g.unit, target: g.target, progress: Math.min(progress, g.target), defeated: progress >= g.target, daysLeft, canStillWin: progress + daysLeft + 1 >= g.target || progress >= g.target };

  // ---- review
  const parts = [logged.length / 7, targets.waterMl ? week.filter((d) => d.waterMl >= targets.waterMl).length / 7 : null, week.filter((d) => d.exerciseMinutes > 0).length / 5, targets.calories && logged.length ? 1 - Math.min(1, Math.abs(avg(logged.map((d) => d.calories)) - targets.calories) / targets.calories) : null].filter((x) => x !== null).map((x) => Math.min(1, x));
  const score = r(avg(parts) * 100);
  const mood = score >= 75 ? 'celebrate' : score >= 45 ? 'good' : 'encourage';
  const review = {
    score, mood, loggedDays: logged.length, avgCalories: r(avg(logged.map((d) => d.calories))), avgProtein: r(avg(logged.map((d) => d.protein))),
    headline: mood === 'celebrate' ? 'What a week!' : mood === 'good' ? 'Solid week — keep it rolling' : 'A fresh week is a fresh start',
    text: mood === 'celebrate' ? 'You showed up and it shows. Keep the same rhythm.' : mood === 'good' ? 'You are building the habit. One small change below will help most.' : 'Progress is not a straight line. Start with just one thing from the list below.',
  };
  // ---- weekly budget: a heavy day can borrow from the rest of the week. Days you did not log count as "on budget", never as spare calories.
  let weekBudget = null;
  if (targets.calories) {
    const before = [];
    for (let d = monday; d < today; d = addDays(d, 1)) { const row = days.find((x) => x.date === d); before.push(row && row.calories > 0 ? row.calories : targets.calories); }
    const budget = targets.calories * 7;
    const used = before.reduce((a, b) => a + b, 0);
    const daysLeft = 7 - before.length; // today + the rest of the week
    const perDay = Math.round((budget - used) / daysLeft);
    weekBudget = { budget: r(budget), usedBeforeToday: r(used), daysLeft, perDayLeft: perDay, dailyTarget: r(targets.calories), diffPerDay: perDay - r(targets.calories) };
  }
  const maintenance = adaptiveMaintenance(days, expectedTdee);
  return { tips: tips.slice(0, 2), challenge, review, weekBudget, maintenance };
}

module.exports = { buildCoach };
