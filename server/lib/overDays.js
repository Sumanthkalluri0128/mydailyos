// Managing continuous over-calorie days — kindly. Detects how far a run has gone, checks whether the cause is eating, the log or an
// unrealistic pace, spreads any correction thinly (never a crash cut), and finds what is driving the overs from the logs.
const { addDays, weekday } = require('./dates');

const OVER_RATIO = 1.08; // matches caloriesOnTrack(): above 108% of target is "over"
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r10 = (x) => Math.round(x / 10) * 10;

const isOver = (d, target) => !!d && d.calories > target * OVER_RATIO;

/**
 * @param days    ascending [{date, calories}]; calories 0 = nothing logged
 * @param opts    {direction, paceKg, weightTrendPerWeek (kg/wk or null), floor}
 * One over day: a gentle note. 2+ in a row: a course-correct card. A week over on average: root-cause review.
 */
function overStatus({ days, target, today, direction = 'lose', paceKg = 0.5, weightTrendPerWeek = null }) {
  const base = { tier: 'none', runDays: 0, overDays7: 0, loggedDays7: 0, avgRatio7: null, overKcal: 0, cause: null, easierPace: null, message: '' };
  if (!(target > 0) || direction === 'gain') return base;
  const by = new Map(days.map((d) => [d.date, d]));
  // Count back from today (only if today is already over — a half-logged day is not "over" yet) else from yesterday.
  let cursor = isOver(by.get(today), target) ? today : addDays(today, -1);
  let run = 0, over = 0;
  while (isOver(by.get(cursor), target)) { run += 1; over += by.get(cursor).calories - target; cursor = addDays(cursor, -1); }

  const week = days.filter((d) => d.date > addDays(today, -7) && d.date <= today && d.calories > 0);
  const overDays7 = week.filter((d) => isOver(d, target)).length;
  const avgRatio7 = week.length ? avg(week.map((d) => d.calories)) / target : null;
  // A real "week over": most days ran over AND the average is clearly above target (three heavy days in an otherwise normal week is a streak, not a week).
  const weekOver = week.length >= 4 && avgRatio7 > 1.05 && overDays7 >= 4;
  const tier = weekOver ? 'week' : run >= 2 ? 'streak' : run === 1 ? 'single' : 'none';
  const out = { ...base, tier, runDays: run, overDays7, loggedDays7: week.length, avgRatio7: avgRatio7 === null ? null : Math.round(avgRatio7 * 100) / 100, overKcal: Math.round(tier === 'week' ? Math.max(0, week.reduce((s, d) => s + d.calories, 0) - target * week.length) : over) };

  if (tier === 'single') out.message = 'A little over today is completely normal, and one day barely moves your weight. Nothing to fix. Just log your next meal as usual.';
  if (tier === 'streak') out.message = `${run} days a little over in a row. That is a pattern worth a gentle nudge, not a reason to feel bad. A small adjustment over the next few days is enough.`;

  if (tier === 'streak' || tier === 'week') {
    // Before blaming the person: is the weight actually going up? If not, the target or the log is probably off.
    const rising = weightTrendPerWeek !== null && weightTrendPerWeek > 0.1;
    if (weightTrendPerWeek !== null && !rising && direction === 'lose') {
      out.cause = 'target_or_log';
      out.message = 'Your weight is not going up even though the log says you are over. So the target is probably a bit low for your body, or some meals are logged heavier than they were. A steady weight with "over" days is a sign to review the numbers, not to eat less.';
    } else if (paceKg >= 0.75) {
      out.cause = 'pace_too_aggressive';
      out.easierPace = paceKg > 0.5 ? 0.5 : Math.max(0.25, Math.round((paceKg - 0.25) * 100) / 100);
      out.message = `At ${paceKg} kg a week the daily budget is tight, and being over most days usually means the pace is unrealistic, not that you are failing. An easier pace of ${out.easierPace} kg a week gives you a bigger budget and the same direction.`;
    } else out.cause = 'eating';
  }
  if (tier === 'week' && out.cause === 'eating') out.message = 'This week ran over your target on average. Let us look at what is driving it, then pick one small change. No catching up required.';
  return out;
}

/**
 * Spread a correction thinly: trim about 150–250 kcal a day for the next 3–4 days, and never below the safe floor.
 * @returns null when there is nothing to correct; else {perDay, days, newTarget, recovers, safe, note}
 */
function spreadCorrection({ overKcal, target, floor = 1200, avgIntake7 = null }) {
  if (!(overKcal > 0) || !(target > 0)) return null;
  const room = target - floor; // how far the target can drop and still sit on the floor
  // Eating near the floor already: no cuts at all (this also guards against restrict-then-binge cycles).
  if (room < 100 || (avgIntake7 !== null && avgIntake7 < floor * 1.05)) {
    return { perDay: 0, days: 0, newTarget: target, recovers: 0, safe: false, note: 'You are already close to the lowest sensible intake, so skip any cutting. A 20–30 minute walk and a normal day tomorrow is the plan.' };
  }
  const days = overKcal > 600 ? 4 : 3;
  let perDay = Math.min(250, Math.max(150, r10(overKcal / days)));
  perDay = Math.min(perDay, r10(room));
  const recovers = Math.min(overKcal, perDay * days);
  return {
    perDay, days, newTarget: target - perDay, recovers: Math.round(recovers), safe: true,
    note: `About ${perDay} kcal lighter for ${days} days brings you back on track. Fully "paying back" ${Math.round(overKcal)} kcal is not needed; a gentle partial correction is enough.`,
  };
}

