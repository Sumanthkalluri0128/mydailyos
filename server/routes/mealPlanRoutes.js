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
const { buildSmartPlan, buildPool, inferDiet, classify } = require('../lib/smartPlan');
const { loadAdvice } = require('../lib/planAdvice');
const { adoptFood } = require('../lib/healthyDiet');
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
  return { foodName: food.name, servingUnit: food.servingUnit, calories: Math.round(total.calories), protein: total.protein, fiber: total.fiber, carbohydrates: Math.round(total.carbohydrates || 0), fat: Math.round(total.fat || 0) };
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
// Smart planning: built from my eating habits, a balanced food pool and the last days of eating.
const clampInt = (x, lo, hi, d) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

async function loadHabits(uid, today) {
  const logs = await FoodLog.find({ userId: uid, date: { $gt: addDays(today, -60), $lte: today } })
    .select('foodId foodName mealType date consumedQuantity servingUnit nutritionTotal').lean();
  const habits = analyzeHabits(logs, today);
  const foodDocs = await Food.find({ _id: { $in: [...habits.byFood.keys()] }, hidden: { $ne: true }, ...visible(uid) }).lean();
  return { habits, foods: new Map(foodDocs.map((f) => [String(f._id), f])), names: logs.map((l) => l.foodName).filter(Boolean) };
}
const dietOf = (x, names) => (['v', 'e', 'n'].includes(x) ? x : inferDiet(names));
const adviceView = (a) => (a && a.level !== 'none' ? { level: a.level, headline: a.headline, detail: a.detail, perDay: a.perDay, days: a.days, startDate: a.startDate, skipCut: a.skipCut, runDays: a.runDays, weekExcess: a.weekExcess, lastExcess: a.lastExcess } : null);

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

// GET /api/meal-plans/context?from=&days=&today= — what the planner should know before it plans: do I need a lighter day (and how
// much), the calorie target of each day in the range, what the last days were short on, and which diet will be planned.
router.get('/context', wrap(async (req, res) => {
  const uid = req.user.id;
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const from = req.query.from ? v.date(req.query.from, 'from') : today;
  const nDays = clampInt(req.query.days, 1, 14, 7);
  const dates = Array.from({ length: nDays }, (_, i) => addDays(from, i));
  const [adv, hab] = await Promise.all([loadAdvice(uid, today, { dates }), loadHabits(uid, today)]);
  const { core } = adv;
  res.json({
    success: true, hasProfile: !!(core.ranges && core.target > 0), baseTarget: core.target || null, floor: core.floor,
    advice: adviceView(adv.advice), targets: adv.targets, needs: adv.needs, diet: inferDiet(hab.names), loggedDays: hab.habits.loggedDays, hasHistory: hab.habits.byFood.size > 0,
    ranges: core.ranges || null,
  });
}));

