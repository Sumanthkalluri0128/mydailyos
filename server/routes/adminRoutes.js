// Admin-only: the list of "report wrong values" notes. Protected by ADMIN_EMAILS (see middleware/admin.js).
const express = require('express');
const FoodReport = require('../models/FoodReport');
const { requireAdmin } = require('../middleware/admin');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const FeatureFlag = require('../models/FeatureFlag');
const { cleanFlag } = require('../lib/flags');
const { stats } = require('../lib/serverStatsStore');

const router = express.Router();
router.use(requireAdmin);

// GET /api/admin/food-reports?status=open
router.get('/food-reports', wrap(async (req, res) => {
  const status = ['open', 'fixed', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const rows = await FoodReport.find({ status }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ success: true, count: rows.length, reports: rows.map((r) => ({ id: r._id, foodId: r.foodId, foodName: r.foodName, catalogue: r.catalogue, note: r.note, status: r.status, userId: r.userId, at: r.createdAt })) });
}));

router.patch('/food-reports/:id', wrap(async (req, res) => {
  const status = v.oneOf(req.body?.status, 'status', ['open', 'fixed', 'dismissed']);
  const r = await FoodReport.findByIdAndUpdate(v.objectId(req.params.id), { $set: { status } }, { new: true }).lean();
  if (!r) throw new HttpError(404, 'Report not found');
  res.json({ success: true, report: { id: r._id, status: r.status } });
}));

// GET /api/admin/health: cold starts, failed syncs, dropped offline writes, errors, keep-alive status (numbers only, no personal data).
router.get('/health', wrap(async (req, res) => {
  const mongoose = require('mongoose');
  res.json({ success: true, version: require('../package.json').version, db: mongoose.connection.readyState === 1 ? 'connected' : 'connecting', ...stats.snapshot() });
}));

// Feature flags (see lib/flags.js). Admins only.
router.get('/flags', wrap(async (req, res) => {
  const rows = await FeatureFlag.find({}).sort({ key: 1 }).lean();
  res.json({ success: true, flags: rows.map((f) => ({ key: f.key, enabled: f.enabled, percent: f.percent, allow: f.allow, deny: f.deny, description: f.description })) });
}));
router.put('/flags/:key', wrap(async (req, res) => {
  let flag; try { flag = cleanFlag(req.params.key, req.body); } catch (e) { throw new HttpError(400, e.message); }
  await FeatureFlag.updateOne({ key: flag.key }, { $set: flag }, { upsert: true });
  res.json({ success: true, flag });
}));
router.delete('/flags/:key', wrap(async (req, res) => {
  await FeatureFlag.deleteOne({ key: String(req.params.key) });
  res.json({ success: true });
}));

module.exports = router;
