// Loads everything the journey needs for one person (profile, goals, logs, weights) and builds it. Shared by the goals and album routes.
const Goal = require('../models/Goal');
const Profile = require('../models/Profile');
const WeightLog = require('../models/WeightLog');
const { buildHistory, lifetimeTotals } = require('./progress');
const { dailyTarget, expectedEnergy, macroTargets, waterTargetMl } = require('./energy');
const { buildJourney } = require('./journey');
const { addDays } = require('./dates');
const FoodLog = require('../models/FoodLog');
const S = require('./simpleGoals');
const { computeStreaks } = require('./streaks');

function targetsFor(profile) {
  const target = dailyTarget(profile);
  const e = expectedEnergy(profile);
  const macros = macroTargets(target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const g = profile?.goals || {};
  return { calories: target || 0, direction: e?.direction || 'maintain', protein: macros?.protein || 0, waterMl: g.waterTargetMl || waterTargetMl(profile?.currentWeightKg) || 0, steps: g.stepsTarget || 0, exerciseMinutes: g.exerciseMinutesTarget || 0 };
}

async function loadJourney(uid, today) {
  const [profile, goals, totals, weightRows] = await Promise.all([
    Profile.findOne({ userId: uid }).lean(),
    Goal.find({ userId: uid }).sort({ done: 1, deadline: 1, createdAt: -1 }).limit(60).lean(),
    lifetimeTotals(uid),
    WeightLog.find({ userId: uid }).sort({ date: 1, createdAt: 1 }).select('date weightKg').lean(),
  ]);
  const oldest = goals.reduce((m, g) => (g.startDate && g.startDate < m ? g.startDate : m), addDays(today, -400));
  const from = oldest < addDays(today, -799) ? addDays(today, -799) : oldest;
  const { days } = await buildHistory(uid, from, today);
  const targets = targetsFor(profile);
  const journey = buildJourney({ days, targets, today, totals, weights: weightRows.map((w) => Number(w.weightKg)), profile, goals: goals.map((g) => ({ ...g, id: String(g._id) })) });
  // ONE level and ONE quest list everywhere (Section B): the characters, the Home card and the Goals screen all read these.
  const foodDates = await FoodLog.distinct('date', { userId: uid });
  const streak = S.streakSummary(foodDates, today);
  journey.level = S.levelSummary({ days, targets, streaks: { logging: { best: computeStreaks(foodDates, today).longest } }, comebacks: streak.comebacks, floor: profile?.journey?.xpFloor || 0 });
  const focus = S.dailyFocus(days.find((d) => d.date === today) || null, targets);
  journey.today = { ...journey.today, quests: focus.quests.map((q) => ({ ...q, xp: 0 })), done: focus.done, total: focus.total, xpEarned: 0, xpAvailable: 0, complete: focus.complete };
  journey.streak = { ...journey.streak, current: streak.current, best: Math.max(journey.streak?.best || 0, streak.longest) };
  return { targets, ...journey };
}
module.exports = { loadJourney, targetsFor };
