const test = require('node:test');
const assert = require('node:assert/strict');
const { swapFor } = require('../lib/swaps');
const { adaptiveMaintenance } = require('../lib/adaptiveTdee');
const { buildCoach } = require('../lib/weeklyCoach');

const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 10) - (n - 1 - i) * 86400000).toISOString().slice(0, 10), ...f(i) }));

test('swaps suggest a lighter option only for foods that have one', () => {
  assert.ok(swapFor('Butter chicken (restaurant, 1 bowl)'));
  assert.equal(swapFor('Boiled egg'), null);
});

test('adaptive maintenance: eating 1700 while losing 0.2 kg/week means burning more than 1700', () => {
  const days = mk(35, (i) => ({ calories: 1700, weightKg: i % 2 ? 80 - i * 0.03 : null }));
  const m = adaptiveMaintenance(days, 2400);
  assert.ok(m.estimate > 1700 && m.estimate < 2200);
  assert.equal(m.confidence, 'high');
  assert.equal(adaptiveMaintenance(mk(10, () => ({ calories: 1700, weightKg: 80 })), 2400), null, 'too little data -> no estimate');
});

test('weekly budget counts unlogged days as on budget, never as spare calories', () => {
  const days = mk(35, (i) => ({ calories: i % 2 ? 0 : 1000, weightKg: null, protein: 0, waterMl: 0, exerciseMinutes: 0 }));
  const out = buildCoach({ days, targets: { calories: 1600 }, today: '2026-10-10' });
  assert.equal(out.weekBudget.budget, 11200);
  assert.ok(out.weekBudget.usedBeforeToday >= 1000 * 2 + 1600 * 2, 'unlogged days count at the target');
});

test('Indian-language food words map to the English words the catalogue uses', () => {
  const { expandWord, englishify } = require('../lib/foodAliases');
  assert.ok(expandWord('annam').includes('rice'));
  assert.ok(expandWord('perugu').includes('curd'));
  assert.equal(englishify('2 roti, perugu, annam'), '2 roti, curd, rice');
  assert.deepEqual(expandWord('paneer'), ['paneer']);
});

test('barcode import: sodium in the wrong unit or impossible values never produce an unsaveable food', () => {
  const { offToFood } = require('../lib/openFoodFacts');
  const mk = (n, extra = {}) => ({ product_name: 'X', serving_quantity: 30, nutriments: { 'energy-kcal_100g': 400, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 10, ...n }, ...extra });
  assert.equal(offToFood('1', mk({ sodium_100g: 0.4 })).sodium, 120);
  assert.equal(offToFood('1', mk({ sodium_100g: 400 })).sodium, 120, 'typed in mg');
  assert.equal(offToFood('1', mk({ sodium_100g: 400000 })).sodium, 120);
  assert.equal(offToFood('1', mk({ sodium_100g: -1 })).sodium, 0);
  assert.equal(offToFood('1', mk({ salt_100g: 1 })).sodium, 120, 'salt / 2.5');
  assert.ok(offToFood('1', mk({ 'energy-kcal_100g': 1700, energy_100g: 1700 })).calories < 200, 'kJ typed as kcal');
  assert.ok(offToFood('1', mk({ sodium_100g: 5000 }, { serving_quantity: 1000 })).sodium <= 100000);
});

test('macro ranges: the goal always sits inside the healthy minimum-maximum', () => {
  const { macroRanges, rangeStatus } = require('../lib/energy');
  for (const [kcal, kg, dir] of [[1480, 79.3, 'lose'], [1200, 50, 'maintain'], [3000, 90, 'gain'], [1800, 120, 'lose']]) {
    const r = macroRanges(kcal, kg, dir);
    for (const k of Object.keys(r)) assert.ok(r[k].goal >= r[k].min && r[k].goal <= r[k].max, `${k} goal outside range for ${kcal}/${kg}/${dir}`);
    assert.ok(r.protein.max <= Math.round((kcal * 0.35) / 4), 'protein never above 35% of calories');
  }
  const r = macroRanges(1480, 79.3, 'lose');
  assert.equal(rangeStatus(60, r.protein), 'low');
  assert.equal(rangeStatus(110, r.protein), 'ok');
  assert.equal(rangeStatus(200, r.protein), 'high');
});
