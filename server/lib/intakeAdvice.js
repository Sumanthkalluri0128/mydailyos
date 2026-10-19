// "Go a little lighter after heavy days": reads the last days of eating and says, in numbers, how much lighter the next
// few days should be, and what the plan should lean on (protein, fibre) because the last days were short on it.
//
// Principles (same spirit as overDays.js):
//   * a PARTIAL, spread-out correction (100-250 kcal a day for 2-4 days), never a crash cut, never below the safe floor
//   * nobody is told to "burn it off"; no cut at all when they were already eating near the floor
//   * the same numbers feed the warning banners AND the meal planner, so what you are told and what you are planned match
const { addDays } = require('./dates');

const OVER_RATIO = 1.08;      // same line as overDays.isOver: above 108 % of the target counts as "over"
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r10 = (x) => Math.round(x / 10) * 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * @param o.days       ascending [{date, calories}] (calories 0 = nothing logged); today may be in it, half-logged
 * @param o.target     the normal daily calorie target
 * @param o.floor      safe minimum (never plan below it)
 * @param o.today      'YYYY-MM-DD'
 * @param o.direction  'lose' | 'maintain' | 'gain'   (gain: eating more is the goal, so no warnings)
 * @param o.weightTrendPerWeek  kg per week or null (rising while trying to lose makes the warning firmer)
 * @returns {
 *   level: 'none' | 'watch' | 'reduce' | 'high',
 *   runDays, overDays7, weekExcess, lastExcess, lastOverDate,
 *   perDay, days, startDate, adjusted: [{date, target, trim}], todayTarget, tomorrowTarget,
 *   skipCut (true when the person is already near the floor), headline, detail
 * }
 */
