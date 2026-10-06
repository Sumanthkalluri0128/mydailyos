const express = require('express');
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
const { dailyTarget } = require('../lib/energy');
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
  res.json({ success: true, streaks: computeStreaks(dates, today) });
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
  await sendMail({ to: d.user.email, subject: d.subject, text: d.text });
  res.json({ success: true, message: `Sent to ${d.user.email}` });
}));

module.exports = router;
