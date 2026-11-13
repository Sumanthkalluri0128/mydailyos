// Coaching part 1: rough day, 7-day experiments, weight-jump explainer, sleep-to-eating link, goal-date range, learning coach, treat allowance.
const express = require('express');
const CoachState = require('../models/CoachState');
const Profile = require('../models/Profile');
const WeightLog = require('../models/WeightLog');
const HealthLog = require('../models/HealthLog');
const FoodLog = require('../models/FoodLog');
const Food = require('../models/Food');
const WaterLog = require('../models/WaterLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const v = require('../lib/validate');
const { buildHistory } = require('../lib/progress');
const { dailyTarget, expectedEnergy, resolveTargets } = require('../lib/energy');
const { addDays, todayUtc } = require('../lib/dates');
const G = require('../lib/coachG');
const H = require('../lib/coachH');
const T = require('../lib/toneLines');
const { loadPlanContext } = require('../lib/planContext');
const { detectPlateau } = require('../lib/plateau');
const { estimateWeight } = require('../lib/weightEstimate');
const MealPlan = require('../models/MealPlan');
const { featureView, ALL, homeCardsView } = require('../lib/features');
const { nextStep } = require('../lib/nextStep');
const { s, body } = require('../lib/schema');
const TODAY = s.date();                       // todayOf(req) reads body.today, so every schema below keeps it
const { SLEEP_CHOICES, ENERGY_CHOICES, pickSleep, coachAdvice } = require('../lib/checkin');
const { planTrendKg } = require('../lib/trendWeight');
const { goalContext, goalTargets } = require('../lib/progressView');
const { dayGuide, entryCheck, suggestActivityLevel, isTrained, weekdayMon0 } = require('../lib/dailyCoach');
const { loadDaily, refreshAutoActivity } = require('../lib/dailyCoachData');
const { weeklyDecision } = require('../lib/weeklyDecision');
const { dailyDecision, fastTrend } = require('../lib/dailyDecision');
const Readiness = require('../models/Readiness');
const BodyPlanSession = require('../models/BodyPlanSession');
const ActivityLog = require('../models/ActivityLog');
const { strengthTrend } = require('../lib/strengthTrend');
const { cleanEntry, readinessScore, sessionAdjust, recoverySummary } = require('../lib/readiness');
const { dayPlan, crossCheck, nextAction } = require('../lib/coachSync');
const { dropOutliers } = require('../lib/robustWeights');
const { smoothTrend, trendRate } = require('../lib/trendWeight');
const { budgetOf } = require('../lib/dailyCoach');
const { compositionChange, measurePrompts } = require('../lib/bodySignals');
const { retentionFlags } = require('../lib/retention');
const { replanRestOfDay } = require('../lib/replanDay');
const { mealProteinGap } = require('../lib/mealGap');
const { autoSafe, snapshotGoals, restoreSet, logEntry, pushLog, changelogView, undoView, undoneRecently } = require('../lib/coachHub');
const { diffDays } = require('../lib/dates');
const { refreshStoredTarget } = require('../lib/profileEnergy');
const { calorieFloorOf, KCAL_PER_KG } = require('../lib/energy');
const CoachLock = require('../models/CoachLock');
const { withLease, makeMongoStore } = require('../lib/dbLock');
const { signalsOf, shouldRefresh, sessionsMoved, decisionId } = require('../lib/weeklyRefresh');
const { targetOffer } = require('../lib/targetOffer');
const { cycleView, cycleWait, cycleHint, cleanStarts, cycleLength, CYCLE } = require('../lib/cycle');
const { markCoachDirty } = require('../lib/coachDirty');
const B = require('../lib/bodyAnalysis');
const { waterPattern } = require('../lib/cycle');

const router = express.Router();
router.use(requireAuth);

const getState = async (uid) => (await CoachState.findOne({ userId: uid })) || new CoachState({ userId: uid });
const plain = (d) => (d.toObject ? d.toObject() : d);
const todayOf = (req) => (req.query?.today || req.body?.today ? v.date(req.query?.today || req.body?.today, 'today') : todayUtc());

async function context(uid, today) {
  const [profile, history, sleepRows, mealRows, weights] = await Promise.all([
    Profile.findOne({ userId: uid }).lean(),
    buildHistory(uid, addDays(today, -34), today),
    HealthLog.find({ userId: uid, type: 'sleep', date: { $gte: addDays(today, -60), $lte: today } }).select('date value').lean(),
    FoodLog.find({ userId: uid, date: { $gte: addDays(today, -21), $lte: today }, mealType: { $in: ['breakfast', 'snacks'] } }).select('date mealType nutritionTotal').lean(),
    WeightLog.find({ userId: uid, date: { $gte: addDays(today, -60), $lte: today } }).select('date weightKg').lean(),
  ]);
  const target = dailyTarget(profile); const e = expectedEnergy(profile);
  const macros = resolveTargets(profile).macros;
  const waterMl = resolveTargets(profile).waterMl;
  const sleepByDate = {}; for (const s of sleepRows) sleepByDate[s.date] = Math.max(sleepByDate[s.date] || 0, Number(s.value) || 0);
  const breakfastProtein = {}, snackKcal = {};
  for (const m of mealRows) {
    if (m.mealType === 'breakfast') breakfastProtein[m.date] = (breakfastProtein[m.date] || 0) + Number(m.nutritionTotal?.protein || 0);
    else snackKcal[m.date] = (snackKcal[m.date] || 0) + Number(m.nutritionTotal?.calories || 0);
  }
  const days = history.days;
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const tdee = e?.tdee || null;
  return { profile, days, byDate, sleepByDate, weights, target, macros, waterMl, tdee, ctx: { byDate, breakfastProtein, snackKcal, sleepByDate, waterMl } };
}

// Today's sleep + energy check-in and what the coach suggests. Sleep hours from Health Connect count automatically.
async function checkinView(uid, today) {
  const rows = await HealthLog.find({ userId: uid, type: { $in: ['sleep', 'energy'] }, date: today }).select('type value source').lean();
  const sleep = pickSleep(rows.filter((r) => r.type === 'sleep'));
  const en = rows.find((r) => r.type === 'energy');
  const energy = en ? Number(en.value) : null;
  return { date: today, sleepHours: sleep.hours, sleepSource: sleep.source, energy, advice: coachAdvice({ sleepHours: sleep.hours, energy }), choices: { sleep: SLEEP_CHOICES, energy: ENERGY_CHOICES } };
}
router.get('/checkin', wrap(async (req, res) => { res.json({ success: true, checkin: await checkinView(req.user.id, todayOf(req)) }); }));
router.post('/checkin', body(s.object({ sleep: s.string({ max: 10 }), energy: s.number({ min: 1, max: 5, int: true }), today: TODAY })), wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const sleepId = req.body?.sleep; const energy = req.body?.energy;
  if (sleepId != null && sleepId !== '') {
    const choice = SLEEP_CHOICES.find((c) => c.id === sleepId);
    if (!choice) throw new HttpError(400, 'Unknown sleep answer');
    // Never replace real hours from Health Connect with a tapped guess.
    const device = await HealthLog.findOne({ userId: uid, type: 'sleep', date: today, source: 'device' }).lean();
    if (!device) await HealthLog.findOneAndUpdate({ userId: uid, type: 'sleep', date: today }, { $set: { value: choice.hours, source: 'manual', notes: 'One-tap check-in' }, $setOnInsert: { userId: uid } }, { upsert: true, setDefaultsOnInsert: true });
  }
  if (energy != null && energy !== '') {
    const n = Math.round(Number(energy));
    if (!(n >= 1 && n <= 5)) throw new HttpError(400, 'Energy must be 1 to 5');
    await HealthLog.findOneAndUpdate({ userId: uid, type: 'energy', date: today }, { $set: { value: n, source: 'manual' }, $setOnInsert: { userId: uid } }, { upsert: true, setDefaultsOnInsert: true });
  }
  res.json({ success: true, checkin: await checkinView(uid, today) });
}));

// One call for the Home / Weekly cards.
router.get('/state', wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const [st, c] = await Promise.all([getState(uid), context(uid, today)]);
  const state = plain(st);
  const rolled = G.rollExperiment({ state, today, ctx: c.ctx, tipIds: [] });
  if (JSON.stringify(rolled.state.exp) !== JSON.stringify(state.exp) || rolled.state.expHistory.length !== (state.expHistory || []).length) {
    st.exp = rolled.state.exp; st.expHistory = rolled.state.expHistory; st.markModified('exp'); st.markModified('expHistory'); await st.save();
  }
  res.json({
    success: true,
    rough: G.roughDayView({ state, day: c.byDate[today], today }),
    experiment: { current: rolled.current, last: rolled.last },
    treat: G.treatView({ treat: state.treat, today }),
    settings: { tone: state.tone || 'funny', gentle: !!state.gentle },
    checkin: await checkinView(uid, today),
    homeCards: homeCardsView({ counts: await featureCounts(uid), showAll: !!state.showAll }),   // which optional Home cards to show (quiet Home for new people)
    event: H.eventView({ event: state.event, dietBreak: state.dietBreak, today, target: c.target, tdee: c.tdee, profile: c.profile || {} }),
  });
}));

