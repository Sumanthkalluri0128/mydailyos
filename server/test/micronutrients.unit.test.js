const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./fixtures/micronutrients-fixtures.json');
const { rdaFor, KEYS } = require('../lib/rda');
const m = require('../lib/micronutrients');
const { confidenceOf } = require('../lib/confidence');
const { parseMicros } = require('../lib/microParse');
const { offToDraft, offMicroValue } = require('../lib/openFoodFacts');
const { buildUpdates, parseCsv } = require('../lib/microImport');
const { isAdmin, adminEmails } = require('../lib/admin');
const { audit } = require('../scripts/auditFoods');

const log = (food, servings, kcal, id) => ({ foodId: id || food.name, servings, nutritionTotal: { calories: kcal } });
const foodsOf = () => new Map(Object.values(fx.foods).map((f) => [f.name, f]));

test('RDA: adult values per sex, iron drops for women from 50', () => {
  for (const [who, exp] of Object.entries(fx.rdaExpected)) {
    const r = rdaFor(fx.profiles[who]);
    assert.ok(r.ok);
    for (const [k, v] of Object.entries(exp)) assert.equal(r.targets.find((t) => t.key === k).rda, v, `${who} ${k}`);
  }
  assert.equal(rdaFor({ age: 55, sex: 'female' }).targets.find((t) => t.key === 'iron').rda, 19);
  const iron = rdaFor(fx.profiles.woman30).targets.find((t) => t.key === 'iron');
  assert.equal(iron.min, 23.2); // 80 % of 29
  assert.equal(rdaFor(fx.profiles.woman30).targets.length, KEYS.length);
});

test('RDA: under-18, missing age and missing sex are out of scope with a reason', () => {
  assert.deepEqual(rdaFor(fx.profiles.teen), { ok: false, reason: 'under18' });
  assert.deepEqual(rdaFor({ sex: 'male' }), { ok: false, reason: 'age' });
  assert.deepEqual(rdaFor(fx.profiles.noSex), { ok: false, reason: 'sex' });
});

test('daily card: foods without values never count as zero -> "unknown", not "low"', () => {
  const logs = [log(fx.foods.rice, 2, 400)]; // rice carries no micronutrient data at all
  const card = m.dailyCard({ logs, foodsById: foodsOf(), profile: fx.profiles.woman30 });
  assert.equal(card.enoughData, false);
  assert.ok(card.nutrients.every((n) => n.status === 'unknown' && n.value === null && n.percentOfRda === null));
});

test('daily card: judged only when foods with data cover >= 60 % of calories', () => {
  const foods = foodsOf();
  // 300 kcal rajma (has iron) + 400 kcal rice (no data): 43 % coverage -> unknown
  let card = m.dailyCard({ logs: [log(fx.foods.rajma, 1, 300), log(fx.foods.rice, 2, 400)], foodsById: foods, profile: fx.profiles.woman30 });
  assert.equal(card.nutrients.find((n) => n.key === 'iron').status, 'unknown');
  // 300 kcal rajma + 100 kcal rice: 75 % coverage -> judged, 2.4 mg of 29 is low
  card = m.dailyCard({ logs: [log(fx.foods.rajma, 1, 300), log(fx.foods.rice, 1, 100)], foodsById: foods, profile: fx.profiles.woman30 });
  const iron = card.nutrients.find((n) => n.key === 'iron');
  assert.equal(iron.status, 'low');
  assert.equal(iron.value, 2.4);
  assert.equal(iron.percentOfRda, 8);
  assert.equal(card.enoughData, true);
});

test('daily card: in range and high (ceiling) statuses; servings scale the totals', () => {
  const foods = new Map([['big', { name: 'big', iron: 20, calcium: 1400 }]]);
  const ok = m.dailyCard({ logs: [{ foodId: 'big', servings: 1.5, nutritionTotal: { calories: 500 } }], foodsById: foods, profile: fx.profiles.man40 });
  assert.equal(ok.nutrients.find((n) => n.key === 'iron').value, 30);
  assert.equal(ok.nutrients.find((n) => n.key === 'iron').status, 'ok'); // man min 15.2, max 45
  const high = m.dailyCard({ logs: [{ foodId: 'big', servings: 3, nutritionTotal: { calories: 500 } }], foodsById: foods, profile: fx.profiles.man40 });
  assert.equal(high.nutrients.find((n) => n.key === 'iron').status, 'high'); // 60 > 45
  assert.equal(high.nutrients.find((n) => n.key === 'calcium').status, 'high'); // 4200 > 2500
});

