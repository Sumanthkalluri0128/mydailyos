// GET /api/wrapped?month=YYYY-MM&health=0|1 -> the numbers for the monthly recap card. The picture is drawn on the device.
const express = require('express');
const FoodLog = require('../models/FoodLog');
const ActivityLog = require('../models/ActivityLog');
const WeightLog = require('../models/WeightLog');
const Collection = require('../models/Collection');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { todayUtc } = require('../lib/dates');
const { buildWrapped, monthRange } = require('../lib/wrapped');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const month = String(req.query.month || todayUtc().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'month must be YYYY-MM');
  const showHealth = req.query.health === '1' || req.query.health === 'true';
  const { from, to } = monthRange(month); const uid = req.user.id; const range = { $gte: from, $lte: to };
  const [food, acts, weights, col] = await Promise.all([
    FoodLog.find({ userId: uid, date: range }).select('date foodName nutritionTotal.calories').lean(),
    showHealth ? ActivityLog.find({ userId: uid, date: range }).select('date').lean() : [],
    showHealth ? WeightLog.find({ userId: uid, date: range }).select('date weightKg').lean() : [],
    Collection.findOne({ userId: uid }).lean(),
  ]);
  res.json({ success: true, wrapped: buildWrapped({ month, foodLogs: food.map((l) => ({ date: l.date, foodName: l.foodName, calories: l.nutritionTotal?.calories })), activityDates: acts.map((a) => a.date), owned: col?.owned || [], weights, showHealth }) });
}));
module.exports = router;
