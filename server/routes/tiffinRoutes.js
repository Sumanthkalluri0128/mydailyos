// Tiffin / office lunch planner: plan tomorrow's lunch tonight. Canteen favourites are the person's own foods (saved as quick picks);
// the plan itself is an ordinary planner entry (POST /api/meal-plans), so allergies and "foods to avoid" apply exactly as everywhere else.
const express = require('express');
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const MealPlan = require('../models/MealPlan');
const FoodPreference = require('../models/FoodPreference');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { addDays } = require('../lib/dates');
const { loadPlanContext } = require('../lib/planContext');
const { pickTiffinQuick, favouriteFood } = require('../lib/tiffin');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);
const KEYS = ['name', 'brand', 'servingSize', 'servingUnit', 'calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'units'];
const slim = (f) => ({ ...Object.fromEntries(KEYS.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])), _id: f._id });

// GET /api/tiffin?date=YYYY-MM-DD  (the day being planned, normally tomorrow) -> what is already planned for lunch, favourites, and recent lunches.
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const date = v.date(req.query.date, 'date');
  const [pref, planned, logs] = await Promise.all([
    FoodPreference.findOne({ userId: uid }).select('tiffin').lean(),
    MealPlan.find({ userId: uid, date, mealType: 'lunch' }).lean(),
    FoodLog.find({ userId: uid, mealType: 'lunch', date: { $gte: addDays(date, -45), $lt: date } }).select('foodId foodName consumedQuantity').lean(),
  ]);
  const favIds = (pref?.tiffin?.favs || []).map(String);
  const recentIds = [...new Set(logs.map((l) => String(l.foodId)))];
  const foods = await Food.find({ _id: { $in: [...new Set([...favIds, ...recentIds])] }, hidden: { $ne: true }, userId: uid }).lean();
  const pc = await loadPlanContext(uid, {});
  const safe = (list) => (pc.excluder.empty ? list : pc.excluder.keep(pc.decorate(list), (f) => f.name, (f) => ({ ingredients: f.ingredients })));
  const byId = new Map(safe(foods).map((f) => [String(f._id), f]));
  const { favourites, recent } = pickTiffinQuick({ favIds, logs, byId });
  res.json({ success: true, date, planned, planAlready: planned.length > 0, favourites: favourites.map(slim), recent: recent.map(slim) });
}));

// POST /api/tiffin/favorites { name, calories, protein?, carbohydrates?, fat?, foodId? } — save a canteen dish as a quick pick.
router.post('/favorites', wrap(async (req, res) => {
  const uid = req.user.id;
  let food;
  if (req.body?.foodId) {
    food = await Food.findOne({ _id: v.objectId(String(req.body.foodId), 'foodId'), userId: uid }).lean();
    if (!food) throw new HttpError(404, 'Food not found. Only your own foods can be saved here.');
  } else {
    const d = favouriteFood({
      name: v.string(req.body?.name, 'name', { max: 80, required: true }),
      calories: v.number(req.body?.calories, 'calories', { min: 1, max: 5000 }),
      protein: v.number(req.body?.protein, 'protein', { min: 0, max: 500, required: false, def: 0 }),
      carbohydrates: v.number(req.body?.carbohydrates, 'carbohydrates', { min: 0, max: 1000, required: false, def: 0 }),
      fat: v.number(req.body?.fat, 'fat', { min: 0, max: 500, required: false, def: 0 }),
    });
    food = (await Food.create({ ...d, userId: uid })).toObject();
  }
  const pref = await FoodPreference.findOneAndUpdate({ userId: uid }, { $addToSet: { 'tiffin.favs': food._id } }, { upsert: true, new: true, setDefaultsOnInsert: true }).select('tiffin').lean();
  if ((pref.tiffin?.favs || []).length > 30) await FoodPreference.updateOne({ userId: uid }, { $pop: { 'tiffin.favs': -1 } });
  res.status(201).json({ success: true, food: slim(food) });
}));

router.delete('/favorites/:foodId', wrap(async (req, res) => {
  await FoodPreference.updateOne({ userId: req.user.id }, { $pull: { 'tiffin.favs': v.objectId(req.params.foodId, 'foodId') } });
  res.json({ success: true });
}));

module.exports = router;