// ---- 1. rough day
router.post('/rough', body(s.object({ on: s.boolean(), today: TODAY })), wrap(async (req, res) => {
  const today = todayOf(req); const on = req.body?.on !== false;
  const st = await getState(req.user.id);
  st.rough = { date: on ? today : '' };
  if (on && !st.roughDates.includes(today)) st.roughDates = [...st.roughDates, today].slice(-60);
  await st.save();
  const c = await context(req.user.id, today);
  res.json({ success: true, rough: G.roughDayView({ state: plain(st), day: c.byDate[today], today }) });
}));
/** Dates kept alive by rough-day mode (at least one tiny action done) — used by /api/progress/streaks. */
async function roughKeptFor(uid) {
  const st = await CoachState.findOne({ userId: uid }).select('roughDates').lean();
  const dates = st?.roughDates || [];
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const { days } = await buildHistory(uid, sorted[0], sorted[sorted.length - 1]);
  return G.roughKeptDates(dates, Object.fromEntries(days.map((d) => [d.date, d])));
}

// ---- 2. experiments
const saveExp = async (st, next) => { st.exp = next.exp; st.expHistory = next.expHistory || st.expHistory; st.markModified('exp'); st.markModified('expHistory'); await st.save(); };
router.post('/experiment/tick', wrap(async (req, res) => {
  const today = todayOf(req); const date = v.date(req.body?.date, 'date');
  const st = await getState(req.user.id);
  await saveExp(st, G.tickExperiment(plain(st), date, today));
  const c = await context(req.user.id, today);
  res.json({ success: true, experiment: { current: G.rollExperiment({ state: plain(st), today, ctx: c.ctx }).current } });
}));
router.post('/experiment/skip', wrap(async (req, res) => {
  const today = todayOf(req); const st = await getState(req.user.id);
  const c = await context(req.user.id, today);
  await saveExp(st, G.skipExperiment(plain(st), today, c.ctx, []));
  res.json({ success: true, experiment: { current: G.rollExperiment({ state: plain(st), today, ctx: c.ctx }).current } });
}));
router.post('/experiment/ack', wrap(async (req, res) => {
  const st = await getState(req.user.id);
  const h = (st.expHistory || []).map((x) => ({ ...x, announced: true }));
  st.expHistory = h; st.markModified('expHistory'); await st.save();
  res.json({ success: true });
}));

// ---- 3-5. explainers (read-only)
router.get('/weight-jump', wrap(async (req, res) => {
  const today = todayOf(req); const c = await context(req.user.id, today);
  res.json({ success: true, ...G.explainJump({ weights: c.weights, days: c.days, sleepByDate: c.sleepByDate, today }) });
}));
router.get('/sleep-eating', wrap(async (req, res) => {
  const today = todayOf(req); const c = await context(req.user.id, today);
  res.json({ success: true, ...G.sleepEating({ days: c.days, sleepByDate: c.sleepByDate }) });
}));
router.get('/goal-range', wrap(async (req, res) => {
  const today = todayOf(req); const c = await context(req.user.id, today);
  // Same target and same "now" as the goal card, so "to go" reads the same everywhere.
  const gc = goalContext(c.profile, c.weights);
  res.json({ success: true, ...G.goalRange({ weights: c.weights, goalKg: gc.targetKg, today, nowKg: gc.onPlan ? gc.nowKg : null }) });
}));

// ---- 6. learning
router.post('/learn', wrap(async (req, res) => {
  const key = v.string(req.body?.key, 'key', { max: 60, required: true });
  const action = v.oneOf(req.body?.action, 'action', ['shown', 'accepted']);
  const st = await getState(req.user.id);
  st.learn = G.learnRecord(plain(st).learn || {}, key, action); st.markModified('learn'); await st.save();
  res.json({ success: true });
}));
router.get('/learn', wrap(async (req, res) => {
  const st = plain(await getState(req.user.id));
  res.json({ success: true, weights: Object.fromEntries(Object.keys(st.learn || {}).map((k) => [k, G.learnWeight(st.learn, k)])), count: Object.keys(st.learn || {}).length });
}));
router.delete('/learn', wrap(async (req, res) => {
  const st = await getState(req.user.id); st.learn = {}; st.markModified('learn'); await st.save();
  res.json({ success: true, message: 'The coach has forgotten what it learned from your taps.' });
}));

// ---- 7. treat allowance
router.put('/treat', wrap(async (req, res) => {
  const today = todayOf(req); const kcal = v.number(req.body?.weeklyKcal, 'weeklyKcal', { min: 0, max: 5000 });
  const st = await getState(req.user.id); st.treat.weeklyKcal = Math.round(kcal); await st.save();
  res.json({ success: true, treat: G.treatView({ treat: plain(st).treat, today }) });
}));
router.post('/treat/use', wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const date = req.body?.date ? v.date(req.body.date, 'date') : today;
  const name = v.string(req.body?.name, 'name', { max: 80, required: true });
  const kcal = Math.round(v.number(req.body?.kcal, 'kcal', { min: 1, max: 5000 }));
  const st = await getState(uid);
  if (!(st.treat.weeklyKcal > 0)) throw new HttpError(400, 'Set a weekly treat allowance first');
  // The treat is also logged as food, so the day's totals stay honest. One hidden placeholder food per person, like quick-add.
  let base = await Food.findOne({ userId: uid, hidden: true, name: 'Quick add' });
  if (!base) base = await Food.create({ userId: uid, hidden: true, name: 'Quick add', servingSize: 1, servingUnit: 'serving', calories: 0, units: [{ label: 'serving', quantity: 1 }], notes: 'Placeholder for estimated entries' });
  const total = { calories: kcal, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
  const { duplicate } = await createOnce(FoodLog, uid, v.clientId(req.body?.clientId), {
    foodId: base._id, date, mealType: 'snacks', foodName: name, baseServingSize: 1, servingUnit: 'serving', consumedQuantity: 1, servings: 1,
    nutritionPerServing: total, nutritionTotal: total, notes: 'Treat',
  });
  if (!duplicate) { st.treat.entries.push({ date, name, kcal }); st.treat.entries = st.treat.entries.slice(-100); await st.save(); }
  res.json({ success: true, treat: G.treatView({ treat: plain(st).treat, today }) });
}));

// ---- Section H -----------------------------------------------------------------------------------------------
// 8. tone + gentle mode: the copy lives on the server and both apps fetch it once.
router.get('/tone', wrap(async (req, res) => {
  const st = plain(await getState(req.user.id));
  const today = todayOf(req);
  const act = st.event && st.event.kind && st.event.from <= today && today <= st.event.to ? H.EVENT_KINDS[st.event.kind] : null;
  res.json({ success: true, gentle: !!st.gentle, eatingOutPadPct: act ? act.padPct : 15, ...T.toneBundle(st.tone) });
}));
router.put('/settings', wrap(async (req, res) => {
  const st = await getState(req.user.id);
  if (req.body?.tone !== undefined) st.tone = v.oneOf(req.body.tone, 'tone', T.TONES);
  if (req.body?.gentle !== undefined) {
    st.gentle = req.body.gentle === true;
    // Reuses the existing "hide calorie numbers" switch so every screen that already honours it follows gentle mode.
    await Profile.updateOne({ userId: req.user.id }, { $set: { 'safety.hideNumbers': st.gentle } });
  }
  await st.save();
  res.json({ success: true, gentle: !!st.gentle, ...T.toneBundle(st.tone) });
}));

// 9. plate balance for gentle mode (no calories anywhere in the answer)
router.get('/plate', wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const date = req.query.date ? v.date(req.query.date, 'date') : today;
  const [logs, c] = await Promise.all([FoodLog.find({ userId: uid, date }).select('foodName mealType').lean(), context(uid, date)]);
  const day = c.byDate[date] || {};
  res.json({ success: true, ...H.plateBalance({ logs: logs.map((l) => ({ name: l.foodName, mealType: l.mealType })), habitInputs: { waterGoalMet: !!(c.waterMl && day.waterMl >= c.waterMl) } }) });
}));

// 10. craving swap from the person's own foods (allergens and avoided foods never appear)
router.post('/craving/swap', wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const rows = await FoodLog.find({ userId: uid, date: { $gte: addDays(today, -30), $lte: today } }).select('foodId foodName nutritionPerServing baseServingSize servingUnit').lean();
  const by = new Map();
  for (const r of rows) {
    if (/^(Quick add|Imported entry)$/i.test(r.foodName)) continue;
    const k = String(r.foodId); const e = by.get(k) || { foodId: k, name: r.foodName, count: 0, calories: Number(r.nutritionPerServing?.calories || 0), protein: Number(r.nutritionPerServing?.protein || 0), fiber: Number(r.nutritionPerServing?.fiber || 0), servingSize: r.baseServingSize, servingUnit: r.servingUnit };
    e.count += 1; by.set(k, e);
  }
  let list = [...by.values()];
  const pc = await loadPlanContext(uid, {});
  if (!pc.excluder.empty) list = pc.excluder.keep(list, (f) => f.name);
  const c = await context(uid, today);
  const eaten = (c.byDate[today]?.calories) || 0;
  res.json({ success: true, ...H.cravingSwap({ recent: list, remainingKcal: c.target ? c.target - eaten : null }) });
}));

