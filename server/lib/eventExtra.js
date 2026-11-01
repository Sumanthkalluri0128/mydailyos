// Festival / wedding / trip windows and diet breaks widen the day's calorie budget (see coachH.dayEffect). This file loads the saved window
// from the database; the maths lives in eventExtraPure.js. Home, the planner, quests, level and the over-day advice all use the same numbers.
const CoachState = require('../models/CoachState');
const { dailyTarget, expectedEnergy } = require('./energy');
const { extraMapFor, calorieTargetFor } = require('./eventExtraPure');

/** { date: extraKcal } for a user. Never throws: no saved window = no extra. */
async function eventExtraMap(uid, dates, profile) {
  try {
    const st = await CoachState.findOne({ userId: uid }).select('event dietBreak').lean();
    if (!st || (!(st.event && st.event.kind) && !(st.dietBreak && st.dietBreak.from))) return {};
    const e = expectedEnergy(profile || {});
    return extraMapFor({ event: st.event, dietBreak: st.dietBreak, dates, target: dailyTarget(profile || {}), tdee: e?.tdee || null, profile: profile || {} });
  } catch { return {}; }
}

module.exports = { extraMapFor, eventExtraMap, calorieTargetFor };
