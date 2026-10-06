// Turns free text ("2 roti, dal, 1 cup rice, 100g paneer") into loggable items by matching against the foods a person can see.
// Pure functions (no database) so they are easy to test; the route supplies the candidate foods.
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25 };
const UNIT_ALIASES = {
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  serving: 'serving', servings: 'serving', piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
  cup: 'cup', cups: 'cup', bowl: 'bowl', bowls: 'bowl', katori: 'katori', katoris: 'katori', plate: 'plate', plates: 'plate',
  slice: 'slice', slices: 'slice', tbsp: 'tbsp', tsp: 'tsp', glass: 'glass', glasses: 'glass', scoop: 'scoop', scoops: 'scoop',
};
const STOP = new Set(['of', 'the', 'with', 'some', 'my', 'had', 'ate', 'for', 'i']);

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f./\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const singular = (w) => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const tokens = (s) => norm(s).split(/[\s/()-]+/).filter(Boolean).map(singular).filter((w) => !STOP.has(w));

function parseNumber(tok) {
  if (tok == null) return null;
  if (WORDS[tok] !== undefined) return WORDS[tok];
  if (/^\d+\/\d+$/.test(tok)) { const [a, b] = tok.split('/').map(Number); return b ? a / b : null; }
  if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
  return null;
}

/** Split one segment into { qty, unit, query }. */
function parseSegment(segment) {
  let s = norm(segment);
  let qty = null, unit = null;
  s = s.replace(/\bx\s*(\d+(\.\d+)?)\b/, (_, n) => { qty = Number(n); return ' '; }); // "roti x2"
  const m = /^(\d+(?:\.\d+)?(?:\/\d+)?|[a-z]+)\s*(g|gm|gms|grams?|kg|ml|l|litres?|liters?)?\b\s*(.*)$/.exec(s);
  let rest = s;
  if (m && parseNumber(m[1]) !== null) {
    qty = qty ?? parseNumber(m[1]);
    rest = m[3];
    if (m[2]) unit = UNIT_ALIASES[m[2]];
  } else {
    // "100g paneer" with no space is handled above; "1.5 cups rice" falls through here
    const m2 = /^(\d+(?:\.\d+)?)(g|gm|kg|ml|l)\s+(.*)$/.exec(s);
    if (m2) { qty = Number(m2[1]); unit = UNIT_ALIASES[m2[2]]; rest = m2[3]; }
  }
  if (!unit) {
    const first = rest.split(' ')[0];
    if (qty !== null && UNIT_ALIASES[first]) { unit = UNIT_ALIASES[first]; rest = rest.slice(first.length).trim(); }
  }
  rest = rest.replace(/^of\s+/, '').trim();
  return { qty, unit, query: rest };
}

function scoreFood(food, qTokens) {
  const fTokens = tokens(`${food.name} ${food.brand || ''}`);
  if (!qTokens.length || !fTokens.length) return 0;
  const hit = qTokens.filter((t) => fTokens.includes(t) || fTokens.some((f) => f.startsWith(t) && t.length >= 3)).length;
  if (hit === 0) return 0;
  const coverage = hit / qTokens.length;               // how much of what was typed we found
  const precision = hit / fTokens.length;               // prefer the simpler food name ("Dal" over "Dal makhani with cream")
  const exact = norm(food.name) === qTokens.join(' ') ? 0.5 : 0;
  const mineBoost = food.isCustom || food.userId ? 0.05 : 0;
  return coverage * 0.7 + precision * 0.3 + exact + mineBoost;
}

function bestFood(foods, query) {
  const qTokens = tokens(query);
  let best = null;
  for (const f of foods) {
    const sc = scoreFood(f, qTokens);
    if (sc > 0 && (!best || sc > best.score)) best = { food: f, score: sc };
  }
  return best && best.score >= 0.5 ? best : null;
}

/** Quantity expressed in the food's own serving unit. */
function resolveQuantity(food, qty, unit, query) {
  const size = Number(food.servingSize) || 1;
  const own = String(food.servingUnit || 'g').toLowerCase();
  const count = qty ?? 1;
  const units = Array.isArray(food.units) ? food.units : [];
  const find = (label) => units.find((u) => singular(norm(u.label)) === singular(label));

  if (unit === 'g' && own === 'g') return count;
  if (unit === 'kg' && own === 'g') return count * 1000;
  if (unit === 'ml' && own === 'ml') return count;
  if (unit === 'l' && own === 'ml') return count * 1000;
  if (unit && !['g', 'kg', 'ml', 'l', 'serving', 'piece'].includes(unit)) {
    const u = find(unit);
    if (u) return count * Number(u.quantity);
  }
  // No usable unit: if the typed word is one of the food's household measures ("2 roti"), use it; otherwise count servings.
  for (const t of tokens(query)) {
    const u = find(t);
    if (u && qty !== null) return count * Number(u.quantity);
  }
  return count * size;
}

/**
 * @param text   what the person typed
 * @param foods  [{ _id, name, brand, servingSize, servingUnit, units:[{label,quantity}], ... }]
 * @returns { items:[{ raw, query, foodId, foodName, quantity, servingUnit, confidence }], unmatched:[string] }
 */
function parseMealText(text, foods) {
  const parts = String(text || '').slice(0, 600).split(/[,;\n]|\s+and\s+|\s*\+\s*|\s*&\s*/i).map((s) => s.trim()).filter(Boolean).slice(0, 25);
  const items = [], unmatched = [];
  for (const raw of parts) {
    const { qty, unit, query } = parseSegment(raw);
    const hit = query ? bestFood(foods, query) : null;
    if (!hit) { unmatched.push(raw); continue; }
    const quantity = Math.round(resolveQuantity(hit.food, qty, unit, query) * 100) / 100;
    items.push({
      raw, query, foodId: String(hit.food._id), foodName: hit.food.name, quantity, servingUnit: hit.food.servingUnit || 'g',
      confidence: hit.score >= 0.9 ? 'high' : 'medium',
    });
  }
  return { items, unmatched };
}

module.exports = { parseMealText, parseSegment, bestFood, resolveQuantity };
