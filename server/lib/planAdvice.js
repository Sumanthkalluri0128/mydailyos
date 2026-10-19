// One place that turns "what has this person eaten lately" into: the intake advice (go lighter?), the calorie target for each upcoming
// day, what the recent days were short on, and the diet to plan for. Used by the warning banners and by the meal planner, so the
// number you are warned about is the number the plan uses.
const { loadCore } = require('./planData');
const { smoothTrend, trendRate } = require('./trendWeight');
const { intakeAdvice, targetForDate, recentNeeds } = require('./intakeAdvice');
const { limitTargets } = require('./energy');
const { addDays } = require('./dates');

async function loadAdvice(uid, today, { dates = [] } = {}) {
  const core = await loadCore(uid, today, { historyDays: 35 });
  const weights = core.weights.length ? core.weights : (core.profile.currentWeightKg ? [{ date: today, weightKg: core.profile.currentWeightKg }] : []);
  const rate = weights.length >= 2 ? trendRate(smoothTrend(weights), today) : null;
  const days = core.days.map((d) => ({ date: d.date, calories: d.calories, protein: d.protein, fiber: d.fiber, sugar: d.sugar, sodium: d.sodium }));
  const advice = core.target > 0 ? intakeAdvice({ days, target: core.target, floor: core.floor, today, direction: core.direction, weightTrendPerWeek: rate }) : null;
  const limits = core.target > 0 ? limitTargets(core.target) : {};
  const needs = recentNeeds({ days, today, ranges: core.ranges, limits });
  const targets = {};
  for (const d of dates) targets[d] = advice ? targetForDate(advice, d, core.target) : core.target;
  return { core, advice, needs, targets, limits, trendPerWeek: rate, days };
}

module.exports = { loadAdvice, addDays };
