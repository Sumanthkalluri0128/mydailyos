const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMealText } = require('../lib/foodParse');
const { detectPlateau } = require('../lib/plateau');
const { weeklyNutrients } = require('../lib/nutrients');
const { suggestFoods } = require('../lib/suggest');
const { buildPdf } = require('../lib/pdfReport');
const { buildReportLines } = require('../lib/reportBuilder');
const { renderWeeklyEmail, weekScore } = require('../lib/emailTemplate');
const unsub = require('../lib/unsubscribe');

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

const SUMMARY = {
  from: '2026-09-28', to: '2026-10-04', activeDays: 6, trends: { calories: -4, waterMl: 12, exerciseMinutes: 0, tasksCompleted: null },
  averages: { calories: 1840, protein: 92, waterMl: 2400, exerciseMinutes: 30 }, totals: { exerciseMinutes: 210 },
  goalDays: { calories: 5, protein: 3, water: 6, exercise: 4 }, weight: { start: 71.2, end: 70.6, change: -0.6 },
  bestDay: { date: '2026-10-02', highlights: ['Water goal', 'Protein goal'] },
  days: ['28', '29', '30', '01', '02', '03', '04'].map((d, i) => ({ date: `2026-${i < 3 ? '09' : '10'}-${d}`, calories: [1700, 1900, 0, 2300, 1800, 1650, 1850][i], waterMl: 2000, exerciseMinutes: 30 })),
};
const NUTRI = weeklyNutrients(SUMMARY.days.map((d) => ({ ...d, protein: 80, carbohydrates: 210, fat: 60, fiber: 14 })), { protein: 112, carbs: 220, fat: 60, fiber: 28 });

test('report text includes fibre', () => {
  const days = [{ date: '2026-10-01', calories: 1800, protein: 100, carbohydrates: 200, fat: 60, fiber: 25, sugar: 30, waterMl: 2500, exerciseMinutes: 30, weightKg: 70, weighIn: true }];
  const lines = buildReportLines({ user: { name: 'A' }, profile: { age: 30 }, targets: { calories: 1900, protein: 110, carbs: 220, fat: 60, fiber: 27 }, days, foodLogs: [], from: '2026-10-01', to: '2026-10-01', weight: null });
  assert.ok(lines.some((l) => String(l.text || l).includes('Fibre')));
});

test('weekly email: HTML + text, escaped name, score, nutrients, unsubscribe', () => {
  const m = renderWeeklyEmail({ name: '<script>alert(1)</script> Asha', summary: SUMMARY, nutrients: NUTRI, plateau: { status: 'plateau', message: 'Flat for 3 weeks.' }, target: 1900, scoreKeys: ['calories', 'protein', 'water', 'exercise'], appUrl: 'https://app.example', unsubscribeUrl: 'https://api.example/api/email/unsubscribe?token=t' });
  assert.match(m.html, /^<!DOCTYPE html>/);
  assert.ok(!m.html.includes('<script>'), 'user text must be escaped');
  assert.match(m.subject, /18|\d+\/100/);
  assert.match(m.html, /Open FlexFit/);
  assert.match(m.html, /unsubscribe with one click/);
  assert.match(m.html, /Fibre/);
  assert.match(m.text, /Week score: \d+\/100/);
  assert.match(m.text, /Fibre: /);
  assert.equal(weekScore({ calories: 7, protein: 7, water: 7, exercise: 7 }), 100);
  assert.equal(weekScore({ calories: 0, protein: 0, water: 0 }, ['calories', 'protein', 'water']), 0);
  assert.equal(weekScore({}, []), null);
});

test('weekly email copes with an empty week and no optional parts', () => {
  const empty = { ...SUMMARY, activeDays: 0, weight: null, bestDay: null, goalDays: { calories: 0, protein: 0, water: 0, exercise: 0 }, days: SUMMARY.days.map((d) => ({ ...d, calories: 0 })), averages: { calories: 0, protein: 0, waterMl: 0, exerciseMinutes: 0 }, trends: { calories: null, waterMl: null } };
  const m = renderWeeklyEmail({ name: '', summary: empty, nutrients: { loggedDays: 0, rows: [], tip: null }, plateau: null, target: null });
  assert.match(m.html, /We missed you/);
  assert.ok(!/undefined|NaN/.test(m.html), 'no undefined/NaN leaks into the email');
});

