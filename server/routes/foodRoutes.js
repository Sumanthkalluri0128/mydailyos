// Food database: a shared read-only catalogue + each person's own custom foods (full CRUD).
const express = require('express');
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { lookupBarcode, CODE_RE } = require('../lib/openFoodFacts');
const Profile = require('../models/Profile');
const { parseMealText } = require('../lib/foodParse');
const { catalogueFoods } = require('../lib/foodCache');
const { suggestFoods } = require('../lib/suggest');
const { buildMeals, lightOptions, makeItFit, macroCaps } = require('../lib/mealBuilder');
const { previewFit } = require('../lib/fitCheck');
const { weekUsage } = require('../lib/fatLossScore');
const { buildHistory, getDayDetails } = require('../lib/progress');
const { addDays } = require('../lib/dates');
const { expandWord, englishify } = require('../lib/foodAliases');
const { searchFoods, tokens } = require('../lib/foodSearch');
const { dailyTarget, expectedEnergy, macroTargets, macroRanges, dayBalance } = require('../lib/energy');

const router = express.Router();
router.use(requireAuth);

const visibleTo = (userId) => ({ $or: [{ userId: null }, { userId: { $exists: false } }, { userId }] });

/** Shape a food for the client: flags whether it's mine + favourited, and hides internals. */
function present(food, userId) {
  const f = food.toObject ? food.toObject() : { ...food };
  const mine = f.userId && String(f.userId) === String(userId);
  const fav = (f.favoriteBy || []).some((id) => String(id) === String(userId)) || (mine && f.isFavorite === true);
  delete f.favoriteBy;
  f.isCustom = !!mine;
  f.isFavorite = !!fav;
  return f;
}

function parseUnits(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((u) => ({
    label: v.string(u?.label, 'unit label', { max: 30, required: true }),
    quantity: v.number(u?.quantity, 'unit quantity', { min: 0.01, max: 100000 }),
  }));
}

/** Sodium in mg per serving. Accepts "1,200", " 450 mg" and a stray unit mix-up instead of rejecting the whole food:
 *  commas/units are stripped, negatives become 0, and a value above the 100,000 mg limit is treated as micrograms-by-mistake. */
function sodiumMg(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  let n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').replace(/[^0-9.\-eE]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  while (n > 100000) n /= 1000;
  return Math.round(n * 10) / 10;
}

function parseFood(body = {}) {
  const num = (k, o = {}) => v.number(body[k], k, { min: 0, max: 100000, required: false, def: 0, ...o });
  return {
    name: v.string(body.name, 'name', { max: 120, required: true }),
    brand: v.string(body.brand, 'brand', { max: 120 }),
    servingSize: v.number(body.servingSize, 'servingSize', { min: 0.01, max: 100000 }),
    servingUnit: v.string(body.servingUnit, 'servingUnit', { max: 20, def: 'g' }) || 'g',
    calories: v.number(body.calories, 'calories', { min: 0, max: 100000 }),
    protein: num('protein'),
    carbohydrates: num('carbohydrates'),
    fat: num('fat'),
    fiber: num('fiber'),
    sugar: num('sugar'),
    sodium: sodiumMg(body.sodium),
    barcode: v.string(body.barcode, 'barcode', { max: 20 }),
    units: parseUnits(body.units),
    notes: v.string(body.notes, 'notes', { max: 500 }),
  };
}

