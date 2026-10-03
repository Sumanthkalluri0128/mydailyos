const express = require('express');
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const KEYS = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium'];

const perServing = (f) => Object.fromEntries(KEYS.map((k) => [k, Number(f[k] || 0)]));
const scale = (per, servings) => Object.fromEntries(KEYS.map((k) => [k, Number(per[k] || 0) * servings]));

router.get('/', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  res.json({ success: true, logs: await FoodLog.find({ userId: req.user.id, date }).sort({ createdAt: -1 }).lean() });
}));

router.get('/summary', wrap(async (req, res) => {
  const date = v.date(req.query.date);
  const logs = await FoodLog.find({ userId: req.user.id, date }).lean();
  const summary = { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, meals: { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 } };
  for (const l of logs) {
    const n = l.nutritionTotal || {};
    for (const k of KEYS) summary[k] += Number(n[k] || 0);
    if (summary.meals[l.mealType] !== undefined) summary.meals[l.mealType] += Number(n.calories || 0);
  }
  res.json({ success: true, summary });
}));

router.post('/', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const mealType = v.oneOf(req.body?.mealType, 'mealType', MEALS);
  const quantity = v.number(req.body?.quantity, 'quantity', { min: 0.01, max: 100000, required: false, def: 1 });
  const clientId = v.clientId(req.body?.clientId);

  const food = await Food.findOne({
    _id: v.objectId(String(req.body?.foodId || ''), 'foodId'),
    $or: [{ userId: null }, { userId: { $exists: false } }, { userId: req.user.id }],
  }).lean();
  if (!food) throw new HttpError(404, 'Food not found');

  const servings = quantity / Number(food.servingSize || 1);
  const per = perServing(food);
  const { doc, duplicate } = await createOnce(FoodLog, req.user.id, clientId, {
    foodId: food._id, date, mealType, foodName: food.name, baseServingSize: food.servingSize, servingUnit: food.servingUnit,
    consumedQuantity: quantity, servings, nutritionPerServing: per, nutritionTotal: scale(per, servings),
    notes: v.string(req.body?.notes, 'notes', { max: 300 }),
  });
  res.status(duplicate ? 200 : 201).json({ success: true, log: doc, duplicate });
}));

// Change the amount or meal of an existing entry (nutrition is recalculated from the stored snapshot).
router.patch('/:id', wrap(async (req, res) => {
  const log = await FoodLog.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!log) throw new HttpError(404, 'Food log not found');
  if (req.body?.mealType !== undefined) log.mealType = v.oneOf(req.body.mealType, 'mealType', MEALS);
  if (req.body?.quantity !== undefined) {
    const q = v.number(req.body.quantity, 'quantity', { min: 0.01, max: 100000 });
    log.consumedQuantity = q;
    log.servings = q / Number(log.baseServingSize || 1);
    log.nutritionTotal = scale(log.nutritionPerServing || {}, log.servings);
  }
  await log.save();
  res.json({ success: true, log });
}));

// Copy every entry (optionally one meal) from one day to another — "same breakfast as yesterday".
router.post('/copy', wrap(async (req, res) => {
  const from = v.date(req.body?.fromDate, 'fromDate');
  const to = v.date(req.body?.toDate, 'toDate');
  const filter = { userId: req.user.id, date: from };
  if (req.body?.mealType) filter.mealType = v.oneOf(req.body.mealType, 'mealType', MEALS);
  const source = await FoodLog.find(filter).lean();
  if (!source.length) return res.json({ success: true, logs: [] });
  if (source.length > 100) throw new HttpError(400, 'Too many entries to copy at once');
  const logs = await FoodLog.insertMany(source.map((l) => {
    const { _id, createdAt, updatedAt, __v, clientId, ...rest } = l;
    return { ...rest, date: to };
  }));
  res.status(201).json({ success: true, logs });
}));

router.delete('/:id', wrap(async (req, res) => {
  await FoodLog.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  res.json({ success: true });
}));

module.exports = router;