// POST /api/meal-plans/auto { from, days (1-7), meals?, mode?, diet?, variant?, respectAdvice?, preview? }
//   mode 'balanced' (default): every plate has protein + carb + vegetables, your own foods get a bonus, gaps are filled from a healthy pool.
//   mode 'mine': only foods you really log, in your usual portions (needs a few days of history).
// preview:true returns the plan without saving. Re-running replaces the earlier automatic plan for the meals asked for (not what
// I added by hand, not what I ate).
router.post('/auto', wrap(async (req, res) => {
  const uid = req.user.id;
  const from = v.date(req.body?.from, 'from');
  const nDays = clampInt(req.body?.days, 1, 7, 7);
  const to = addDays(from, nDays - 1);
  const dates = Array.from({ length: nDays }, (_, i) => addDays(from, i));
  const meals = Array.isArray(req.body?.meals) && req.body.meals.length ? req.body.meals.filter((m) => MEALS.includes(m)) : MEALS;
  if (!meals.length) throw new HttpError(400, 'Choose at least one meal to plan');
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();
  const mode = req.body?.mode === 'mine' ? 'mine' : 'balanced';
  const variant = clampInt(req.body?.variant, 0, 99, 0);

  const [adv, hab] = await Promise.all([loadAdvice(uid, today, { dates }), loadHabits(uid, today)]);
  const { core } = adv;
  if (!core.ranges || !(core.target > 0)) throw new HttpError(400, 'Add your height, age and weight in Profile first so each day can be sized for you');
  const { habits, foods, names } = hab;
  if (mode === 'mine' && !habits.byFood.size) throw new HttpError(422, 'Log a few days of meals first, or choose the balanced plan which does not need a food history');
  const diet = dietOf(req.body?.diet, names);
  const respect = req.body?.respectAdvice !== false;
  const targets = respect ? adv.targets : Object.fromEntries(dates.map((d) => [d, core.target]));

  const [existing, eaten, shared, mine] = await Promise.all([
    MealPlan.find({ userId: uid, date: { $gte: from, $lte: to } }).lean(),
    FoodLog.find({ userId: uid, date: { $gte: from, $lte: to } }).select('date mealType foodId nutritionTotal').lean(),
    catalogueFoods(Food),
    mode === 'balanced' ? Food.find({ userId: uid, hidden: { $ne: true } }).limit(1500).lean() : [],
  ]);
  const replace = (i) => i.auto && !i.logged && meals.includes(i.mealType);      // earlier automatic, uneaten items of the meals being re-planned
  const keep = existing.filter((i) => !replace(i));
  const occupied = {}; const dayBase = {}; const weekCounts = new Map();
  const bump = (id) => weekCounts.set(String(id), (weekCounts.get(String(id)) || 0) + 1);
  for (const i of keep) {
    occupied[`${i.date}|${i.mealType}`] = true; bump(i.foodId);
    const b = (dayBase[i.date] ||= {});
    for (const k of ['calories', 'protein', 'fiber', 'carbohydrates', 'fat']) b[k] = (b[k] || 0) + Number(i[k] || 0);
  }
  for (const l of eaten) { occupied[`${l.date}|${l.mealType}`] = true; bump(l.foodId); const b = (dayBase[l.date] ||= {}); for (const k of ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium']) b[k] = (b[k] || 0) + Number(l.nutritionTotal?.[k] || 0); }

  const common = { habits, foods, catalogue: shared.filter((f) => !f.hidden), dates, target: core.target, targets, floor: core.floor, ranges: core.ranges, limits: limitTargets(core.target), occupied, dayBase, weekCounts, meals };
  const plan = mode === 'mine'
    ? buildAutoPlan(common)
    : buildSmartPlan({ ...common, userFoods: mine, diet, mode, needs: adv.needs, seed: `${uid}|${from}|${variant}`, avoidIndulgent: !!adv.advice && adv.advice.level !== 'none' });
  if (!plan.items.length) throw new HttpError(422, plan.notes[0] || 'Nothing to plan: every meal in that range already has food');
  const meta = { mode, diet, variant, advice: respect ? adviceView(adv.advice) : null, needs: adv.needs, hasHistory: habits.byFood.size > 0 };

  if (req.body?.preview === true) return res.json({ success: true, preview: true, ...meta, ...plan });

  const rows = [];
  for (const i of plan.items) {
    let foodId = i.foodId; let unit = i.servingUnit;
    if (!foodId) {                       // a curated healthy food that is not in the person's list yet: add it, then plan it
      const f = await adoptFood(Food, uid, i.foodName); if (!f) continue;
      foodId = f._id; unit = f.servingUnit;
    }
    rows.push({ userId: uid, date: i.date, mealType: i.mealType, foodId, foodName: i.foodName, quantity: i.quantity, servingUnit: unit, calories: i.calories, protein: i.protein, fiber: i.fiber, carbohydrates: i.carbohydrates || 0, fat: i.fat || 0, auto: true, why: String(i.why || '').slice(0, 200), role: i.role || '' });
  }
  await MealPlan.deleteMany({ userId: uid, date: { $gte: from, $lte: to }, auto: true, logged: false, mealType: { $in: meals } });
  const saved = await MealPlan.insertMany(rows);
  res.status(201).json({ success: true, saved: saved.length, ...meta, ...plan });
}));

// POST /api/meal-plans/clear { from, to?, meals? } — remove everything planned (and not yet eaten) in a range: a day, or a whole week.
router.post('/clear', wrap(async (req, res) => {
  const from = v.date(req.body?.from, 'from'); const to = req.body?.to ? v.date(req.body.to, 'to') : from;
  if (from > to || diffDays(from, to) > MAX_RANGE) throw new HttpError(400, `Range must be 1–${MAX_RANGE} days`);
  const filter = { userId: req.user.id, date: { $gte: from, $lte: to }, logged: false };
  if (Array.isArray(req.body?.meals) && req.body.meals.length) filter.mealType = { $in: req.body.meals.filter((m) => MEALS.includes(m)) };
  const r = await MealPlan.deleteMany(filter);
  res.json({ success: true, removed: r.deletedCount || 0 });
}));

// GET /api/meal-plans/:id/alternatives — same kind of food (protein / carb / veg ...), similar calories, for the "Swap" button.
router.get('/:id/alternatives', wrap(async (req, res) => {
  const uid = req.user.id;
  const item = await MealPlan.findOne({ _id: v.objectId(req.params.id), userId: uid }).lean();
  if (!item) throw new HttpError(404, 'Planned item not found');
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const [hab, shared, mine] = await Promise.all([loadHabits(uid, today), catalogueFoods(Food), Food.find({ userId: uid, hidden: { $ne: true } }).limit(1500).lean()]);
  const role = item.role || classify(item.foodName).role;
  const pool = buildPool({ foods: hab.foods, userFoods: mine, catalogue: shared.filter((f) => !f.hidden), habits: hab.habits, diet: dietOf(req.query.diet, hab.names) });
  const round2 = (x) => Math.round(x * 2) / 2;
  const out = pool.filter((c) => c.role === role && (c.meals.has(item.mealType) || c.famMeals.has(item.mealType)) && c.key !== String(item.foodId) && c.name !== item.foodName && (!c.heavy || c.habit))
    .map((c) => {
      const servings = Math.min(4, Math.max(0.5, round2(item.calories / Math.max(c.per.calories, 20))));
      const kcal = c.per.calories * servings;
      const close = 1 - Math.abs(kcal - item.calories) / Math.max(item.calories, 60);
      return { c, servings, kcal, score: close + (c.habit ? 0.35 : 0) + Math.min(0.4, (c.per.protein * servings * 4) / Math.max(kcal, 40)) };
    })
    .filter((x) => Math.abs(x.kcal - item.calories) <= Math.max(40, item.calories * 0.3))
    .sort((a, b) => b.score - a.score).slice(0, 6)
    .map(({ c, servings, kcal }) => ({ foodId: c.id, name: c.name, servings, quantity: Math.round(c.size * servings * 10) / 10, unit: c.unit, calories: Math.round(kcal), protein: Math.round(c.per.protein * servings * 10) / 10, familiar: !!c.habit, curated: c.source === 'curated' && !c.id }));
  res.json({ success: true, role, items: out });
}));

// POST /api/meal-plans/:id/swap { foodId | name, servings? } — replace a planned (not yet eaten) food with another, keeping the meal and day.
router.post('/:id/swap', wrap(async (req, res) => {
  const uid = req.user.id;
  const item = await MealPlan.findOne({ _id: v.objectId(req.params.id), userId: uid });
  if (!item) throw new HttpError(404, 'Planned item not found');
  if (item.logged) throw new HttpError(400, 'That one is already eaten');
  let food = null;
  if (req.body?.foodId) food = await Food.findOne({ _id: v.objectId(String(req.body.foodId), 'foodId'), ...visible(uid) }).lean();
  else if (req.body?.name) food = (await adoptFood(Food, uid, String(req.body.name)))?.toObject?.() || null;
  if (!food) throw new HttpError(404, 'Food not found');
  const servings = req.body?.servings !== undefined ? v.number(req.body.servings, 'servings', { min: 0.25, max: 20 }) : 1;
  const quantity = Math.round((Number(food.servingSize) || 1) * servings * 10) / 10;
  item.foodId = food._id; item.quantity = quantity; item.why = 'Swapped by you'; item.role = classify(food.name).role === 'other' ? item.role : classify(food.name).role;
  Object.assign(item, snapshot(food, quantity));
  await item.save();
  res.json({ success: true, item });
}));

module.exports = router;
