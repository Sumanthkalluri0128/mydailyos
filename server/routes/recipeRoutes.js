// Recipe builder: combine ingredients, divide by servings, and get a loggable food with per-serving nutrition.
const express = require('express');
const Recipe = require('../models/Recipe');
const Food = require('../models/Food');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { nutritionFor, KEYS } = require('../lib/nutritionCalc');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const visible = (uid) => ({ $or: [{ userId: null }, { userId: { $exists: false } }, { userId: uid }] });
const round1 = (x) => Math.round(x * 10) / 10;

async function parseRecipe(uid, body = {}) {
  const name = v.string(body.name, 'name', { max: 100, required: true });
  const servings = v.number(body.servings, 'servings', { min: 0.25, max: 200 });
  const raw = Array.isArray(body.ingredients) ? body.ingredients.slice(0, 40) : [];
  if (!raw.length) throw new HttpError(400, 'Add at least one ingredient');
  const ids = raw.map((i) => v.objectId(String(i?.foodId || ''), 'foodId'));
  const foods = await Food.find({ _id: { $in: ids }, ...visible(uid) }).lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const sum = Object.fromEntries(KEYS.map((k) => [k, 0]));
  const ingredients = raw.map((i) => {
    const f = byId.get(String(i.foodId));
    if (!f) throw new HttpError(404, 'One of the ingredients was not found');
    const quantity = v.number(i.quantity, 'quantity', { min: 0.01, max: 100000 });
    const { total } = nutritionFor(f, quantity);
    for (const k of KEYS) sum[k] += total[k];
    return { foodId: f._id, foodName: f.name, quantity, servingUnit: f.servingUnit };
  });
  const perServing = Object.fromEntries(KEYS.map((k) => [k, round1(sum[k] / servings)]));
  return { name, servings, ingredients, perServing, notes: v.string(body.notes, 'notes', { max: 1000 }) };
}

/** Keeps the generated Food (one serving of the recipe) in step with the recipe. */
async function syncFood(uid, recipe, existingFoodId) {
  const data = {
    name: recipe.name, brand: 'Recipe', servingSize: 1, servingUnit: 'serving', ...recipe.perServing,
    units: [{ label: 'serving', quantity: 1 }], notes: `Recipe · makes ${recipe.servings} serving${recipe.servings === 1 ? '' : 's'}`,
  };
  if (existingFoodId) {
    const f = await Food.findOneAndUpdate({ _id: existingFoodId, userId: uid }, { $set: data }, { new: true });
    if (f) return f;
  }
  return Food.create({ ...data, userId: uid });
}

router.get('/', wrap(async (req, res) => {
  res.json({ success: true, recipes: await Recipe.find({ userId: req.user.id }).sort({ name: 1 }).lean() });
}));

router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  if ((await Recipe.countDocuments({ userId: uid })) >= 100) throw new HttpError(400, 'You can save up to 100 recipes');
  const parsed = await parseRecipe(uid, req.body);
  const food = await syncFood(uid, parsed);
  const recipe = await Recipe.create({ ...parsed, userId: uid, foodId: food._id });
  res.status(201).json({ success: true, recipe, food });
}));

router.put('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const recipe = await Recipe.findOne({ _id: v.objectId(req.params.id), userId: uid });
  if (!recipe) throw new HttpError(404, 'Recipe not found');
  const parsed = await parseRecipe(uid, req.body);
  const food = await syncFood(uid, parsed, recipe.foodId);
  Object.assign(recipe, parsed, { foodId: food._id });
  await recipe.save();
  res.json({ success: true, recipe, food });
}));

router.delete('/:id', wrap(async (req, res) => {
  const recipe = await Recipe.findOneAndDelete({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!recipe) throw new HttpError(404, 'Recipe not found');
  if (recipe.foodId) await Food.deleteOne({ _id: recipe.foodId, userId: req.user.id }); // past food logs keep their own snapshot
  res.json({ success: true });
}));

module.exports = router;