test('daily card: nothing logged, or profile out of scope', () => {
  assert.equal(m.dailyCard({ logs: [], foodsById: new Map(), profile: fx.profiles.woman30 }).loggedAnything, false);
  assert.deepEqual(m.dailyCard({ logs: [], foodsById: new Map(), profile: fx.profiles.teen }), { available: false, reason: 'under18' });
});

test('mood: victory when most judged nutrients are in range, unknown when too few are judged', () => {
  assert.equal(m.moodFor({ ok: 8, low: 2, high: 0, unknown: 0 }), 'victory');
  assert.equal(m.moodFor({ ok: 5, low: 5, high: 0, unknown: 0 }), 'power');
  assert.equal(m.moodFor({ ok: 1, low: 8, high: 0, unknown: 1 }), 'support');
  assert.equal(m.moodFor({ ok: 1, low: 1, high: 0, unknown: 8 }), 'unknown');
});

const week = (iron, extra = {}) => ({ loggedDays: 6, averages: { iron, calcium: 900, ...extra }, coverage: { iron: 0.9, calcium: 0.9 } });
test('low-streak insight: needs 3 weeks in a row, enough logged days and enough coverage', () => {
  const p = fx.profiles.woman30; // iron min 23.2
  assert.deepEqual(m.lowStreaks([week(10), week(12), week(14)], p).map((x) => x.key), ['iron']);
  assert.equal(m.lowStreaks([week(10), week(30), week(14)], p).length, 0); // one good week breaks it
  assert.equal(m.lowStreaks([week(12), week(14)], p).length, 0); // only 2 weeks
  assert.equal(m.lowStreaks([week(10), { ...week(12), loggedDays: 3 }, week(14)], p).length, 0); // too few logged days
  assert.equal(m.lowStreaks([week(10), { ...week(12), coverage: { iron: 0.3 } }, week(14)], p).length, 0); // too little data
  assert.equal(m.lowStreaks([week(10), week(12), week(14)], fx.profiles.teen).length, 0);
  const calcium = m.lowStreaks([week(30), week(30), week(30)], p); // calcium 900 >= 800 min
  assert.equal(calcium.length, 0);
});

test('weekRow averages only logged days and weights coverage by calories', () => {
  const days = [m.dayTotals([log(fx.foods.rajma, 1, 300)], foodsOf()), m.dayTotals([], foodsOf()), m.dayTotals([log(fx.foods.rajma, 2, 600)], foodsOf())];
  const w = m.weekRow(days);
  assert.equal(w.loggedDays, 2);
  assert.equal(w.averages.iron, 3.6); // (2.4 + 4.8) / 2
  assert.equal(w.coverage.iron, 1);
});

test('suggestions: own foods first, only foods that carry a value, highest first, no duplicates', () => {
  const own = [fx.foods.rajma, fx.foods.rice, fx.foods.spinach];
  const catalogue = [{ name: 'Ragi roti', iron: 3.9 }, { name: 'rajma masala', iron: 9 }, { name: 'Hidden', iron: 50, hidden: true }, { name: 'Zero', iron: 0 }];
  const s = m.suggestFoodsFor('iron', { ownFoods: own, catalogue, limit: 4 });
  assert.deepEqual(s.map((x) => x.name), ['Palak sabzi', 'Rajma masala', 'Ragi roti']);
  assert.deepEqual(s.map((x) => x.source), ['yours', 'yours', 'catalogue']);
  assert.deepEqual(m.suggestFoodsFor('zinc', { ownFoods: own, catalogue }), []);
});

test('confidence badge: your own food, verified with a source, otherwise typical', () => {
  assert.equal(confidenceOf({ userId: 'u1' }), 'user');
  assert.equal(confidenceOf({ userId: null, verified: true, dataSource: 'IFCT 2017' }), 'verified');
  assert.equal(confidenceOf({ userId: null, verified: true, dataSource: '' }), 'typical');
  assert.equal(confidenceOf({ userId: null }), 'typical');
});

test('parseMicros: absent stays absent, blank is unknown, zero is a real zero, bad values are rejected', () => {
  assert.deepEqual(parseMicros({ name: 'x' }), {});
  assert.deepEqual(parseMicros({ iron: '', calcium: null, zinc: 0, folate: '1,200.5' }), { iron: null, calcium: null, zinc: 0, folate: 1200.5 });
  assert.throws(() => parseMicros({ iron: -1 }), /iron/);
  assert.throws(() => parseMicros({ vitaminC: 'abc' }), /vitaminC/);
  assert.throws(() => parseMicros({ calcium: 999999 }), /calcium/);
});

