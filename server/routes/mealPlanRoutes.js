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
const { loadCore } = require('../lib/planData');
const { analyzeHabits, buildAutoPlan, MEALS: ALL_MEALS } = require('../lib/autoPlan');
const { catalogueFoods } = require('../lib/foodCache');
const { limitTargets } = require('../lib/energy');
const { todayUtc } = require('../lib/dates');

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

// ---------------------------------------------------------------------------------------------------------------------
// Plan from my own eating habits.
async function loadHabits(uid, today) {
  const logs = await FoodLog.find({ userId: uid, date: { $gt: addDays(today, -60), $lte: today } })
    .select('foodId foodName mealType date consumedQuantity servingUnit nutritionTotal').lean();
  const habits = analyzeHabits(logs, today);
  const foodDocs = await Food.find({ _id: { $in: [...habits.byFood.keys()] }, hidden: { $ne: true }, ...visible(uid) }).lean();
  return { habits, foods: new Map(foodDocs.map((f) => [String(f._id), f])) };
}

// GET /api/meal-plans/habits — what I eat at each meal, how often, usual and biggest portion, and the weekly cap this implies.
router.get('/habits', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const { habits, foods } = await loadHabits(req.user.id, today);
  const out = {};
  for (const m of ALL_MEALS) {
    out[m] = habits.byMeal[m].filter((h) => foods.has(h.foodId)).slice(0, 8)
      .map((h) => ({ foodId: h.foodId, name: h.name, perWeek: h.perWeek, usualQty: h.usualQty, maxQty: h.maxQty, unit: h.unit, weeklyCap: h.weeklyCap, indulgent: h.indulgent, lastDate: h.lastDate }));
  }
  res.json({ success: true, loggedDays: habits.loggedDays, meals: out });
}));

// POST /api/meal-plans/auto { from, days (1-7), meals?, preview? } — fills empty meal slots from what I really eat.
// preview:true returns the plan without saving. Re-running replaces the earlier automatic plan (not what I added by hand, not what I ate).
router.post('/auto', wrap(async (req, res) => {
  const uid = req.user.id;
  const from = v.date(req.body?.from, 'from');
  const nDays = Math.min(7, Math.max(1, Math.round(Number(req.body?.days) || 7)));
  const to = addDays(from, nDays - 1);
  const dates = Array.from({ length: nDays }, (_, i) => addDays(from, i));
  const meals = Array.isArray(req.body?.meals) && req.body.meals.length ? req.body.meals.filter((m) => MEALS.includes(m)) : MEALS;
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();

  const core = await loadCore(uid, today, { historyDays: 2 });
  if (!core.ranges || !(core.target > 0)) throw new HttpError(400, 'Add your height, age and weight in Profile first so each day can be sized for you');
  const { habits, foods } = await loadHabits(uid, today);
  if (!habits.byFood.size) throw new HttpError(422, 'Log a few days of meals first. The plan is built from what you actually eat');

  const [existing, eaten, shared] = await Promise.all([
    MealPlan.find({ userId: uid, date: { $gte: from, $lte: to } }).lean(),
    FoodLog.find({ userId: uid, date: { $gte: from, $lte: to } }).select('date mealType foodId nutritionTotal').lean(),
    catalogueFoods(Food),
  ]);
  const keep = existing.filter((i) => !(i.auto && !i.logged));              // earlier automatic, uneaten items get replaced
  const occupied = {}; const dayBase = {}; const weekCounts = new Map();
  const bump = (id) => weekCounts.set(String(id), (weekCounts.get(String(id)) || 0) + 1);
  for (const i of keep) { occupied[`${i.date}|${i.mealType}`] = true; bump(i.foodId); const b = (dayBase[i.date] ||= {}); b.calories = (b.calories || 0) + i.calories; b.protein = (b.protein || 0) + i.protein; b.fiber = (b.fiber || 0) + i.fiber; }
  for (const l of eaten) { occupied[`${l.date}|${l.mealType}`] = true; bump(l.foodId); const b = (dayBase[l.date] ||= {}); for (const k of ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium']) b[k] = (b[k] || 0) + Number(l.nutritionTotal?.[k] || 0); }

  const plan = buildAutoPlan({
    habits, foods, catalogue: shared.filter((f) => !f.hidden), dates, target: core.target, floor: core.floor, ranges: core.ranges,
    limits: limitTargets(core.target), occupied, dayBase, weekCounts, meals,
  });
  if (!plan.items.length) throw new HttpError(422, plan.notes[0] || 'Nothing to plan: every meal in that range already has food');

  if (req.body?.preview === true) return res.json({ success: true, preview: true, ...plan });
  await MealPlan.deleteMany({ userId: uid, date: { $gte: from, $lte: to }, auto: true, logged: false });
  const saved = await MealPlan.insertMany(plan.items.map((i) => ({ userId: uid, date: i.date, mealType: i.mealType, foodId: i.foodId, foodName: i.foodName, quantity: i.quantity, servingUnit: i.servingUnit, calories: i.calories, protein: i.protein, fiber: i.fiber, auto: true, why: i.why })));
  res.status(201).json({ success: true, saved: saved.length, ...plan });
}));

module.exports = router;