/** Local hour (0–23) of a timestamp for someone whose JS getTimezoneOffset() is `tzOffsetMin` (IST = -330). */
function localHour(createdAt, tzOffsetMin = 0) {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t - tzOffsetMin * 60000).getUTCHours();
}
const isWeekend = (date) => [0, 6].includes(weekday(date));

/**
 * What is driving the over days? Looks only at the over days and compares them with the other days.
 * @param rows  [{date, mealType, calories, createdAt, foodName, trigger}] food entries of the window
 * @param days  [{date, calories}] the same window
 */
function rootCauses({ rows, days, target, tzOffsetMin = 0 }) {
  const overDates = days.filter((d) => isOver(d, target)).map((d) => d.date);
  const okDates = days.filter((d) => d.calories > 0 && !isOver(d, target)).map((d) => d.date);
  if (overDates.length < 3) return { overDays: overDates.length, findings: [], enough: false };
  const n = overDates.length;
  const onOver = rows.filter((r) => overDates.includes(r.date));
  const findings = [];

  // 1) late-evening snacks
  const lateDays = overDates.filter((d) => onOver.filter((r) => r.date === d && r.mealType === 'snacks' && (localHour(r.createdAt, tzOffsetMin) ?? -1) >= 18).reduce((s, r) => s + r.calories, 0) >= 400);
  if (lateDays.length >= 2 && lateDays.length / n >= 0.4) findings.push({ id: 'late-snacks', icon: '🌙', share: lateDays.length / n, title: `${lateDays.length} of ${n} over days had 400+ kcal of snacks after 6 pm`, detail: 'Evening snacking is the biggest swing. Try moving a protein snack to 5 pm, or a plated portion instead of eating from the pack.' });

  // 2) weekends
  const wk = overDates.filter(isWeekend);
  if (wk.length >= 2 && wk.length / n >= 0.6) {
    const wkDinner = avg(wk.map((d) => onOver.filter((r) => r.date === d && r.mealType === 'dinner').reduce((s, r) => s + r.calories, 0)));
    findings.push({ id: 'weekends', icon: '🎉', share: wk.length / n, title: `${wk.length} of ${n} over days were weekend days`, detail: wkDinner >= 600 ? `Weekend dinners average about ${r10(wkDinner)} kcal. Plan one treat meal and keep the others normal.` : 'Plan one treat meal for the weekend instead of a free-for-all day.' });
  }

  // 3) the meal where over days differ most from on-target days
  const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const perMeal = (dates, m) => avg(dates.map((d) => rows.filter((r) => r.date === d && r.mealType === m).reduce((s, r) => s + r.calories, 0)));
  if (okDates.length >= 2) {
    const diffs = MEALS.map((m) => ({ m, diff: perMeal(overDates, m) - perMeal(okDates, m) })).sort((a, b) => b.diff - a.diff);
    if (diffs[0].diff >= 150) findings.push({ id: 'meal-gap', icon: '🍽️', share: Math.min(1, diffs[0].diff / 400), title: `${diffs[0].m[0].toUpperCase()}${diffs[0].m.slice(1)} is where over days differ`, detail: `On over days it runs about ${r10(diffs[0].diff)} kcal higher than on your on-target days. That is the easiest meal to adjust.` });
  }

  // 4) a food that keeps showing up
  const seen = new Map();
  for (const d of overDates) for (const name of new Set(onOver.filter((r) => r.date === d && r.calories >= 150).map((r) => r.foodName))) seen.set(name, (seen.get(name) || 0) + 1);
  const top = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3 && top[1] / n >= 0.5) findings.push({ id: 'repeat-food', icon: '🔁', share: top[1] / n, title: `${top[0]} showed up on ${top[1]} of ${n} over days`, detail: 'A lighter version or a smaller portion of this one food is the single biggest lever.' });

  // 5) trigger tags
  const tagDays = new Map();
  for (const d of overDates) for (const tag of new Set(onOver.filter((r) => r.date === d && r.trigger).map((r) => r.trigger))) tagDays.set(tag, (tagDays.get(tag) || 0) + 1);
  const tag = [...tagDays.entries()].sort((a, b) => b[1] - a[1])[0];
  if (tag && tag[1] >= 2 && tag[1] / n >= 0.4) findings.push({ id: 'trigger', icon: '🏷️', share: tag[1] / n, title: `"${tag[0]}" was tagged on ${tag[1]} of ${n} over days`, detail: tag[0] === 'stress' ? 'Stress eating is common and nothing to be ashamed of. A 5-minute walk or a glass of water first often takes the edge off.' : tag[0] === 'bored' ? 'When boredom is the trigger, a quick walk or a call tends to work better than a snack.' : tag[0] === 'late-night' ? 'A set kitchen-closed time and a planned small snack can help.' : 'Knowing the trigger is half the fix. Plan for it in advance.' });

  findings.sort((a, b) => b.share - a.share);
  return { overDays: n, findings: findings.slice(0, 4), enough: true };
}

module.exports = { OVER_RATIO, isOver, overStatus, spreadCorrection, rootCauses, localHour };
