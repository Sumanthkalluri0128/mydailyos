// Barcode lookups against Open Food Facts (free, community database). Nutrition is converted to one serving.
//
// Why some scans used to come back empty: community entries are often incomplete (no calories, only per-serving numbers,
// no product name) and the same product can be stored under a slightly different code (UPC-A vs EAN-13, leading zeros).
// Lookups now try the code variants on two servers (global + India), read per-serving numbers when per-100 g ones are
// missing, estimate calories from the macros when needed, and ALWAYS return what exists with a list of what is missing,
// so the app can show the details it has and ask only for the rest.
const HttpError = require('./http').HttpError;

const CODE_RE = /^\d{6,14}$/;
const HOSTS = ['https://world.openfoodfacts.org', 'https://in.openfoodfacts.org'];
const FIELDS = [
  'code', 'product_name', 'product_name_en', 'generic_name', 'generic_name_en', 'abbreviated_product_name', 'brands', 'quantity',
  'serving_size', 'serving_quantity', 'nutrition_data_per', 'nutriments',
].join(',');

const num = (x) => (x === '' || x === null || x === undefined ? NaN : Number(x));

/** Other ways the same product may be stored: UPC-A <-> EAN-13, GTIN-14, stripped or padded zeros. */
function codeVariants(code) {
  const c = String(code).trim();
  const out = new Set([c]);
  const stripped = c.replace(/^0+/, '');
  if (c.length === 12) out.add(`0${c}`);
  if (c.length === 13 && c.startsWith('0')) out.add(c.slice(1));
  if (c.length === 14) { out.add(c.slice(1)); if (c.startsWith('0')) out.add(c.slice(2)); }
  if (stripped.length >= 6 && stripped.length < 13) out.add(stripped.padStart(13, '0'));
  if (stripped.length >= 6 && stripped.length < 12) out.add(stripped.padStart(12, '0'));
  return [...out].filter((x) => CODE_RE.test(x)).slice(0, 4);
}

/**
 * Pure: turn an Open Food Facts product into a draft food (not saved).
 * Returns { ...food, missing: [], estimated: [] }. With { lenient: false } returns null when there is no calorie data.
 */
