// The grocery list for a plan. Pure (no database) so it can be tested.
//   merge         the same food is added up; a recipe is expanded into its ingredients and merged with the same ingredient elsewhere
//   already have  foods that match what the person said they have at home move to `alreadyHave` (not the buying list)
//   people        quantities scale for who eats: adults 1 portion, kids 0.5, elders 0.8 (estimates); `perPerson` keeps one portion
//   batches       a dish cooked once and eaten twice is simply the sum of its portions, so the pot is bought for once
const { norm } = require('./foodSafety');

const round1 = (x) => Math.round(x * 10) / 10;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The "already have" entry that matches a food name (whole word or plural: "paneer" matches "Paneer bhurji", "egg" matches "Boiled eggs"). */
function matchHave(name, haveList = []) {
  const n = norm(name);
  for (const h of haveList.map(norm).filter((x) => x.length >= 3)) if (new RegExp(`\\b${esc(h)}(?:e?s)?\\b`).test(n)) return h;
  return null;
}

/** portions = adults + 0.5 kids + 0.8 elders */
const portionFactor = ({ adults = 1, kids = 0, elders = 0 } = {}) => Math.round((adults + kids * 0.5 + elders * 0.8) * 100) / 100;

/**
 * @param items      planned rows { foodId, foodName, quantity, servingUnit, calories }
 * @param recipes    [{ foodId, servings, ingredients: [{ foodId, foodName, quantity, servingUnit }] }]
 * @param foodsById  Map(id -> Food) for serving sizes and household units
 */
function buildGroceryList({ items = [], recipes = [], foodsById = new Map(), have = [], factor = 1 }) {
  const recipeByFood = new Map(recipes.map((r) => [String(r.foodId), r]));
  const groups = new Map();
  const bump = (key, name, unit, qty, kcal, fromRecipe) => {
    const g = groups.get(key) || { foodId: key, name, unit, quantity: 0, calories: 0, times: 0, fromRecipe: false };
    g.quantity += qty; g.calories += kcal; g.times += 1; g.fromRecipe = g.fromRecipe || fromRecipe;
    groups.set(key, g);
  };
  for (const it of items) {
    const rec = recipeByFood.get(String(it.foodId));
    const f = foodsById.get(String(it.foodId));
    if (rec && rec.ingredients && rec.ingredients.length) {
      const servings = (Number(it.quantity) || 0) / (Number(f && f.servingSize) || 1);
      rec.ingredients.forEach((ing, idx) => bump(String(ing.foodId), ing.foodName || 'Ingredient', ing.servingUnit || 'g', (Number(ing.quantity) / Math.max(rec.servings || 1, 0.25)) * servings, idx === 0 ? Number(it.calories) || 0 : 0, true));
    } else bump(String(it.foodId), it.foodName, it.servingUnit, Number(it.quantity) || 0, Number(it.calories) || 0, false);
  }
  const all = [...groups.values()].map((g) => {
    const f = foodsById.get(g.foodId);
    const unit = ((f && f.units) || [])[0];
    const q = g.quantity * factor;
    return { ...g, perPerson: round1(g.quantity), quantity: round1(q), calories: Math.round(g.calories), approx: unit && unit.quantity ? { count: round1(q / unit.quantity), label: unit.label } : null, have: matchHave(g.name, have) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { items: all.filter((g) => !g.have), alreadyHave: all.filter((g) => g.have).map((g) => ({ ...g, haveAs: g.have })) };
}

module.exports = { buildGroceryList, matchHave, portionFactor };
