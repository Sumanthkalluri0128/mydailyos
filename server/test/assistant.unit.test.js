const test = require('node:test');
const assert = require('node:assert/strict');
const { answer, matchFeature } = require('../lib/assistant');
const { offToDraft, codeVariants } = require('../lib/openFoodFacts');

const snap = {
  name: 'Ravi', hour: 19, targets: { calories: 1800, protein: 110, waterMl: 2450, steps: 8000 },
  ranges: { protein: { min: 84, max: 140, goal: 110 }, carbs: { min: 158, max: 292 }, fat: { min: 40, max: 70 }, fiber: { goal: 25 } },
  limits: { sodiumMg: 2000, sugar: 45 }, today: { calories: 1250, protein: 62, carbohydrates: 150, fat: 40, fiber: 12, waterMl: 900, steps: 3500 },
  ideas: [{ name: 'Paneer bhurji', qty: '100 g', kcal: 230, protein: 14 }], streak: { current: 5, best: 9 },
  week: [{ date: 'a', calories: 1900, protein: 70, waterMl: 2000, steps: 5000 }, { date: 'b', calories: 1700, protein: 90, waterMl: 2200, steps: 7000 }],
};

test('assistant reads today\'s numbers', () => {
  assert.match(answer('how am i doing today', snap).text, /1250 of 1800/);
  assert.match(answer('how much protein do i need', snap).text, /48|22 g short/);
  assert.match(answer('what should i eat for dinner', snap).text, /Paneer bhurji/);
  assert.match(answer('water?', snap).text, /900 of 2450/);
});

test('assistant explains features and points to the right page', () => {
  const r = answer('how do I plan my week', snap);
  assert.equal(r.topic, 'feature:auto-plan'); assert.equal(r.actions[0].page, 'planner');
  assert.equal(answer('how do i scan a barcode', snap).topic, 'feature:barcode');
  assert.ok(matchFeature(' how do i add water '));
});

test('assistant never invents an overshoot, never crashes on empty data', () => {
  assert.match(answer('i ate too much', snap).text, /not over/i);
  const empty = answer('how am i doing', {});
  assert.ok(empty.text.length > 10); assert.ok(Array.isArray(empty.chips));
  assert.equal(answer('', {}).topic, 'help');
  assert.equal(answer('asdkjh qwe', snap).topic, 'unknown');
});

test('barcode drafts keep what exists and name what is missing', () => {
  const only = offToDraft('1', { product_name: 'Biscuit', serving_quantity: 30, nutriments: { proteins_serving: 2, carbohydrates_serving: 20, fat_serving: 5 } });
  assert.equal(only.protein, 2); assert.ok(only.estimated.includes('calories')); assert.ok(only.calories > 100);
  const bare = offToDraft('1', { nutriments: {} });
  assert.ok(bare.missing.includes('calories') && bare.missing.includes('name'));
  const none = offToDraft('1', { product_name: 'X', nutriments: { energy_100g: 1000 } });
  assert.equal(none.calories, 239);
  assert.ok(codeVariants('012345678905').includes('0012345678905'));
});