// 12. festival / wedding / trip mode (ends by itself) and 13. optional diet break
router.put('/event', wrap(async (req, res) => {
  const today = todayOf(req);
  const kind = v.oneOf(req.body?.kind, 'kind', Object.keys(H.EVENT_KINDS));
  const w = { from: v.date(req.body?.from, 'from'), to: v.date(req.body?.to, 'to') };
  const bad = H.validateWindow(w, today); if (bad) throw new HttpError(400, bad);
  const st = await getState(req.user.id);
  st.event = { kind, from: w.from, to: w.to, label: v.string(req.body?.label, 'label', { max: 40 }) };
  await st.save();
  const c = await context(req.user.id, today);
  res.json({ success: true, event: H.eventView({ event: plain(st).event, dietBreak: plain(st).dietBreak, today, target: c.target, tdee: c.tdee, profile: c.profile || {} }) });
}));
router.delete('/event', wrap(async (req, res) => {
  const st = await getState(req.user.id); st.event = { kind: '', from: '', to: '', label: '' }; await st.save();
  res.json({ success: true });
}));
router.post('/diet-break', body(s.object({ days: s.number({ min: 1, max: 14 }), kind: s.string({ max: 30 }), today: TODAY })), wrap(async (req, res) => {
  const today = todayOf(req);
  const days = Math.min(14, Math.max(1, Math.round(Number(req.body?.days) || 7)));
  const st = await getState(req.user.id);
  st.dietBreak = { kind: String(req.body?.kind || 'maintenance-week').slice(0, 30), from: today, to: addDays(today, days - 1) };
  await st.save();
  await Profile.updateOne({ userId: req.user.id }, { $set: { 'plan.breakUntil': st.dietBreak.to } }); // mirror for the plan screens
  res.json({ success: true, dietBreak: plain(st).dietBreak });
}));
router.delete('/diet-break', wrap(async (req, res) => {
  const st = await getState(req.user.id); st.dietBreak = { kind: '', from: '', to: '' }; await st.save();
  await Profile.updateOne({ userId: req.user.id, 'plan.breakUntil': { $ne: '' } }, { $set: { 'plan.breakUntil': '', 'plan.lastBreakEnd': todayOf(req) } });
  res.json({ success: true });
}));
/** The cycle's water-window hint for the plateau text, or null. One small read, and only asked for when the scale already looks flat. */
async function cycleHintFor(uid, today) {
  const st = await CoachState.findOne({ userId: uid }).select('cycle').lean();
  return cycleHint({ enabled: !!(st && st.cycle && st.cycle.enabled), starts: (st && st.cycle && st.cycle.starts) || [], length: st && st.cycle ? st.cycle.length : null, today });
}
router.get('/diet-break/advice', wrap(async (req, res) => {
  const today = todayOf(req); const c = await context(req.user.id, today);
  let plateau = detectPlateau({ weights: c.weights, profile: c.profile || {}, today, target: c.target, estimate: estimateWeight({ days: c.days, weights: c.weights, profile: c.profile, today }) });
  if (plateau.status === 'plateau' || plateau.status === 'wrong_direction') plateau = detectPlateau({ weights: c.weights, profile: c.profile || {}, today, target: c.target, cycle: await cycleHintFor(req.user.id, today), estimate: estimateWeight({ days: c.days, weights: c.weights, profile: c.profile, today }) });
  const e = expectedEnergy(c.profile);
  res.json({ success: true, advice: H.dietBreakAdvice({ plateau, tdee: c.tdee, target: c.target, direction: e?.direction }) });
}));

// ---- Section I: simple / advanced mode and the adaptive Home step
async function featureCounts(uid) {
  const [foodLogs, plannedDays, weightLogs, foodDates, waterDates] = await Promise.all([
    FoodLog.countDocuments({ userId: uid }), MealPlan.distinct('date', { userId: uid }).then((d) => d.length),
    WeightLog.countDocuments({ userId: uid }), FoodLog.distinct('date', { userId: uid }), WaterLog.distinct('date', { userId: uid }),
  ]);
  return { foodLogs, plannedDays, weightLogs, activeDays: new Set([...foodDates, ...waterDates]).size };
}
router.get('/features', wrap(async (req, res) => {
  const st = await getState(req.user.id);
  res.json({ success: true, ...featureView({ counts: await featureCounts(req.user.id), showAll: st.showAll, seen: st.seenFeatures }) });
}));
router.put('/features', body(s.object({ showAll: s.boolean() })), wrap(async (req, res) => {
  const st = await getState(req.user.id); st.showAll = !!req.body?.showAll; await st.save();
  res.json({ success: true, ...featureView({ counts: await featureCounts(req.user.id), showAll: st.showAll, seen: st.seenFeatures }) });
}));
router.post('/features/seen', body(s.object({ ids: s.array(s.string({ max: 40 }), { max: 100 }) })), wrap(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x) => ALL.includes(x));
  const st = await getState(req.user.id); st.seenFeatures = [...new Set([...(st.seenFeatures || []), ...ids])]; await st.save();
  res.json({ success: true, seen: st.seenFeatures });
}));
router.post('/next-step', body(s.object({ hour: s.any(), meals: s.any(), waterMl: s.any(), waterTargetMl: s.any(), steps: s.any(), stepsTarget: s.any(), budget: s.any(), eaten: s.any(), weightLogged: s.any(), weighDay: s.any() })), wrap(async (req, res) => {
  const b = req.body || {};
  res.json({ success: true, step: nextStep({ hour: b.hour, meals: b.meals, waterMl: b.waterMl, waterTargetMl: b.waterTargetMl, steps: b.steps, stepsTarget: b.stepsTarget, budget: b.budget, eaten: b.eaten, weightLogged: b.weightLogged, weighDay: b.weighDay }) });
}));

// ---- Daily coach: today's maintenance (from yesterday, unless you chose a level), heavy-day recovery, missed workouts, "what am I?".
// The same JSON feeds the web app and the mobile app. Nothing here ever cuts calories for a food or training event.
const hourOf = (v) => { const h = Number(v); return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null; };
router.get('/day-guide', wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  await refreshAutoActivity(uid, today);
  const d = await loadDaily(uid, today);
  res.json({ success: true, guide: dayGuide({ profile: d.profile, days: d.days, today, strengthDates: d.strengthDates, target: d.target, floor: d.floor, diet: d.diet }) });
}));
router.get('/activity-level', wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  await refreshAutoActivity(uid, today);
  const d = await loadDaily(uid, today);
  res.json({ success: true, activity: suggestActivityLevel({ profile: d.profile, days: d.days, strengthDates: d.strengthDates, today }) });
}));
// Feedback for the day so far. Reads today's food, steps and training from the logs: call it after every log.
// GET is the one the apps use (a read: it must never be queued or replayed offline); POST is kept for scripts.
const entryHandler = (get) => wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const src = get ? (req.query || {}) : (req.body || {});
  const d = await loadDaily(uid, today);
  const row = d.days.find((x) => x.date === today) || { date: today };
  const trained = isTrained(row, d.strengthDates);
  const planned = new Set(Array.isArray(d.profile.training?.weekdays) ? d.profile.training.weekdays : []);
  res.json({ success: true, check: entryCheck({ profile: d.profile, today, row, target: d.target, floor: d.floor, proteinTarget: d.proteinTarget, diet: d.diet,
    complete: src.complete === true || src.complete === 'true' || src.complete === '1', hour: hourOf(src.hour), trained, stepsTarget: Number(d.profile.goals?.stepsTarget) || 10000, plannedGym: planned.has(weekdayMon0(today)) }) });
});
router.get('/entry-check', entryHandler(true));
router.post('/entry-check', body(s.object({ today: TODAY, complete: s.boolean(), hour: s.number({ min: 0, max: 23, int: true }) })), entryHandler(false));

// ---- Weekly decision: reads two weeks and changes ONE thing at a time. A suggestion that changes your plan needs your tap (apply),
// unless the person turned on "safe auto-adjust": then only small, reversible changes (lib/coachHub.autoSafe) are applied for them,
// logged in the changelog, and can be undone with one tap.
const dietBreakOn = (st, today) => !!(st.dietBreak && st.dietBreak.to && st.dietBreak.from <= today && st.dietBreak.to >= today);

