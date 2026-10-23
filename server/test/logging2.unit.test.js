// Section F: fit preview, what can I cook, tiffin, glycemic tags, CSV import, grocery list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { previewFit } = require('../lib/fitCheck');
const { cookIdeas } = require('../lib/cookIdeas');
const G = require('../lib/glycemic');
const I = require('../lib/csvImport');
const { parseCsv } = require('../lib/csv');
const { buildGroceryList, aisleOf, groupByAisle, shareText } = require('../lib/groceryList');
const { pickTiffinQuick, favouriteFood } = require('../lib/tiffin');
const { normalizeSpoken } = require('../lib/voiceText');
const { CATALOGUE } = require('../lib/foodCatalogue');
const { excluderFromPrefs } = require('../lib/foodSafety');

const foods = CATALOGUE.map((f, i) => ({ ...f, _id: String(i + 1) }));

test('fit preview: kcal and protein left after this food', () => {
  const f = previewFit({ add: { calories: 300, protein: 10 }, today: { eaten: 1000, budget: 1800, protein: 40, proteinTarget: 100 } });
  assert.equal(f.leftAfter, 500); assert.equal(f.kcalLeftNow, 800); assert.equal(f.proteinLeft, 50);
  assert.match(f.proteinLine, /50 g protein/);
  assert.match(previewFit({ add: { calories: 0, protein: 80 }, today: { eaten: 0, budget: 1800, protein: 40, proteinTarget: 100 } }).proteinLine, /reached/);
  assert.equal(previewFit({ add: { calories: 1, protein: 1 }, today: { eaten: 0, budget: 1800, protein: 0 } }).proteinLeft, null);
});

test('cook ideas: own recipes first, then own foods, then catalogue; budget and protein rank', () => {
  const recipes = [{ _id: 'r1', name: 'Paneer rice bowl', foodId: 'f1', ingredients: [{ foodName: 'Paneer' }, { foodName: 'White rice (cooked)' }, { foodName: 'Capsicum' }], perServing: { calories: 450, protein: 25 } },
    { _id: 'r2', name: 'Tea cake', foodId: 'f2', ingredients: [{ foodName: 'Flour' }], perServing: { calories: 300, protein: 4 } }];
  const out = cookIdeas({ have: ['paneer', 'rice'], recipes, myFoods: [{ _id: 'm1', name: 'Paneer bhurji', calories: 250, protein: 18, servingSize: 100, servingUnit: 'g' }], catalogue: foods, remaining: { calories: 600, protein: 40 } });
  assert.deepEqual(out.groups.map((g) => g.id), ['recipes', 'mine', 'catalogue']);
  assert.equal(out.groups[0].items.length, 1);                       // the tea cake has none of what is at home
  assert.deepEqual(out.groups[0].items[0].missing, ['Capsicum']);
  assert.equal(out.groups[0].items[0].coverage, 67);
  assert.ok(out.groups[2].items.every((i) => /paneer|rice/i.test(i.name)));
  const small = cookIdeas({ have: ['paneer'], catalogue: foods, remaining: { calories: 200 } });
  const fitsFirst = small.groups[0].items.findIndex((i) => i.fits === false);
  assert.ok(fitsFirst === -1 || small.groups[0].items.slice(0, fitsFirst).every((i) => i.fits === true));
  assert.equal(cookIdeas({ have: [], catalogue: foods }).groups.length, 0);
});
test('cook ideas: never offers the hidden placeholder foods or a recipe twice', () => {
  const out = cookIdeas({ have: ['quick', 'paneer'], myFoods: [{ _id: 'q', name: 'Quick add', calories: 5 }, { _id: 'f1', name: 'Paneer rice bowl', brand: 'Recipe', calories: 450 }], recipes: [{ name: 'Paneer rice bowl', foodId: 'f1', ingredients: [{ foodName: 'Paneer' }], perServing: { calories: 450, protein: 20 } }] });
  assert.equal(out.groups.length, 1); assert.equal(out.groups[0].id, 'recipes');
});
test('cook ideas: an allergen filter applied by the caller stays applied', () => {
  const ex = excluderFromPrefs({ avoid: { allergies: ['milk'] } });
  const safeFoods = ex.keep(foods);
  const out = cookIdeas({ have: ['paneer', 'rice'], catalogue: safeFoods });
  for (const g of out.groups) for (const i of g.items) assert.ok(!/paneer|curd|milk/i.test(i.name) || /rice/i.test(i.name) && !/paneer/i.test(i.name), i.name);
});

