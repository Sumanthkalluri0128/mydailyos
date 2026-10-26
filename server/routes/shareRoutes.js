// Accountability link. Authenticated management under /api/share, public read-only page at GET /s/:token (see publicHandler).
//   GET /api/share            -> { link: null | { label, fields, views, lastViewedAt, createdAt }, fields }
//   POST /api/share           -> create or replace (new secret) { label, fields } -> { url } (the secret is shown ONCE)
//   PUT /api/share            -> change label / fields, keep the same link
//   DELETE /api/share         -> revoke
const express = require('express');
const ShareLink = require('../models/ShareLink');
const FoodLog = require('../models/FoodLog');
const ActivityLog = require('../models/ActivityLog');
const WaterLog = require('../models/WaterLog');
const WeightLog = require('../models/WeightLog');
const HealthLog = require('../models/HealthLog');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap, HttpError } = require('../lib/http');
const { addDays, todayUtc } = require('../lib/dates');
const { computeStreaks } = require('../lib/streaks');
const S = require('../lib/shareLink');

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
async function weeklyStats(uid, to) {
  const from = addDays(to, -6); const range = { $gte: from, $lte: to };
  const [allFoodDates, food, acts, water, weights, steps] = await Promise.all([
    FoodLog.distinct('date', { userId: uid }),
    FoodLog.find({ userId: uid, date: range }).select('date nutritionTotal.calories').lean(),
    ActivityLog.find({ userId: uid, date: range }).select('date durationMinutes').lean(),
    WaterLog.find({ userId: uid, date: range }).select('date amountMl').lean(),
    WeightLog.find({ userId: uid, date: range }).select('date weightKg').sort({ date: 1 }).lean(),
    HealthLog.find({ userId: uid, type: 'steps', date: range }).select('value').lean(),
  ]);
  const byDay = (rows, f) => { const m = new Map(); for (const r of rows) m.set(r.date, (m.get(r.date) || 0) + (Number(f(r)) || 0)); return [...m.values()]; };
  const cal = byDay(food, (l) => l.nutritionTotal?.calories);
  const w = byDay(water, (l) => l.amountMl);
  return {
    from, to,
    streak: computeStreaks(allFoodDates, to, { freeze: true }).current,
    loggingDays: new Set(food.map((l) => l.date)).size,
    workouts: acts.length, workoutMinutes: Math.round(acts.reduce((a, b) => a + (Number(b.durationMinutes) || 0), 0)),
    avgSteps: steps.length ? Math.round(avg(steps.map((s) => Number(s.value) || 0))) : null,
    avgWaterMl: w.length ? Math.round(avg(w)) : null,
    weightChangeKg: weights.length >= 2 ? Math.round((weights.at(-1).weightKg - weights[0].weightKg) * 10) / 10 : null,
    avgCalories: cal.length ? Math.round(avg(cal)) : null,
  };
}
const baseUrl = (req) => (process.env.PUBLIC_URL || `${(req.headers['x-forwarded-proto'] || req.protocol).toString().split(',')[0]}://${req.get('host')}`).replace(/\/$/, '');
const view = (l) => (l ? { label: l.label, fields: l.fields, views: l.views, lastViewedAt: l.lastViewedAt, createdAt: l.createdAt } : null);
const FIELD_LIST = Object.entries(S.FIELDS).map(([id, f]) => ({ id, label: f.label, health: f.health }));

const router = express.Router();
router.use(requireAuth);
router.get('/', wrap(async (req, res) => res.json({ success: true, link: view(await ShareLink.findOne({ userId: req.user.id }).lean()), fields: FIELD_LIST, defaults: S.DEFAULT_FIELDS })));
router.post('/', wrap(async (req, res) => {
  const token = S.newToken();
  const doc = await ShareLink.findOneAndUpdate({ userId: req.user.id },
    { tokenHash: S.hashToken(token), label: String(req.body?.label || '').trim().slice(0, 40), fields: S.cleanFields(req.body?.fields), views: 0, lastViewedAt: null },
    { upsert: true, new: true, setDefaultsOnInsert: true });
  res.status(201).json({ success: true, url: `${baseUrl(req)}/s/${token}`, link: view(doc) });
}));
router.put('/', wrap(async (req, res) => {
  const set = {}; if (req.body?.fields !== undefined) set.fields = S.cleanFields(req.body.fields); if (req.body?.label !== undefined) set.label = String(req.body.label).trim().slice(0, 40);
  const doc = await ShareLink.findOneAndUpdate({ userId: req.user.id }, set, { new: true });
  if (!doc) throw new HttpError(404, 'There is no link to change. Create one first.');
  res.json({ success: true, link: view(doc) });
}));
router.delete('/', wrap(async (req, res) => { await ShareLink.deleteOne({ userId: req.user.id }); res.json({ success: true }); }));

// Public page. Looks the secret up by hash, shows only the selected fields, never caches, never indexes.
const publicLimiter = rateLimit({ windowMs: 60_000, max: 40, keyFn: (req) => `share|${req.ip}` });
async function publicHandler(req, res) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'", 'X-Content-Type-Options': 'nosniff' });
  res.type('html');
  try {
    if (!S.looksLikeToken(req.params.token)) return res.status(404).send(S.notFoundPage());
    const link = await ShareLink.findOneAndUpdate({ tokenHash: S.hashToken(req.params.token) }, { $inc: { views: 1 }, $set: { lastViewedAt: new Date() } }, { new: true }).lean();
    if (!link) return res.status(404).send(S.notFoundPage());
    const stats = await weeklyStats(link.userId, todayUtc());
    res.send(S.renderPage({ label: link.label, from: stats.from, to: stats.to, items: S.pick(link.fields, stats) }));
  } catch { res.status(404).send(S.notFoundPage()); }
}
module.exports = router;
module.exports.publicHandler = publicHandler;
module.exports.publicLimiter = publicLimiter;
module.exports.weeklyStats = weeklyStats;