// GET /api/foods?search=&favorites=true&mine=true&limit=
// Search matches every word typed (so "idli chutney" or "chicken biryani" finds it), and the best matches come first:
// foods that start with what you typed, then ones with a word that starts with it, then my own and favourite foods.
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const raw = String(req.query.search || '').trim().slice(0, 80);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);
  const mineOnly = req.query.mine === 'true';
  const favOnly = req.query.favorites === 'true';

  if (!tokens(raw).length) {
    // No search words: plain A–Z list (optionally only mine / favourites).
    const and = [visibleTo(uid), { hidden: { $ne: true } }];
    if (mineOnly) and.push({ userId: uid });
    if (favOnly) and.push({ $or: [{ favoriteBy: uid }, { userId: uid, isFavorite: true }] });
    const found = await Food.find({ $and: and }).select('+favoriteBy').sort({ name: 1 }).limit(limit).lean();
    return res.json({ success: true, foods: found.map((f) => present(f, uid)) });
  }

  // With search words, rank in memory: the shared catalogue is cached, my own foods are read fresh. Matching is forgiving
  // (any word order, partial words, plurals, typos, abbreviations, regional names) — see lib/foodSearch.js.
  const [shared, mine, favDocs] = await Promise.all([
    mineOnly ? [] : catalogueFoods(Food),
    Food.find({ userId: uid, hidden: { $ne: true } }).select('+favoriteBy').limit(2000).lean(),
    Food.find({ favoriteBy: uid }).select('_id').lean(),
  ]);
  const favIds = new Set(favDocs.map((d) => String(d._id)));
  const pool = [...mine, ...shared.filter((f) => !f.hidden)].map((f) => {
    const p = present(f, uid);
    if (favIds.has(String(p._id))) p.isFavorite = true;
    return p;
  }).filter((f) => !favOnly || f.isFavorite);
  const foods = searchFoods(pool, raw, { limit, extra: (f) => (f.isCustom ? 6 : 0) + (f.isFavorite ? 8 : 0) });
  res.json({ success: true, foods });
}));

// GET /api/foods/recent — foods I logged lately, newest first (for one-tap "log again").
router.get('/recent', wrap(async (req, res) => {
  const uid = req.user.id;
  const logs = await FoodLog.find({ userId: uid }).sort({ createdAt: -1 }).limit(120).select('foodId consumedQuantity').lean();
  const qty = new Map(); // foodId -> quantities you actually logged
  for (const l of logs) { const k = String(l.foodId); if (!qty.has(k)) qty.set(k, []); qty.get(k).push(Number(l.consumedQuantity) || 0); }
  const usual = (k) => { const a = (qty.get(k) || []).filter((x) => x > 0).sort((x, y) => x - y); return a.length >= 2 ? a[Math.floor(a.length / 2)] : null; };
  const ids = [];
  for (const l of logs) {
    const id = String(l.foodId);
    if (!ids.includes(id)) ids.push(id);
    if (ids.length >= 12) break;
  }
  const foods = await Food.find({ _id: { $in: ids }, ...visibleTo(uid) }).select('+favoriteBy').lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  res.json({ success: true, foods: ids.map((id) => byId.get(id)).filter((f) => f && !f.hidden).map((f) => ({ ...present(f, uid), usualQuantity: usual(String(f._id)) })) });
}));

// GET /api/foods/dish-range?q=chicken biryani — typical small / regular / large calories for a restaurant dish, to fill an eating-out estimate.
router.get('/dish-range', wrap(async (req, res) => {
  const raw = String(req.query.q || '').trim().slice(0, 60).toLowerCase();
  const words = raw.split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return res.json({ success: true, dishes: [] });
  const and = [visibleTo(req.user.id), { hidden: { $ne: true } }, { calories: { $gte: 80 } }];
  for (const w of words) and.push({ name: new RegExp(expandWord(w).map(v.escapeRegex).join('|'), 'i') });
  const found = await Food.find({ $and: and }).select('name calories servingSize servingUnit').limit(40).lean();
  const round10 = (n) => Math.round(n / 10) * 10;
  const dishes = found
    .sort((a, b) => (/restaurant|plate|full/i.test(b.name) ? 1 : 0) - (/restaurant|plate|full/i.test(a.name) ? 1 : 0) || a.name.length - b.name.length)
    .slice(0, 5)
    .map((f) => ({ name: f.name, regular: round10(f.calories), small: round10(f.calories * 0.75), large: round10(f.calories * 1.4) }));
  res.json({ success: true, dishes });
}));

// POST /api/foods/parse  { text: "2 roti, dal, 1 cup rice" } -> matched foods with quantities (nothing is saved).
router.post('/parse', wrap(async (req, res) => {
  const text = v.string(req.body?.text, 'text', { max: 600, required: true });
  const [shared, mine] = await Promise.all([catalogueFoods(Food), Food.find({ userId: req.user.id, hidden: { $ne: true } }).select('name brand servingSize servingUnit units userId').limit(2000).lean()]);
  res.json({ success: true, ...parseMealText(englishify(text), [...mine, ...shared]) });
}));