test('glycemic: only listed foods are tagged; load is calculated from carbs minus fibre', () => {
  const rice = G.glycemicOf({ name: 'White rice (cooked)', carbohydrates: 43, fiber: 0.6 });
  assert.equal(rice.known, true); assert.equal(rice.gi, 73); assert.equal(rice.giBand, 'high');
  assert.equal(rice.gl, Math.round(73 * 42.4) / 100 >= 0 ? rice.gl : 0);
  assert.ok(Math.abs(rice.gl - 31) < 0.1); assert.equal(rice.glBand, 'high');
  assert.equal(G.glycemicOf({ name: 'Poha', carbohydrates: 40 }).known, false);   // not listed: no tag, no guess
  assert.equal(G.glycemicOf({ name: 'Apple', carbohydrates: 25, fiber: 4.4 }).giBand, 'low');
  assert.equal(G.glycemicOf({ name: 'Apple' }).gl, null);                          // no carbs: GI only
  assert.deepEqual([G.giBand(55), G.giBand(56), G.giBand(70)], ['low', 'medium', 'high']);
  assert.deepEqual([G.glBand(10), G.glBand(11), G.glBand(20)], ['low', 'medium', 'high']);
});
test('glycemic: every value in the data file is a published-looking number with a source', () => {
  const d = G.load();
  assert.ok(d.source.length > 20);
  for (const [k, e] of Object.entries(d.foods)) assert.ok(e.gi >= 10 && e.gi <= 110, k);
  const names = new Set(CATALOGUE.map((f) => require('../lib/foodSafety').norm(f.name)));
  for (const k of Object.keys(d.foods)) assert.ok(names.has(k), `${k} is not a catalogue food`);
});
test('pairing tips: suggested only when the helper is missing', () => {
  assert.match(G.pairingTip('White rice (cooked)').text, /dal, curd/);
  assert.equal(G.pairingTip('White rice (cooked)', ['Toor dal (cooked)']), null);
  assert.match(G.pairingTip('Banana').text, /nuts|curd/);
  assert.equal(G.pairingTip('Grilled chicken'), null);
  assert.match(G.DIABETES_NOTE, /doctor/);
});

test('csv: reads quotes, BOM and CRLF', () => {
  const r = parseCsv('﻿Date,Food\r\n2026-10-01,"Idli, 2"\r\n2026-10-02,"He said ""hi"""\r\n');
  assert.deepEqual(r, [['Date', 'Food'], ['2026-10-01', 'Idli, 2'], ['2026-10-02', 'He said "hi"']]);
});
test('import: detects MyFitnessPal-style, HealthifyMe-style and weight columns', () => {
  const mfp = I.detect(['Date', 'Meal', 'Food Name', 'Calories', 'Protein (g)', 'Carbohydrates (g)', 'Fat (g)', 'Fiber (g)', 'Sugar (g)', 'Sodium (mg)']);
  assert.equal(mfp.kind, 'food'); assert.equal(mfp.mapping.protein, 4); assert.equal(mfp.mapping.sodium, 9);
  const hm = I.detect(['Logged On', 'Meal Type', 'Item', 'Energy (kcal)', 'Proteins', 'Carbs', 'Fats']);
  assert.equal(hm.mapping.calories, 3); assert.equal(hm.mapping.food, 2);
  assert.equal(hm.mapping.date, undefined);                                           // "Logged On" is not guessed: the person picks it
  const w = I.detect(['Date', 'Weight (kg)']);
  assert.equal(w.kind, 'weight');
  assert.equal(I.detect(['a', 'b']).kind, 'unknown');
});
test('import: dates, meals, numbers, pounds', () => {
  assert.deepEqual(I.parseDate('2026-10-05'), { date: '2026-10-05', ambiguous: false });
  assert.deepEqual(I.parseDate('25/10/2026'), { date: '2026-10-25', ambiguous: false });
  assert.deepEqual(I.parseDate('10/25/2026'), { date: '2026-10-25', ambiguous: false });
  assert.deepEqual(I.parseDate('03/04/2026'), { date: '2026-04-03', ambiguous: true });   // India default: day first
  assert.equal(I.parseDate('03/04/2026', 'mdy').date, '2026-03-04');
  assert.equal(I.parseDate('05 Oct 2026').date, '2026-10-05'); assert.equal(I.parseDate('Oct 5, 2026').date, '2026-10-05');
  assert.equal(I.parseDate('31/02/2026').date, null); assert.equal(I.parseDate('hello').date, null);
  assert.equal(I.parseMeal('Morning Snack').meal, 'snacks'); assert.equal(I.parseMeal('Dinner').meal, 'dinner'); assert.equal(I.parseMeal('???').guessed, true);
  assert.equal(I.num('1,234.5'), 1234.5); assert.equal(I.num('12,5'), 12.5); assert.equal(I.num('12 g'), 12); assert.equal(I.num(''), null);
  assert.equal(I.toKg('165', 'Weight (lbs)'), 74.84); assert.equal(I.toKg('72.5', 'Weight (kg)'), 72.5); assert.equal(I.toKg('5', 'Weight'), null);
});
test('import: preview counts, duplicates in the file and in the app, problems, nothing invented', () => {
  const csv = 'Date,Meal,Food,Calories,Protein\n2026-10-01,Breakfast,Idli,120,4\n2026-10-01,Breakfast,Idli,120,4\n2026-10-01,Lunch,Dal rice,450,\n2026-10-02,Lunch,Dal rice,abc,5\n05/13/2026,Dinner,Roti,80,3\n';
  const rows = parseCsv(csv); const d = I.detect(rows[0]);
  const b = I.buildFood(rows.slice(1), d.mapping, { existing: [{ date: '2026-10-01', mealType: 'lunch', foodName: 'Dal rice', calories: 450 }] });
  assert.equal(b.rows.length, 2);                     // idli once, roti
  assert.equal(b.duplicates.length, 2);               // second idli (in the file) + dal rice (already in the app)
  assert.equal(b.problems.length, 1);                 // "abc" calories
  assert.equal(b.rows.find((r) => r.name === 'Roti').date, '2026-05-13');
  const s = I.summarize('food', b);
  assert.equal(s.toImport, 2); assert.equal(s.duplicates, 2); assert.equal(s.problems, 1); assert.equal(s.totalKcal, 200);
  const have = [{ date: '2026-10-01', mealType: 'lunch', foodName: 'Dal rice', calories: 450 }, ...b.rows.map((r) => ({ date: r.date, mealType: r.mealType, foodName: r.name, calories: r.calories }))];
  const again = I.buildFood(rows.slice(1), d.mapping, { existing: have });
  assert.equal(again.rows.length, 0);                 // importing the same file twice adds nothing
});
test('import: weight history, pounds and same-day duplicates', () => {
  const rows = parseCsv('Date,Weight (lbs)\n2026-10-01,165\n2026-10-02,164.2\n2026-10-03,bad\n');
  const d = I.detect(rows[0]);
  const b = I.buildWeight(rows.slice(1), d.mapping, { headers: rows[0], existing: [{ date: '2026-10-01', weightKg: 74.84 }] });
  assert.equal(b.duplicates.length, 1); assert.equal(b.rows.length, 1); assert.equal(b.rows[0].weightKg, 74.48); assert.equal(b.problems.length, 1);
  assert.match(I.CULT_NOTE, /cult\.fit/);
});