test('unsubscribe tokens are signed, purpose-bound and tamper-proof', () => {
  const t = unsub.sign('abc123', 'secret');
  assert.equal(unsub.verify(t, 'secret'), 'abc123');
  assert.equal(unsub.verify(t, 'other-secret'), null);
  assert.equal(unsub.verify('garbage', 'secret'), null);
  const jwt = require('jsonwebtoken');
  assert.equal(unsub.verify(jwt.sign({ sub: 'abc123' }, 'secret'), 'secret'), null, 'a login-style token must not work as an unsubscribe token');
  assert.match(unsub.unsubscribeUrl('u1', { RENDER_EXTERNAL_URL: 'https://api.x.com/', JWT_SECRET: 's' }), /^https:\/\/api\.x\.com\/api\/email\/unsubscribe\?token=/);
  assert.equal(unsub.unsubscribeUrl('u1', { JWT_SECRET: 's' }), '');
  assert.equal(unsub.appUrl({ CLIENT_URL: 'http://localhost:5173, https://flex.app/' }), 'https://flex.app');
});

test('sugar and sodium are ceilings; sodium is only shown when foods actually carry sodium data', () => {
  const mk = (sodium) => [1, 2, 3].map((i) => ({ date: `d${i}`, calories: 1800, protein: 80, carbohydrates: 200, fat: 60, fiber: 20, sugar: 70, sodium }));
  const noData = weeklyNutrients(mk(0), { protein: 100, carbs: 220, fat: 60, fiber: 28 }, { sugar: 45, sodiumMg: 2000 });
  assert.deepEqual(noData.limits.map((l) => l.key), ['sugar']);
  assert.equal(noData.limits[0].status, 'high'); // 70 g vs 45 g guide = 156 %
  const withData = weeklyNutrients(mk(2600), { protein: 100, carbs: 220, fat: 60, fiber: 28 }, { sugar: 45, sodiumMg: 2000 });
  assert.deepEqual(withData.limits.map((l) => l.key), ['sugar', 'sodium']);
  assert.equal(withData.limits[1].status, 'high');
  assert.deepEqual(weeklyNutrients(mk(0), { protein: 1, carbs: 1, fat: 1, fiber: 1 }).limits, []);
});

test('every catalogue food is internally consistent (calories ≈ 4P + 4C + 9F, sugar ≤ carbs, no negatives)', () => {
  const { audit } = require('../scripts/auditFoods');
  const issues = audit();
  assert.deepEqual(issues, [], issues.slice(0, 5).map((i) => `${i.name}: ${i.msg}`).join('; '));
  assert.ok(audit([{ name: 'bad', servingSize: 100, servingUnit: 'g', calories: 900, protein: 5, carbohydrates: 10, fat: 2, sugar: 20 }]).length >= 2, 'the audit must be able to catch a bad record');
});

test('catalogue cache: simultaneous requests share one database read, and it expires', async () => {
  const { catalogueFoods, clearFoodCache } = require('../lib/foodCache');
  clearFoodCache();
  let reads = 0, clock = 0;
  const Food = { find: () => ({ select: () => ({ lean: async () => { reads += 1; await new Promise((r) => setTimeout(r, 5)); return [{ name: 'x' }]; } }) }) };
  await Promise.all([1, 2, 3].map(() => catalogueFoods(Food, { now: () => clock })));
  await catalogueFoods(Food, { now: () => clock });
  assert.equal(reads, 1);
  clock += 6 * 60 * 1000;
  await catalogueFoods(Food, { now: () => clock });
  assert.equal(reads, 2);
  clearFoodCache();
});
