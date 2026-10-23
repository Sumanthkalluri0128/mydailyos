const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const M = require('../lib/micro');
const F = require('./fixtures/micro.json');
const { toneCheck } = require('../lib/safety');
const IM = require('../scripts/importMicros');
const { offToDraft } = require('../lib/openFoodFacts');

const none = new Map();
const item = (food, servings = 1) => ({ servings, calories: food.calories * servings, micros: M.microsOf(food, none).values });

test('RDA lookup: adult male / female, women over 50, and the out-of-scope cases', () => {
  const m = M.rdaFor({ age: 26, sex: 'male' }), f = M.rdaFor({ age: 26, sex: 'female' }), f55 = M.rdaFor({ age: 55, sex: 'female' });
  assert.equal(m.ranges.iron.min, 19); assert.equal(f.ranges.iron.min, 29); assert.equal(f55.ranges.iron.min, 19);
  assert.equal(m.ranges.calcium.min, 1000); assert.equal(f.ranges.zinc.min, 13.2);
  assert.equal(Object.keys(m.ranges).length, 10);
  assert.equal(M.rdaFor({ age: 16, sex: 'male' }).ok, false); assert.match(M.rdaFor({ age: 16, sex: 'male' }).note, /dietitian/);
  assert.equal(M.rdaFor({ age: 30 }).ok, false); assert.equal(M.rdaFor({}).ok, false);
  assert.match(m.note, /Pregnancy/);
});

test('day totals: sums per serving, coverage is by calories, unknown stays unknown', () => {
  const d = M.dayMicro([item(F.dal, 2), item(F.rajma, 1)]);
  assert.equal(d.nutrients.iron.total, 10.5); assert.equal(d.nutrients.iron.enough, true);
  assert.equal(d.nutrients.folate.total, 330);
  assert.equal(d.nutrients.calcium.total, 80); assert.equal(d.nutrients.calcium.coverage, 0.6);
  const thin = M.dayMicro([item(F.dal, 1), item(F.rajma, 2)]);
  assert.ok(thin.nutrients.calcium.coverage < 0.6); assert.equal(thin.nutrients.calcium.enough, false, 'rajma has no calcium: too little data');
  assert.equal(d.nutrients.zinc.enough, false);
  const mostlyUnknown = M.dayMicro([item(F.ricePlain, 3), item(F.dal, 1)]);
  assert.equal(mostlyUnknown.nutrients.iron.enough, false);
  assert.equal(M.dayMicro([]).nutrients.iron.enough, false);
});

test('card: arrows, "not enough data" instead of zeros, mood', () => {
  const rda = M.rdaFor({ age: 26, sex: 'male' });
  const card = M.microCard(M.dayMicro([item(F.dal, 2), item(F.rajma, 1)]), rda);
  const iron = card.rows.find((r) => r.id === 'iron'), zinc = card.rows.find((r) => r.id === 'zinc');
  assert.equal(iron.status, 'low'); assert.equal(iron.arrow, '↓'); assert.equal(iron.pct, 55);
  assert.equal(zinc.status, 'nodata'); assert.equal(zinc.value, undefined, 'never shows a misleading 0');
  const empty = M.microCard(M.dayMicro([item(F.ricePlain, 2)]), rda);
  assert.equal(empty.knownCount, 0); assert.equal(empty.mood, 'nodata'); assert.match(empty.emptyNote, /no vitamin/);
  assert.equal(M.microCard(M.dayMicro([]), M.rdaFor({ age: 15, sex: 'male' })).ok, false);
});
test('status: magnesium is never flagged high from food, others use the upper limit', () => {
  assert.equal(M.statusFor('magnesium', 900, { min: 440, max: 350 }), 'ok');
  assert.equal(M.statusFor('iron', 50, { min: 19, max: 45 }), 'high');
  assert.equal(M.statusFor('potassium', 9000, { min: 3510, max: null }), 'ok');
  assert.equal(M.statusFor('iron', 10, { min: 19, max: 45 }), 'low');
});

test('weekly insight: low for 3 weeks in a row, needs enough data, breaks when a week is fine', () => {
  const rda = M.rdaFor({ age: 26, sex: 'female' });
  const wk = (iron, enough = true) => ({ iron: { avg: iron, enough }, calcium: { avg: 1200, enough: true } });
  const s = M.lowStreaks([wk(25), wk(8), wk(9), wk(7)], rda);
  assert.equal(s.length, 1); assert.equal(s[0].weeks, 3); assert.match(s[0].line, /Low on iron 3 weeks in a row/);
  assert.equal(M.lowStreaks([wk(8), wk(9), wk(30), wk(8)], rda).length, 0, 'recovered, then one low week');
  assert.equal(M.lowStreaks([wk(8), wk(9, false), wk(8)], rda).length, 0, 'a week without data breaks the run');
  assert.deepEqual(M.lowStreaks([wk(8), wk(8)], { ok: false }), []);
  const avg = M.weekAverage([M.dayMicro([item(F.dal, 2)]), M.dayMicro([item(F.dal, 1)])]);
  assert.equal(avg.iron.enough, false, 'only 2 days with data: not enough for a weekly average');
});

