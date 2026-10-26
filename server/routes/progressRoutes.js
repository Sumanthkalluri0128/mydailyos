const express = require('express');
const { microForDay, microForWeeks } = require('../lib/microData');
const Profile = require('../models/Profile');
const Habit = require('../models/Habit');
const WeightLog = require('../models/WeightLog');
const FoodLog = require('../models/FoodLog');
const { computeStreaks } = require('../lib/streaks');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { buildHistory, getDayDetails, lifetimeTotals } = require('../lib/progress');
const { buildAchievements } = require('../lib/achievements');
const { buildWeeklySummary } = require('../lib/weekly');
const { dailyTarget, expectedEnergy, macroTargets, waterTargetMl } = require('../lib/energy');
const { buildCoach } = require('../lib/weeklyCoach');
const CoachState = require('../models/CoachState');
const coachG = require('../lib/coachG');
const coachH = require('../lib/coachH');
const toneLines = require('../lib/toneLines');
const { addDays, diffDays, todayUtc } = require('../lib/dates');
const { materializeRecurring } = require('../lib/taskSeries');
const { weeklyBundle, plateauFor, digestFor } = require('../lib/weeklyDigest');
const { sendMail } = require('../lib/mailer');
const { rateLimit } = require('../middleware/rateLimit');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const MAX_RANGE_DAYS = 800;

router.get('/history', wrap(async (req, res) => {
  const from = v.date(req.query.from, 'from');
  const to = v.date(req.query.to, 'to');
  if (from > to) throw new HttpError(400, 'from must not be after to');
  if (diffDays(from, to) > MAX_RANGE_DAYS) throw new HttpError(400, `Range is limited to ${MAX_RANGE_DAYS} days`);
  const history = await buildHistory(req.user.id, from, to);
  res.json({ success: true, ...history, generatedAt: new Date().toISOString() });
}));

/**
 * Single-day snapshot: every log for the date + a summary.
 * `include` lets a dashboard replace its whole fan-out of requests with this one call:
 *    ?include=profile,habits,weights
 *      profile -> { profile }
 *      habits  -> { habitDefs }   (the person's habit definitions; `habits` stays the day's habit *logs*)
 *      weights -> { weightLogs }  (recent weigh-ins, newest first)
 */
const dayHandler = (dateOf) => wrap(async (req, res) => {
  const date = v.date(dateOf(req), 'date');
  const include = new Set(String(req.query.include || '').split(',').map((s) => s.trim()).filter(Boolean));
  const uid = req.user.id;

  await materializeRecurring(uid, date); // make sure repeating tasks for this day exist before listing
  const [details, profile, habitDefs, weightLogs] = await Promise.all([
    getDayDetails(uid, date),
    include.has('profile') ? Profile.findOne({ userId: uid }).lean() : null,
    include.has('habits') ? Habit.find({ userId: uid, isActive: true }).sort({ createdAt: 1 }).lean() : null,
    include.has('weights') ? WeightLog.find({ userId: uid }).sort({ date: -1, createdAt: -1 }).limit(400).lean() : null,
  ]);
  res.json({
    success: true,
    ...details,
    ...(include.has('profile') ? { profile: profile || (await Profile.create({ userId: uid })).toObject() } : {}),
    ...(habitDefs ? { habitDefs } : {}),
    ...(weightLogs ? { weightLogs } : {}),
  });
});

router.get('/day', dayHandler((req) => req.query.date));
router.get('/history/day', dayHandler((req) => req.query.date));
router.get('/day/:date', dayHandler((req) => req.params.date));

router.get('/streaks', wrap(async (req, res) => {
  const today = v.date(req.query.today);
  const dates = await FoodLog.distinct('date', { userId: req.user.id });
  // Rough-day mode: a day with at least one tiny action still counts toward the streak.
  try { dates.push(...(await require('./coachRoutes').roughKeptFor(req.user.id))); } catch { /* optional */ }
  res.json({ success: true, streaks: computeStreaks(dates, today, { freeze: true }) });
}));