/** Strength trend, recovery pattern and waist readings for the weekly decision. Missing data just means "unknown", never a guess. */
async function weeklyInputs(uid, today) {
  const [sessions, activity, readiness, waists] = await Promise.all([
    BodyPlanSession.find({ userId: uid, date: { $gte: addDays(today, -63), $lte: today } }).select('date status phase exercises').limit(300).lean(),
    ActivityLog.find({ userId: uid, date: { $gte: addDays(today, -63), $lte: today }, 'sets.0': { $exists: true } }).select('date activityName sets').limit(600).lean(),
    Readiness.find({ userId: uid, date: { $gte: addDays(today, -14), $lte: today } }).select('date sleepHours energy soreness stress').lean(),
    HealthLog.find({ userId: uid, type: { $in: ['waist', 'neck', 'hips'] }, date: { $gte: addDays(today, -70), $lte: today } }).select('date value type').sort({ date: 1 }).limit(120).lean(),
  ]);
  const measures = { waist: [], neck: [], hips: [] };
  for (const m of waists) if (measures[m.type]) measures[m.type].push({ date: m.date, value: Number(m.value) });
  return { strengthTrend: strengthTrend({ sessions, activity, today }), recovery: recoverySummary(readiness, today), readiness, waists: measures.waist.filter((w) => w.date > addDays(today, -40)), measures };
}

/** Puts ONE change (steps goal, pace / calorie target, diet break, target date) into the profile and records it so it can be undone.
 *  Used by the weekly decision AND by the "behind plan" offers (lib/targetOffer.js). Mutates st (the caller saves). Throws HttpError when it cannot be applied safely. */
