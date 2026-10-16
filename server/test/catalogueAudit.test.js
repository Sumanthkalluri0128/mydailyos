// Keeps the built-in food data honest: calories must agree with the macros (4/4/9 kcal per g), numbers must be sane,
// names unique, and every household unit must be usable. Fails loudly if someone adds a bad row.
const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOGUE } = require('../lib/foodCatalogue');

test('every catalogue food: calories agree with macros within 15% (or 25 kcal)', () => {
  const bad = CATALOGUE.filter((f) => { const est = 4 * (f.protein || 0) + 4 * (f.carbohydrates || 0) + 9 * (f.fat || 0); return f.calories > 20 && Math.abs(est - f.calories) / f.calories > 0.15 && Math.abs(est - f.calories) > 25; });
  assert.deepEqual(bad.map((f) => f.name), []);
});
test('numbers are finite, non-negative and plausible per serving', () => {
  for (const f of CATALOGUE) {
    for (const k of ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar']) assert.ok(Number.isFinite(f[k] || 0) && (f[k] || 0) >= 0, `${f.name}.${k}`);
    assert.ok(f.servingSize > 0, `${f.name} servingSize`);
    assert.ok((f.fiber || 0) <= (f.carbohydrates || 0) + 0.5, `${f.name}: fibre exceeds carbs`);
    assert.ok((f.sugar || 0) <= (f.carbohydrates || 0) + 0.5, `${f.name}: sugar exceeds carbs`);
    assert.ok(f.calories <= 1500, `${f.name}: ${f.calories} kcal per serving looks wrong`);
    for (const u of f.units || []) assert.ok(u.label && u.quantity > 0, `${f.name} unit ${u.label}`);
  }
});
test('food names are unique (case-insensitive)', () => {
  const seen = new Map();
  for (const f of CATALOGUE) { const k = f.name.toLowerCase().trim(); assert.ok(!seen.has(k), `duplicate: ${f.name}`); seen.set(k, 1); }
});
