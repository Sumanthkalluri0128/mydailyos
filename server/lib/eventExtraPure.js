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

/** The day's calorie target INCLUDING the window's room, so a festival / trip / diet-break day is judged fairly. */
const calorieTargetFor = (t, date) => (Number(t?.calories) || 0) + (Number(t?.extraByDate?.[date]) || 0);

module.exports = { extraMapFor, calorieTargetFor };
