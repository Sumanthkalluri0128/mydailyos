// Weekly meal planner: plan foods for future days/meals, log them with one tap, and get a shopping list.
const express = require('express');
const MealPlan = require('../models/MealPlan');
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { createOnce } = require('../lib/idempotent');
const { nutritionFor, foodLogDoc } = require('../lib/nutritionCalc');
const { diffDays, addDays } = require('../lib/dates');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MAX_RANGE = 62;
const visible = (uid) => ({ $or: [{ userId: null }, { userId: { $exists: false } }, { userId: uid }] });

function range(req) {
  const from = v.date(req.query.from, 'from'), to = v.date(req.query.to, 'to');
  if (from > to || diffDays(from, to) > MAX_RANGE) throw new HttpError(400, `Range must be 1–${MAX_RANGE} days`);
  return { from, to };
}

function snapshot(food, quantity) {
  const { total } = nutritionFor(food, quantity);
  return { foodName: food.name, servingUnit: food.servingUnit, calories: Math.round(total.calories), protein: total.protein, fiber: total.fiber };
}

router.get('/', wrap(async (req, res) => {
  const { from, to } = range(req);
  const items = await MealPlan.find({ userId: req.user.id, date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 }).lean();
  res.json({ success: true, items });
}));

router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const date = v.date(req.body?.date);
  const mealType = v.oneOf(req.body?.mealType, 'mealType', MEALS);
  const quantity = v.number(req.body?.quantity, 'quantity', { min: 0.01, max: 100000 });
  const food = await Food.findOne({ _id: v.objectId(String(req.body?.foodId || ''), 'foodId'), ...visible(uid) }).lean();
  if (!food) throw new HttpError(404, 'Food not found');
  if ((await MealPlan.countDocuments({ userId: uid, date })) >= 60) throw new HttpError(400, 'That day is full');
  const item = await MealPlan.create({ userId: uid, date, mealType, foodId: food._id, quantity, ...snapshot(food, quantity) });
  res.status(201).json({ success: true, item });
}));

router.patch('/:id', wrap(async (req, res) => {
  const item = await MealPlan.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!item) throw new HttpError(404, 'Planned item not found');
  if (req.body?.mealType !== undefined) item.mealType = v.oneOf(req.body.mealType, 'mealType', MEALS);
  if (req.body?.date !== undefined) item.date = v.date(req.body.date);
  if (req.body?.quantity !== undefined) {
    const quantity = v.number(req.body.quantity, 'quantity', { min: 0.01, max: 100000 });
    const food = await Food.findOne({ _id: item.foodId, ...visible(req.user.id) }).lean();
    item.quantity = quantity;
    if (food) Object.assign(item, snapshot(food, quantity));
  }
  await item.save();
  res.json({ success: true, item });
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await MealPlan.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Planned item not found');
  res.json({ success: true });
}));

async function logItems(uid, items, { date, clientId } = {}) {
  const foods = await Food.find({ _id: { $in: items.map((i) => i.foodId) }, ...visible(uid) }).lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const logs = []; let skipped = 0;
  for (let idx = 0; idx < items.length; idx += 1) {
    const it = items[idx], food = byId.get(String(it.foodId));
    if (!food) { skipped += 1; continue; }
    const { doc } = await createOnce(FoodLog, uid, clientId ? `${clientId}:${idx}` : undefined, foodLogDoc(food, it.quantity, date || it.date, it.mealType));
    logs.push(doc);
    await MealPlan.updateOne({ _id: it._id }, { $set: { logged: true } });
  }
  return { logs, skipped };
}

// Eat one planned item (defaults to its planned day; pass `date` to log it on a different day).
router.post('/:id/log', wrap(async (req, res) => {
  const item = await MealPlan.findOne({ _id: v.objectId(req.params.id), userId: req.user.id }).lean();
  if (!item) throw new HttpError(404, 'Planned item not found');
  const date = req.body?.date ? v.date(req.body.date) : item.date;
  const out = await logItems(req.user.id, [item], { date, clientId: v.clientId(req.body?.clientId) });
  res.status(201).json({ success: true, ...out });
}));

// Eat everything still unlogged on a day.
router.post('/log-day', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const items = await MealPlan.find({ userId: req.user.id, date, logged: false }).sort({ createdAt: 1 }).lean();
  const out = await logItems(req.user.id, items, { date, clientId: v.clientId(req.body?.clientId) });
  res.status(201).json({ success: true, ...out });
}));

// Copy a 7-day block of plans to another 7-day block ("repeat last week").
router.post('/copy-week', wrap(async (req, res) => {
  const uid = req.user.id;
  const from = v.date(req.body?.fromStart, 'fromStart'), to = v.date(req.body?.toStart, 'toStart');
  if (from === to) throw new HttpError(400, 'Choose a different week to copy into');
  const src = await MealPlan.find({ userId: uid, date: { $gte: from, $lte: addDays(from, 6) } }).lean();
  const shift = diffDays(from, to);
  const docs = src.map(({ _id, createdAt, updatedAt, __v, ...rest }) => ({ ...rest, date: addDays(rest.date, shift), logged: false }));
  if (docs.length) await MealPlan.insertMany(docs);
  res.status(201).json({ success: true, copied: docs.length });
}));

// Everything needed for the plan, grouped by food: "Paneer – 600 g (6 servings)".
router.get('/shopping-list', wrap(async (req, res) => {
  const { from, to } = range(req);
  const uid = req.user.id;
  const filter = { userId: uid, date: { $gte: from, $lte: to } };
  if (req.query.includeLogged !== 'true') filter.logged = false;
  const items = await MealPlan.find(filter).lean();
  const foods = await Food.find({ _id: { $in: [...new Set(items.map((i) => String(i.foodId)))] }, ...visible(uid) }).lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const groups = new Map();
  for (const it of items) {
    const key = String(it.foodId);
    const g = groups.get(key) || { foodId: key, name: it.foodName, unit: it.servingUnit, quantity: 0, calories: 0, times: 0 };
    g.quantity += it.quantity; g.calories += it.calories; g.times += 1;
    groups.set(key, g);
  }
  const list = [...groups.values()].map((g) => {
    const f = byId.get(g.foodId);
    const unit = (f?.units || [])[0];
    const approx = unit && unit.quantity ? { count: Math.round((g.quantity / unit.quantity) * 10) / 10, label: unit.label } : null;
    return { ...g, quantity: Math.round(g.quantity * 10) / 10, calories: Math.round(g.calories), approx };
  }).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, from, to, items: list });
}));

module.exports = router;