// GET /api/foods/suggest?date=YYYY-MM-DD&mealType=lunch — what fits what's left today.
//   mode 'meal'  (250+ kcal left)   whole plates (roti + dal + sabzi) that fit kcal AND protein, plus single foods, with carb / fat caps
//   mode 'light' (40–250 kcal left) single foods that fit, plus near-zero-calorie options
//   mode 'over'  (under 40 left)    near-zero options and "make it fit" swaps of what is already logged — exactly when help is needed most
router.get('/suggest', wrap(async (req, res) => {
  const uid = req.user.id;
  const date = v.date(req.query.date, 'date');
  const [profile, logs, recentLogs] = await Promise.all([
    Profile.findOne({ userId: uid }).lean(),
    FoodLog.find({ userId: uid, date }).select('foodName mealType nutritionTotal').lean(),
    FoodLog.find({ userId: uid }).sort({ createdAt: -1 }).limit(120).select('foodId').lean(),
  ]);
  const eaten = logs.reduce((a, l) => { const n = l.nutritionTotal || {}; for (const k of ['calories', 'protein', 'fiber', 'carbohydrates', 'fat']) a[k] += n[k] || 0; return a; }, { calories: 0, protein: 0, fiber: 0, carbohydrates: 0, fat: 0 });
  const target = dailyTarget(profile);
  const e = expectedEnergy(profile);
  const macros = macroTargets(target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const ranges = macroRanges(target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const remaining = { calories: target - eaten.calories, protein: macros.protein - eaten.protein, fiber: macros.fiber - eaten.fiber };
  const [shared, mine, favs] = await Promise.all([
    catalogueFoods(Food),
    Food.find({ userId: uid, hidden: { $ne: true } }).limit(2000).lean(),
    Food.find({ $or: [{ favoriteBy: uid }, { userId: uid, isFavorite: true }] }).select('_id').lean(),
  ]);
  const foods = [...mine, ...shared];
  const mealType = ['breakfast', 'lunch', 'dinner', 'snacks'].includes(req.query.mealType) ? req.query.mealType : undefined;
  const recentIds = new Set(recentLogs.map((l) => String(l.foodId)));
  const mode = remaining.calories < 40 ? 'over' : remaining.calories < 250 ? 'light' : 'meal';
  const caps = macroCaps({ ranges, eaten });
  const picks = suggestFoods(foods, remaining, { mealType, recentIds, favoriteIds: new Set(favs.map((f) => String(f._id))) });
  const meals = mode === 'meal' ? buildMeals(foods, remaining, { caps, recentIds, mealType, limit: 3 }) : [];
  const light = mode === 'meal' ? [] : lightOptions(foods, { recentIds });
  const fit = mode === 'over' || mode === 'light' ? makeItFit(logs, Math.max(0, -remaining.calories)) : [];
  res.json({
    success: true, mode,
    remaining: { calories: Math.round(remaining.calories), protein: Math.round(remaining.protein), fiber: Math.round(remaining.fiber) },
    caps,
    suggestions: picks.map((p) => ({ food: present(p.food, uid), reason: p.reason })),
    meals: meals.map((m) => ({ ...m, items: m.items.map((i) => ({ food: present(i.food, uid), servings: i.servings, label: i.label })) })),
    light: light.map((l) => ({ ...l, food: l.food ? present(l.food, uid) : null })),
    makeItFit: fit,
    message: mode === 'over' ? 'You are at or past your budget. That is okay. Here are very light options, and ways to make what you have already eaten fit better.' : '',
  });
}));

// POST /api/foods/fit { foodId, quantity, date } — "will this fit?": what one food does to today and to the week, nothing is saved.
router.post('/fit', wrap(async (req, res) => {
  const uid = req.user.id;
  const date = v.date(req.body?.date, 'date');
  const food = await Food.findOne({ _id: v.objectId(String(req.body?.foodId || ''), 'foodId'), ...visibleTo(uid) }).lean();
  if (!food) throw new HttpError(404, 'Food not found');
  const quantity = v.number(req.body?.quantity, 'quantity', { min: 0.01, max: 100000, required: false, def: food.servingSize || 1 });
  const servings = quantity / Number(food.servingSize || 1);
  const [profile, details, history] = await Promise.all([
    Profile.findOne({ userId: uid }).lean(), getDayDetails(uid, date), buildHistory(uid, addDays(date, -7), date),
  ]);
  const bal = dayBalance(profile, { eaten: details.summary.calories, workout: details.summary.workoutCalories, steps: details.summary.stepCalories });
  const e = expectedEnergy(profile);
  const macros = macroTargets(bal.target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const fit = previewFit({
    add: { calories: (food.calories || 0) * servings, protein: (food.protein || 0) * servings },
    today: { eaten: details.summary.calories, budget: bal.budget, protein: details.summary.protein, proteinTarget: macros.protein },
    week: weekUsage(history.days, bal.target, date),
  });
  res.json({ success: true, food: present(food, uid), quantity, servings, ...fit });
}));

// GET /api/foods/barcode/:code — my/catalogue food with that barcode, else a draft from Open Food Facts (not saved).
router.get('/barcode/:code', wrap(async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!CODE_RE.test(code)) throw new HttpError(400, 'Barcode must be 6–14 digits');
  const known = await Food.findOne({ barcode: code, ...visibleTo(req.user.id) }).select('+favoriteBy').lean();
  if (known) return res.json({ success: true, found: true, saved: true, food: present(known, req.user.id) });
  const draft = await lookupBarcode(code);
  if (!draft) return res.json({ success: true, found: false, saved: false, food: null });
  res.json({ success: true, found: true, saved: false, food: draft });
}));

router.get('/:id', wrap(async (req, res) => {
  const food = await Food.findOne({ _id: v.objectId(req.params.id), ...visibleTo(req.user.id) }).select('+favoriteBy');
  if (!food) throw new HttpError(404, 'Food not found');
  res.json({ success: true, food: present(food, req.user.id) });
}));

router.post('/', wrap(async (req, res) => {
  if ((await Food.countDocuments({ userId: req.user.id })) >= 2000) throw new HttpError(400, 'You can save up to 2000 custom foods');
  const food = await Food.create({ ...parseFood(req.body), userId: req.user.id });
  res.status(201).json({ success: true, food: present(food, req.user.id) });
}));

// Copy any visible food (usually a catalogue one) into my own list so I can tweak the numbers.
router.post('/:id/duplicate', wrap(async (req, res) => {
  const src = await Food.findOne({ _id: v.objectId(req.params.id), ...visibleTo(req.user.id) }).lean();
  if (!src) throw new HttpError(404, 'Food not found');
  const { _id, createdAt, updatedAt, __v, favoriteBy, userId, isFavorite, ...rest } = src;
  const copy = await Food.create({ ...rest, name: `${src.name} (copy)`.slice(0, 120), userId: req.user.id });
  res.status(201).json({ success: true, food: present(copy, req.user.id) });
}));

router.put('/:id', wrap(async (req, res) => {
  const food = await Food.findOne({ _id: v.objectId(req.params.id), ...visibleTo(req.user.id) });
  if (!food) throw new HttpError(404, 'Food not found');
  if (!food.userId || String(food.userId) !== String(req.user.id)) {
    throw new HttpError(403, 'Shared catalogue foods can\u2019t be edited — duplicate it to make your own version.');
  }
  Object.assign(food, parseFood(req.body));
  await food.save();
  res.json({ success: true, food: present(food, req.user.id) });
}));

router.patch('/:id/favorite', wrap(async (req, res) => {
  const uid = req.user.id;
  const food = await Food.findOne({ _id: v.objectId(req.params.id), ...visibleTo(uid) }).select('+favoriteBy');
  if (!food) throw new HttpError(404, 'Food not found');
  const has = food.favoriteBy.some((id) => String(id) === String(uid)) || (String(food.userId) === String(uid) && food.isFavorite);
  food.favoriteBy = has ? food.favoriteBy.filter((id) => String(id) !== String(uid)) : [...food.favoriteBy, uid];
  if (String(food.userId) === String(uid)) food.isFavorite = false; // migrate the legacy flag into favoriteBy
  await food.save();
  res.json({ success: true, food: present(food, uid) });
}));

router.delete('/:id', wrap(async (req, res) => {
  const food = await Food.findOne({ _id: v.objectId(req.params.id), ...visibleTo(req.user.id) });
  if (!food) throw new HttpError(404, 'Food not found');
  if (!food.userId || String(food.userId) !== String(req.user.id)) throw new HttpError(403, 'Shared catalogue foods can\u2019t be deleted');
  // Past food logs keep their own nutrition snapshot, so history is unaffected.
  await food.deleteOne();
  res.json({ success: true });
}));

module.exports = router;
module.exports.parseFood = parseFood;
