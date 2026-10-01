// Weekly summary built from the same per-day rows /api/progress/history returns.
const { addDays } = require('./dates');

const r1 = (n) => Math.round(n * 10) / 10;
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

function pctChange(now, before) {
  if (!before) return now ? null : 0; // can't express growth from zero as a percent
  return Math.round(((now - before) / before) * 100);
}

function scoreDay(d, goals) {
  const highlights = [];
  if (goals.waterTargetMl && d.waterMl >= goals.waterTargetMl) highlights.push('Water goal');
  if (goals.proteinTarget && d.protein >= goals.proteinTarget) highlights.push('Protein goal');
  if (goals.exerciseMinutesTarget && d.exerciseMinutes >= goals.exerciseMinutesTarget) highlights.push('Exercise goal');
  if (goals.calorieTarget && d.calories > 0 && d.calories <= goals.calorieTarget) highlights.push('Calories on target');
  if (d.tasksTotal > 0 && d.tasksCompleted === d.tasksTotal) highlights.push('All tasks done');
  return { score: highlights.length, highlights };
}

/**
 * @param current  exactly the 7 day-rows of the week being summarised (oldest first)
 * @param previous the 7 day-rows before it (may be empty)
 */
function buildWeeklySummary({ current, previous = [], goals = {} }) {
  const loggedFood = current.filter((d) => d.calories > 0);
  const prevLoggedFood = previous.filter((d) => d.calories > 0);

  const totals = {
    calories: Math.round(sum(current, (d) => d.calories)),
    protein: r1(sum(current, (d) => d.protein)),
    waterMl: Math.round(sum(current, (d) => d.waterMl)),
    exerciseMinutes: Math.round(sum(current, (d) => d.exerciseMinutes)),
    caloriesBurned: Math.round(sum(current, (d) => d.caloriesBurned)),
    tasksCompleted: sum(current, (d) => d.tasksCompleted),
    tasksTotal: sum(current, (d) => d.tasksTotal),
    habitsCompleted: sum(current, (d) => d.habitsCompleted),
  };

  const averages = {
    calories: loggedFood.length ? Math.round(totals.calories / loggedFood.length) : 0,
    protein: loggedFood.length ? r1(totals.protein / loggedFood.length) : 0,
    waterMl: Math.round(totals.waterMl / 7),
    exerciseMinutes: Math.round(totals.exerciseMinutes / 7),
  };

  const prevAvgCalories = prevLoggedFood.length ? sum(prevLoggedFood, (d) => d.calories) / prevLoggedFood.length : 0;
  const trends = {
    waterMl: pctChange(totals.waterMl, sum(previous, (d) => d.waterMl)),
    exerciseMinutes: pctChange(totals.exerciseMinutes, sum(previous, (d) => d.exerciseMinutes)),
    calories: pctChange(averages.calories, prevAvgCalories),
    tasksCompleted: pctChange(totals.tasksCompleted, sum(previous, (d) => d.tasksCompleted)),
  };

  const goalDays = {
    water: goals.waterTargetMl ? current.filter((d) => d.waterMl >= goals.waterTargetMl).length : 0,
    protein: goals.proteinTarget ? current.filter((d) => d.protein >= goals.proteinTarget).length : 0,
    exercise: goals.exerciseMinutesTarget ? current.filter((d) => d.exerciseMinutes >= goals.exerciseMinutesTarget).length : 0,
    calories: goals.calorieTarget ? current.filter((d) => d.calories > 0 && d.calories <= goals.calorieTarget).length : 0,
  };

  let bestDay = null;
  for (const d of current) {
    const { score, highlights } = scoreDay(d, goals);
    const better =
      !bestDay || score > bestDay.score ||
      (score === bestDay.score && d.exerciseMinutes > bestDay.exerciseMinutes);
    if (score > 0 && better) bestDay = { date: d.date, score, highlights, exerciseMinutes: d.exerciseMinutes };
  }

  const weights = current.filter((d) => d.weighIn && d.weightKg != null);
  const weight = weights.length
    ? { start: weights[0].weightKg, end: weights[weights.length - 1].weightKg, change: r1(weights[weights.length - 1].weightKg - weights[0].weightKg) }
    : null;

  const activeDays = current.filter((d) =>
    d.waterMl > 0 || d.calories > 0 || d.exerciseMinutes > 0 || d.tasksCompleted > 0 || d.habitsCompleted > 0).length;

  return {
    from: current[0]?.date,
    to: current[current.length - 1]?.date,
    totals, averages, trends, goalDays, bestDay, weight, activeDays,
    days: current.map((d) => ({ date: d.date, calories: Math.round(d.calories), waterMl: d.waterMl, exerciseMinutes: d.exerciseMinutes })),
  };
}

/** Monday-to-Sunday week that contains `dateStr`, as {from, to}. */
function weekContaining(dateStr, weekdayOf) {
  const dow = weekdayOf(dateStr); // 0 = Sun
  const sinceMonday = (dow + 6) % 7;
  const from = addDays(dateStr, -sinceMonday);
  return { from, to: addDays(from, 6) };
}

module.exports = { buildWeeklySummary, weekContaining, scoreDay };
