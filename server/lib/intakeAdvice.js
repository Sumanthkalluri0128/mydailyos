// "Go a little lighter after heavy days": reads the last days of eating and says, in numbers, how much lighter the next
// few days should be, and what the plan should lean on (protein, fibre) because the last days were short on it.
//
// Principles (same spirit as overDays.js):
//   * a PARTIAL, spread-out correction (100-250 kcal a day for 2-4 days), never a crash cut, never below the safe floor
//   * nobody is told to "burn it off"; no cut at all when they were already eating near the floor
//   * the same numbers feed the warning banners AND the meal planner, so what you are told and what you are planned match
const { addDays } = require('./dates');
const { analyseOverDays } = require('./overEngine');

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
function intakeAdvice({ days = [], target, floor = 1200, today, direction = 'lose', weightTrendPerWeek = null, profile = null, hour = null, paceKg = null }) {
  // The weekly-ledger engine (lib/overEngine.js) decides: capped credit for light days, unlogged days are unknown, a share (not all)
  // of the surplus is recovered over a few days, floor always held, no cut after a very light day or when the weight is not rising.
  return analyseOverDays({ profile, days, today, target, floor, direction, hour, weightTrendPerWeek, paceKg });
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
