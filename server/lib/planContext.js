// Loads a person's Food Preferences and turns them into what the planner needs: settings, the food-safety filter, the safety note.
// One loader for every route that picks foods (auto plan, swaps, add-ons, suggestions, templates), so an allergen filter cannot be forgotten.
const FoodPreference = require('../models/FoodPreference');
const Recipe = require('../models/Recipe');
const Q = require('./planQuestions');
const { excluderFromPrefs, makeExcluder } = require('./foodSafety');

async function loadPlanContext(uid, { today = '', profile = {}, days, meals } = {}) {
  const doc = await FoodPreference.findOne({ userId: uid }).lean();
  const prefs = doc || {};
  const settings = Q.deriveSettings(prefs, { days, meals });
  const excluder = excluderFromPrefs(prefs);
  const safety = Q.planSafety(profile, prefs);
  // a recipe is judged by its ingredients too (a "Veg curry" recipe that lists peanuts is a peanut food)
  let ingByFood = new Map();
  if (!excluder.empty) {
    const recipes = await Recipe.find({ userId: uid }).select('foodId ingredients').lean();
    ingByFood = new Map(recipes.filter((r) => r.foodId).map((r) => [String(r.foodId), (r.ingredients || []).map((i) => i.foodName).filter(Boolean)]));
  }
  const decorate = (foods) => (ingByFood.size ? foods.map((f) => (ingByFood.has(String(f._id)) ? { ...f, ingredients: ingByFood.get(String(f._id)) } : f)) : foods);
  return { doc, prefs, hasPrefs: !!doc, settings, excluder, safety, decorate, now: Date.now(), today };
}

const { filterHabits, adjustCoreForSafety } = require('./planContextPure');

module.exports = { loadPlanContext, filterHabits, adjustCoreForSafety, makeExcluder };
