// The north-star plan and everything that hangs under it: trend weight + corridor, the fat-loss score, over-day help,
// outcome badges, pattern insights, the what-if simulator, rewards, events, maintenance breaks and the safety layer.
const express = require('express');
const crypto = require('crypto');
const Profile = require('../models/Profile');
const FoodLog = require('../models/FoodLog');
const Food = require('../models/Food');
const HealthLog = require('../models/HealthLog');
const MealPlan = require('../models/MealPlan');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { addDays, diffDays, todayUtc } = require('../lib/dates');
const { catalogueFoods } = require('../lib/foodCache');
const { loadCore, corridorPlan } = require('../lib/planData');
const { smoothTrend, buildTrend, trendRate, maxSafeWeeklyLossKg } = require('../lib/trendWeight');
const { weeklyScore } = require('../lib/fatLossScore');
const { overStatus, spreadCorrection, rootCauses } = require('../lib/overDays');
const { buildOutcomeBadges, weeklyFlags, cumulativeDeficit } = require('../lib/outcomes');
const { derivePlan, rewardLadder, breakAdvice, eventAdvice, focusProgress, adherenceOf } = require('../lib/northStar');
const { safetyReport } = require('../lib/safety');
const { buildPatterns } = require('../lib/patterns');
const { whatIf } = require('../lib/whatIf');
const { navyBodyFat } = require('../lib/bodyFat');
const { rescueDay } = require('../lib/mealBuilder');
const { intakeAdvice } = require('../lib/intakeAdvice');
const { buildDietDay, adoptFood } = require('../lib/healthyDiet');
const { oilKcal } = require('../lib/oil');
const { computeStreaks } = require('../lib/streaks');
const { startBreak, endBreak, breakExpired } = require('../lib/planState');

const router = express.Router();
router.use(requireAuth);

const todayOf = (req) => (req.query.today ? v.date(req.query.today, 'today') : todayUtc());
const r1 = (x) => Math.round(x * 10) / 10;
const newId = () => crypto.randomBytes(5).toString('hex');

/** Trend weight series from every weigh-in (the profile weight is the fallback when there are none). */
function trendInputs(core) {
  const weights = core.weights.length ? core.weights : (core.profile.currentWeightKg ? [{ date: core.days[core.days.length - 1].date, weightKg: core.profile.currentWeightKg }] : []);
  return { weights, series: smoothTrend(weights) };
}

async function ensureProfile(uid) { return (await Profile.findOne({ userId: uid }).lean()) || (await Profile.create({ userId: uid })).toObject(); }

// GET /api/plan — the plan, how far along it is, this week's focus habits, rewards, events, break advice and the safety state.
router.get('/', wrap(async (req, res) => {
  const today = todayOf(req); const uid = req.user.id;
  let profile = await ensureProfile(uid);
  if (breakExpired(profile, today)) { await Profile.updateOne({ userId: uid }, { $set: endBreak(profile, today) }); profile = await ensureProfile(uid); }
  const core = await loadCore(uid, today);
  const plan = profile.plan || {};
  const { series } = trendInputs(core);
  const last = series[series.length - 1];
  const lost = plan.active && plan.startKg && last ? Math.max(0, plan.startKg - last.trendKg) : 0;
  const total = plan.active && plan.startKg && plan.targetKg ? Math.abs(plan.startKg - plan.targetKg) : 0;
  const rate = trendRate(series, today);
  const safety = safetyReport({ profile: core.profile, trendRate: rate, avgIntake7: avgIntake(core.days, today), loggedDays7: core.days.filter((d) => d.date > addDays(today, -7) && d.calories > 0).length });
  const weeksSince = plan.active ? diffDays(plan.lastBreakEnd && plan.lastBreakEnd > plan.startDate ? plan.lastBreakEnd : plan.startDate, today) / 7 : 0;
  const onBreak = !!plan.breakUntil && plan.breakUntil >= today;
  res.json({
    success: true,
    plan: { active: !!plan.active, startKg: plan.startKg, startDate: plan.startDate, targetKg: plan.targetKg, byDate: plan.byDate, paceKg: plan.paceKg, focus: plan.focus || [], events: plan.events || [], breakUntil: onBreak ? plan.breakUntil : '' },
    progress: plan.active ? { lostKg: r1(lost), totalKg: r1(total), pct: total ? Math.min(100, Math.round((lost / total) * 100)) : 0, trendKg: last?.trendKg ?? null, daysLeft: plan.byDate ? diffDays(today, plan.byDate) : null } : null,
    focus: focusProgress(plan.focus, core.days, core.targets, core.sleep, core.strengthDates, today),
    rewards: rewardLadder(plan.rewards || [], safety.pauseWeightRewards ? 0 : lost),
    break: breakAdvice({ weeksSince, onBreak }),
    event: eventAdvice(plan.events || [], today, core.target, core.floor),
    safety,
    adjustedTarget: Math.max(core.floor, core.target + (eventAdvice(plan.events || [], today, core.target, core.floor).adjust || 0)),
    target: core.target,
  });
}));

