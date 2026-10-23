// "What can I cook?": tick what is at home, get ideas from MY recipes first, then my own foods, then the catalogue.
// Pure (no database). The caller removes anything the person avoids (allergies etc.) BEFORE calling: this module never adds foods back.
const { norm } = require('./foodSafety');

const singular = (w) => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const words = (s) => norm(s).split(' ').filter(Boolean).map(singular);
const SKIP = new Set(['quick add', 'imported entry']);

/** Which of the `have` items appear (as whole words) in a name. */
function haveIn(name, have) {
  const w = new Set(words(name));
  return have.filter((h) => h.words.every((x) => w.has(x)));
}
const prep = (list) => [...new Set((list || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 30).map((raw) => ({ raw, words: words(raw) })).filter((h) => h.words.length);

/**
 * @param o.have        ["paneer", "rice"]
 * @param o.recipes     [{ name, foodId, servings, ingredients:[{foodName}], perServing:{calories,protein} }]
 * @param o.myFoods     person's own foods  [{ _id, name, calories, protein, servingSize, servingUnit, brand }]
 * @param o.catalogue   shared foods (same shape)
 * @param o.remaining   { calories, protein } left today (may be negative)
 * @param o.limit       per group
 */
function cookIdeas({ have: haveRaw, recipes = [], myFoods = [], catalogue = [], remaining = {}, limit = 5 }) {
  const have = prep(haveRaw);
  if (!have.length) return { have: [], groups: [], message: 'Tick or type what you have at home.' };
  const left = Number.isFinite(Number(remaining.calories)) ? Number(remaining.calories) : null;
  const fit = (kcal) => (left === null ? null : kcal <= Math.max(0, left));
  const ppc = (p, c) => (c > 0 ? Math.round((p / c) * 1000) / 1000 : 0);
  const recipeFoodIds = new Set(recipes.map((r) => String(r.foodId)));

  const recipeIdeas = [];
  for (const r of recipes) {
    const ings = (r.ingredients || []).map((i) => i.foodName).filter(Boolean);
    if (!ings.length) continue;
    const has = ings.filter((n) => haveIn(n, have).length);
    if (!has.length) continue;
    const missing = ings.filter((n) => !has.includes(n));
    const cal = Number(r.perServing?.calories) || 0;
    recipeIdeas.push({ type: 'recipe', name: r.name, foodId: r.foodId ? String(r.foodId) : null, recipeId: r._id ? String(r._id) : null, calories: Math.round(cal), protein: Math.round((Number(r.perServing?.protein) || 0) * 10) / 10,
      have: has, missing, coverage: Math.round((has.length / ings.length) * 100), fits: fit(cal), proteinPerKcal: ppc(Number(r.perServing?.protein) || 0, cal) });
  }
  const fromFoods = (list, type) => list.filter((f) => f.name && !SKIP.has(norm(f.name)) && Number(f.calories) > 0 && !recipeFoodIds.has(String(f._id)) && f.brand !== 'Recipe').map((f) => {
    const hits = haveIn(f.name, have);
    if (!hits.length) return null;
    return { type, name: f.name, foodId: String(f._id), calories: Math.round(f.calories), protein: Math.round((Number(f.protein) || 0) * 10) / 10, servingSize: f.servingSize, servingUnit: f.servingUnit,
      have: hits.map((h) => h.raw), missing: [], coverage: null, matched: hits.length, fits: fit(Number(f.calories)), proteinPerKcal: ppc(Number(f.protein) || 0, Number(f.calories)) };
  }).filter(Boolean);

  // fits the budget first, then covers more of what you have, then protein per kcal
  const rank = (a, b) => (b.fits === true) - (a.fits === true) || (b.matched || 0) - (a.matched || 0) || (b.coverage || 0) - (a.coverage || 0) || b.proteinPerKcal - a.proteinPerKcal || a.name.localeCompare(b.name);
  const groups = [
    { id: 'recipes', title: 'Your recipes', items: recipeIdeas.sort(rank).slice(0, limit) },
    { id: 'mine', title: 'Your own foods', items: fromFoods(myFoods, 'mine').sort(rank).slice(0, limit) },
    { id: 'catalogue', title: 'More ideas', items: fromFoods(catalogue, 'catalogue').sort(rank).slice(0, limit) },
  ].filter((g) => g.items.length);
  const reason = (i) => [i.coverage !== null ? `you have ${i.coverage}% of the ingredients` : `uses ${i.have.join(', ')}`, i.fits === true ? 'fits what is left today' : i.fits === false ? 'a bit more than what is left today' : '', i.proteinPerKcal >= 0.08 ? 'good protein for the calories' : ''].filter(Boolean).join(' · ');
  for (const g of groups) g.items = g.items.map((i) => ({ ...i, reason: reason(i) }));
  return { have: have.map((h) => h.raw), groups, message: groups.length ? '' : 'Nothing matched yet. Try fewer or simpler names, like "paneer" or "dal".' };
}

module.exports = { cookIdeas, haveIn };
