const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMealText } = require('../lib/foodParse');
const { detectPlateau } = require('../lib/plateau');
const { weeklyNutrients } = require('../lib/nutrients');
const { suggestFoods } = require('../lib/suggest');
const { buildPdf } = require('../lib/pdfReport');
const { buildReportLines } = require('../lib/reportBuilder');
const { digestText } = require('../lib/weeklyDigest');

const FOODS = [
  { _id: '1', name: 'Roti / Chapati', servingSize: 40, servingUnit: 'g', units: [{ label: 'roti', quantity: 40 }] },
  { _id: '2', name: 'Dal (cooked)', servingSize: 150, servingUnit: 'g', units: [{ label: 'katori', quantity: 150 }] },
  { _id: '3', name: 'White rice (cooked)', servingSize: 150, servingUnit: 'g', units: [{ label: 'cup', quantity: 160 }] },
  { _id: '4', name: 'Paneer', servingSize: 100, servingUnit: 'g', units: [] },
  { _id: '5', name: 'Milk', servingSize: 200, servingUnit: 'ml', units: [{ label: 'glass', quantity: 250 }] },
];

test('text meal parser handles counts, household units, grams and unknown foods', () => {
  const r = parseMealText('2 rotis, dal, 1 cup rice, 100g paneer and 1 glass milk, pizza', FOODS);
  const q = (id) => r.items.find((i) => i.foodId === id).quantity;
  assert.equal(q('1'), 80);
  assert.equal(q('2'), 150);
  assert.equal(q('3'), 160);
  assert.equal(q('4'), 100);
  assert.equal(q('5'), 250);
  assert.deepEqual(r.unmatched, ['pizza']);
  assert.equal(parseMealText('', FOODS).items.length, 0);
  assert.equal(parseMealText('half paneer', FOODS).items[0].quantity, 50);
});

test('plateau: flat weight while losing is flagged, steady loss is on track, little data is not judged', () => {
  const mk = (fn) => Array.from({ length: 8 }, (_, i) => ({ date: `2026-09-${String(10 + i * 2).padStart(2, '0')}`, weightKg: fn(i) }));
  const profile = { sex: 'female', goals: { targetWeightKg: 60, weeklyPaceKg: 0.5 } };
  const flat = detectPlateau({ weights: mk((i) => 70 + (i % 2) * 0.1), profile, today: '2026-09-25', target: 1700 });
  assert.equal(flat.status, 'plateau');
  assert.equal(flat.suggestedKcalChange, -100);
  const losing = detectPlateau({ weights: mk((i) => 70 - i * 0.2), profile, today: '2026-09-25', target: 1700 });
  assert.equal(losing.status, 'on_track');
  assert.equal(detectPlateau({ weights: mk((i) => 70).slice(0, 2), profile, today: '2026-09-25' }).status, 'insufficient_data');
  const atFloor = detectPlateau({ weights: mk((i) => 70), profile, today: '2026-09-25', target: 1250 });
  assert.equal(atFloor.suggestedKcalChange, 0, 'never suggests eating below the safe minimum');
});

test('weekly nutrients flag low fibre and protein', () => {
  const day = (d, fiber, protein) => ({ date: d, calories: 1800, protein, carbohydrates: 200, fat: 60, fiber });
  const r = weeklyNutrients([day('a', 10, 50), day('b', 12, 55), day('c', 11, 60)], { protein: 110, carbs: 220, fat: 60, fiber: 28 });
  assert.equal(r.rows.find((x) => x.key === 'fiber').status, 'low');
  assert.ok(r.tip);
  assert.equal(weeklyNutrients([], { protein: 1, carbs: 1, fat: 1, fiber: 1 }).loggedDays, 0);
});

test('suggestions fit the remaining calories and favour protein / fibre gaps', () => {
  const foods = [
    { _id: 'a', name: 'Moong dal', calories: 150, protein: 10, fiber: 6, sugar: 1 },
    { _id: 'b', name: 'Gulab jamun', calories: 150, protein: 2, fiber: 0, sugar: 25 },
    { _id: 'c', name: 'Huge thali', calories: 900, protein: 30, fiber: 10, sugar: 5 },
  ];
  const out = suggestFoods(foods, { calories: 300, protein: 40, fiber: 15 }, {});
  assert.equal(out[0].food._id, 'a');
  assert.ok(!out.some((o) => o.food._id === 'c'), 'does not suggest what will not fit');
  assert.deepEqual(suggestFoods(foods, { calories: 10, protein: 40, fiber: 15 }), []);
});

test('PDF report is a well-formed PDF with page breaks and escapes parentheses', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line (${i}) \\ ok`);
  const buf = buildPdf(lines, { title: 't' });
  const text = buf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count (\d+)/);
  assert.ok(Number(/\/Count (\d+)/.exec(text)[1]) >= 3);
  assert.ok(text.includes('line \\(1\\)'));
});

test('report text and weekly email include fibre and weight', () => {
  const days = [{ date: '2026-10-01', calories: 1800, protein: 100, carbohydrates: 200, fat: 60, fiber: 25, sugar: 30, waterMl: 2500, exerciseMinutes: 30, weightKg: 70, weighIn: true }];
  const lines = buildReportLines({ user: { name: 'A' }, profile: { age: 30 }, targets: { calories: 1900, protein: 110, carbs: 220, fat: 60, fiber: 27 }, days, foodLogs: [], from: '2026-10-01', to: '2026-10-01', weight: null });
  assert.ok(lines.some((l) => String(l.text || l).includes('Fibre')));
  const body = digestText({ name: 'A', summary: { from: 'x', to: 'y', activeDays: 5, averages: { calories: 1800, protein: 90, waterMl: 2000 }, totals: { exerciseMinutes: 120 }, goalDays: { calories: 4, protein: 3, water: 5, exercise: 4 }, weight: null }, nutrients: weeklyNutrients(days, { protein: 110, carbs: 220, fat: 60, fiber: 27 }), plateau: null });
  assert.match(body, /Fibre/);
});
