// Saved meals: a named bundle of foods (e.g. "My usual breakfast") that can be logged in one tap.
const express = require('express');
const SavedMeal = require('../models/SavedMeal');
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
const visible = (uid) => ({ $or: [{ userId: null }, { userId: { $exists: false } }, { userId: uid }] });

router.get('/', wrap(async (req, res) => {
  res.json({ success: true, meals: await SavedMeal.find({ userId: req.user.id }).sort({ name: 1 }).lean() });
}));

router.post('/', wrap(async (req, res) => {
  if ((await SavedMeal.countDocuments({ userId: req.user.id })) >= 50) throw new HttpError(400, 'You can save up to 50 meals');
  const name = v.string(req.body?.name, 'name', { max: 80, required: true });
  const raw = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
  if (!raw.length) throw new HttpError(400, 'Add at least one food');
  const ids = raw.map((i) => v.objectId(String(i?.foodId || ''), 'foodId'));
  const foods = await Food.find({ _id: { $in: ids }, ...visible(req.user.id) }).lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const items = raw.map((i) => {
    const f = byId.get(String(i.foodId));
    if (!f) throw new HttpError(404, 'One of the foods was not found');
    const quantity = v.number(i.quantity, 'quantity', { min: 0.01, max: 100000 });
    return { foodId: f._id, foodName: f.name, quantity, servingUnit: f.servingUnit, calories: Math.round((Number(f.calories) || 0) * (quantity / f.servingSize)) };
  });
  res.status(201).json({ success: true, meal: await SavedMeal.create({ userId: req.user.id, name, items }) });
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await SavedMeal.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Saved meal not found');
  res.json({ success: true });
}));

// Log every item of a saved meal to a day + meal slot.
router.post('/:id/log', wrap(async (req, res) => {
  const meal = await SavedMeal.findOne({ _id: v.objectId(req.params.id), userId: req.user.id }).lean();
  if (!meal) throw new HttpError(404, 'Saved meal not found');
  const date = v.date(req.body?.date);
  const mealType = v.oneOf(req.body?.mealType, 'mealType', MEALS);
  const clientId = v.clientId(req.body?.clientId);
  const foods = await Food.find({ _id: { $in: meal.items.map((i) => i.foodId) }, ...visible(req.user.id) }).lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));

  const logs = [];
  let skipped = 0;
  for (let idx = 0; idx < meal.items.length; idx += 1) {
    const item = meal.items[idx];
    const food = byId.get(String(item.foodId));
    if (!food) { skipped += 1; continue; } // food was deleted since the meal was saved
    const servings = item.quantity / Number(food.servingSize || 1);
    const per = Object.fromEntries(KEYS.map((k) => [k, Number(food[k] || 0)]));
    const total = Object.fromEntries(KEYS.map((k) => [k, per[k] * servings]));
    const { doc } = await createOnce(FoodLog, req.user.id, clientId ? `${clientId}:${idx}` : undefined, {
      foodId: food._id, date, mealType, foodName: food.name, baseServingSize: food.servingSize, servingUnit: food.servingUnit,
      consumedQuantity: item.quantity, servings, nutritionPerServing: per, nutritionTotal: total, notes: '',
    });
    logs.push(doc);
  }
  res.status(201).json({ success: true, logs, skipped });
}));

module.exports = router;