async function applyChange({ uid, st, today, dec, auto = false, keepDecision = false }) {
  const a = dec.apply;
  const profile = await Profile.findOne({ userId: uid }).lean();
  const floor = calorieFloorOf(profile);
  const touchesPlan = a.type === 'targetDate' || a.type === 'pace' || Number(a.planPaceKg) > 0;
  const before = snapshotGoals(profile, { withPlan: touchesPlan });
  const prevDietBreak = st.dietBreak ? { kind: st.dietBreak.kind || '', from: st.dietBreak.from || '', to: st.dietBreak.to || '' } : null;
  const prevWeekly = JSON.parse(JSON.stringify({ ...(st.weekly || {}), ...(keepDecision ? {} : { decision: null }) }));     // ladder state before the change, restored by undo
  const planOn = !!(profile && profile.plan && profile.plan.active);
  let set = null;
  if (a.type === 'steps') set = { 'goals.stepsTarget': Math.min(12000, Math.round(Number(a.stepsTarget))) };
  else if (a.type === 'pace') { if (Number(a.calorieTarget) < floor) throw new HttpError(409, 'That would go below your safe minimum'); set = { 'goals.weeklyPaceKg': Number(a.weeklyPaceKg) }; }
  else if (a.type === 'calorie') { if (Number(a.calorieTarget) < floor) throw new HttpError(409, 'That would go below your safe minimum'); set = { 'goals.calorieMode': 'manual', 'goals.calorieTarget': Math.round(Number(a.calorieTarget)) }; }
  else if (a.type === 'dietBreak') { st.dietBreak = { kind: 'weekly-coach', from: today, to: addDays(today, Math.min(14, Math.max(1, Number(a.days) || 7)) - 1) }; set = { 'plan.breakUntil': st.dietBreak.to }; }
  else if (a.type === 'targetDate') {
    if (!planOn) throw new HttpError(409, 'Set a goal plan first, then the coach can move its date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.byDate)) || String(a.byDate) <= today) throw new HttpError(409, 'That date is not in the future');
    set = { 'plan.byDate': String(a.byDate) };
  } else throw new HttpError(400, 'Unknown change');
  // The goal plan's pace and the calorie pace must tell the same story, or the progress corridor and the calorie target disagree.
  if (set && planOn) { const pk = Number(a.planPaceKg) > 0 ? Number(a.planPaceKg) : a.type === 'pace' ? Number(a.weeklyPaceKg) : 0; if (pk > 0) set['plan.paceKg'] = pk; }
  if (set) { const p = await Profile.findOneAndUpdate({ userId: uid }, { $set: set }, { new: true, runValidators: true }); await refreshStoredTarget(Profile, p); }
  const e = expectedEnergy(profile);
  const entry = logEntry({ dec, today, auto, target: e ? e.calorieTarget : null });
  st.changelog = pushLog(st.changelog, entry);
  st.autoUndo = { date: today, action: dec.action, change: entry.change, auto, goals: before, dietBreak: a.type === 'dietBreak' ? prevDietBreak : undefined, weekly: prevWeekly, keepDecision: keepDecision || undefined };
  st.markModified('changelog'); st.markModified('autoUndo'); dailyStale(st);
  return { entry, kind: a.type === 'steps' ? 'steps' : a.type === 'dietBreak' ? 'break' : a.type === 'targetDate' ? null : 'calorie' };
}

/** Applies st.weekly.decision.apply. Mutates st (the caller saves). */
async function applyDecision({ uid, st, today, auto = false }) {
  const dec = st.weekly && st.weekly.decision;
  if (!dec || dec.applied || !dec.apply) throw new HttpError(409, 'Nothing to apply right now');
  const { kind } = await applyChange({ uid, st, today, dec, auto });
  st.weekly = { ...st.weekly, ...(dec.onApply || {}), lastChange: today, lastChangeKind: kind, decision: { ...dec, applied: true, auto } };
  st.markModified('weekly');
}

/** One weekly-coach operation per person at a time. Home opens several cards at once (hub, weekly card); without this two of them could both compute
 *  and both auto-apply the same change, logging it twice and making undo restore the wrong value.
 *  Two layers: an in-process queue (cheap, no database round trip while the work is in one server), and a database lease (models/CoachLock.js)
 *  so SEVERAL server instances can never do it at the same time either. */
const userLocks = new Map();
let useProcessLock = true;
function withProcessLock(uid, fn) {
  if (!useProcessLock) return fn();
  const key = String(uid);
  const tail = (userLocks.get(key) || Promise.resolve()).catch(() => {});
  const result = tail.then(fn);
  const mark = result.catch(() => {});
  userLocks.set(key, mark);
  mark.then(() => { if (userLocks.get(key) === mark) userLocks.delete(key); });
  return result;
}
const lockStore = makeMongoStore(CoachLock);
const withUserLock = (uid, fn) => withProcessLock(uid, () => withLease(lockStore, String(uid), fn, { ttlMs: 30000, waitMs: 15000 }));

/** The few cheap facts that can change this week's decision (lib/weeklyRefresh.js). Small queries only. */
async function quickSignals(uid, today, strengthStatus = null) {
  const [readiness, waists, weighDates, foodDates, sess, weightRows, prof] = await Promise.all([
    Readiness.find({ userId: uid, date: { $gte: addDays(today, -14), $lte: today } }).select('date sleepHours energy soreness stress').lean(),
    HealthLog.find({ userId: uid, type: 'waist', date: { $gt: addDays(today, -36), $lte: today } }).select('date').lean(),
    WeightLog.distinct('date', { userId: uid, date: { $gt: addDays(today, -14), $lte: today } }),
    FoodLog.distinct('date', { userId: uid, date: { $gt: addDays(today, -14), $lte: today } }),
    BodyPlanSession.find({ userId: uid, date: { $gte: addDays(today, -14), $lte: today } }).select('date updatedAt').limit(60).lean(),
    WeightLog.find({ userId: uid, date: { $gt: addDays(today, -35), $lte: today } }).sort({ date: 1, createdAt: 1 }).select('date weightKg').lean(),
    Profile.findOne({ userId: uid }).lean(),
  ]);
  const stamps = (sess || []).map((r) => (r.updatedAt ? new Date(r.updatedAt).toISOString() : r.date)).sort();
  // The daily engine's early warning: the weekly engine's own "too fast" test, so the weekly coach re-checks today instead of at the next review.
  const e = prof ? expectedEnergy(prof) : null;
  const trendFast = e ? fastTrend({ weights: (weightRows || []).map((r) => ({ date: r.date, weightKg: Number(r.weightKg) })), today, direction: e.direction, weightKg: e.weightKg }).fast : false;
  return signalsOf({ recoveryLow: recoverySummary(readiness || [], today).low, waistDates: (waists || []).map((w) => w.date), weighIns14: (weighDates || []).length, foodDays14: (foodDates || []).length,
    sessionStamp: `${stamps.length}:${stamps[stamps.length - 1] || ''}`, strengthStatus, trendFast });
}

/** Everything in the saved weekly state EXCEPT the bookkeeping of the last review: this is the state a re-check starts from. */
const BOOK = ['decision', 'inputState', 'sig', 'dirty', 'sigCheckedOn', 'refreshedOn', 'refreshReason'];
const cleanState = (w) => { if (!w) return null; const o = { ...w }; for (const k of BOOK) delete o[k]; return o; };

/** Is a re-check due for the cached decision? Runs the cheap signal read only when something was written (dirty) or once a day. */
async function refreshCheck(uid, today, st) {
  const w = st.weekly;
  if (!(w.dirty || w.sigCheckedOn !== today)) return { refresh: false, reason: '', adopt: false };
  let sig = await quickSignals(uid, today, w.sig ? w.sig.strengthStatus : (w.decision.strength && w.decision.strength.status) || null);
  if (w.sig && sessionsMoved(w.sig, sig)) {                       // new sessions / effort taps: only now pay for the strength check
    const x = await weeklyInputs(uid, today);
    sig = { ...sig, strengthStatus: x.strengthTrend ? x.strengthTrend.status : null };
  }
  const verdict = shouldRefresh({ prev: w.sig || null, next: sig, decision: w.decision, refreshedOn: w.refreshedOn || '', today });
  // A change that is real but held back (one re-check a day, or the decision was already applied) must stay "news" for the next look:
  // the stored signals are NOT moved forward over it, or tomorrow would see no difference and the change would be lost.
  const held = !verdict.refresh && !verdict.adopt && !!w.sig && shouldRefresh({ prev: w.sig, next: sig, decision: { ...w.decision, applied: false }, refreshedOn: '', today }).refresh;
  return { ...verdict, sig, held };
}

/** The weekly decision for the screen: cached for 7 days, re-checked early when something important changed (see lib/weeklyRefresh.js),
 *  otherwise worked out now (and auto-applied when the person allows it and it is safe). */
const settled = (st, today) => { const w = st.weekly; return !!(w && w.decision && w.lastReview && diffDays(w.lastReview, today) >= 0 && diffDays(w.lastReview, today) < 7 && !w.dirty && w.sigCheckedOn === today); };
async function weeklyView(uid, today) {
  // The common call (decided this week, nothing written since, signals already read today) is ONE read and takes no lock and writes nothing.
  // The lock, and the database lease behind it, are only paid when the coach actually has work to do.
  const st = await getState(uid);
  if (settled(st, today)) return { st, decision: st.weekly.decision, cached: true };
  return withUserLock(uid, () => weeklyViewLocked(uid, today));
}
async function weeklyViewLocked(uid, today) {
  const st = await getState(uid);
  const w = st.weekly || null;
  if (w && w.decision && w.lastReview && diffDays(w.lastReview, today) >= 0 && diffDays(w.lastReview, today) < 7) {
    const chk = await refreshCheck(uid, today, st);
    if (!chk.refresh) {
      if (chk.sig) { st.weekly = { ...w, sig: chk.held ? w.sig : chk.sig, dirty: false, sigCheckedOn: today }; st.markModified('weekly'); await st.save(); }
      return { st, decision: st.weekly.decision, cached: true };
    }
    return computeWeekly(uid, today, st, { reason: chk.reason });
  }
  return computeWeekly(uid, today, st, null);
}

async function computeWeekly(uid, today, st, refresh) {
  const w = st.weekly || null;
  const stateIn = refresh ? (w && w.inputState) || null : cleanState(w);           // a re-check starts from BEFORE this review, so a slow week is never counted twice
  await refreshAutoActivity(uid, today);
  const [d, x] = await Promise.all([loadDaily(uid, today), weeklyInputs(uid, today)]);
  const e0 = expectedEnergy(d.profile);
  const composition = compositionChange({ measures: x.measures, weights: d.weights, sex: d.profile.sex, heightCm: d.profile.heightCm, today });
  const sleepVals = Object.entries(d.sleep || {}).filter(([date]) => date > addDays(today, -7)).map(([, h]) => h).filter((h) => h > 0);
  const trainedIn = (from, to) => d.days.filter((r) => r.date >= from && r.date <= to && isTrained(r, d.strengthDates)).length;
  const retention = retentionFlags({ days: d.days, today, target: e0 ? e0.calorieTarget : 0, dietBreakActive: dietBreakOn(st, today),
    dietBreakEnded: st.dietBreak && st.dietBreak.to && st.dietBreak.to < today ? st.dietBreak.to : null,
    sleepAvg: sleepVals.length >= 3 ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null,
    trainingJump: trainedIn(addDays(today, -6), today) >= trainedIn(addDays(today, -13), addDays(today, -7)) + 2, sex: d.profile.sex });
  const cy = st.cycle || {};
  const personal = cy.enabled && (cy.starts || []).length >= 3 ? waterPattern({ weights: d.weights, starts: cy.starts, length: cy.length || null, today }) : null;       // her own pattern, once learned
  const cycle = cycleWait({ enabled: !!cy.enabled, starts: cy.starts || [], length: cy.length || null, today, waitedOn: stateIn && stateIn.cycleWaitedOn, personal });
  const sinceDeficit = stateIn && stateIn.deficitSince ? Math.floor(diffDays(stateIn.deficitSince, today) / 7) : 0;
  const fatigue = B.fatigueScore({ readiness: (x.readiness || []).filter((r) => r.date > addDays(today, -8)), strengthStatus: x.strengthTrend ? x.strengthTrend.status : null, weeksInDeficit: sinceDeficit });
  const dec = weeklyDecision({ profile: d.profile, days: d.days, today, strengthDates: d.strengthDates, state: stateIn, dietBreakActive: dietBreakOn(st, today),
    strengthTrend: x.strengthTrend, recovery: x.recovery, waists: x.waists, composition, retention, cycle, fatigue });
  const view = { action: dec.action, headline: dec.headline, messages: dec.messages, apply: dec.apply, onApply: dec.onApply, metrics: dec.metrics, date: today, applied: false, auto: false,
    forecast: dec.forecast || null, outliers: (dec.droppedWeighIns || []).length, strength: x.strengthTrend, composition: composition.hasData ? composition : null, recovery: x.recovery.low ? { low: true, note: x.recovery.note } : null,
    refreshReason: refresh ? refresh.reason : '', refreshedFrom: refresh && w && w.decision ? w.decision.action : '' };
  view.id = decisionId(view);
  const sig = await quickSignals(uid, today, x.strengthTrend ? x.strengthTrend.status : null);
  st.weekly = { ...dec.state, ...(refresh && w ? { lastReview: w.lastReview } : {}), decision: view, inputState: cleanState(stateIn) || {}, sig, dirty: false, sigCheckedOn: today, refreshedOn: refresh ? today : '' };
  st.markModified('weekly');
  const e = expectedEnergy(d.profile);
  const auto = d.profile.goals && d.profile.goals.coachAuto === 'safe' && !undoneRecently(w, today) && autoSafe(dec.apply, { target: e ? e.calorieTarget : null, floor: calorieFloorOf(d.profile) });
  if (auto) { try { await applyDecision({ uid, st, today, auto: true }); } catch (err) { /* a refused automatic change simply stays a suggestion */ } }
  await st.save();
  return { st, decision: st.weekly.decision, cached: false };
}

router.get('/weekly', wrap(async (req, res) => {
  const { decision, cached } = await weeklyView(req.user.id, todayOf(req));
  res.json({ success: true, decision, cached });
}));
/** A tap that waited offline (or on a stale screen) can only apply the SAME suggestion the person saw. */
function assertSameDecision(st, id) {
  const d = st.weekly && st.weekly.decision;
  if (id && d && d.id && d.id !== id) throw new HttpError(409, 'That suggestion has changed since you tapped it. Please look at the new one.');
}
router.post('/weekly/apply', body(s.object({ today: TODAY, decisionId: s.string({ max: 80 }) })), wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const decision = await withUserLock(uid, async () => {
    const st = await getState(uid);                          // fresh inside the lock: an automatic apply that just finished is seen here
    // A tap that waited offline can only apply the SAME suggestion the person saw. If the coach has moved on, it is refused (409), never applied blindly.
    assertSameDecision(st, req.body.decisionId);
    await applyDecision({ uid, st, today, auto: false });
    await st.save();
    return st.weekly.decision;
  });
  res.json({ success: true, decision });
}));
// ---- Daily decision: works UNDER the weekly decision (lib/dailyDecision.js). It reads the weekly decision, never changes the plan (no apply),
// and its only influence on the plan is the early 'trend-fast' signal that makes the weekly engine re-check (see quickSignals / weeklyRefresh).
// Order matters: the weekly engine runs FIRST (it is cheap when already settled), then the daily one reads what it decided. They never run
// inside each other's lock, so they cannot deadlock.
const weeklyKey = (w) => (w && w.decision ? `${w.decision.id || w.decision.action}:${w.decision.applied ? 1 : 0}:${w.decision.date || ''}:${w.decision.refreshReason || ''}` : 'none');
const dailySettled = (st, today) => { const d = st.daily; return !!(d && d.decision && d.date === today && !d.dirty && d.weeklyKey === weeklyKey(st.weekly)); };
async function dailyView(uid, today) {
  const wk = await weeklyView(uid, today);                                       // 1. the weekly decision is current (may re-check on 'trend-fast')
  if (dailySettled(wk.st, today)) return { decision: wk.st.daily.decision, cached: true };
  return withUserLock(uid, async () => {                                          // 2. the daily one reads it
    const st = await getState(uid);
    if (dailySettled(st, today)) return { decision: st.daily.decision, cached: true };
    const d = await loadDaily(uid, today);
    const dec = dailyDecision({ profile: d.profile, days: d.days, today, weekly: { decision: st.weekly && st.weekly.decision, state: cleanState(st.weekly) || {} }, dietBreakActive: dietBreakOn(st, today) });
    const view = { ...dec, date: today };
    st.daily = { date: today, dirty: false, weeklyKey: weeklyKey(st.weekly), decision: view };
    st.markModified('daily');
    await st.save();
    return { decision: view, cached: false };
  });
}
router.get('/daily', wrap(async (req, res) => {
  const { decision, cached } = await dailyView(req.user.id, todayOf(req));
  res.json({ success: true, decision, cached });
}));
/** Any plan change (weekly apply, behind-plan offer, undo) makes today's daily numbers stale. Mutates st (the caller saves). */
function dailyStale(st) { if (st.daily) { st.daily = { ...st.daily, dirty: true }; st.markModified('daily'); } }

