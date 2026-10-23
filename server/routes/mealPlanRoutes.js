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
const { buildHistory } = require('../lib/progress');
const { dayBalance, dailyTarget } = require('../lib/energy');
const { reconcile, buildDayViews, fixedSummary } = require('../lib/dayView');
const Recipe = require('../models/Recipe');
const Q = require('../lib/planQuestions');
const { loadPlanContext, filterHabits, adjustCoreForSafety } = require('../lib/planContext');
const { createRules } = require('../lib/planRules');
const { rankAlternatives } = require('../lib/planSwap');
const { findViolations, norm } = require('../lib/foodSafety');
const { buildGroceryList, groupByAisle, shareText } = require('../lib/groceryList');

const FoodPreference = require('../models/FoodPreference');
const router = express.Router();
router.use(requireAuth);

/** The meals the person chose to plan in the Planning sensei (null = never chose: all four). */
async function savedMeals(uid) { const d = await FoodPreference.findOne({ userId: uid }).select('scope').lean(); const m = d && d.scope && d.scope.meals; return m && m.length ? m : null; }

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MAX_RANGE = 62;
const visible = (uid) => ({ $or: [{ userId: null }, { userId: { $exists: false } }, { userId: uid }] });

// Plans can only be made for today and later. `today` is the person's own date (the server's UTC day can be a day off); without it we
// only refuse days that are clearly over in any time zone.
function assertNotPast(date, today) {
  const floor = today || addDays(todayUtc(), -1);
  if (date < floor) throw new HttpError(400, 'That day is over. Past days show what you logged and cannot be planned.');
}
const todayOf = (x) => (x ? v.date(x, 'today') : null);

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
  assertNotPast(date, todayOf(req.body?.today));
  const mealType = v.oneOf(req.body?.mealType, 'mealType', MEALS);
  const quantity = v.number(req.body?.quantity, 'quantity', { min: 0.01, max: 100000 });
  const clientId = v.clientId(req.body?.clientId);
  // A suggested healthy food that is not in the person's list yet can be planned by name: it is added to their list first.
  let food = null;
  if (req.body?.foodId) food = await Food.findOne({ _id: v.objectId(String(req.body.foodId), 'foodId'), ...visible(uid) }).lean();
  else if (req.body?.name) food = (await adoptFood(Food, uid, String(req.body.name)))?.toObject?.() || null;
  if (!food) throw new HttpError(404, 'Food not found');
  if ((await MealPlan.countDocuments({ userId: uid, date })) >= 60) throw new HttpError(400, 'That day is full');
  const pc = await loadPlanContext(uid, {});
  const hit = pc.excluder.test(pc.decorate([food])[0]);
  if (hit && hit.kind !== 'dislike') throw new HttpError(409, `I kept ${food.name} out of your plan: it ${hit.reason}. You asked me to keep that out, and I will not override it.`);
  const { doc, duplicate } = await createOnce(MealPlan, uid, clientId, { date, mealType, foodId: food._id, quantity, ...snapshot(food, quantity), ...(req.body?.why ? { why: String(req.body.why).slice(0, 200) } : {}) });
  res.status(duplicate ? 200 : 201).json({ success: true, item: doc, ...(hit ? { warning: `You said you do not like this (${hit.id}). Added anyway because you chose it.` } : {}) });
}));

