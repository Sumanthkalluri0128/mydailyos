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
const { dailyTarget, expectedEnergy, macroTargets, waterTargetMl } = require('../lib/energy');
const { addDays, todayUtc } = require('../lib/dates');
const G = require('../lib/coachG');
const H = require('../lib/coachH');
const T = require('../lib/toneLines');
const { loadPlanContext } = require('../lib/planContext');
const { detectPlateau } = require('../lib/plateau');
const MealPlan = require('../models/MealPlan');
const { featureView, ALL } = require('../lib/features');
const { nextStep } = require('../lib/nextStep');

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
  const macros = macroTargets(target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const waterMl = profile?.goals?.waterTargetMl || waterTargetMl(profile?.currentWeightKg) || null;
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
    event: H.eventView({ event: state.event, dietBreak: state.dietBreak, today, target: c.target, tdee: c.tdee, profile: c.profile || {} }),
  });
}));

// ---- 1. rough day
router.post('/rough', wrap(async (req, res) => {
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
  res.json({ success: true, ...G.goalRange({ weights: c.weights, goalKg: c.profile?.goals?.targetWeightKg, today }) });
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
router.post('/diet-break', wrap(async (req, res) => {
  const today = todayOf(req);
  const days = Math.min(7, Math.max(1, Math.round(Number(req.body?.days) || 7)));
  const st = await getState(req.user.id);
  st.dietBreak = { kind: String(req.body?.kind || 'maintenance-week').slice(0, 30), from: today, to: addDays(today, days - 1) };
  await st.save();
  res.json({ success: true, dietBreak: plain(st).dietBreak });
}));
router.delete('/diet-break', wrap(async (req, res) => {
  const st = await getState(req.user.id); st.dietBreak = { kind: '', from: '', to: '' }; await st.save();
  res.json({ success: true });
}));
router.get('/diet-break/advice', wrap(async (req, res) => {
  const today = todayOf(req); const c = await context(req.user.id, today);
  const plateau = detectPlateau({ weights: c.weights, profile: c.profile || {}, today, target: c.target });
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
router.put('/features', wrap(async (req, res) => {
  const st = await getState(req.user.id); st.showAll = !!req.body?.showAll; await st.save();
  res.json({ success: true, ...featureView({ counts: await featureCounts(req.user.id), showAll: st.showAll, seen: st.seenFeatures }) });
}));
router.post('/features/seen', wrap(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x) => ALL.includes(x));
  const st = await getState(req.user.id); st.seenFeatures = [...new Set([...(st.seenFeatures || []), ...ids])]; await st.save();
  res.json({ success: true, seen: st.seenFeatures });
}));
router.post('/next-step', wrap(async (req, res) => {
  const b = req.body || {};
  res.json({ success: true, step: nextStep({ hour: b.hour, meals: b.meals, waterMl: b.waterMl, waterTargetMl: b.waterTargetMl, steps: b.steps, stepsTarget: b.stepsTarget, budget: b.budget, eaten: b.eaten, weightLogged: b.weightLogged, weighDay: b.weighDay }) });
}));

module.exports = router;
module.exports.roughKeptFor = roughKeptFor;
module.exports.context = context;