/** Puts back what the last applied change touched (goals, diet break, ladder state). Mutates st; the caller saves. */
async function undoLast({ uid, st, today }) {
  if (!undoView(st.autoUndo, today)) throw new HttpError(409, 'Nothing to undo');
  const u = st.autoUndo;
  const set = restoreSet(u.goals);
  if (Object.keys(set).length) { const p = await Profile.findOneAndUpdate({ userId: uid }, { $set: set }, { new: true, runValidators: true }); await refreshStoredTarget(Profile, p); }
  if (u.dietBreak !== undefined) st.dietBreak = u.dietBreak || { kind: '', from: '', to: '' };
  st.weekly = { ...(u.weekly || {}), decision: u.keepDecision && u.weekly ? u.weekly.decision : null, undoneOn: today };      // the coach will not auto-apply again for 14 days
  st.changelog = (st.changelog || []).map((e, i) => (i === 0 ? { ...e, undone: true } : e));
  st.autoUndo = null;
  st.markModified('weekly'); st.markModified('changelog'); st.markModified('autoUndo'); dailyStale(st);
}
router.post('/weekly/undo', body(s.object({ today: TODAY })), wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  await withUserLock(uid, async () => {
    const st = await getState(uid);
    await undoLast({ uid, st, today });
    await st.save();
  });
  res.json({ success: true });
}));

// ---- Readiness: the 10-second daily check (sleep hours, energy, soreness, stress). One row per day; saving again replaces it.
router.get('/readiness', wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const rows = await Readiness.find({ userId: uid, date: { $gte: addDays(today, -13), $lte: today } }).select('date sleepHours energy soreness stress').sort({ date: 1 }).lean();
  const todayRow = rows.find((r) => r.date === today) || null;
  res.json({ success: true, today: todayRow, adjust: sessionAdjust(todayRow), week: recoverySummary(rows, today), entries: rows });
}));
router.post('/readiness', body(s.object({ today: TODAY, date: s.date(), sleepHours: s.number({ min: 0, max: 16 }), energy: s.number({ min: 1, max: 5, int: true }), soreness: s.number({ min: 1, max: 5, int: true }), stress: s.number({ min: 1, max: 5, int: true }) })), wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  const date = req.body.date ? v.date(req.body.date, 'date') : today;
  if (date > today || date < addDays(today, -7)) throw new HttpError(400, 'Check-ins can be saved for today or the last week');
  const row = cleanEntry({ date, ...req.body });
  if (readinessScore(row) === null) throw new HttpError(400, 'Answer at least two questions');
  await Readiness.findOneAndUpdate({ userId: uid, date }, { $set: { sleepHours: row.sleepHours, energy: row.energy, soreness: row.soreness, stress: row.stress }, $setOnInsert: { userId: uid, date } }, { upsert: true, setDefaultsOnInsert: true });
  await markCoachDirty(CoachState, uid);                       // a new check-in can start (or end) a low-recovery pattern: the weekly coach re-reads its signals
  res.json({ success: true, today: row, adjust: sessionAdjust(row) });
}));

// ---- The Coach hub: ONE call that powers the single Coach screen (web and phone): the next action, today's check-in, today's eating plan,
// this week's decision with the reason, the goal forecast, diet<->gym advisories and the changelog of what the coach changed.
async function buildHub(uid, today, hour) {
  const [{ st, decision }, x, bp] = await Promise.all([
    weeklyView(uid, today), weeklyInputs(uid, today),
    require('./bodyPlanRoutes').build(uid, '', undefined, today).catch(() => null),
  ]);
  const d = await loadDaily(uid, today);
  const adapt = bp && bp.plan && bp.plan.adapt ? bp.plan.adapt : null;
  if (adapt && adapt.todayPlan) {          // Home's light endpoint reuses this answer, so Home and this page never disagree about "workout today"
    const g = st.gymToday;
    if (!g || g.date !== today || g.kind !== adapt.todayPlan.kind) CoachState.updateOne({ userId: uid }, { $set: { gymToday: { date: today, kind: adapt.todayPlan.kind } } }).catch(() => {});
  }
  const todayRow = d.days.find((r) => r.date === today) || null;
  const todayEntry = (x.readiness || []).find((r) => r.date === today) || null;
  const adjust = sessionAdjust(todayEntry);
  const e = expectedEnergy(d.profile);
  const training = !!(adapt && adapt.todayPlan && adapt.todayPlan.kind === 'train');
  const plan = e ? dayPlan({ kcal: budgetOf(d.profile, todayRow), weightKg: d.profile.currentWeightKg, direction: e.direction, proteinTarget: d.proteinTarget, training, readiness: adjust }) : null;
  const weights = d.days.filter((r) => r.weighIn).map((r) => ({ date: r.date, weightKg: Number(r.weightKg) }));
  const rate = weights.length >= 2 ? trendRate(smoothTrend(dropOutliers(weights).kept), today) : null;
  const week = d.days.filter((r) => r.date > addDays(today, -7) && r.calories > 0);
  const protein7 = week.length >= 3 ? week.reduce((t, r) => t + (Number(r.protein) || 0), 0) / week.length : null;
  const advisories = crossCheck({ direction: e ? e.direction : 'maintain', rateKgWk: rate, planKgWk: decision && decision.metrics ? decision.metrics.targetLossKgWk : null, strength: x.strengthTrend,
    protein7Avg: protein7, proteinTarget: d.proteinTarget, phaseKey: adapt ? adapt.phase.key : '', deficitWeeks: st.weekly && st.weekly.deficitSince ? Math.floor(diffDays(st.weekly.deficitSince, today) / 7) : 0,
    dietBreakActive: dietBreakOn(st, today), recovery: x.recovery });
  const [foodRows, measureRows] = await Promise.all([
    FoodLog.find({ userId: uid, date: { $gte: addDays(today, -13), $lte: today } }).select('date mealType nutritionTotal').limit(1500).lean(),
    HealthLog.find({ userId: uid, type: { $in: ['waist', 'neck'] }, date: { $lte: today } }).select('date type').sort({ date: -1 }).limit(40).lean(),
  ]);
  const mealRows = foodRows.map((r) => ({ date: r.date, mealType: r.mealType, protein: Number(r.nutritionTotal && r.nutritionTotal.protein) || 0, calories: Number(r.nutritionTotal && r.nutritionTotal.calories) || 0 }));
  const eatenToday = mealRows.filter((r) => r.date === today);
  const logged = {}; for (const r of eatenToday) logged[r.mealType === 'snacks' ? 'snack' : r.mealType] = true;
  const hourQ = Number(hour);
  const restOfDay = e && Number.isFinite(hourQ) && hourQ >= 0 && hourQ <= 23 && todayRow
    ? replanRestOfDay({ budget: budgetOf(d.profile, todayRow), floor: calorieFloorOf(d.profile), eaten: eatenToday.reduce((t, r) => t + r.calories, 0), proteinEaten: eatenToday.reduce((t, r) => t + r.protein, 0), proteinTarget: d.proteinTarget, logged, hour: hourQ }) : null;
  const weakMeal = mealProteinGap({ rows: mealRows.filter((r) => r.date < today), proteinTarget: d.proteinTarget, diet: d.diet });
  if (weakMeal) advisories.push({ id: 'weak-meal', level: 'tip', title: `Your ${weakMeal.meal} is low in protein`, detail: weakMeal.text });
  const lastOf = (t) => (measureRows.find((m) => m.type === t) || {}).date || null;
  const lastWeigh = [...d.days].reverse().find((r) => r.weighIn);
  const prompts = measurePrompts({ today, lastWaistDate: lastOf('waist'), lastNeckDate: lastOf('neck'), lastWeighInDate: lastWeigh ? lastWeigh.date : null, sex: d.profile.sex });
  const action = nextAction({ decision, checkedIn: !!todayEntry && readinessScore(todayEntry) !== null, gym: adapt ? adapt.todayPlan : null, loggedFood: !!(todayRow && todayRow.calories > 0), readiness: adjust });
  const hubOffer = offerFor({ profile: d.profile, st, decision, today, recovery: x.recovery, strength: x.strengthTrend });
  return { success: true, date: today, nextAction: action, readiness: { today: todayEntry, adjust, week: x.recovery }, dayPlan: plan, restOfDay, prompts, composition: decision ? decision.composition || null : null, weekly: decision, forecast: decision ? decision.forecast : null,
    strength: x.strengthTrend, advisories, gym: adapt ? { phase: adapt.phase, todayPlan: adapt.todayPlan, tier: adapt.tier, status: adapt.status } : null,
    changelog: changelogView(st.changelog, { today, rateNow: rate, direction: e ? e.direction : 'lose' }), undo: undoView(st.autoUndo, today), auto: (d.profile.goals && d.profile.goals.coachAuto) || 'off',
    offer: hubOffer, taper: hubOffer ? null : taperFor({ profile: d.profile, st, decision, today }), cycle: cycleSummary(st, today), showCycle: d.profile.sex !== 'male' };
}