function avgIntake(days, today) {
  const w = days.filter((d) => d.date > addDays(today, -7) && d.calories > 0);
  return w.length ? w.reduce((s, d) => s + d.calories, 0) / w.length : null;
}

// PUT /api/plan { targetKg, byDate } — "lose 6 kg by March". Derives a safe pace and three focus habits; also sets the goal weight and pace.
router.put('/', wrap(async (req, res) => {
  const today = todayOf(req); const uid = req.user.id;
  const profile = await ensureProfile(uid);
  const targetKg = v.number(req.body?.targetKg, 'targetKg', { min: 20, max: 400 });
  const byDate = req.body?.byDate ? v.date(req.body.byDate, 'byDate') : '';
  if (byDate && byDate <= today) throw new HttpError(400, 'Pick a date in the future');
  if (!(profile.currentWeightKg > 0)) throw new HttpError(400, 'Add your current weight first');
  const core = await loadCore(uid, today);
  const derived = derivePlan({ currentKg: profile.currentWeightKg, targetKg, byDate, today, heightCm: profile.heightCm, adherence: adherenceOf(core.days, core.targets, core.sleep, core.strengthDates, today) });
  if (!derived.ok) throw new HttpError(400, derived.reason);
  const useSafe = req.body?.useSafeDate === true && derived.suggestedDate;
  const set = {
    'plan.active': true, 'plan.startKg': profile.currentWeightKg, 'plan.startDate': today, 'plan.targetKg': targetKg,
    'plan.byDate': useSafe ? derived.suggestedDate : byDate || derived.suggestedDate || '', 'plan.paceKg': derived.paceKg, 'plan.focus': derived.focus,
    'goals.targetWeightKg': targetKg, 'goals.weeklyPaceKg': derived.paceKg,
  };
  await Profile.updateOne({ userId: uid }, { $set: set }, { upsert: true });
  res.json({ success: true, derived, plan: set });
}));

// Preview without saving: what pace and date would this goal mean?
router.get('/preview', wrap(async (req, res) => {
  const today = todayOf(req); const profile = await ensureProfile(req.user.id);
  const derived = derivePlan({ currentKg: profile.currentWeightKg, targetKg: v.number(req.query.targetKg, 'targetKg', { min: 20, max: 400 }), byDate: req.query.byDate ? v.date(req.query.byDate, 'byDate') : '', today, heightCm: profile.heightCm });
  res.json({ success: true, derived });
}));

router.patch('/focus', wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.focus) ? req.body.focus.filter((x) => typeof x === 'string').slice(0, 3) : null;
  const ok = ['logging', 'protein', 'steps', 'water', 'sleep', 'strength'];
  if (!ids || ids.some((x) => !ok.includes(x))) throw new HttpError(400, 'Choose up to three focus habits');
  await Profile.updateOne({ userId: req.user.id }, { $set: { 'plan.focus': ids } });
  res.json({ success: true, focus: ids });
}));