router.patch('/:id', wrap(async (req, res) => {
  const item = await MealPlan.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!item) throw new HttpError(404, 'Planned item not found');
  if (req.body?.mealType !== undefined) item.mealType = v.oneOf(req.body.mealType, 'mealType', MEALS);
  if (req.body?.date !== undefined) { item.date = v.date(req.body.date); assertNotPast(item.date, todayOf(req.body?.today)); }
  if (item.logged) throw new HttpError(400, 'That one is already eaten. Edit it in your food log.');
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

// Turns planned items into food logs, counting each one ONCE:
//   * an item that is already eaten is skipped (a second tap, a retried request, "Log day" after logging one by hand)
//   * an item the person already logged directly (same day + meal + food) is just marked done, no second log is created
//   * the log it becomes is remembered on the plan row (logId), so every screen can pair them and never add them up twice
async function logItems(uid, items, { date, clientId } = {}) {
  const fresh = items.filter((i) => !i.logged);
  const foods = await Food.find({ _id: { $in: fresh.map((i) => i.foodId) }, ...visible(uid) }).lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const dates = [...new Set(fresh.map((i) => date || i.date))];
  const existing = dates.length ? await FoodLog.find({ userId: uid, date: { $in: dates } }).select('date mealType foodId').lean() : [];
  const logs = []; let skipped = 0; let already = items.length - fresh.length; let matched = 0;
  const claimed = new Set();
  for (let idx = 0; idx < fresh.length; idx += 1) {
    const it = fresh[idx], food = byId.get(String(it.foodId));
    if (!food) { skipped += 1; continue; }
    const day = date || it.date;
    const hit = existing.find((l) => !claimed.has(String(l._id)) && l.date === day && l.mealType === it.mealType && String(l.foodId) === String(it.foodId));
    if (hit) { claimed.add(String(hit._id)); matched += 1; await MealPlan.updateOne({ _id: it._id }, { $set: { logged: true, logId: hit._id } }); continue; }
    const { doc } = await createOnce(FoodLog, uid, clientId ? `${clientId}:${idx}` : undefined, foodLogDoc(food, it.quantity, day, it.mealType));
    logs.push(doc);
    await MealPlan.updateOne({ _id: it._id }, { $set: { logged: true, logId: doc._id } });
  }
  return { logs, skipped, already, matched };
}

// Eat one planned item (defaults to its planned day; pass `date` to log it on a different day). Safe to repeat: a second call changes nothing.
router.post('/:id/log', wrap(async (req, res) => {
  const item = await MealPlan.findOne({ _id: v.objectId(req.params.id), userId: req.user.id }).lean();
  if (!item) throw new HttpError(404, 'Planned item not found');
  const date = req.body?.date ? v.date(req.body.date) : item.date;
  const out = await logItems(req.user.id, [item], { date, clientId: v.clientId(req.body?.clientId) });
  res.status(out.logs.length ? 201 : 200).json({ success: true, ...out });
}));

// Eat everything still unlogged on a day. Items already eaten (or already logged by hand) are skipped, never doubled.
router.post('/log-day', wrap(async (req, res) => {
  const date = v.date(req.body?.date);
  const items = await MealPlan.find({ userId: req.user.id, date, logged: false }).sort({ createdAt: 1 }).lean();
  const out = await logItems(req.user.id, items, { date, clientId: v.clientId(req.body?.clientId) });
  res.status(out.logs.length ? 201 : 200).json({ success: true, ...out });
}));

// Copy a 7-day block of plans to another 7-day block ("repeat last week").
router.post('/copy-week', wrap(async (req, res) => {
  const uid = req.user.id;
  const from = v.date(req.body?.fromStart, 'fromStart'), to = v.date(req.body?.toStart, 'toStart');
  if (from === to) throw new HttpError(400, 'Choose a different week to copy into');
  const src = await MealPlan.find({ userId: uid, date: { $gte: from, $lte: addDays(from, 6) } }).lean();
  const shift = diffDays(from, to);
  const pc = await loadPlanContext(uid, {});
  const bad = new Set(findViolations(src, pc.excluder).map((b) => b.item));        // a food you now keep out is not copied
  const docs = src.filter((i) => !bad.has(i)).map(({ _id, createdAt, updatedAt, __v, clientId, logId, ...rest }) => ({ ...rest, date: addDays(rest.date, shift), logged: false, logId: null }));
  if (docs.length) await MealPlan.insertMany(docs);
  res.status(201).json({ success: true, copied: docs.length, skipped: bad.size });
}));

// Everything needed for the plan, grouped by food: "Paneer – 600 g (6 servings)".
// GET /api/meal-plans/shopping-list?from&to — the grocery list for planned (not yet eaten) meals.
//   * the same food is merged; a recipe is expanded into its ingredients and merged with the same ingredient elsewhere
//   * what you said you already have (Food Preferences) moves to `alreadyHave` instead of the buying list
//   * quantities are scaled for the people who eat (adults 1, kids 0.5, elders 0.8 portions; estimates), `perPerson` keeps your own amount
//   * a dish cooked in a batch counts for everything cooked (the leftover lunch is part of the same pot)
router.get('/shopping-list', wrap(async (req, res) => {
  const { from, to } = range(req);
  const uid = req.user.id;
  const filter = { userId: uid, date: { $gte: from, $lte: to } };
  if (req.query.includeLogged !== 'true') filter.logged = false;
  const [items, pc] = await Promise.all([MealPlan.find(filter).lean(), loadPlanContext(uid, {})]);
  const foodIds = [...new Set(items.map((i) => String(i.foodId)))];
  const [foods, recipes] = await Promise.all([
    Food.find({ _id: { $in: foodIds }, ...visible(uid) }).lean(),
    Recipe.find({ userId: uid, foodId: { $in: foodIds } }).lean(),
  ]);
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const ingredientIds = recipes.flatMap((r) => (r.ingredients || []).map((x) => String(x.foodId))).filter((k) => !byId.has(k));
  if (ingredientIds.length) for (const f of await Food.find({ _id: { $in: ingredientIds }, ...visible(uid) }).lean()) byId.set(String(f._id), f);
  const factor = pc.settings.portions.factor || 1;
  const list = buildGroceryList({ items, recipes, foodsById: byId, have: pc.settings.have, factor });
  res.json({ success: true, from, to, ...list, aisles: groupByAisle(list.items), text: shareText(list, { from, to }), people: { ...pc.settings.portions, scaled: factor !== 1 } });
}));

// "I already have this at home" / "I need to buy it": keeps the list's "already at home" shelf in step with Food Preferences.
router.post('/shopping-list/have', wrap(async (req, res) => {
  const name = v.string(req.body?.name, 'name', { max: 40, required: true }).trim().toLowerCase();
  const have = req.body?.have !== false;
  await FoodPreference.updateOne({ userId: req.user.id }, have ? { $addToSet: { have: name } } : { $pull: { have: name } }, { upsert: true, setDefaultsOnInsert: true });
  res.json({ success: true, name, have });
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
const dietOf = (x, names, pcDiet) => (['v', 'e', 'n'].includes(x) ? x : pcDiet || inferDiet(names));
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
    advice: adviceView(adv.advice), targets: adv.targets, needs: adv.needs, diet: dietOf(req.query.diet, hab.names), loggedDays: hab.habits.loggedDays, hasHistory: hab.habits.byFood.size > 0,
    ranges: core.ranges || null,
  });
}));