test('food suggestions: the person\'s own foods first, ranked by amount per 100 kcal; hints only when there is no data', () => {
  const foods = [{ name: 'Dal fixture', calories: 150, micros: { iron: 3 }, mine: true }, { name: 'Rajma fixture', calories: 200, micros: { iron: 4.5 }, mine: true }, { name: 'Catalogue spinach', calories: 20, micros: { iron: 2.8 }, mine: false }];
  const r = M.sourcesFor('iron', foods);
  assert.ok(r.foods.slice(0, 2).every((x) => x.mine)); assert.equal(r.fromData, true);
  const none2 = M.sourcesFor('zinc', foods);
  assert.equal(none2.fromData, false); assert.match(none2.hint, /Often found in/);
});

test('confidence labels', () => {
  assert.equal(M.confidenceOf(F.mine, none).id, 'added');
  assert.equal(M.confidenceOf(F.dal, none).id, 'typical');
  const ov = new Map([['dalfixture', { iron: 3, source: 'IFCT 2017 T12 A015' }]]);
  assert.equal(M.confidenceOf(F.dal, ov).id, 'verified');
  assert.equal(M.confidenceOf(F.dal, new Map([['dalfixture', { iron: 3, source: 'someone said so' }]])).id, 'typical');
});

test('audit: negatives, implausible values and missing sources are reported', () => {
  const bad = [{ name: 'A', userId: null, iron: -1 }, { name: 'B', userId: null, iron: 500 }, { name: 'C', userId: null, calcium: 50 }, { name: 'D', userId: 'u', calcium: 50 }, { name: 'E', userId: null }];
  const types = M.auditMicros(bad, new Map([['c', { calcium: 50 }]])).map((i) => `${i.name}:${i.type}`);
  assert.ok(types.includes('A:micro_negative')); assert.ok(types.includes('B:micro_implausible')); assert.ok(types.includes('C:micro_no_source'));
  assert.ok(!types.some((t) => t.startsWith('D:')) && !types.some((t) => t.startsWith('E:')));
});

test('sodium: catalogue foods take the reviewed value only when they have none', () => {
  const ov = new Map([['rotichapati', { sodium: 120 }]]);
  assert.equal(M.sodiumFor({ name: 'Roti / Chapati', userId: null, sodium: 0 }, ov), 120);
  assert.equal(M.sodiumFor({ name: 'Roti / Chapati', userId: null, sodium: 300 }, ov), 300);
  assert.equal(M.sodiumFor({ name: 'Roti / Chapati', userId: 'u', sodium: 0 }, ov), 0);
});

test('importer: rows need a source and valid numbers; unknown foods are rejected; nothing is invented', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mic-')), 'm.csv');
  fs.writeFileSync(f, 'name,serving,iron,calcium,source\n"Roti / Chapati",40 g,1.2,,IFCT 2017 T12 A001\n"Roti / Chapati",40 g,,,\nNot a food,1 g,2,,IFCT\nPhulka (no oil),30 g,0.9,,\nPhulka (no oil),30 g,abc,,x\n');
  const db = { foods: {} };
  const r = IM.importCsv(f, db);
  assert.equal(r.accepted, 1); assert.equal(db.foods['Roti / Chapati'].iron, 1.2); assert.equal(db.foods['Roti / Chapati'].calcium, undefined);
  assert.equal(r.rejected.length, 3); assert.ok(r.rejected.some((m) => /no source/.test(m)) && r.rejected.some((m) => /not in the catalogue/.test(m)));
  assert.deepEqual(IM.check(db), []);
  assert.equal(IM.check({ foods: { X: { iron: 1 } } }).some((i) => i.type === 'micro_no_source'), true);
  assert.deepEqual(IM.parseCsv('a,"b,c"\n1,2\n'), [['a', 'b,c'], ['1', '2']]);
});

test('Open Food Facts: micronutrients are read per serving, absent stays absent, source is named', () => {
  const d = offToDraft('1', { product_name: 'X', serving_quantity: 50, nutriments: { 'energy-kcal_100g': 300, proteins_100g: 10, carbohydrates_100g: 40, fat_100g: 5, iron_100g: 0.004, 'vitamin-b12_100g': 0.0000024, 'vitamin-c_100g': 0.02 } });
  assert.equal(d.iron, 2); assert.equal(d.vitaminB12, 1.2); assert.equal(d.vitaminC, 10); assert.equal(d.zinc, undefined); assert.equal(d.dataSource, 'Open Food Facts');
  assert.equal(offToDraft('2', { product_name: 'Y', nutriments: { 'energy-kcal_100g': 100 } }).dataSource, undefined);
});

test('wording is positive', () => {
  const rda = M.rdaFor({ age: 26, sex: 'male' });
  const card = M.microCard(M.dayMicro([item(F.dal, 1)]), rda);
  for (const s of [card.note, card.emptyNote, ...M.lowStreaks([{ iron: { avg: 1, enough: true } }, { iron: { avg: 1, enough: true } }], rda).map((x) => x.line), M.sourcesFor('zinc', []).hint]) assert.equal(toneCheck(s || '').ok, true, s);
});
