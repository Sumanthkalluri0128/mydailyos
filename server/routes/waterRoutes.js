const express = require('express');
const WaterLog = require('../models/WaterLog');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  const logs = await WaterLog.find({ userId: req.user.id, date }).sort({ createdAt: -1 }).lean();
  const totalMl = logs.reduce((s, x) => s + x.amountMl, 0);
  res.json({ success: true, logs, totalMl, totalLiters: totalMl / 1000 });
}));

router.post('/', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const amountMl = v.number(req.body?.amountMl, 'amountMl', { min: 1, max: 10000 });
  const clientId = v.clientId(req.body?.clientId);
  const { doc, duplicate } = await createOnce(WaterLog, req.user.id, clientId, {
    date, amountMl: Math.round(amountMl), notes: v.string(req.body?.notes, 'notes', { max: 300 }),
  });
  res.status(duplicate ? 200 : 201).json({ success: true, log: doc, duplicate });
}));

router.delete('/:id', wrap(async (req, res) => {
  await WaterLog.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  res.json({ success: true });
}));

module.exports = router;