function offToDraft(code, product, { lenient = true } = {}) {
  if (!product) return null;
  const n = product.nutriments || {};
  const missing = [];
  const estimated = [];

  const sq = Number(product.serving_quantity);
  const servingKnown = sq > 0 && sq <= 5000;
  const isLiquid = /\b(ml|l|cl)\b/i.test(String(product.quantity || '')) || /\bml\b/i.test(String(product.serving_size || ''));
  const serving = servingKnown ? sq : 100;
  const f = serving / 100;

  // per 100 g value, falling back to the per-serving number (scaled up) and to the plain "value" field
  const per100 = (k) => {
    let v = num(n[`${k}_100g`]);
    if (Number.isFinite(v)) return v;
    v = num(n[`${k}_serving`]);
    if (Number.isFinite(v) && servingKnown) return (v / sq) * 100;
    if (product.nutrition_data_per === 'serving' && Number.isFinite(v) && !servingKnown) return v; // treat the serving as 100
    v = num(n[k]);
    return Number.isFinite(v) && (product.nutrition_data_per || '100g') === '100g' ? v : NaN;
  };

  const grams = (k) => { const v = per100(k); return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : NaN; };
  const protein100 = grams('proteins'), carbs100 = grams('carbohydrates'), fat100 = grams('fat');

  // Energy: kcal first; kJ typed as kcal (> 900) is converted; kJ field next; finally Atwater from the macros.
  let kcal = per100('energy-kcal');
  if (!Number.isFinite(kcal) || kcal > 900) {
    const kj = per100('energy');
    kcal = Number.isFinite(kj) ? kj / 4.184 : (Number.isFinite(kcal) ? kcal / 4.184 : NaN);
  }
  if ((!Number.isFinite(kcal) || kcal < 0) && [protein100, carbs100, fat100].some(Number.isFinite)) {
    kcal = (protein100 || 0) * 4 + (carbs100 || 0) * 4 + (fat100 || 0) * 9;
    estimated.push('calories');
  }
  if (!Number.isFinite(kcal) || kcal < 0) {
    if (!lenient) return null;
    kcal = 0; missing.push('calories');
  }
  kcal = Math.min(kcal, 900);

  const r = (g) => (Number.isFinite(g) ? Math.round(g * f * 10) / 10 : 0);
  const macro = (name, v) => { if (!Number.isFinite(v)) missing.push(name); return r(v); };

  // Sodium is stored in GRAMS per 100 g (0.4 = 400 mg). Pure salt holds 39 g sodium per 100 g, so a bigger number means the
  // contributor typed milligrams. Salt (NaCl) is ~40 % sodium; use it when sodium is missing. Sodium is optional, never "missing".
  let sodiumG = per100('sodium');
  if (!Number.isFinite(sodiumG)) { const salt = per100('salt'); sodiumG = Number.isFinite(salt) ? salt / 2.5 : 0; }
  while (sodiumG > 40) sodiumG /= 1000;
  sodiumG = Math.min(40, Math.max(0, sodiumG));

  const name = [product.product_name, product.product_name_en, product.generic_name, product.generic_name_en, product.abbreviated_product_name]
    .map((x) => String(x || '').trim()).find(Boolean);
  if (!name) missing.push('name');
  if (!servingKnown) estimated.push('servingSize');

  return {
    name: (name || 'Unnamed product').slice(0, 120),
    brand: String(product.brands || '').split(',')[0].trim().slice(0, 120),
    servingSize: serving,
    servingUnit: isLiquid ? 'ml' : 'g',
    calories: Math.round(kcal * f),
    protein: macro('protein', protein100),
    carbohydrates: macro('carbohydrates', carbs100),
    fat: macro('fat', fat100),
    fiber: r(grams('fiber')),
    sugar: r(grams('sugars')),
    sodium: Math.min(100000, Math.round(sodiumG * 1000 * f)),
    barcode: String(code),
    missing,
    estimated,
  };
}

/** Strict form kept for callers that only want complete products (null when there are no calories at all). */
function offToFood(code, product) {
  const d = offToDraft(code, product, { lenient: false });
  if (!d) return null;
  const { missing, estimated, ...food } = d; // eslint-disable-line no-unused-vars
  return food;
}

async function fetchOne(host, code, signal) {
  const url = `${host}/api/v2/product/${code}.json?fields=${FIELDS}`;
  const res = await fetch(url, { signal, headers: { 'User-Agent': 'FlexFit/1.1 (health tracker)' } });
  if (res.status === 404) return { product: null };
  if (!res.ok) throw new Error(`status ${res.status}`);
  const data = await res.json();
  return { product: data.status === 1 && data.product ? data.product : null };
}

/** How much usable data a product has (used to prefer the better of two records for the same barcode). */
function richness(p) {
  const n = p?.nutriments || {};
  return ['energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'energy-kcal_serving', 'proteins_serving']
    .filter((k) => Number.isFinite(num(n[k]))).length + (p?.product_name ? 2 : 0);
}

/**
 * Looks the code up (and its variants) on every server and keeps the best record.
 * Returns null only when no server knows the product; throws only when nothing could be reached at all.
 */
async function lookupBarcode(code) {
  if (!CODE_RE.test(String(code))) throw new HttpError(400, 'Barcode must be 6–14 digits');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  let best = null, reached = 0;
  try {
    const jobs = [];
    for (const c of codeVariants(code)) for (const h of HOSTS) jobs.push(fetchOne(h, c, ctl.signal).then((x) => { reached += 1; return x; }).catch(() => null));
    for (const r of await Promise.all(jobs)) {
      if (r?.product && (!best || richness(r.product) > richness(best))) best = r.product;
    }
  } finally {
    clearTimeout(timer);
  }
  if (!best) {
    if (!reached) throw new HttpError(502, 'Could not reach the barcode service. Check your connection and try again.');
    return null;
  }
  return offToDraft(code, best);
}

module.exports = { offToFood, offToDraft, lookupBarcode, codeVariants, CODE_RE };
