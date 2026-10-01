// Food database: a shared read-only catalogue + each person's own custom foods (full CRUD).
const express = require('express');
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');

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
    notes: v.string(body.notes, 'notes', { max: 500 }),
  };
}

// GET /api/foods?search=&favorites=true&mine=true&limit=
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const and = [visibleTo(uid)];
  if (req.query.search) {
    const rx = new RegExp(v.escapeRegex(String(req.query.search).trim().slice(0, 60)), 'i');
    and.push({ $or: [{ name: rx }, { brand: rx }] });
  }
  if (req.query.mine === 'true') and.push({ userId: uid });
  if (req.query.favorites === 'true') and.push({ $or: [{ favoriteBy: uid }, { userId: uid, isFavorite: true }] });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);

  const foods = await Food.find({ $and: and }).select('+favoriteBy').sort({ name: 1 }).limit(limit).lean();
  res.json({ success: true, foods: foods.map((f) => present(f, uid)) });
}));

// GET /api/foods/recent — foods I logged lately, newest first (for one-tap "log again").
router.get('/recent', wrap(async (req, res) => {
  const uid = req.user.id;
  const logs = await FoodLog.find({ userId: uid }).sort({ createdAt: -1 }).limit(80).select('foodId').lean();
  const ids = [];
  for (const l of logs) {
    const id = String(l.foodId);
    if (!ids.includes(id)) ids.push(id);
    if (ids.length >= 12) break;
  }
  const foods = await Food.find({ _id: { $in: ids }, ...visibleTo(uid) }).select('+favoriteBy').lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  res.json({ success: true, foods: ids.map((id) => byId.get(id)).filter(Boolean).map((f) => present(f, uid)) });
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