// ---- "Behind plan": the coach offers to move the target date or raise the pace (lib/targetOffer.js). Never automatic; one tap; undoable; snoozable.
/** One change at a time: nothing is offered while a suggestion waits for a tap, right after a change (its effect is still being judged), or without enough data. */
function offersPaused(st, decision, today) {
  const w = st.weekly || {};
  const coolDays = w.lastChangeKind === 'steps' || w.lastChangeKind === 'walk' ? 7 : 10;
  const cooling = !!(w.lastChange && diffDays(w.lastChange, today) < coolDays);
  return !!(decision.apply && !decision.applied) || cooling || ['NEED_DATA', 'NEED_FOOD_LOGS', 'NEED_PROFILE'].includes(decision.action);
}
const keyOf = (o) => (o ? `${o.id}:${require('node:crypto').createHash('sha1').update(JSON.stringify(o.apply)).digest('hex').slice(0, 8)}` : null);

/** "Ease the pace for the last few kilos": a gentler finish is easier to hold. A suggestion with one tap, never automatic. */
function taperFor({ profile, st, decision, today }) {
  if (!profile || !decision || !decision.forecast || offersPaused(st, decision, today)) return null;
  const e = expectedEnergy(profile);
  if (!e || e.direction !== 'lose') return null;
  const { targetKg: target, paceKg: pace } = goalTargets(profile, e);
  const t = B.taperPlan({ currentKg: target + decision.forecast.remainingKg, targetKg: target, paceKg: pace, direction: e.direction });
  if (!t) return null;
  const kcal = Math.round((e.tdee - (t.pace * KCAL_PER_KG) / 7) / 10) * 10;
  if (kcal < calorieFloorOf(profile)) return null;
  const apply = e.mode === 'manual' ? { type: 'calorie', calorieTarget: kcal, from: e.calorieTarget, planPaceKg: t.pace } : { type: 'pace', weeklyPaceKg: t.pace, from: e.pace, calorieTarget: kcal, planPaceKg: t.pace };
  const o = { id: 'taper', apply, ...t, kcal, kcalMore: Math.max(0, kcal - Math.round(e.calorieTarget)) };
  return { ...o, key: keyOf(o) };
}
function offerFor({ profile, st, decision, today, recovery = null, strength = null }) {
  if (!profile || !decision || !decision.forecast) return null;
  const e = expectedEnergy(profile);
  if (!e) return null;
  const w = st.weekly || {};
  const pending = offersPaused(st, decision, today);
  const offer = targetOffer({
    today, direction: e.direction, e, floor: calorieFloorOf(profile), plan: profile.plan || {}, forecast: decision.forecast, currentKg: profile.currentWeightKg,
    adherence: decision.metrics ? decision.metrics.adherence : null,
    blockers: { recoveryLow: !!(recovery && recovery.low) || !!(decision.recovery && decision.recovery.low), strengthDown: !!(strength && strength.status === 'down'), dietBreak: dietBreakOn(st, today), underEating: decision.action === 'UNDER_EATING' },
    snoozedUntil: w.offerSnoozedUntil || '', pending,
  });
  if (!offer) return null;
  return { ...offer, date: offer.date ? { ...offer.date, key: keyOf(offer.date) } : null, pace: offer.pace ? { ...offer.pace, key: keyOf(offer.pace) } : null };
}

router.post('/offer/apply', body(s.object({ choice: s.string({ max: 10, oneOf: ['date', 'pace', 'taper'], optional: false }), key: s.string({ max: 40 }), today: TODAY })), wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  await withUserLock(uid, async () => {
    const st = await getState(uid);
    const decision = st.weekly && st.weekly.decision;
    const profile = await Profile.findOne({ userId: uid }).lean();
    const offer = req.body.choice === 'taper' ? null : offerFor({ profile, st, decision, today });
    const opt = req.body.choice === 'taper' ? taperFor({ profile, st, decision, today }) : offer && offer[req.body.choice];
    if (!opt) throw new HttpError(409, 'That offer is no longer available.');
    if (req.body.key && req.body.key !== opt.key) throw new HttpError(409, 'The offer has changed since you tapped it. Please look at the new one.');
    const dec = { action: opt.id === 'date' ? 'TARGET_DATE' : opt.id === 'taper' ? 'EASE_PACE' : 'RAISE_PACE', headline: opt.id === 'date' ? 'Move your target date' : opt.id === 'taper' ? 'Ease your pace for the finish' : 'Raise your planned pace', apply: opt.apply, metrics: decision && decision.metrics ? decision.metrics : {} };
    const { kind } = await applyChange({ uid, st, today, dec, auto: false, keepDecision: true });
    if (kind) { st.weekly = { ...st.weekly, lastChange: today, lastChangeKind: kind }; st.markModified('weekly'); }   // a faster pace is judged like any other change
    await st.save();
  });
  res.json({ success: true });
}));
router.post('/offer/snooze', body(s.object({ today: TODAY })), wrap(async (req, res) => {
  const uid = req.user.id; const today = todayOf(req);
  await withUserLock(uid, async () => {
    const st = await getState(uid);
    if (!st.weekly) throw new HttpError(409, 'Nothing to snooze');
    st.weekly = { ...st.weekly, offerSnoozedUntil: addDays(today, 14) }; st.markModified('weekly'); await st.save();
  });
  res.json({ success: true });
}));

// ---- Optional cycle log (OFF by default). Only used to avoid reading the monthly water shift as a stall.
function cycleSummary(st, today) {
  const c = st.cycle || {};
  if (!c.enabled) return { enabled: false };
  const v = cycleView({ starts: c.starts || [], length: c.length || null, today });
  return { enabled: true, ...v, starts: cleanStarts(c.starts || [], today).slice(-6), declaredLength: c.length || null };
}
router.get('/cycle', wrap(async (req, res) => { res.json({ success: true, cycle: cycleSummary(await getState(req.user.id), todayOf(req)) }); }));
router.put('/cycle', body(s.object({ enabled: s.boolean(), length: s.number({ min: CYCLE.minLen, max: CYCLE.maxLen, int: true }), today: TODAY })), wrap(async (req, res) => {
  const st = await getState(req.user.id); const today = todayOf(req);
  const c = { enabled: !!(st.cycle && st.cycle.enabled), starts: (st.cycle && st.cycle.starts) || [], length: (st.cycle && st.cycle.length) || null };
  if (req.body.enabled !== undefined) { c.enabled = req.body.enabled === true; if (!c.enabled) { c.starts = []; c.length = null; } }     // turning it off erases what was logged
  if (req.body.length !== undefined) c.length = Math.round(req.body.length);
  st.cycle = c; st.markModified('cycle'); await st.save();
  res.json({ success: true, cycle: cycleSummary(st, today) });
}));
router.post('/cycle/start', body(s.object({ date: s.date(), today: TODAY })), wrap(async (req, res) => {
  const st = await getState(req.user.id); const today = todayOf(req);
  if (!(st.cycle && st.cycle.enabled)) throw new HttpError(409, 'Turn the cycle log on first');
  const date = req.body.date || today;
  if (date > today || date < addDays(today, -CYCLE.historyDays)) throw new HttpError(400, 'Pick a date from the last year, not in the future');
  st.cycle = { ...plain(st).cycle, starts: cleanStarts([...(st.cycle.starts || []), date], today) }; st.markModified('cycle'); await st.save();
  res.json({ success: true, cycle: cycleSummary(st, today) });
}));
router.delete('/cycle/start', wrap(async (req, res) => {
  const st = await getState(req.user.id); const today = todayOf(req);
  const date = v.date(req.query.date, 'date');
  st.cycle = { ...plain(st).cycle, starts: ((st.cycle && st.cycle.starts) || []).filter((d) => d !== date) }; st.markModified('cycle'); await st.save();
  res.json({ success: true, cycle: cycleSummary(st, today) });
}));
router.delete('/cycle', wrap(async (req, res) => {
  const st = await getState(req.user.id);
  st.cycle = { enabled: false, starts: [], length: null }; st.markModified('cycle'); await st.save();
  res.json({ success: true, cycle: { enabled: false } });
}));

/** Identical requests that arrive while one is still running share its answer (Home opens several cards at once). Nothing is cached after it finishes,
 *  so the next request always sees fresh data; it only removes duplicate work in the same moment. */