test('Open Food Facts: micronutrients converted from g per 100 g to mg / µg per serving; missing stays unknown', () => {
  const draft = offToDraft('8901234567890', {
    product_name: 'Test cereal', serving_quantity: 50,
    nutriments: { 'energy-kcal_100g': 380, proteins_100g: 8, carbohydrates_100g: 78, fat_100g: 3, iron_100g: 0.012, calcium_100g: 0.4, 'vitamin-d_100g': 0.00001, 'vitamin-b9_100g': 0.0002, 'vitamin-c_100g': 0.04, 'vitamin-c_unit': 'g' },
  });
  assert.equal(draft.iron, 6); // 12 mg/100 g * 0.5
  assert.equal(draft.calcium, 200);
  assert.equal(draft.vitaminD, 5); // 10 µg/100 g * 0.5
  assert.equal(draft.folate, 100);
  assert.equal(draft.vitaminC, 20);
  assert.equal('zinc' in draft, false);
  assert.equal('potassium' in draft, false);
});

test('Open Food Facts unit handling', () => {
  assert.equal(offMicroValue(5, 'mg', 'mg'), 5);
  assert.equal(offMicroValue(250, 'µg', 'mg'), 0.25);
  assert.equal(offMicroValue(0.0001, 'g', 'ug'), 100);
  assert.equal(offMicroValue(400, 'IU', 'ug'), 10); // vitamin D only
  assert.equal(offMicroValue(400, 'IU', 'ug', { noIU: true }), null); // vitamin A IU is ambiguous
  assert.equal(offMicroValue(-1, 'g', 'mg'), null);
});

test('data file: blank is unknown, values need a source, junk is reported, duplicates are flagged', () => {
  const head = 'name,serving_size,serving_unit,sodium_mg,iron_mg,calcium_mg,potassium_mg,magnesium_mg,zinc_mg,vitaminA_ug_rae,vitaminB12_ug,vitaminC_mg,vitaminD_ug,folate_ug,source,verified';
  const csv = [head, 'Rajma masala,150,g,300,2.4,,,,,,,,,,IFCT 2017 T5,yes', 'Idli,40,g,,,,,,,,,,,,,', 'Roti,40,g,,1.1,,,,,,,,,,,', 'Dal,150,g,,abc,,,,,,,,,,IFCT,no', '"Chana, boiled",100,g,,4.5,,,,,,,,,,"USDA FDC 1",no'].join('\n');
  const { updates, problems } = buildUpdates(csv);
  assert.deepEqual(updates.map((u) => u.name), ['Rajma masala', 'Chana, boiled']);
  assert.deepEqual(updates[0].set, { sodium: 300, iron: 2.4, dataSource: 'IFCT 2017 T5', verified: true });
  assert.equal(updates[1].set.verified, false);
  assert.ok(problems.some((p) => /Roti.*no source/.test(p)));
  assert.ok(problems.some((p) => /Dal.*iron_mg/.test(p)));
  assert.ok(!problems.some((p) => /Idli/.test(p))); // all blank = fine
  assert.deepEqual(parseCsv('a,"b,c"\r\n1,2\r\n'), [['a', 'b,c'], ['1', '2']]);
});

test('admin guard reads ADMIN_EMAILS (case-insensitive) and is closed when unset', () => {
  assert.deepEqual(adminEmails({ ADMIN_EMAILS: ' Me@x.com, b@y.com ' }), ['me@x.com', 'b@y.com']);
  assert.equal(isAdmin({ email: 'ME@x.com' }, { ADMIN_EMAILS: 'me@x.com' }), true);
  assert.equal(isAdmin({ email: 'me@x.com' }, {}), false);
  assert.equal(isAdmin(null, { ADMIN_EMAILS: 'me@x.com' }), false);
});

test('audit: flags negative / implausible / over-serving micronutrients and verified-without-source', () => {
  const base = { name: 'T', servingSize: 100, servingUnit: 'g', calories: 100, protein: 5, carbohydrates: 15, fat: 2, fiber: 1, sugar: 1 };
  const types = (extra) => audit([{ ...base, ...extra }]).map((i) => i.type);
  assert.deepEqual(types({ iron: 2, calcium: null }), []);
  assert.deepEqual(types({ iron: -1 }), ['micro_negative']);
  assert.ok(types({ iron: 900 }).includes('micro_implausible'));
  assert.ok(types({ calcium: 150000 }).includes('micro_exceeds_serving'));
  assert.ok(types({ verified: true, dataSource: '' }).includes('verified_without_source'));
});