// ---------------------------------------------------------------------------------------------------------------------
// GET /api/meal-plans/view?from=&to=&today= — THE planner response: for every day, each meal with what is logged and what is planned
// merged into one list (status 'logged' | 'planned'), the day bar (eaten / planned / remaining, the same budget Home uses), up to 3
// add-on suggestions under every meal that already has food ('suggested', plus `more` for "show more"), and a hint for the chef.
// Past days are history (logged only, read-only). Web and mobile both render exactly this, and both can cache it for offline use.
const VIEW_MAX_DAYS = 14;
const enumerateDays = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

async function homeBudgets(uid, core, dates, today) {
  const pastDates = dates.filter((d) => d <= today);
  const rows = new Map();
  if (pastDates.length) {
    const h = await buildHistory(uid, pastDates[0], pastDates[pastDates.length - 1]);
    for (const d of h.days) rows.set(d.date, d);
  }
  const budgets = {};
  for (const d of dates) {
    const row = rows.get(d);
    // Exactly Home's maths: target + the extra food earned by activity so far. Future days have no activity yet.
    budgets[d] = d <= today && row ? dayBalance(core.profile, { eaten: row.calories, workout: row.caloriesBurned, steps: 0 }).budget : core.target;
  }
  return budgets;
}

router.get('/view', wrap(async (req, res) => {
  const uid = req.user.id;
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const { from, to } = range(req);
  if (diffDays(from, to) + 1 > VIEW_MAX_DAYS) throw new HttpError(400, `Show at most ${VIEW_MAX_DAYS} days at a time`);
  const dates = enumerateDays(from, to);
  const [adv, hab, plans, logs] = await Promise.all([
    loadAdvice(uid, today, { dates: dates.filter((d) => d >= today) }),
    loadHabits(uid, today),
    MealPlan.find({ userId: uid, date: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean(),
    FoodLog.find({ userId: uid, date: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean(),
  ]);
  const pc = await loadPlanContext(uid, { today, profile: adv.core.profile });
  const core = adjustCoreForSafety(adv.core, pc.safety);
  const rules = createRules({ settings: pc.settings, excluder: pc.excluder, now: pc.now });
  const diet = dietOf(req.query.diet, hab.names, pc.settings.diet);
  const needSuggest = dates.some((d) => d >= today);
  const [shared, mine, budgets] = await Promise.all([
    needSuggest ? catalogueFoods(Food) : [],
    needSuggest ? Food.find({ userId: uid, hidden: { $ne: true } }).limit(1500).lean() : [],
    homeBudgets(uid, core, dates, today),
  ]);
  const trims = {};
  for (const d of dates) trims[d] = d >= today && adv.targets[d] ? Math.max(0, Math.round(core.target - adv.targets[d])) : 0;
  const days = buildDayViews({
    dates, today, logs, plans, budgets, trims, ranges: core.ranges, diet, suggest: needSuggest,
    foods: hab.foods, userFoods: pc.decorate(mine), catalogue: shared.filter((f) => !f.hidden), habits: hab.habits, rules,
    dayInfo: (d, bud) => {
      const i = rules.dayInfo(d, bud || core.target, core.floor);
      return { out: i.out.map((m) => ({ meal: m, kind: pc.settings.out ? pc.settings.out.kind : '', aim: Math.round((bud || core.target) * (pc.settings.shares[m] || 0)) })), fasted: i.fasted, vrat: i.vrat, ramadan: i.ramadan, travel: i.travel, festivalRoom: i.room };
    },
  });
  // A planned food that was logged directly (not through "Log") is marked done here, so it is paired for good and never counted twice.
  const rec = reconcile(plans, logs);
  const toMark = [...rec.paired.entries()].filter(([planId]) => plans.find((p) => String(p._id) === planId && !p.logged));
  for (const [planId, logId] of toMark) MealPlan.updateOne({ _id: planId, userId: uid }, { $set: { logged: true, logId } }).catch(() => {});
  res.json({
    success: true, today, from, to, days,
    ctx: {
      hasProfile: !!(core.ranges && core.target > 0), baseTarget: core.target || null, floor: core.floor, ranges: core.ranges || null, advice: adviceView(adv.advice), diet,
      safety: pc.safety, sensei: { setupDone: Q.isSetupDone(pc.prefs), improve: Q.isSetupDone(pc.prefs) ? Q.pickQuestions({ prefs: pc.prefs, ctx: { today, age: Number(core.profile.age) || 0, mode: 'update' } }).length : 0, coach: pc.prefs.coach || null },
    },
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
  const pcEarly = await savedMeals(uid);
  const meals = Array.isArray(req.body?.meals) && req.body.meals.length ? req.body.meals.filter((m) => MEALS.includes(m)) : (pcEarly || MEALS);
  if (!meals.length) throw new HttpError(400, 'Choose at least one meal to plan');
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();
  const mode = req.body?.mode === 'mine' ? 'mine' : 'balanced';
  const variant = clampInt(req.body?.variant, 0, 99, 0);
  const planDates = dates.filter((d) => d >= today);            // days that are over are history: never planned
  if (!planDates.length) throw new HttpError(400, 'That day is over. Past days show what you logged and cannot be planned.');

  const [adv, hab] = await Promise.all([loadAdvice(uid, today, { dates: planDates }), loadHabits(uid, today)]);
  const pc = await loadPlanContext(uid, { today, profile: adv.core.profile });
  const core = adjustCoreForSafety(adv.core, pc.safety);
  if (!core.ranges || !(core.target > 0)) throw new HttpError(400, 'Add your height, age and weight in Profile first so each day can be sized for you');
  const { names } = hab;
  const habitsFoods = mode === 'mine' ? filterHabits(hab.habits, new Map([...hab.foods].map(([id, f]) => [id, pc.decorate([f])[0]])), pc.excluder) : { habits: hab.habits, foods: hab.foods };
  const { habits, foods } = habitsFoods;
  if (mode === 'mine' && !habits.byFood.size) throw new HttpError(422, 'Log a few days of meals first, or choose the balanced plan which does not need a food history');
  const diet = dietOf(req.body?.diet, names, pc.settings.diet);
  const respect = req.body?.respectAdvice !== false && !pc.safety.maintenanceOnly;   // pregnancy / under 18 / medical: no lighter-day cuts either
  const targets = respect ? { ...adv.targets } : Object.fromEntries(planDates.map((d) => [d, core.target]));
  // Today's budget is Home's budget (target + the food earned by activity so far), minus any "lighter day" cut, so the plan fills what Home says is left.
  if (planDates.includes(today)) {
    const homeBudget = (await homeBudgets(uid, core, [today], today))[today];
    targets[today] = Math.max(core.floor, homeBudget - Math.max(0, Math.round(core.target - (targets[today] ?? core.target))));
  }

  const [existing, eaten, shared, mine] = await Promise.all([
    MealPlan.find({ userId: uid, date: { $in: planDates } }).lean(),
    FoodLog.find({ userId: uid, date: { $in: planDates } }).select('date mealType foodId foodName consumedQuantity servingUnit nutritionTotal').lean(),
    catalogueFoods(Food),
    mode === 'balanced' ? Food.find({ userId: uid, hidden: { $ne: true } }).limit(1500).lean() : [],
  ]);
  // Logged food is FIXED. A plan row that was eaten (or matches something already logged) is covered by its log, so it is not
  // counted again as "planned": only rows still to eat compete for the budget.
  const rec = reconcile(existing, eaten);
  // a locked meal is kept as it is while the rest is re-shuffled
  const lockedMeals = new Set(rec.pending.filter((i) => i.locked).map((i) => `${i.date}|${i.mealType}`));
  const replace = (i) => i.auto && !i.locked && !lockedMeals.has(`${i.date}|${i.mealType}`) && meals.includes(i.mealType);   // earlier automatic, uneaten items of the meals being re-planned
  const keep = rec.pending.filter((i) => !replace(i));
  const occupied = {}; const dayBase = {}; const weekCounts = new Map();
  const bump = (id) => weekCounts.set(String(id), (weekCounts.get(String(id)) || 0) + 1);
  for (const i of keep) {
    occupied[`${i.date}|${i.mealType}`] = true; bump(i.foodId);
    const b = (dayBase[i.date] ||= {});
    for (const k of ['calories', 'protein', 'fiber', 'carbohydrates', 'fat']) b[k] = (b[k] || 0) + Number(i[k] || 0);
  }
  for (const l of eaten) { occupied[`${l.date}|${l.mealType}`] = true; bump(l.foodId); const b = (dayBase[l.date] ||= {}); for (const k of ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium']) b[k] = (b[k] || 0) + Number(l.nutritionTotal?.[k] || 0); }

  const common = { habits, foods, catalogue: shared.filter((f) => !f.hidden), dates: planDates, target: core.target, targets, floor: core.floor, ranges: core.ranges, limits: limitTargets(core.target), occupied, dayBase, weekCounts, meals };
  const plan = mode === 'mine'
    ? buildAutoPlan(common)
    : buildSmartPlan({ ...common, userFoods: pc.decorate(mine), diet, mode, needs: adv.needs, seed: `${uid}|${planDates[0]}|${variant}`, avoidIndulgent: !!adv.advice && adv.advice.level !== 'none', settings: pc.settings, excluder: pc.excluder, now: pc.now });
  // last gate: whatever the engine did, an excluded allergen is never shown or saved
  const leaked = findViolations(plan.items, pc.excluder);
  if (leaked.length) { plan.items = plan.items.filter((i) => !leaked.some((l) => l.item === i)); plan.notes = [...(plan.notes || []), 'A food that you keep out of your plan was removed.']; }
  if (pc.safety.flagged) plan.notes = [pc.safety.note, ...(plan.notes || [])];
  if (!plan.items.length) throw new HttpError(422, plan.notes[0] || 'Nothing to plan: every meal in that range already has food');
  // What was treated as fixed, and add-ons for meals that are only partly logged (suggested, never saved on their own).
  const sumRules = createRules({ settings: pc.settings, excluder: pc.excluder, now: pc.now });
  const sumPool = buildPool({ foods, userFoods: pc.decorate(mine), catalogue: shared.filter((f) => !f.hidden), habits, diet, rules: sumRules });
  const stillToEat = [...keep, ...plan.items].map((i) => ({ _id: i._id || `n:${i.date}|${i.mealType}|${i.foodName}`, date: i.date, mealType: i.mealType, foodId: i.foodId || '', foodName: i.foodName, quantity: i.quantity, servingUnit: i.servingUnit, calories: i.calories, protein: i.protein, fiber: i.fiber, carbohydrates: i.carbohydrates || 0, fat: i.fat || 0 }));
  const { fixed, addOns } = fixedSummary({ dates: planDates, logs: eaten, plans: stillToEat, budgets: targets, ranges: core.ranges, pool: sumPool });
  const meta = { mode, diet, variant, advice: respect ? adviceView(adv.advice) : null, needs: adv.needs, hasHistory: habits.byFood.size > 0, fixed, addOns, safety: pc.safety, usedPreferences: pc.hasPrefs, portions: pc.settings.portions, locked: [...lockedMeals] };

  if (req.body?.preview === true) return res.json({ success: true, preview: true, ...meta, ...plan });

  const rows = [];
  for (const i of plan.items) {
    let foodId = i.foodId; let unit = i.servingUnit;
    if (!foodId) {                       // a curated healthy food that is not in the person's list yet: add it, then plan it
      const f = await adoptFood(Food, uid, i.foodName); if (!f) continue;
      foodId = f._id; unit = f.servingUnit;
    }
    rows.push({ userId: uid, date: i.date, mealType: i.mealType, foodId, foodName: i.foodName, quantity: i.quantity, servingUnit: unit, calories: i.calories, protein: i.protein, fiber: i.fiber, carbohydrates: i.carbohydrates || 0, fat: i.fat || 0, auto: true, why: String(i.why || '').slice(0, 200), role: i.role || '', leftover: !!i.leftover, cookMin: i.cookMin ?? null, cookNote: String(i.cookNote || '').slice(0, 120) });
  }
  const delFilter = { userId: uid, date: { $in: planDates }, auto: true, logged: false, locked: { $ne: true }, mealType: { $in: meals } };
  if (lockedMeals.size) delFilter.$nor = [...lockedMeals].map((k) => { const [date, mealType] = k.split('|'); return { date, mealType }; });
  await MealPlan.deleteMany(delFilter);
  const saved = await MealPlan.insertMany(rows);
  res.status(201).json({ success: true, saved: saved.length, ...meta, ...plan });
}));

// POST /api/meal-plans/lock { date, mealType, locked } — keep a planned meal while the rest of the week is re-shuffled ("Plan my week" again).
router.post('/lock', wrap(async (req, res) => {
  const date = v.date(req.body?.date); const mealType = v.oneOf(req.body?.mealType, 'mealType', MEALS);
  const locked = req.body?.locked !== false;
  const r = await MealPlan.updateMany({ userId: req.user.id, date, mealType, logged: false }, { $set: { locked } });
  res.json({ success: true, locked, items: r.modifiedCount ?? r.nModified ?? 0 });
}));

// POST /api/meal-plans/clear { from, to?, meals? } — remove everything planned (and not yet eaten) in a range: a day, or a whole week.
router.post('/clear', wrap(async (req, res) => {
  const from = v.date(req.body?.from, 'from'); const to = req.body?.to ? v.date(req.body.to, 'to') : from;
  if (from > to || diffDays(from, to) > MAX_RANGE) throw new HttpError(400, `Range must be 1–${MAX_RANGE} days`);
  const filter = { userId: req.user.id, date: { $gte: from, $lte: to }, logged: false };
  if (req.body?.keepLocked === true) filter.locked = { $ne: true };
  if (Array.isArray(req.body?.meals) && req.body.meals.length) filter.mealType = { $in: req.body.meals.filter((m) => MEALS.includes(m)) };
  const r = await MealPlan.deleteMany(filter);
  res.json({ success: true, removed: r.deletedCount || 0 });
}));

// GET /api/meal-plans/:id/alternatives — the 3 best swaps for a planned food, each with the reason it was ranked there (same kind of food,
// similar calories). Anything you keep out (allergies, dislikes, no-stove kitchen ...) is never offered.
router.get('/:id/alternatives', wrap(async (req, res) => {
  const uid = req.user.id;
  const item = await MealPlan.findOne({ _id: v.objectId(req.params.id), userId: uid }).lean();
  if (!item) throw new HttpError(404, 'Planned item not found');
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const profile = await require('../models/Profile').findOne({ userId: uid }).lean();
  const [hab, shared, mine, pc, dayItems, weekItems] = await Promise.all([
    loadHabits(uid, today), catalogueFoods(Food), Food.find({ userId: uid, hidden: { $ne: true } }).limit(1500).lean(), loadPlanContext(uid, { today, profile: profile || {} }),
    MealPlan.find({ userId: uid, date: item.date }).select('foodName role').lean(),
    MealPlan.find({ userId: uid, date: { $gte: addDays(item.date, -3), $lte: addDays(item.date, 3) } }).select('foodId').lean(),
  ]);
  const role = item.role || classify(item.foodName).role;
  const rules = createRules({ settings: pc.settings, excluder: pc.excluder, now: pc.now });
  const pool = buildPool({ foods: hab.foods, userFoods: pc.decorate(mine), catalogue: shared.filter((f) => !f.hidden), habits: hab.habits, diet: dietOf(req.query.diet, hab.names, pc.settings.diet), rules, allowSweet: role === 'sweet' });
  const weekCounts = new Map(); for (const w of weekItems) weekCounts.set(String(w.foodId), (weekCounts.get(String(w.foodId)) || 0) + 1);
  const { familyOf } = require('../lib/smartPlan');
  const otherFamilies = new Set(dayItems.filter((d) => d.role === 'protein' && d.foodName !== item.foodName).map((d) => familyOf(d.foodName)));
  const out = rankAlternatives({ item, pool, rules, weekCounts, plannedNames: new Set(dayItems.map((d) => d.foodName.toLowerCase())), otherFamilies, limit: 3, role });
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
  const pc = await loadPlanContext(uid, {});
  const hit = pc.excluder.test(pc.decorate([food])[0]);
  if (hit && hit.kind !== 'dislike') throw new HttpError(409, `I kept ${food.name} out: it ${hit.reason}. You asked me to keep that out, and I will not override it.`);
  const servings = req.body?.servings !== undefined ? v.number(req.body.servings, 'servings', { min: 0.25, max: 20 }) : 1;
  const quantity = Math.round((Number(food.servingSize) || 1) * servings * 10) / 10;
  item.foodId = food._id; item.quantity = quantity; item.why = 'Swapped by you'; item.leftover = false; item.cookNote = ''; item.role = classify(food.name).role === 'other' ? item.role : classify(food.name).role;
  Object.assign(item, snapshot(food, quantity));
  await item.save();
  res.json({ success: true, item });
}));

module.exports = router;
