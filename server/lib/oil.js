// Hidden oil: the biggest silent calorie source in home cooking. 1 tsp of oil or ghee ≈ 40 kcal (≈ 4.5 g fat).
const KCAL_PER_TSP = 40;
const OIL_WORDS = /\b(oil|ghee|butter|tadka|tarka|vanaspati|clarified)\b/i;
const oilKcal = (tsp) => Math.round((Number(tsp) || 0) * KCAL_PER_TSP);

/** Rough teaspoons of added fat per serving of a recipe from its ingredient lines [{foodName, quantity, servingUnit}] (grams / ml / tsp / tbsp). */
function recipeOilTsp(ingredients, servings = 1) {
  let tsp = 0;
  for (const i of ingredients || []) {
    if (!OIL_WORDS.test(i.foodName || '')) continue;
    const q = Number(i.quantity) || 0;
    const u = String(i.servingUnit || 'g').toLowerCase();
    tsp += /tbsp|tablespoon/.test(u) ? q * 3 : /tsp|teaspoon/.test(u) ? q : q / 4.5; // grams or ml ≈ 4.5 per teaspoon
  }
  const per = tsp / Math.max(0.25, Number(servings) || 1);
  return Math.round(per * 10) / 10;
}
module.exports = { KCAL_PER_TSP, oilKcal, recipeOilTsp, OIL_WORDS };