// ---- rewards the person chooses (never food)
router.post('/rewards', wrap(async (req, res) => {
  const profile = await ensureProfile(req.user.id);
  if ((profile.plan?.rewards || []).length >= 8) throw new HttpError(400, 'You can set up to 8 rewards');
  const reward = { id: newId(), atKg: v.number(req.body?.atKg, 'atKg', { min: 0.1, max: 200 }), text: v.string(req.body?.text, 'text', { max: 80, required: true }), claimedAt: '' };
  await Profile.updateOne({ userId: req.user.id }, { $push: { 'plan.rewards': reward } });
  res.status(201).json({ success: true, reward });
}));
router.post('/rewards/:id/claim', wrap(async (req, res) => {
  const today = todayOf(req);
  const r = await Profile.updateOne({ userId: req.user.id, 'plan.rewards.id': req.params.id }, { $set: { 'plan.rewards.$.claimedAt': today } });
  if (!r.matchedCount) throw new HttpError(404, 'Reward not found');
  res.json({ success: true });
}));
router.delete('/rewards/:id', wrap(async (req, res) => {
  await Profile.updateOne({ userId: req.user.id }, { $pull: { 'plan.rewards': { id: req.params.id } } });
  res.json({ success: true });
}));

// ---- event mode
router.post('/events', wrap(async (req, res) => {
  const profile = await ensureProfile(req.user.id);
  if ((profile.plan?.events || []).length >= 10) throw new HttpError(400, 'You can plan up to 10 events');
  const startDate = v.date(req.body?.startDate, 'startDate'); const endDate = req.body?.endDate ? v.date(req.body.endDate, 'endDate') : startDate;
  if (endDate < startDate) throw new HttpError(400, 'The end date must not be before the start');
  const event = { id: newId(), title: v.string(req.body?.title, 'title', { max: 60, required: true }), startDate, endDate };
  await Profile.updateOne({ userId: req.user.id }, { $push: { 'plan.events': event } });
  res.status(201).json({ success: true, event });
}));
router.delete('/events/:id', wrap(async (req, res) => {
  await Profile.updateOne({ userId: req.user.id }, { $pull: { 'plan.events': { id: req.params.id } } });
  res.json({ success: true });
}));

// ---- maintenance break
router.post('/break', wrap(async (req, res) => {
  const today = todayOf(req); const uid = req.user.id;
  const profile = await ensureProfile(uid);
  if (req.body?.action === 'end') {
    const set = endBreak(profile, today);
    if (set) await Profile.updateOne({ userId: uid }, { $set: set });
    return res.json({ success: true, ended: !!set });
  }
  const r = startBreak(profile, today, 14);
  if (!r.ok) throw new HttpError(400, r.reason);
  if (r.set) await Profile.updateOne({ userId: uid }, { $set: r.set });
  res.json({ success: true, until: r.until, maintenance: r.maintenance });
}));

router.patch('/safety', wrap(async (req, res) => {
  const hide = v.bool(req.body?.hideNumbers, 'hideNumbers');
  await Profile.updateOne({ userId: req.user.id }, { $set: { 'safety.hideNumbers': hide } }, { upsert: true });
  res.json({ success: true, hideNumbers: hide });
}));

// ---- trend weight + corridor
router.get('/trend', wrap(async (req, res) => {
  const today = todayOf(req);
  const core = await loadCore(req.user.id, today, { historyDays: 2 });
  const { weights } = trendInputs(core);
  const t = buildTrend({ weights, plan: corridorPlan(core.profile), today });
  const limit = maxSafeWeeklyLossKg(core.profile.currentWeightKg);
  res.json({ success: true, ...t, maxSafeWeeklyLossKg: limit });
}));

