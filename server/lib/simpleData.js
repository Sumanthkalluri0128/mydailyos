// Loads what the one-goal / one-focus / one-level / one-shelf screen needs and builds it with lib/simpleGoals.js.
const Profile = require('../models/Profile');
const WeightLog = require('../models/WeightLog');
const FoodLog = require('../models/FoodLog');
const HealthLog = require('../models/HealthLog');
const ActivityLog = require('../models/ActivityLog');
const { buildHistory, lifetimeTotals } = require('./progress');
const { expectedEnergy, dailyTarget, macroRanges } = require('./energy');
const { targetsFor } = require('./journeyData');
const { buildAchievements } = require('./achievements');
const { buildOutcomeBadges, weeklyFlags, cumulativeDeficit } = require('./outcomes');
const { smoothTrend, trendRate, planTrendKg } = require('./trendWeight');
const { safetyReport } = require('./safety');
const { computeStreaks } = require('./streaks');
const { addDays, diffDays } = require('./dates');
const S = require('./simpleGoals');

async function loadSimple(uid, today) {
  const [profile, totals, weightRows, foodDates, tape, sleepRows, strengthRows] = await Promise.all([
    Profile.findOne({ userId: uid }).lean(),
    lifetimeTotals(uid),
    WeightLog.find({ userId: uid }).sort({ date: 1, createdAt: 1 }).select('date weightKg').lean(),
    FoodLog.distinct('date', { userId: uid }),
    HealthLog.find({ userId: uid, type: 'waist' }).sort({ date: 1, createdAt: 1 }).select('date value').lean(),
    HealthLog.find({ userId: uid, type: 'sleep', date: { $gte: addDays(today, -13), $lte: today } }).select('date value').lean(),
    ActivityLog.find({ userId: uid, date: { $gte: addDays(today, -400), $lte: today }, 'sets.0': { $exists: true } }).select('date').lean(),
  ]);
  const p = profile || {};
  const { days } = await buildHistory(uid, addDays(today, -799), today);
  const targets = targetsFor(p);
  const energy = expectedEnergy(p);
  const target = dailyTarget(p);
  const direction = energy?.direction || 'maintain';
  const floor = p.sex === 'male' ? 1500 : 1200;
  const series = smoothTrend(weightRows.map((w) => ({ date: w.date, weightKg: Number(w.weightKg) })));
  const last = series[series.length - 1] || null;
  const rate = trendRate(series, today);
  const plan = p.plan || {};

  // Progress counts from where THIS plan started (see planTrendKg), not from the first weigh-in ever.
  const goalTrend = planTrendKg(plan, weightRows, last?.trendKg ?? null);
  const goal = S.goalCard({ plan, trendKg: goalTrend, rate, today });
  const todayRow = days.find((d) => d.date === today) || null;
  const focus = S.dailyFocus(todayRow, targets);

  const streak = S.streakSummary(foodDates, today);
  const level = S.levelSummary({ days, targets, streaks: { logging: { best: computeStreaks(foodDates, today).longest } }, comebacks: streak.comebacks, floor: p.journey?.xpFloor || 0 });

  const sleep = Object.fromEntries(sleepRows.map((r) => [r.date, Number(r.value)]));
  const score = S.weeklyScoreSimple(days, targets, today, sleep);

  // Badges
  const ach = buildAchievements({ days, totals, goals: p.goals, today });
  const best = (k) => Math.max(ach.streaks[k]?.best || 0, ach.streaks[k]?.current || 0);
  const strengthDates = new Set(strengthRows.map((r) => r.date));
  const flags = weeklyFlags(days, strengthDates, targets.protein, today);
  const startKg = plan.active && plan.startKg ? plan.startKg : (series[0]?.trendKg ?? null);
  const waist0 = tape[0]?.value ?? null, waistNow = tape[tape.length - 1]?.value ?? null;
  const sinceStart = plan.active && plan.startDate ? days.filter((d) => d.date >= plan.startDate) : days.slice(-90);
  const safety = safetyReport({ profile: p, trendRate: rate, avgIntake7: null, loggedDays7: 0 });
  const oc = buildOutcomeBadges({ direction: safety.pauseWeightRewards ? 'maintain' : direction, startKg, trendKg: goalTrend, startWaistCm: waist0, waistCm: waistNow, deficitKcal: cumulativeDeficit(sinceStart, energy?.tdee || 0, floor), proteinWeeks: flags.proteinWeeks, muscleWeeks: flags.muscleWeeks, comebacks: streak.comebacks });
  const val = (id) => oc.badges.find((b) => b.id === id)?.value || 0;
  const inputs = {
    streaks: { logging: best('logging'), water: best('water'), habit: best('habit'), workout: best('workout') }, totals,
    outcomes: { direction: safety.pauseWeightRewards ? 'maintain' : direction, lostKg: val('fat-kg'), lostPct: val('fat-pct'), waistLostCm: val('waist'), deficitKg: oc.deficitKg, proteinWeeks: flags.proteinWeeks, muscleWeeks: flags.muscleWeeks, comebacks: streak.comebacks },
    earnedAt: p.journey?.earnedAt || {},
  };
  let shelves = S.buildShelves(inputs);
  // Remember when each badge was first earned (first run records existing badges with an old date so only new ones count as "last earned").
  const firstRun = !p.journey?.earnedAt || !Object.keys(p.journey.earnedAt).length;
  const earnedAt = { ...(p.journey?.earnedAt || {}) }; let changed = false;
  for (const b of shelves.shelves.flatMap((s) => s.badges)) if (b.earned && !earnedAt[b.id]) { earnedAt[b.id] = firstRun ? '2000-01-01' : today; changed = true; }
  if (changed) { inputs.earnedAt = earnedAt; shelves = S.buildShelves(inputs); }

  const set = {};
  if (changed) set['journey.earnedAt'] = earnedAt;
  if (level.raisedFloor) set['journey.xpFloor'] = level.raisedFloor;
  if (Object.keys(set).length) await Profile.updateOne({ userId: uid }, { $set: set });

  const planActive = !!plan.active;
  const onBreak = !!plan.breakUntil && plan.breakUntil >= today;
  const weeksSinceBreak = planActive ? diffDays(plan.lastBreakEnd && plan.lastBreakEnd > plan.startDate ? plan.lastBreakEnd : plan.startDate, today) / 7 : 0;
  const tv = S.targetsView({ profile: p, target, direction, energy, floor });
  return {
    copy: S.COPY, goal, focus, level, streak, weeklyScore: score, badges: shelves, targets: tv,
    updatedLine: S.updatedLine(p.targetHistory || [], today),
    phaseSuggestion: S.phaseSuggestion({ direction, goal, weeksSinceBreak, onBreak }),
    recap: S.weeklyRecap({ days, targets, today, streak, goal }),
    hideNumbers: !!p.safety?.hideNumbers,
    safety: { level: safety.level, flags: safety.flags },
  };
}

module.exports = { loadSimple };
