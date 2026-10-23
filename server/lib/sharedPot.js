// Shared pot: cook one pot, then eat part of it by servings or by weight. Everything scales from the recipe's per-serving nutrition.
const r2 = (x) => Math.round(x * 100) / 100;

/** The pot you cooked: { servings, totalG } -> grams per serving. Either number may be missing; the other is then used as is. */
function potFrom({ servings, totalG, recipeServings }) {
  const s = Number(servings) > 0 ? Number(servings) : null;
  const g = Number(totalG) > 0 ? Number(totalG) : null;
  const sv = s || (g ? null : Number(recipeServings) || 1);
  if (!sv && !g) return { ok: false, message: 'Enter the number of servings or the total cooked weight.' };
  if (sv && g) return { ok: true, servings: r2(sv), totalG: r2(g), servingG: r2(g / sv) };
  if (sv) return { ok: true, servings: r2(sv), totalG: null, servingG: null };
  return { ok: false, needsServings: true, message: 'Enter how many servings the pot makes, or the weight of one serving.' };
}

/**
 * What the person ate -> servings of the pot.
 * @param pot  { servingG } grams per serving (null when only servings are known)
 * @param ate  { servings?, grams? }
 */
function eatenServings(pot, ate = {}) {
  const s = Number(ate.servings), g = Number(ate.grams);
  if (s > 0) return { ok: true, servings: r2(s) };
  if (g > 0) {
    if (!(pot?.servingG > 0)) return { ok: false, message: 'Enter the total cooked weight of the pot first, to log by grams.' };
    return { ok: true, servings: r2(g / pot.servingG) };
  }
  return { ok: false, message: 'Enter how many servings or how many grams you ate.' };
}

/** Nutrition for `servings` of a recipe: per-serving numbers scaled. */
function scaleNutrition(perServing, servings) {
  const out = {};
  for (const k of Object.keys(perServing || {})) out[k] = Math.round(Number(perServing[k] || 0) * servings * 10) / 10;
  return out;
}

/** Portions left after eating (never below 0); `over` is true when more was eaten than the pot had. */
function afterEating(left, servings) {
  const l = Number(left) || 0;
  return { left: Math.max(0, r2(l - servings)), over: servings > l + 1e-9 };
}

module.exports = { potFrom, eatenServings, scaleNutrition, afterEating };