const inflight = new Map();
function coalesce(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---- Home's lightweight "next step": no gym plan build, no weekly recompute unless it is due, a handful of one-row queries.
async function buildNext(uid, today) {
  const { decision, st } = await weeklyView(uid, today);
  if (decision && decision.apply && !decision.applied) {                 // a pending change always comes first: no other question needs asking
    return { success: true, date: today, nextAction: nextAction({ decision }), band: null, apply: { decisionId: decision.id || decisionId(decision), action: decision.action, headline: decision.headline, apply: decision.apply }, recoveryLow: !!(decision.recovery && decision.recovery.low), headline: decision.headline };
  }
  const [ready, food, sess, prof] = await Promise.all([
    Readiness.findOne({ userId: uid, date: today }).select('date sleepHours energy soreness stress').lean(),
    FoodLog.findOne({ userId: uid, date: today }).select('_id').lean(),
    BodyPlanSession.findOne({ userId: uid, date: today, status: { $ne: 'skipped' } }).select('_id').lean(),
    Profile.findOne({ userId: uid }).select('training').lean(),
  ]);
  const adjust = sessionAdjust(ready || null);
  const planned = new Set(Array.isArray(prof && prof.training && prof.training.weekdays) ? prof.training.weekdays : []);
  const known = st && st.gymToday && st.gymToday.date === today ? st.gymToday.kind : null;       // the full adaptive plan's answer, saved by the Coach page
  const gym = sess ? { kind: 'done' } : known ? { kind: known, text: '' } : planned.has(weekdayMon0(today)) ? { kind: 'train', text: '' } : { kind: 'rest', text: '' };
  const action = nextAction({ decision, checkedIn: !!ready && readinessScore(ready) !== null, gym, loggedFood: !!food, readiness: adjust });
  const pending = decision && decision.apply && !decision.applied ? { decisionId: decision.id || decisionId(decision), action: decision.action, headline: decision.headline, apply: decision.apply } : null;
  return { success: true, date: today, nextAction: action, band: adjust.band, apply: pending, recoveryLow: !!(decision && decision.recovery && decision.recovery.low), headline: decision ? decision.headline : '' };
}
router.get('/next', wrap(async (req, res) => { const today = todayOf(req); res.json(await coalesce(`next:${req.user.id}:${today}`, () => buildNext(req.user.id, today))); }));

// ---- Body progress: what is really changing, how accurate the target is, how fast is sensible, the finish, and keeping it (lib/bodyAnalysis.js).
// Opened on demand by the apps (never part of Home), so it costs nothing until someone looks at it. Every card is null when there is too little data.
const STALL_ACTIONS = ['WAIT_ONE_MORE', 'LADDER_STEPS', 'LADDER_WALK', 'LADDER_CUT', 'LADDER_BREAK', 'FIX_ADHERENCE', 'HIT_STEPS', 'WAIT_RETENTION', 'WAIT_CYCLE', 'HOLD_STRENGTH', 'HOLD_RECOVERY', 'REASSESS', 'RESTORE_TRAINING', 'FIX_HEAVY_DAYS'];
const lastOf = (rows) => ([...(rows || [])].filter((r) => Number(r.value) > 0).sort((a, b) => a.date.localeCompare(b.date)).pop() || null);

async function buildBody(uid, today) {
  const [d, x, st, food] = await Promise.all([
    loadDaily(uid, today), weeklyInputs(uid, today), getState(uid),
    FoodLog.find({ userId: uid, date: { $gte: addDays(today, -13), $lte: today } }).select('date mealType nutritionTotal').limit(1500).lean(),
  ]);
  const profile = d.profile, e = expectedEnergy(profile);
  const decision = st.weekly && st.weekly.decision ? st.weekly.decision : null;
  const m = decision && decision.metrics ? decision.metrics : {};
  const gc = goalContext(profile, d.weights, e);          // the same goal weight, "now" and pace as the goal card, Progress and the journey
  const nowKg = gc.nowKg, targetKg = gc.targetKg, pace = gc.paceKg;
  const plan = profile.plan && profile.plan.active ? profile.plan : {};
  const strengthStatus = x.strengthTrend ? x.strengthTrend.status : null;
  const rateKgWk = m.rateKgWk === undefined ? null : m.rateKgWk;

  const comp = compositionChange({ measures: x.measures, weights: d.weights, sex: profile.sex, heightCm: profile.heightCm, today });
  const fatLean = B.fatLeanEstimate({ comp, strengthStatus, rateKgWk });
  const waist = lastOf(x.measures && x.measures.waist), hips = lastOf(x.measures && x.measures.hips);
  const days35 = d.days.filter((r) => r.date <= today).slice(-35).map((r) => ({ date: r.date, calories: r.calories, weightKg: r.weightKg }));
  const maintenance = e ? B.calibratedMaintenance(days35, e.tdee) : { ready: false };
  const gap = e && maintenance.ready ? B.loggingGap({ avgIntake: maintenance.avgIntake, expectedTdee: e.tdee, kgPerWeek: maintenance.kgPerWeek, loggedShare: maintenance.loggedShare }) : null;
  const drop = B.activityDrop({ days: d.days, today });
  const lose = e && e.direction === 'lose';
  const weeksInDeficit = st.weekly && st.weekly.deficitSince ? Math.floor(diffDays(st.weekly.deficitSince, today) / 7) : 0;
  const fatigue = B.fatigueScore({ readiness: (x.readiness || []).filter((r) => r.date > addDays(today, -8)), strengthStatus, weeksInDeficit });
  const stalled = !!(decision && STALL_ACTIONS.includes(decision.action));
  const rows = (food || []).map((f) => ({ date: f.date, mealType: f.mealType, calories: f.nutritionTotal && f.nutritionTotal.calories, protein: f.nutritionTotal && f.nutritionTotal.protein, fiber: f.nutritionTotal && f.nutritionTotal.fiber }));
  const logged14 = d.days.filter((r) => r.date > addDays(today, -14) && r.calories > 0).length / 14;
  const maintainPhase = e && nowKg && targetKg ? B.maintenancePhase({ currentKg: nowKg, targetKg, calorieTarget: e.calorieTarget, maintenanceKcal: maintenance.ready ? maintenance.estimate : e.tdee }) : null;
  const changelog = changelogView(st.changelog, { today, rateNow: rateKgWk, direction: e ? e.direction : 'lose' });
  const missing = ['hips', 'chest', 'arm', 'thigh'].filter((t) => { const l = lastOf(x.measures && x.measures[t]); return !l || diffDays(l.date, today) >= 28; });

  return {
    success: true, date: today, hasGoal: !!(e && targetKg),
    fatLean, recomp: B.recompVerdict({ rateKgWk, comp, strengthStatus }),
    ratios: waist ? { ...B.bodyRatios({ heightCm: profile.heightCm, waistCm: waist.value, hipCm: hips ? hips.value : null, sex: profile.sex }), waistCm: Number(waist.value) } : null,
    maintenance, loggingGap: gap, activityDrop: drop,
    pace: lose && nowKg ? B.paceByBody({ weightKg: nowKg, heightCm: profile.heightCm, sex: profile.sex, bodyFatPct: fatLean.ready ? fatLean.bfEnd : null, chosenPace: pace }) : null,
    taper: taperFor({ profile, st, decision: decision || {}, today }),
    plateau: stalled ? B.plateauChecks({ weighIns14: m.weighIns14 || 0, waterLikely: !!decision && ['WAIT_RETENTION', 'WAIT_CYCLE'].includes(decision.action), loggedShare: logged14, gap, drop, maintenance }) : null,
    fatigue: weeksInDeficit >= 2 || fatigue.score >= 35 ? fatigue : null,
    realism: lose && nowKg && targetKg ? B.goalRealism({ heightCm: profile.heightCm, weightKg: nowKg, targetKg, paceKg: pace, byDate: plan.byDate || '', startDate: plan.startDate || '', today, sex: profile.sex }) : null,
    maintenancePhase: maintainPhase ? { ...maintainPhase, guard: B.regainGuard({ trendKg: nowKg, band: maintainPhase.band }) } : null,
    scenarios: lose && nowKg && targetKg ? B.scenarios({ currentKg: nowKg, targetKg, paceKg: pace, today, weightKg: nowKg }) : null,
    leaks: e ? B.topLeaks({ days: d.days.filter((r) => r.date <= today).slice(-14), rows, target: e.calorieTarget }) : [],
    nutrition: B.proteinFibre({ rows, days: d.days }),
    learned: B.learnedEffects(changelog),
    measure: missing.length && waist ? { missing, guide: true } : null,
  };
}
router.get('/body', wrap(async (req, res) => { const today = todayOf(req); res.json(await coalesce(`body:${req.user.id}:${today}`, () => buildBody(req.user.id, today))); }));


router.get('/hub', wrap(async (req, res) => { const today = todayOf(req); res.json(await coalesce(`hub:${req.user.id}:${today}:${req.query.hour || ''}`, () => buildHub(req.user.id, today, req.query.hour))); }));

module.exports = router;
module.exports.weeklyView = weeklyView;        // exported for the flow tests (auto-adjust, undo)
module.exports.applyDecision = applyDecision;
module.exports.undoLast = undoLast;
module.exports.buildHub = buildHub;
module.exports.buildNext = buildNext;
module.exports.buildBody = buildBody;
module.exports.cycleHintFor = cycleHintFor;
module.exports.coalesce = coalesce;
module.exports.assertSameDecision = assertSameDecision;
module.exports.offerFor = offerFor;
module.exports.taperFor = taperFor;
module.exports.applyChange = applyChange;
module.exports.cycleSummary = cycleSummary;
module.exports.__setProcessLock = (on) => { useProcessLock = !!on; };   // tests: prove the database lease alone keeps two instances apart
module.exports.roughKeptFor = roughKeptFor;
module.exports.context = context;