// ---- graded fat-loss score on the weekly average
router.get('/score', wrap(async (req, res) => {
  const today = todayOf(req);
  const core = await loadCore(req.user.id, today, { historyDays: 14 });
  res.json({ success: true, ...weeklyScore(core.days, core.targets, today, core.sleep), caloriesTarget: core.target });
}));

// ---- over-calorie days: tiers, spread correction, root causes
router.get('/over-days', wrap(async (req, res) => {
  const today = todayOf(req); const uid = req.user.id;
  const tz = Number.isFinite(Number(req.query.tz)) ? Number(req.query.tz) : 0;
  const core = await loadCore(uid, today, { historyDays: 35 });
  const { series } = trendInputs(core);
  const rate = trendRate(series, today);
  const days = core.days.map((d) => ({ date: d.date, calories: d.calories }));
  const status = overStatus({ days, target: core.target, today, direction: core.direction, paceKg: core.profile.goals?.weeklyPaceKg || 0.5, weightTrendPerWeek: rate });
  const correction = status.tier === 'streak' || (status.tier === 'single' && status.overKcal >= 400) ? spreadCorrection({ overKcal: status.overKcal, target: core.target, floor: core.floor, avgIntake7: avgIntake(core.days, today) }) : null;
  let causes = null;
  if (status.tier === 'week' || status.tier === 'streak') {
    const rows = await FoodLog.find({ userId: uid, date: { $gt: addDays(today, -28), $lte: today } }).select('date mealType foodName createdAt trigger nutritionTotal').lean();
    causes = rootCauses({ rows: rows.map((r) => ({ date: r.date, mealType: r.mealType, foodName: r.foodName, createdAt: r.createdAt, trigger: r.trigger, calories: Number(r.nutritionTotal?.calories || 0) })), days: core.days.map((d) => ({ date: d.date, calories: d.calories })).filter((d) => d.date > addDays(today, -28)), target: core.target, tzOffsetMin: tz });
  }
  const easierTarget = status.easierPace && core.energy ? Math.max(core.floor, Math.round((core.energy.tdee - (status.easierPace * 7700) / 7) / 10) * 10) : null;
  // "Go a little lighter" advice: also fires after a single over day, with the exact lighter target for the next days (the planner uses the same numbers)
  const adv = intakeAdvice({ days, target: core.target, floor: core.floor, today, direction: core.direction, weightTrendPerWeek: rate });
  const advice = adv.level === 'none' ? null : { level: adv.level, headline: adv.headline, detail: adv.detail, perDay: adv.perDay, days: adv.days, startDate: adv.startDate, skipCut: adv.skipCut, todayTarget: adv.todayTarget, tomorrowTarget: adv.tomorrowTarget, runDays: adv.runDays, weekExcess: adv.weekExcess, lastExcess: adv.lastExcess };
  res.json({ success: true, ...status, target: core.target, correction, causes, easierTarget, trendPerWeek: rate, advice });
}));

