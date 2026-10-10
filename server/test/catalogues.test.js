const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOGUE, seedFoods } = require('../lib/foodCatalogue');
const { ACTIVITIES, seedActivities } = require('../lib/activityCatalogue');

const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '');

test('food catalogue: large Indian catalogue, unique names, sane values', () => {
  assert.ok(CATALOGUE.length >= 450, `only ${CATALOGUE.length} foods`);
  const names = CATALOGUE.map((f) => norm(f.name));
  assert.equal(new Set(names).size, names.length, 'duplicate food names');
  for (const f of CATALOGUE) {
    assert.ok(f.servingSize > 0 && f.calories >= 0 && f.protein >= 0 && f.carbohydrates >= 0 && f.fat >= 0, f.name);
    assert.ok(f.units.every((u) => u.label && u.quantity > 0), `${f.name}: bad household unit`);
    const fromMacros = 4 * f.protein + 4 * f.carbohydrates + 9 * f.fat;
    if (f.calories > 40) assert.ok(Math.abs(fromMacros - f.calories) / f.calories <= 0.25, `${f.name}: ${f.calories} kcal vs ${Math.round(fromMacros)} from macros`);
  }
});

test('food catalogue: covers the main Indian categories people search for', () => {
  const has = (s) => CATALOGUE.some((f) => norm(f.name).includes(norm(s)));
  for (const s of ['masala dosa', 'idli', 'biryani', 'paneer butter masala', 'chole bhature', 'pav bhaji', 'pani puri', 'gulab jamun', 'rasmalai', 'masala chai', 'mango lassi', 'sambar', 'rajma', 'thepla', 'kaju katli', 'haleem', 'ragi mudde', 'bisi bele bath', 'momos', 'chikoo'])
    assert.ok(has(s), `missing: ${s}`);
});

test('exercise catalogue: Cult.fit formats present with plausible METs and unique names', () => {
  const names = ACTIVITIES.map((a) => a.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  const cult = ACTIVITIES.filter((a) => a.category === 'Cult.fit');
  assert.ok(cult.length >= 30);
  for (const s of ['HRX Workout', 'Adidas Strength+', 'Boxing', 'Dance Fitness', 'Yoga', 'Burn', 'Bootcamp', 'HIIT', 'Pilates', 'Run', 'Zumba', 'Kettlebell'])
    assert.ok(cult.some((a) => a.name.includes(s)), `missing Cult format: ${s}`);
  for (const a of ACTIVITIES) assert.ok(a.met >= 1 && a.met <= 12, `${a.name} MET ${a.met}`);
  // relative intensity ordering matches how Cult describes them (yoga < HRX < boxing/HIIT)
  const met = (n) => ACTIVITIES.find((a) => a.name.includes(n)).met;
  assert.ok(met('Yoga (Hatha)') < met('HRX Workout') && met('HRX Workout') < met('Boxing') && met('Boxing') <= met('HIIT'));
});

test('seeding only inserts missing items and never overwrites or deletes', async () => {
  const ops = [];
  const model = { updateOne: async (filter, update, opts) => { ops.push({ filter, update, opts }); return { upsertedCount: 1 }; }, bulkWrite: async (list) => { for (const { updateOne: u } of list) ops.push({ filter: u.filter, update: u.update, opts: { upsert: u.upsert } }); return { upsertedCount: list.length }; }, deleteMany: async () => { throw new Error('must never delete'); } };
  const f = await seedFoods(model);
  const a = await seedActivities(model);
  assert.equal(f.total, CATALOGUE.length);
  assert.equal(a.total, ACTIVITIES.length);
  for (const o of ops) {
    assert.ok(o.opts.upsert === true);
    assert.deepEqual(Object.keys(o.update), ['$setOnInsert'], 'only $setOnInsert — existing documents are never modified');
  }
});
