// Pasted ingredient list ("2 cups rice, 1 cup toor dal, 2 tbsp oil") -> a recipe draft the person reviews and edits.
//
// Two honest problems are handled here:
//  1. Recipes are written with RAW amounts, but the catalogue lists rice and dal as COOKED foods. Raw weight is converted to cooked weight
//     with a yield factor, so the calories of what went into the pot are kept. Factors are typical values (they vary with how much water you
//     use), shown to the person and editable. Where a raw food exists in the catalogue no factor is applied.
//  2. "1 cup of rice" is not a weight. Cup / tbsp / tsp weights come from a small table for common Indian staples (approximate, labelled);
//     for anything not in the table the weight is left EMPTY for the person to enter. Nothing is guessed.
const { parseSegment, bestFood } = require('./foodParse');
const { recipeOilTsp } = require('./oil');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9()\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Names the catalogue uses for the plain ingredient (looked up first, so "rice" means cooked white rice, not "Jeera rice").
const ALIAS = {
  rice: 'white rice (cooked)', 'basmati rice': 'white rice (cooked)', 'white rice': 'white rice (cooked)', chawal: 'white rice (cooked)', 'brown rice': 'brown rice (cooked)',
  'toor dal': 'toor dal (cooked)', 'arhar dal': 'toor dal (cooked)', 'tur dal': 'toor dal (cooked)', 'moong dal': 'moong dal (cooked)', 'masoor dal': 'masoor dal (cooked)',
  'chana dal': 'chana dal (cooked)', 'urad dal': 'urad dal (cooked)',
  oil: 'cooking oil', 'cooking oil': 'cooking oil', 'sunflower oil': 'cooking oil', 'mustard oil': 'cooking oil', 'groundnut oil': 'cooking oil', 'coconut oil': 'cooking oil',
  ghee: 'ghee', sugar: 'sugar', milk: 'milk (full cream)', oats: 'oats (dry)',
};

// Raw cup / spoon weights in grams (typical for a standard 240 ml cup, level spoons). Approximate: densities differ by brand and grind.
const GRAMS = {
  cup: { rice: 190, 'brown rice': 190, 'toor dal': 200, 'moong dal': 200, 'masoor dal': 190, 'chana dal': 200, 'urad dal': 200, 'arhar dal': 200, 'tur dal': 200, oats: 90, sugar: 200, atta: 120, besan: 100, rava: 170, sooji: 170, poha: 100, milk: 245 },
  tbsp: { sugar: 13, rice: 12, 'toor dal': 13, 'moong dal': 13 },
};
// Typical volume of liquids (oil, ghee, milk, water) per spoon / cup, in ml.
const ML = { cup: 240, tbsp: 15, tsp: 5 };

// Cooked weight / raw weight, by catalogue food. `rawKcal` = kcal per 100 g of the RAW ingredient (typical IFCT / USDA staple value); when present the
// factor is worked out so the pot keeps the raw ingredient's calories: factor = rawKcal / cookedKcalPer100g, kept inside `range`.
const YIELD = [
  { match: /white rice \(cooked\)|^rice/, id: 'rice', typical: 2.8, range: [2.4, 3.2], rawKcal: 360 },
  { match: /brown rice \(cooked\)/, id: 'brown rice', typical: 3.0, range: [2.6, 3.4], rawKcal: 360 },
  { match: /(toor|moong|masoor|chana|urad) dal \(cooked\)/, id: 'dal', typical: 3.0, range: [2.5, 4.5], rawKcal: 340 },
];
const yieldFor = (foodName, cookedKcal100) => {
  const y = YIELD.find((x) => x.match.test(norm(foodName)));
  if (!y) return null;
  let factor = y.typical;
  if (y.rawKcal && cookedKcal100 > 0) factor = Math.min(y.range[1] + 1.5, Math.max(y.range[0], y.rawKcal / cookedKcal100));
  return { id: y.id, factor: Math.round(factor * 100) / 100, typical: y.typical, range: y.range };
};