function intakeAdvice({ days = [], target, floor = 1200, today, direction = 'lose', weightTrendPerWeek = null }) {
  const none = { level: 'none', runDays: 0, overDays7: 0, weekExcess: 0, lastExcess: 0, lastOverDate: null, perDay: 0, days: 0, startDate: null, adjusted: [], todayTarget: target || null, tomorrowTarget: target || null, skipCut: false, headline: '', detail: '' };
  if (!(target > 0) || !today || direction === 'gain') return none;

  const by = new Map(days.map((d) => [d.date, d]));
  const cal = (date) => n0(by.get(date)?.calories);
  const isOver = (date) => cal(date) > target * OVER_RATIO;

  // Completed days of the last week (today only counts once it is already over: a half-logged day is not "over" yet).
  const window = [];
  for (let i = 0; i <= 7; i += 1) {
    const date = addDays(today, -i);
    if (cal(date) <= 0) continue;
    if (date === today && !isOver(today)) continue;
    window.push(date);
  }
  const logged = window.length;
  const overDates = window.filter(isOver);
  const weekExcess = Math.max(0, Math.round(window.reduce((s, d) => s + (cal(d) - target), 0)));

  // consecutive over days, newest first (today if it is over, else yesterday)
  let cursor = isOver(today) ? today : addDays(today, -1);
  let run = 0; let lastOverDate = null; let runExcess = 0;
  while (isOver(cursor)) { if (!lastOverDate) lastOverDate = cursor; run += 1; runExcess += cal(cursor) - target; cursor = addDays(cursor, -1); }
  if (!lastOverDate && overDates.length) lastOverDate = overDates[0];
  const lastExcess = lastOverDate ? Math.round(cal(lastOverDate) - target) : 0;

  const out = { ...none, runDays: run, overDays7: overDates.length, weekExcess, lastExcess, lastOverDate };

  // Nothing to correct: no over day in the last 3 days and the week as a whole is not over by much.
  const recentOver = overDates.some((d) => d >= addDays(today, -2));
  const bigWeek = weekExcess >= 500 && overDates.length >= 2;
  if (!recentOver && !bigWeek) return out;

  // Already eating near the floor? Then cutting more is the wrong advice (it fuels restrict-then-binge cycles).
  const avg7 = logged ? window.reduce((s, d) => s + cal(d), 0) / logged : 0;
  const room = target - floor;
  if (room < 100 || (logged >= 3 && avg7 < floor * 1.05)) {
    return { ...out, level: 'watch', skipCut: true, headline: 'You went over, but there is nothing to cut', detail: 'You are already close to the lowest sensible intake, so do not eat less to make up for it. A normal day and a 20-30 minute walk is the plan.' };
  }

  const basis = Math.max(lastExcess > 0 ? lastExcess : 0, weekExcess * 0.7);
  const rising = weightTrendPerWeek !== null && weightTrendPerWeek > 0.1 && direction === 'lose';
  let level = 'watch';
  if (run >= 2 || weekExcess >= 400 || basis >= 450) level = 'reduce';
  if (run >= 4 || weekExcess >= 1400 || (run >= 3 && rising)) level = 'high';
  if (rising && level === 'watch') level = 'reduce';

  const nDays = level === 'watch' ? (basis >= 300 ? 2 : 1) : level === 'reduce' ? (basis > 600 ? 4 : 3) : 4;
  const cap = level === 'watch' ? 150 : 250;
  const perDay = clamp(r10((basis * 0.6) / nDays), 100, Math.min(cap, r10(room)));

  // Start with today when the over day is behind us; start tomorrow when today itself is already over.
  const startDate = isOver(today) ? addDays(today, 1) : today;
  const adjusted = Array.from({ length: nDays }, (_, i) => ({ date: addDays(startDate, i), target: Math.max(floor, target - perDay), trim: Math.min(perDay, target - floor) }));
  const adj = new Map(adjusted.map((a) => [a.date, a.target]));

  const when = lastOverDate === today ? 'today' : lastOverDate === addDays(today, -1) ? 'yesterday' : 'recently';
  const headline = level === 'watch'
    ? `You went over ${when}: aim for about ${perDay} kcal less ${nDays > 1 ? `for the next ${nDays} days` : startDate === today ? 'today' : 'tomorrow'}`
    : level === 'reduce'
      ? `${run >= 2 ? `${run} days over in a row` : 'Over this week'}: go about ${perDay} kcal lighter for ${nDays} days`
      : `Several heavy days: a gentle ${perDay} kcal less a day for ${nDays} days`;
  const detail = `${rising ? 'Your weight trend is edging up, so this matters a little more. ' : ''}That is about ${r10(perDay * nDays)} kcal back over ${nDays} day${nDays > 1 ? 's' : ''}, enough to stay on track without skipping meals. The meal planner already uses these lighter targets.`;

  return {
    ...out, level, perDay, days: nDays, startDate, adjusted,
    todayTarget: adj.get(today) ?? target, tomorrowTarget: adj.get(addDays(today, 1)) ?? target,
    headline, detail,
  };
}

/** The daily target to plan with for one date (the normal target unless the advice trims that date). */
function targetForDate(advice, date, target) {
  const hit = (advice?.adjusted || []).find((a) => a.date === date);
  return hit ? hit.target : target;
}

/**
 * What the last few completed days were short on, so the plan can lean on it.
 * @param o.days   ascending [{date, calories, protein, fiber, sugar, sodium}]
 * @param o.ranges macroRanges() result;  o.limits limitTargets() result ({sugar, sodiumMg})
 */
function recentNeeds({ days = [], today, ranges, limits = {} }) {
  const recent = days.filter((d) => d.date < today && d.date >= addDays(today, -4) && n0(d.calories) > 300);
  const out = { protein: false, fiber: false, sugar: false, sodium: false, daysUsed: recent.length };
  if (recent.length < 2 || !ranges) return out;
  const avg = (k) => recent.reduce((s, d) => s + n0(d[k]), 0) / recent.length;
  out.protein = avg('protein') < ranges.protein.min;
  out.fiber = avg('fiber') < ranges.fiber.goal * 0.7;
  out.sugar = limits.sugar ? avg('sugar') > limits.sugar * 1.2 : false;
  out.sodium = avg('sodium') > (limits.sodiumMg || 2000) * 1.15;
  return out;
}

module.exports = { intakeAdvice, targetForDate, recentNeeds, OVER_RATIO };
