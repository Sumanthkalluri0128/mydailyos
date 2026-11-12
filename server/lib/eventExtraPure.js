// Pure half of the festival / trip / diet-break budget room (no database): used by quests, level and score, which are unit-tested without Mongo.
const H = require('./coachH');

/** { 'YYYY-MM-DD': extraKcal } for the dates inside an active window (other dates are simply missing). */
function extraMapFor({ event = null, dietBreak = null, dates = [], target = 0, tdee = null, profile = {} }) {
  const out = {};
  if (!(target > 0)) return out;
  for (const date of dates) {
    const d = H.dayEffect({ event, dietBreak, date, target, tdee, profile });
    if (d.extra > 0) out[date] = d.extra;
  }
  return out;
}

/**
 * The calorie budget a day is judged against. When the day's real budget is known (`budgetByDate`, the same number Home shows: target +
 * the credited share of extra activity + festival / trip / diet-break room) it wins, so a training day is not judged against the smaller
 * base target. Without it, falls back to base target + the window's room.
 */
const calorieTargetFor = (t, date) => {
  const b = Number(t?.budgetByDate?.[date]);
  if (b > 0) return b;
  return (Number(t?.calories) || 0) + (Number(t?.extraByDate?.[date]) || 0);
};

/** Top of the protein range for a day: the base range, widened when that day's budget is bigger (the 35%-of-calories cap grows with it). */
const proteinMaxFor = (t, date) => Math.max(Number(t?.proteinMax) || 0, Number(t?.proteinMaxByDate?.[date]) || 0);

module.exports = { extraMapFor, calorieTargetFor, proteinMaxFor };