function toGrams(unit, qty, key, food) {
  const own = String(food.servingUnit || 'g').toLowerCase();
  const liquid = own === 'ml';
  if (unit === 'g' || (!unit && own === 'g' && qty >= 20)) return { g: qty, how: 'weight' };
  if (unit === 'kg') return { g: qty * 1000, how: 'weight' };
  if (unit === 'ml') return { g: qty, how: 'weight' };
  if (unit === 'l') return { g: qty * 1000, how: 'weight' };
  const u = ['cup', 'tbsp', 'tsp'].includes(unit) ? unit : null;
  if (u) {
    if (liquid || /oil|ghee|milk/.test(key)) return { g: qty * ML[u], how: 'volume' };
    const w = GRAMS[u]?.[key];
    if (w) return { g: qty * w, how: 'table', approx: true };
    const own2 = (food.units || []).find((x) => norm(x.label) === u);
    if (own2) return { g: qty * Number(own2.quantity), how: 'food unit', approx: true };
    return null;
  }
  const own3 = (food.units || []).find((x) => norm(x.label) === norm(unit || ''));
  if (own3) return { g: qty * Number(own3.quantity), how: 'food unit' };
  return null;
}

/**
 * @param text   the pasted list (commas or new lines)
 * @param foods  [{ _id, name, servingSize, servingUnit, calories, units }]
 * @returns { items, unmatched, servings, oilTspPerServing }
 */
function parseIngredients(text, foods, { servings = 4 } = {}) {
  const parts = String(text || '').slice(0, 2000).split(/[\n;]|,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const byName = new Map(foods.map((f) => [norm(f.name), f]));
  const items = [], unmatched = [];
  for (const raw of parts) {
    const { qty, unit, query } = parseSegment(raw.replace(/\b(finely|roughly)?\s*(chopped|sliced|diced|grated|soaked|washed)\b/gi, ''));
    const q = norm(query).replace(/^of\s+/, '');
    const cookedAlready = /\b(cooked|boiled|steamed)\b/.test(q);
    const key = q.replace(/\b(raw|dry|dried|cooked|boiled|steamed|whole|split|washed)\b/g, '').replace(/\s+/g, ' ').trim();
    const aliased = ALIAS[key] && byName.get(ALIAS[key]);
    const hit = aliased ? { food: aliased, score: 1 } : bestFood(foods, query);
    const words = (n) => norm(n).split(' ').map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
    const covered = hit && (aliased || words(key).every((w) => words(hit.food.name).includes(w)));
    if (!hit || !covered) { unmatched.push(raw); continue; }
    const food = hit.food;
    const amount = qty ?? 1;
    const conv = toGrams(unit, amount, key, food);
    const warnings = [];
    let quantity = null, factor = null, rawG = null;
    if (conv) {
      rawG = Math.round(conv.g * 10) / 10;
      const y = !cookedAlready && /cooked|boiled/.test(norm(food.name)) ? yieldFor(food.name, (food.calories / (food.servingSize || 100)) * 100) : null;
      if (y) { factor = y.factor; quantity = Math.round(conv.g * y.factor); warnings.push(`Raw ${rawG} g becomes about ${quantity} g cooked (x${y.factor}, typical ${y.range[0]}–${y.range[1]}). Change it if yours came out wetter or drier.`); }
      else quantity = Math.round(conv.g * 10) / 10;
      if (conv.approx) warnings.push(`1 ${unit} of ${key} is taken as about ${Math.round(conv.g / amount)} g. Check against your own cup.`);
    } else {
      warnings.push(`Enter the weight of "${raw}": the app cannot guess how much a ${unit || 'piece'} of this weighs.`);
    }
    if (!aliased && words(food.name).length > words(key).length) warnings.push(`Matched to "${food.name}". Replace it if that is not what you meant.`);
    items.push({ raw, foodId: String(food._id), foodName: food.name, quantity, servingUnit: food.servingUnit || 'g', rawG, factor, cookedAlready, confidence: hit.score >= 0.9 ? 'high' : 'medium', warnings });
  }
  const oilTspPerServing = recipeOilTsp(items.map((i) => ({ foodName: i.foodName, quantity: i.quantity || 0, servingUnit: i.servingUnit })), servings);
  return { items, unmatched, servings, oilTspPerServing, needsInput: items.filter((i) => i.quantity === null).length };
}

module.exports = { parseIngredients, yieldFor, toGrams, ALIAS, GRAMS, YIELD };
