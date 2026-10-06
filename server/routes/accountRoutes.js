const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Food = require('../models/Food');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap, HttpError } = require('../lib/http');
const { toCsv } = require('../lib/csv');
const v = require('../lib/validate');
const Profile = require('../models/Profile');
const FoodLog = require('../models/FoodLog');
const { buildHistory } = require('../lib/progress');
const { buildReportLines } = require('../lib/reportBuilder');
const { buildPdf } = require('../lib/pdfReport');
const { dailyTarget, expectedEnergy, macroTargets } = require('../lib/energy');
const { addDays, diffDays, todayUtc } = require('../lib/dates');

const router = express.Router();
router.use(requireAuth);

const PERSONAL_MODELS = [
  'Profile', 'WeightLog', 'WaterLog', 'Task', 'Habit', 'HabitLog', 'FoodLog', 'ActivityLog', 'WorkoutTemplate',
  'HealthLog', 'Fast', 'SavedMeal', 'MealPlan', 'Recipe',
];

const passwordLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 8, keyFn: (req) => `pw|${req.user?.id || req.ip}`,
  message: 'Too many password attempts. Please wait a few minutes.',
});
const exportLimiter = rateLimit({
  windowMs: 60 * 60_000, max: 20, keyFn: (req) => `export|${req.user?.id || req.ip}`,
  message: 'Too many exports. Please try again later.',
});

router.get('/me', wrap(async (req, res) => {
  const u = await User.findById(req.user.id).select('_id name email createdAt');
  if (!u) throw new HttpError(404, 'Account not found');
  res.json({ success: true, user: u });
}));

router.post('/change-password', passwordLimiter, wrap(async (req, res) => {
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (next.length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  if (next.length > 128) throw new HttpError(400, 'New password must be at most 128 characters');

  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(404, 'Account not found');
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
  if (current === next) throw new HttpError(400, 'Choose a password different from the current one');

  user.passwordHash = await bcrypt.hash(next, 12);
  user.passwordChangedAt = new Date();
  await user.save();
  const token = jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, message: 'Password updated', token });
}));

// ---------------------------------------------------------------- export
async function collectExport(userId) {
  const load = (name, sort = { date: 1, createdAt: 1 }) => require(`../models/${name}`).find({ userId }).sort(sort).lean();
  const [user, profile, foodLogs, activityLogs, waterLogs, weightLogs, tasks, habits, habitLogs, templates, customFoods, healthLogs, fasts] = await Promise.all([
    User.findById(userId).select('name email createdAt').lean(),
    load('Profile', {}),
    load('FoodLog'), load('ActivityLog'), load('WaterLog'), load('WeightLog'),
    load('Task'), load('Habit', { createdAt: 1 }), load('HabitLog'), load('WorkoutTemplate', { name: 1 }),
    Food.find({ userId }).sort({ name: 1 }).lean(),
    load('HealthLog'), load('Fast', { startedAt: 1 }),
  ]);
  return { user, profile: profile[0] || null, foodLogs, activityLogs, waterLogs, weightLogs, tasks, habits, habitLogs, templates, customFoods, healthLogs, fasts };
}

const CSV_HEADERS = ['type', 'date', 'name', 'quantity', 'unit', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'details', 'notes'];