test('grocery: aisles, merge, already-at-home, share text', () => {
  assert.equal(aisleOf('Paneer'), 'Dairy and eggs'); assert.equal(aisleOf('Toor dal (cooked)'), 'Pulses and dal'); assert.equal(aisleOf('Banana'), 'Fruit'); assert.equal(aisleOf('Zzz'), 'Other');
  const items = [{ foodId: 'a', foodName: 'Paneer', quantity: 100, servingUnit: 'g', calories: 300 }, { foodId: 'a', foodName: 'Paneer', quantity: 150, servingUnit: 'g', calories: 400 }, { foodId: 'b', foodName: 'Banana', quantity: 120, servingUnit: 'g', calories: 100 }, { foodId: 'c', foodName: 'Rice', quantity: 150, servingUnit: 'g', calories: 195 }];
  const list = buildGroceryList({ items, have: ['rice'] });
  assert.equal(list.items.find((i) => i.name === 'Paneer').quantity, 250);     // merged
  assert.deepEqual(list.alreadyHave.map((i) => i.name), ['Rice']);
  const aisles = groupByAisle(list.items);
  assert.deepEqual(aisles.map((a) => a.aisle), ['Fruit', 'Dairy and eggs']);   // shop-walking order
  const text = shareText(list, { from: '2026-10-26', to: '2026-11-01' });
  assert.match(text, /DAIRY AND EGGS\n\[ \] Paneer: 250 g/); assert.match(text, /Already at home: Rice/);
  assert.ok(!shareText(list, { checked: new Set(['a']) }).includes('Paneer'));  // ticked items are left out
});

test('tiffin: favourites first, then lunches eaten most often, unsafe foods never listed', () => {
  const byId = new Map([['1', { _id: '1', name: 'Canteen thali' }], ['2', { _id: '2', name: 'Curd rice' }], ['3', { _id: '3', name: 'Poha' }]]);
  const logs = [{ foodId: '2' }, { foodId: '2' }, { foodId: '3' }, { foodId: '9' }];     // 9 was filtered out (e.g. an allergen)
  const r = pickTiffinQuick({ favIds: ['1', '8'], logs, byId });
  assert.deepEqual(r.favourites.map((f) => f.name), ['Canteen thali']);
  assert.deepEqual(r.recent.map((f) => f.name), ['Curd rice', 'Poha']);
  assert.equal(favouriteFood({ name: ' Rajma ', calories: 400 }).brand, 'Canteen');
});

test('voice: Hindi and Telugu transliteration samples', () => {
  assert.equal(normalizeSpoken('teen roti aur ek katori dal').text, '3 roti, 1 katori dal');
  assert.equal(normalizeSpoken('moodu idli mariyu okati chai').text, '3 idli, 1 chai');
  assert.equal(normalizeSpoken('dopahar mein char roti aur sabzi khayi').meal, 'lunch');
  assert.equal(normalizeSpoken('rendu dosa').text, '2 dosa');
});