// ---- gentle one-day plan from the planner
router.post('/rescue-day', wrap(async (req, res) => {
  const uid = req.user.id;
  const date = v.date(req.body?.date, 'date');
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();
  if (date < today) throw new HttpError(400, 'That day is over. Past days cannot be planned.');
  const core = await loadCore(uid, today, { historyDays: 2 });
  if (!core.ranges) throw new HttpError(400, 'Add your height, age and weight first so we can size the day');
  const [shared, mine, recent, logged] = await Promise.all([
    catalogueFoods(Food), Food.find({ userId: uid, hidden: { $ne: true } }).limit(2000).lean(), FoodLog.find({ userId: uid }).sort({ createdAt: -1 }).limit(120).select('foodId').lean(),
    FoodLog.find({ userId: uid, date }).select('mealType nutritionTotal').lean(),
  ]);
  // Anything already logged on that day is fixed: those meals are not re-planned and their kcal / protein come off the day's budget.
  const eaten = logged.reduce((a, l) => ({ calories: a.calories + Number(l.nutritionTotal?.calories || 0), protein: a.protein + Number(l.nutritionTotal?.protein || 0) }), { calories: 0, protein: 0 });
  const fixedMeals = [...new Set(logged.map((l) => l.mealType))];
  const day = rescueDay({ foods: [...mine, ...shared], target: core.target, floor: core.floor, ranges: core.ranges, recentIds: new Set(recent.map((r) => String(r.foodId))), eaten, fixedMeals });
  if (!day.plan.length) throw new HttpError(422, fixedMeals.length >= 4 ? 'Every meal of that day is already logged, so there is nothing left to plan.' : 'Not enough foods to build a plan yet. Log a few meals first');
  await MealPlan.deleteMany({ userId: uid, date, rescue: true, logged: false });
  const items = await MealPlan.insertMany(day.plan.map((p) => ({ userId: uid, date, rescue: true, mealType: p.mealType, foodId: p.foodId, foodName: p.foodName, quantity: p.quantity, servingUnit: p.servingUnit, calories: p.calories, protein: p.protein, fiber: p.fiber })));
  res.status(201).json({ success: true, goal: day.goal, totalCalories: day.totalCalories, totalProtein: day.totalProtein, eatenCalories: day.eatenCalories, remaining: day.remaining, fixedMeals: day.fixedMeals, items });
}));

// ---- a balanced, varied healthy day built from a curated food pool (not limited to what the person has logged)
const dietOf = (x) => (['v', 'e', 'n'].includes(x) ? x : 'v');
async function dietDayFor(req, src) {
  const uid = req.user.id;
  const today = todayOf(req);
  const date = src.date ? v.date(src.date, 'date') : today;
  const core = await loadCore(uid, today, { historyDays: 2 });
  const diet = dietOf(src.diet), variant = Math.max(0, Math.min(50, Number(src.variant) || 0));
  const day = buildDietDay({ target: core.target || 1800, proteinGoal: core.ranges?.protein?.goal || 0, floor: core.floor, diet, seed: `${date}|${variant}` });
  return { date, diet, variant, needsProfile: !core.ranges, ...day };
}
router.get('/diet-day', wrap(async (req, res) => { res.json({ success: true, ...(await dietDayFor(req, req.query)) }); }));
router.post('/diet-day/apply', wrap(async (req, res) => {
  const uid = req.user.id;
  const day = await dietDayFor(req, req.body || {});   // rebuilt on the server: never trusts client-sent items
  await MealPlan.deleteMany({ userId: uid, date: day.date, why: 'Healthy day', logged: false });
  const rows = [];
  for (const m of day.meals) for (const it of m.items) {
    const food = await adoptFood(Food, uid, it.name);
    if (!food) continue;
    rows.push({ userId: uid, date: day.date, mealType: m.mealType, foodId: food._id, foodName: food.name, quantity: it.qty, servingUnit: food.servingUnit, calories: it.kcal, protein: it.protein, fiber: it.fiber, why: 'Healthy day' });
  }
  const items = await MealPlan.insertMany(rows);
  res.status(201).json({ success: true, date: day.date, count: items.length, totals: day.totals });
}));

