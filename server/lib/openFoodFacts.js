// Barcode lookups against Open Food Facts (free, community database). Nutrition is converted to one serving.
const HttpError = require('./http').HttpError;

const CODE_RE = /^\d{6,14}$/;

/** Pure: turn an Open Food Facts product into a draft food (not saved). Returns null if it has no calorie data. */
function offToFood(code, product) {
  if (!product) return null;
  const n = product.nutriments || {};
  const per100 = (k) => Number(n[`${k}_100g`]);
  let kcal = per100('energy-kcal');
  if (!Number.isFinite(kcal)) {
    const kj = per100('energy');
    kcal = Number.isFinite(kj) ? kj / 4.184 : NaN;
  }
  if (!Number.isFinite(kcal)) return null;

  const isLiquid = /\b(ml|l|cl)\b/i.test(String(product.quantity || '')) || /\bml\b/i.test(String(product.serving_size || ''));
  const serving = Number(product.serving_quantity) > 0 ? Number(product.serving_quantity) : 100;
  const f = serving / 100;
  const r = (x, d = 1) => { const v = Number(x); return Number.isFinite(v) ? Math.round(v * f * 10 ** d) / 10 ** d : 0; };
  const sodiumG = Number.isFinite(per100('sodium')) ? per100('sodium') : (Number.isFinite(per100('salt')) ? per100('salt') / 2.5 : 0);

  return {
    name: String(product.product_name || 'Unnamed product').slice(0, 120),
    brand: String(product.brands || '').split(',')[0].trim().slice(0, 120),
    servingSize: serving,
    servingUnit: isLiquid ? 'ml' : 'g',
    calories: Math.round(kcal * f),
    protein: r(per100('proteins')),
    carbohydrates: r(per100('carbohydrates')),
    fat: r(per100('fat')),
    fiber: r(per100('fiber')),
    sugar: r(per100('sugars')),
    sodium: Math.round(sodiumG * 1000 * f),
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
