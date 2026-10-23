// Admin-only: the list of "report wrong values" notes. Protected by ADMIN_EMAILS (see middleware/admin.js).
const express = require('express');
const FoodReport = require('../models/FoodReport');
const { requireAdmin } = require('../middleware/admin');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');

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
module.exports = router;
