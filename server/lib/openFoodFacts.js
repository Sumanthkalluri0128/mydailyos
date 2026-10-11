// Barcode lookups against Open Food Facts (free, community database). Nutrition is converted to one serving.
const HttpError = require('./http').HttpError;

const CODE_RE = /^\d{6,14}$/;

/** Pure: turn an Open Food Facts product into a draft food (not saved). Returns null if it has no calorie data. */
function offToFood(code, product) {
  if (!product) return null;
  const n = product.nutriments || {};
  const per100 = (k) => Number(n[`${k}_100g`]);
  // Open Food Facts is community-edited, so some products carry values in the wrong unit or with impossible numbers.
  // Everything below is normalised to one serving and clamped to what is physically possible, so a bad entry can never
  // produce a food the server refuses to save.
  let kcal = per100('energy-kcal');
  if (!Number.isFinite(kcal) || kcal > 900) {            // pure fat is 900 kcal/100 g, so anything above is kJ typed as kcal
    const kj = per100('energy');
    kcal = Number.isFinite(kj) ? kj / 4.184 : (Number.isFinite(kcal) ? kcal / 4.184 : NaN);
  }
  if (!Number.isFinite(kcal) || kcal < 0) return null;
  kcal = Math.min(kcal, 900);

  const isLiquid = /\b(ml|l|cl)\b/i.test(String(product.quantity || '')) || /\bml\b/i.test(String(product.serving_size || ''));
  const sq = Number(product.serving_quantity);
  const serving = sq > 0 && sq <= 5000 ? sq : 100;
  const f = serving / 100;
  // grams per 100 g can never be negative or above 100
  const grams = (k) => { const v = per100(k); return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0; };
  const r = (g) => Math.round(g * f * 10) / 10;

  // Sodium is stored in GRAMS per 100 g (0.4 = 400 mg). Pure salt holds 39 g sodium per 100 g, so a bigger number means the
  // contributor typed milligrams. Salt (NaCl) is ~40 % sodium; use it when sodium is missing.
  let sodiumG = per100('sodium');
  if (!Number.isFinite(sodiumG)) sodiumG = Number.isFinite(per100('salt')) ? per100('salt') / 2.5 : 0;
  while (sodiumG > 40) sodiumG /= 1000;
  sodiumG = Math.min(40, Math.max(0, sodiumG));

  return {
    name: String(product.product_name || 'Unnamed product').slice(0, 120),
    brand: String(product.brands || '').split(',')[0].trim().slice(0, 120),
    servingSize: serving,
    servingUnit: isLiquid ? 'ml' : 'g',
    calories: Math.round(kcal * f),
    protein: r(grams('proteins')),
    carbohydrates: r(grams('carbohydrates')),
    fat: r(grams('fat')),
    fiber: r(grams('fiber')),
    sugar: r(grams('sugars')),
    sodium: Math.min(100000, Math.round(sodiumG * 1000 * f)),
    barcode: code,
  };
}

async function lookupBarcode(code) {
  if (!CODE_RE.test(String(code))) throw new HttpError(400, 'Barcode must be 6–14 digits');
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity,serving_size,serving_quantity,nutriments`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'FlexFit/1.0 (health tracker)' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new HttpError(502, 'Barcode service is unavailable right now');
    const data = await res.json();
    return data.status === 1 ? offToFood(code, data.product) : null;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'Could not reach the barcode service. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { offToFood, lookupBarcode, CODE_RE };