function toCsvRows(d) {
  const r = (o) => ({ quantity: '', unit: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', details: '', notes: '', ...o });
  const rows = [];
  for (const l of d.foodLogs) {
    const n = l.nutritionTotal || {};
    rows.push(r({
      type: 'food', date: l.date, name: l.foodName, quantity: l.consumedQuantity, unit: l.servingUnit,
      calories: Math.round(n.calories || 0), protein_g: +(n.protein || 0).toFixed(1), carbs_g: +(n.carbohydrates || 0).toFixed(1), fat_g: +(n.fat || 0).toFixed(1),
      details: l.mealType, notes: l.notes,
    }));
  }
  for (const l of d.activityLogs) {
    rows.push(r({ type: 'exercise', date: l.date, name: l.activityName, quantity: l.durationMinutes, unit: 'min', calories: -Math.round(l.caloriesBurned || 0), details: l.category, notes: l.notes }));
  }
  for (const l of d.healthLogs || []) rows.push(r({ type: l.type, date: l.date, name: l.type, quantity: l.value, unit: '', details: l.value2 != null ? `value2 ${l.value2}` : '', notes: l.notes }));
  for (const l of d.waterLogs) rows.push(r({ type: 'water', date: l.date, name: 'Water', quantity: l.amountMl, unit: 'ml', notes: l.notes }));
  for (const l of d.weightLogs) rows.push(r({ type: 'weight', date: l.date, name: 'Weight', quantity: l.weightKg, unit: 'kg', notes: l.notes }));
  for (const t of d.tasks) {
    if (t.skipped) continue;
    rows.push(r({ type: 'task', date: t.date, name: t.title, details: `${t.completed ? 'done' : 'open'}${t.time ? ` @ ${t.time}` : ''}; ${t.priority}; ${t.recurrence}`, notes: t.notes }));
  }
  for (const l of d.habitLogs) {
    rows.push(r({ type: 'habit', date: l.date, name: l.habitName, quantity: l.completedValue, unit: l.unit, details: l.completed ? 'done' : `target ${l.target}`, notes: l.notes }));
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.type.localeCompare(b.type));
}

router.get('/export', exportLimiter, wrap(async (req, res) => {
  const format = v.oneOf(req.query.format, 'format', ['csv', 'json'], 'csv');
  const data = await collectExport(req.user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flexfit-export-${stamp}.json"`);
    return res.send(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="flexfit-export-${stamp}.csv"`);
  res.send('\uFEFF' + toCsv(CSV_HEADERS, toCsvRows(data))); // BOM so Excel opens UTF-8 correctly
}));

// ---------------------------------------------------------------- delete account
router.delete('/me', rateLimit({ windowMs: 60 * 60_000, max: 5, keyFn: (req) => `del|${req.user?.id || req.ip}` }), wrap(async (req, res) => {
  const id = req.user.id;

  // Delete everything this person owns before the user record itself. The shared food/activity
  // catalogues are intentionally kept (reference data), but the person's own custom foods go.
  const deleted = {};
  for (const name of PERSONAL_MODELS) {
    const result = await require(`../models/${name}`).deleteMany({ userId: id });
    deleted[name] = result.deletedCount || 0;
  }
  deleted.CustomFoods = (await Food.deleteMany({ userId: id })).deletedCount || 0;
  await Food.updateMany({ favoriteBy: id }, { $pull: { favoriteBy: id } });

  const userResult = await User.deleteOne({ _id: id });
  if (userResult.deletedCount !== 1) throw new HttpError(404, 'Account was not found or was already deleted');

  // Data from very old single-user versions carried no userId. If this was the last account,
  // those orphans can only be this person's, so remove them too.
  if ((await User.countDocuments()) === 0) {
    for (const name of PERSONAL_MODELS) {
      await require(`../models/${name}`).deleteMany({ $or: [{ userId: { $exists: false } }, { userId: null }] });
    }
  }

  console.log(`Account ${id} deleted permanently`, deleted);
  res.json({ success: true, message: 'Account and all personal data deleted permanently' });
}));

// Printable report for a dietitian / doctor: targets, averages, a day-by-day table and the food diary. GET /api/account/report.pdf?from=&to=&diary=true
router.get('/report.pdf', exportLimiter, wrap(async (req, res) => {
  const uid = req.user.id;
  const to = req.query.to ? v.date(req.query.to, 'to') : todayUtc();
  const from = req.query.from ? v.date(req.query.from, 'from') : addDays(to, -29);
  if (from > to || diffDays(from, to) > 92) throw new HttpError(400, 'Choose a range of up to 93 days');
  const [user, profile, { days }, foodLogs] = await Promise.all([
    User.findById(uid).select('name').lean(),
    Profile.findOne({ userId: uid }).lean(),
    buildHistory(uid, from, to),
    req.query.diary === 'false' ? [] : FoodLog.find({ userId: uid, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).select('date mealType foodName consumedQuantity servingUnit nutritionTotal').lean(),
  ]);
  const calories = dailyTarget(profile), e = expectedEnergy(profile);
  const targets = { calories, ...macroTargets(calories, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget) };
  targets.carbs = targets.carbs;
  const weighIns = days.filter((d) => d.weighIn);
  const weight = weighIns.length > 1 ? { start: weighIns[0].weightKg, end: weighIns[weighIns.length - 1].weightKg, change: Math.round((weighIns[weighIns.length - 1].weightKg - weighIns[0].weightKg) * 10) / 10 } : null;
  const pdf = buildPdf(buildReportLines({ user, profile, targets, days, foodLogs, from, to, weight }), { title: `FlexFit report ${from} to ${to}` });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="flexfit-report-${from}_${to}.pdf"`, 'Cache-Control': 'no-store' }).send(pdf);
}));

module.exports = router;
module.exports.toCsvRows = toCsvRows;
