// Recipe builder: combine ingredients, divide by servings, and get a loggable food with per-serving nutrition.
const express = require('express');
const Recipe = require('../models/Recipe');
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const { createOnce } = require('../lib/idempotent');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { nutritionFor, KEYS } = require('../lib/nutritionCalc');
const v = require('../lib/validate');
const { potFrom, eatenServings, afterEating } = require('../lib/sharedPot');
const { parseIngredients } = require('../lib/ingredientParse');
const { catalogueFoods } = require('../lib/foodCache');

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

// Paste "2 cups rice, 1 cup toor dal, 2 tbsp oil" -> an editable recipe draft (nothing is saved).
router.post('/parse-ingredients', wrap(async (req, res) => {
  const text = v.string(req.body?.text, 'text', { max: 2000, required: true });
  const servings = v.number(req.body?.servings, 'servings', { min: 0.25, max: 200, required: false, def: 4 });
  const [shared, mine] = await Promise.all([catalogueFoods(Food), Food.find({ userId: req.user.id, hidden: { $ne: true } }).select('name brand servingSize servingUnit calories units userId').limit(2000).lean()]);
  res.json({ success: true, ...parseIngredients(text, [...mine, ...shared], { servings }) });
}));

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

// Shared pot / meal prep: "I cooked a pot" = number of servings and/or the total cooked weight. Adds to the portions left.
router.post('/:id/cook', wrap(async (req, res) => {
  const recipe = await Recipe.findOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!recipe) throw new HttpError(404, 'Recipe not found');
  const hasPot = req.body?.totalG !== undefined && req.body?.totalG !== '' && req.body?.totalG !== null;
  const legacy = req.body?.portions !== undefined;
  const pot = potFrom({ servings: legacy ? req.body.portions : req.body?.servings, totalG: hasPot ? Number(req.body.totalG) : null, recipeServings: recipe.servings });
  if (!pot.ok) throw new HttpError(400, pot.message);
  recipe.portionsLeft = Math.min(1000, (recipe.portionsLeft || 0) + pot.servings);
  if (pot.servingG) recipe.potServingG = pot.servingG;
  await recipe.save();
  res.json({ success: true, recipe, pot });
}));

// "Ate 1 portion": logs it to a meal in one step and takes it off the batch.
router.post('/:id/eat', wrap(async (req, res) => {
  const uid = req.user.id;
  const recipe = await Recipe.findOne({ _id: v.objectId(req.params.id), userId: uid });
  if (!recipe) throw new HttpError(404, 'Recipe not found');
  const date = v.date(req.body?.date);
  const mealType = v.oneOf(req.body?.mealType, 'mealType', ['breakfast', 'lunch', 'dinner', 'snacks']);
  const ate = eatenServings({ servingG: recipe.potServingG }, req.body?.grams ? { grams: Number(req.body.grams) } : { servings: req.body?.portions === undefined ? 1 : Number(req.body.portions) });
  if (!ate.ok) throw new HttpError(400, ate.message);
  const portions = v.number(ate.servings, 'portions', { min: 0.01, max: 50 });
  const per = Object.fromEntries(KEYS.map((k) => [k, Number(recipe.perServing?.[k] || 0)]));
  const total = Object.fromEntries(KEYS.map((k) => [k, per[k] * portions]));
  const firstPot = !(await FoodLog.exists({ userId: uid, source: 'pot' }));
  const { doc, duplicate } = await createOnce(FoodLog, uid, v.clientId(req.body?.clientId), {
    foodId: recipe.foodId, date, mealType, foodName: recipe.name, baseServingSize: 1, servingUnit: 'serving', consumedQuantity: portions, servings: portions,
    nutritionPerServing: per, nutritionTotal: total, source: 'pot', notes: req.body?.grams ? `Shared pot, ${Math.round(Number(req.body.grams))} g` : 'Shared pot portion',
  });
  const after = afterEating(recipe.portionsLeft, portions);
  if (!duplicate) { recipe.portionsLeft = after.left; await recipe.save(); }
  res.status(duplicate ? 200 : 201).json({ success: true, log: doc, recipe, duplicate, servings: portions, moreThanLeft: after.over, sticker: firstPot && !duplicate ? 'pot' : null });
}));

router.delete('/:id', wrap(async (req, res) => {
  const recipe = await Recipe.findOneAndDelete({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!recipe) throw new HttpError(404, 'Recipe not found');
  if (recipe.foodId) await Food.deleteOne({ _id: recipe.foodId, userId: req.user.id }); // past food logs keep their own snapshot
  res.json({ success: true });
}));

module.exports = router;