// ---- outcome badges, body composition
router.get('/outcomes', wrap(async (req, res) => {
  const today = todayOf(req); const uid = req.user.id;
  const core = await loadCore(uid, today, { historyDays: 200 });
  const profile = core.profile; const plan = profile.plan || {};
  const { series } = trendInputs(core);
  const last = series[series.length - 1];
  const rate = trendRate(series, today);
  const safety = safetyReport({ profile, trendRate: rate, avgIntake7: avgIntake(core.days, today), loggedDays7: core.days.filter((d) => d.date > addDays(today, -7) && d.calories > 0).length });
  const tape = await HealthLog.find({ userId: uid, type: { $in: ['waist', 'hips', 'neck'] } }).sort({ date: 1, createdAt: 1 }).select('type date value').lean();
  const by = (t) => tape.filter((x) => x.type === t);
  const first = (t) => by(t)[0]?.value ?? null, latest = (t) => by(t).slice(-1)[0]?.value ?? null;
  const foodDates = await FoodLog.distinct('date', { userId: uid });
  const streaks = computeStreaks(foodDates, today, { freeze: true });
  const startKg = plan.active && plan.startKg ? plan.startKg : (series[0]?.trendKg ?? null);
  const sinceStart = plan.active && plan.startDate ? core.days.filter((d) => d.date >= plan.startDate) : core.days.slice(-90);
  const maintenance = core.energy?.tdee || 0;
  const flags = weeklyFlags(core.days, core.strengthDates, core.targets.protein, today);
  const out = buildOutcomeBadges({
    direction: safety.pauseWeightRewards ? 'maintain' : core.direction, startKg, trendKg: last?.trendKg ?? null,
    startWaistCm: first('waist'), waistCm: latest('waist'), deficitKcal: cumulativeDeficit(sinceStart, maintenance, core.floor),
    proteinWeeks: flags.proteinWeeks, muscleWeeks: flags.muscleWeeks, comebacks: streaks.comebacks,
  });
  const bf = (w, n, h) => navyBodyFat({ sex: profile.sex, heightCm: profile.heightCm, waistCm: w, neckCm: n, hipCm: h });
  const bodyFat = { current: bf(latest('waist'), latest('neck'), latest('hips')), start: bf(first('waist'), first('neck') ?? latest('neck'), first('hips') ?? latest('hips')) };
  bodyFat.change = bodyFat.current !== null && bodyFat.start !== null ? r1(bodyFat.current - bodyFat.start) : null;
  res.json({ success: true, ...out, bodyFat, tape: { waist: { start: first('waist'), now: latest('waist') }, hips: { start: first('hips'), now: latest('hips') } }, streak: { weekly: streaks.weekly, comeback: streaks.comeback, comebacks: streaks.comebacks, lapsed: streaks.lapsed }, safety: { level: safety.level, pauseWeightRewards: safety.pauseWeightRewards } });
}));

// ---- personal pattern insights
router.get('/patterns', wrap(async (req, res) => {
  const today = todayOf(req); const uid = req.user.id;
  const core = await loadCore(uid, today, { historyDays: 90 });
  const meals = await FoodLog.find({ userId: uid, date: { $gt: addDays(today, -90), $lte: today } }).select('date mealType').lean();
  const insights = buildPatterns({ days: core.days, sleep: core.sleep, meals, target: core.target });
  res.json({ success: true, insights, hasSleep: Object.keys(core.sleep).length > 0 });
}));

// ---- what-if
router.get('/what-if', wrap(async (req, res) => {
  const today = todayOf(req);
  const profile = await ensureProfile(req.user.id);
  const { series } = trendInputs(await loadCore(req.user.id, today, { historyDays: 2 }));
  const current = series.length ? series[series.length - 1].trendKg : profile.currentWeightKg;
  const out = whatIf({ currentKg: current, targetKg: profile.goals?.targetWeightKg, paceKg: profile.goals?.weeklyPaceKg || 0.5, extraKcal: v.number(req.query.extraKcal, 'extraKcal', { min: 0, max: 10000, required: false, def: 0 }), repeatsPerWeek: v.number(req.query.repeats, 'repeats', { min: 0, max: 14, required: false, def: 0 }), today });
  res.json({ success: true, result: out });
}));

// ---- hidden oil (teaspoons) for a day
router.get('/oil', wrap(async (req, res) => {
  const date = v.date(req.query.date, 'date');
  const rows = await HealthLog.find({ userId: req.user.id, type: 'oil', date }).sort({ createdAt: -1 }).lean();
  const tsp = rows.reduce((s, r) => s + r.value, 0);
  res.json({ success: true, tsp: r1(tsp), kcal: oilKcal(tsp), entries: rows });
}));

module.exports = router;
