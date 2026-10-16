const test = require('node:test');
const assert = require('node:assert/strict');
const { searchFoods, editDistance, stem } = require('../lib/foodSearch');

const F = (name, extra = {}) => ({ _id: name, name, ...extra });
const foods = [
  F('Masala Dosa'), F('Plain Dosa'), F('Idli (2 pcs)'), F('Chicken Biryani'), F('Paneer Butter Masala'), F('Boiled Egg'),
  F('Egg Curry'), F('Steamed Rice'), F('Dal Tadka'), F('Curd Rice'), F('Chicken Curry'), F('Banana'), F('Roti / Chapati'),
];
const names = (q, o) => searchFoods(foods, q, o).map((f) => f.name);

test('word order does not matter', () => {
  assert.equal(names('dosa masala')[0], 'Masala Dosa');
  assert.equal(names('biryani chicken')[0], 'Chicken Biryani');
  assert.equal(names('masala paneer')[0], 'Paneer Butter Masala');
});
test('partial words match as you type', () => {
  assert.equal(names('chick')[0].startsWith('Chicken'), true);
  assert.ok(names('bir ch').includes('Chicken Biryani'));
  assert.equal(names('b')[0] !== undefined, true);
});
test('plurals, typos and abbreviations still find the food', () => {
  assert.ok(names('eggs').includes('Boiled Egg'));
  assert.equal(names('idlis')[0], 'Idli (2 pcs)');
  assert.equal(names('chiken')[0].startsWith('Chicken'), true);
  assert.equal(names('biriyani')[0], 'Chicken Biryani');
  assert.equal(names('panner')[0], 'Paneer Butter Masala');
  assert.equal(names('chkn')[0].startsWith('Chicken'), true);
});
test('regional words and compact typing work', () => {
  assert.ok(names('perugu annam').includes('Curd Rice'));
  assert.equal(names('masaladosa')[0], 'Masala Dosa');
});
test('foods with every word outrank partial matches; partial ones still appear', () => {
  const r = names('chicken rice');
  assert.ok(r.indexOf('Curd Rice') > -1 && r.indexOf('Chicken Curry') > -1);
  const strict = names('egg curry', { partial: false });
  assert.deepEqual(strict, ['Egg Curry']);
});
test('empty or nonsense queries return nothing', () => {
  assert.deepEqual(names(''), []);
  assert.deepEqual(names('   '), []);
  assert.deepEqual(names('zzqxv'), []);
});
test('helpers', () => {
  assert.equal(editDistance('paneer', 'panner', 2), 1);
  assert.equal(editDistance('abc', 'xyz', 1), 2);
  assert.equal(stem('berries'), 'berry');
  assert.equal(stem('eggs'), 'egg');
});