// Weekly coach: 1–2 things to change, this week's boss-fight challenge, and a review for the weekly screen.
router.get('/coach', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const uid = req.user.id;
  const [profile, history, rows] = await Promise.all([
    Profile.findOne({ userId: uid }).lean(),
    buildHistory(uid, addDays(today, -34), today),
    FoodLog.find({ userId: uid, date: { $gt: addDays(today, -7), $lte: today } }).select('date mealType foodName nutritionTotal').lean(),
  ]);
  const target = dailyTarget(profile);
  const e = expectedEnergy(profile);
  const macros = macroTargets(target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const goals = profile?.goals || {};
  const targets = {
    calories: target || null, protein: macros?.protein || null,
    waterMl: goals.waterTargetMl || waterTargetMl(profile?.currentWeightKg) || null,
    exerciseMinutes: goals.exerciseMinutesTarget || null, steps: goals.stepsTarget || null,
  };
  const meals = rows.map((l) => ({ date: l.date, mealType: l.mealType, calories: Number(l.nutritionTotal?.calories || 0) }));
  const foods = rows.map((l) => ({ name: l.foodName, calories: Number(l.nutritionTotal?.calories || 0) }));
  // "Low on iron 3 weeks in a row" with foods from the person's own log first (only when there is enough vitamin / mineral data).
  let microInsights = [];
  try { microInsights = (await microForWeeks(uid, today)).insights.slice(0, 2); } catch { /* optional */ }
  const cs = await CoachState.findOne({ userId: uid }).lean();
  const coach = buildCoach({ days: history.days, meals, foods, targets, today, expectedTdee: e?.tdee || null, learn: cs?.learn || {} });
  const tv = coachG.treatView({ treat: cs?.treat, today });
  // Festival / trip window and diet break widen the week; the per-day figure never drops below the calorie floor. Tone changes the review wording.
  const tdee = e?.tdee || null; const monday = coachG.mondayOf(today);
  const extra = coachH.weeklyExtra({ event: cs?.event, dietBreak: cs?.dietBreak, weekStart: monday, target, tdee, profile });
  const wb = coachH.applyWeekExtra(coachG.applyTreat(coach.weekBudget, tv), extra, profile);
  const [rh, rt] = toneLines.reviewLine(cs?.tone, coach.review.mood);
  const review = { ...coach.review, headline: rh, text: rt };
  res.json({ success: true, ...coach, review, weekBudget: wb, treat: tv, microInsights, tone: toneLines.norm(cs?.tone), gentle: !!cs?.gentle });
}));

// Vitamins and minerals for one day (min-max range per nutrient, "not enough data" instead of misleading zeros) and the week view.
router.get('/micro', wrap(async (req, res) => {
  const date = req.query.date ? v.date(req.query.date, 'date') : todayUtc();
  res.json({ success: true, ...(await microForDay(req.user.id, date)) });
}));
router.get('/micro/weekly', wrap(async (req, res) => {
  const end = req.query.end ? v.date(req.query.end, 'end') : todayUtc();
  res.json({ success: true, ...(await microForWeeks(req.user.id, end)) });
}));

router.get('/achievements', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const uid = req.user.id;
  const [{ days }, totals, profile] = await Promise.all([
    buildHistory(uid, addDays(today, -399), today),
    lifetimeTotals(uid),
    Profile.findOne({ userId: uid }).lean(),
  ]);
  res.json({ success: true, ...buildAchievements({ days, totals, goals: profile?.goals, today }), totals });
}));

// Trailing 7 days ending on `end` (default: today) vs the 7 days before that, plus nutrient averages vs targets.
router.get('/weekly', wrap(async (req, res) => {
  const end = req.query.end ? v.date(req.query.end, 'end') : todayUtc();
  const profile = await Profile.findOne({ userId: req.user.id }).lean();
  const { summary, nutrients } = await weeklyBundle(req.user.id, end, profile);
  res.json({ success: true, ...summary, nutrients });
}));

// Is the scale moving the way the goal says it should? (needs ~3 weigh-ins over two weeks)
router.get('/plateau', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const profile = await Profile.findOne({ userId: req.user.id }).lean();
  res.json({ success: true, ...(await plateauFor(req.user.id, today, profile, dailyTarget(profile))) });
}));

// Email myself this week's summary right now (weekly emails themselves are opt-in via PATCH /api/profile { notify: { weeklyEmail } }).
const emailLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, keyFn: (req) => `weekly-mail|${req.user?.id || req.ip}`, message: 'Too many emails. Try again later.' });
router.post('/weekly/email', emailLimiter, wrap(async (req, res) => {
  const end = req.body?.end ? v.date(req.body.end, 'end') : todayUtc();
  const d = await digestFor(req.user.id, end);
  if (!d) throw new HttpError(404, 'Account not found');
  await sendMail({ to: d.user.email, subject: d.subject, text: d.text, html: d.html, headers: d.headers });
  res.json({ success: true, message: `Sent to ${d.user.email}` });
}));

module.exports = router;
