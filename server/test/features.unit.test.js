const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStreaks } = require('../lib/streaks');
const { computeRecords } = require('../lib/records');
const { offToFood } = require('../lib/openFoodFacts');
const { stepCalories, stepDistanceKm } = require('../lib/steps');
const { CATALOGUE } = require('../lib/foodCatalogue');

test('steps -> calories scales with weight; 10k steps at 70 kg is about 350 kcal', () => {
  assert.equal(stepCalories(10000, 70), 350);
  assert.equal(stepCalories(10000, 100), 500);
  assert.equal(stepCalories(0, 70), 0);
  assert.equal(stepCalories(-5, 70), 0);
  assert.equal(stepCalories(1000, null), 35); // unknown weight -> 70 kg
  assert.ok(stepDistanceKm(10000) > 7 && stepDistanceKm(10000) < 8);
});

test('streak survives until the day ends, then breaks', () => {
  const d = ['2026-10-01', '2026-10-02', '2026-10-03'];
  assert.equal(computeStreaks(d, '2026-10-03').current, 3);
  assert.equal(computeStreaks(d, '2026-10-04').current, 3, 'not logged yet today, still alive');
  assert.equal(computeStreaks(d, '2026-10-05').current, 0, 'a full day missed');
  const gap = computeStreaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-03'], '2026-10-03');
  assert.equal(gap.current, 1);
  assert.equal(gap.longest, 4);
  assert.equal(gap.loggedToday, true);
  assert.equal(gap.last14.length, 14);
});

test('personal records: heaviest set, Epley 1RM, volume', () => {
  const r = computeRecords([
    { activityName: 'Bench press', date: '2026-10-01', sets: [{ reps: 10, weightKg: 60 }, { reps: 5, weightKg: 80 }] },
    { activityName: 'Bench press', date: '2026-10-03', sets: [{ reps: 8, weightKg: 70 }] },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].bestWeightKg, 80);
  assert.equal(r[0].bestWeightReps, 5);
  assert.equal(r[0].totalSets, 3);
  assert.equal(r[0].totalVolumeKg, 600 + 400 + 560);
  assert.equal(r[0].lastDate, '2026-10-03');
  assert.equal(r[0].best1RM, Math.round(80 * (1 + 5 / 30) * 10) / 10 > Math.round(70 * (1 + 8 / 30) * 10) / 10 ? Math.round(80 * (1 + 5 / 30) * 10) / 10 : Math.round(70 * (1 + 8 / 30) * 10) / 10);
});

test('Open Food Facts product converts to one serving', () => {
  const f = offToFood('8901234567890', {
    product_name: 'Digestive biscuit', brands: 'Brand A, Brand B', serving_quantity: 30,
    nutriments: { 'energy-kcal_100g': 480, proteins_100g: 7, carbohydrates_100g: 68, fat_100g: 19, fiber_100g: 3, sugars_100g: 20, sodium_100g: 0.6 },
  });
  assert.equal(f.calories, 144);
  assert.equal(f.servingSize, 30);
  assert.equal(f.servingUnit, 'g');
  assert.equal(f.brand, 'Brand A');
  assert.equal(f.sodium, 180);
  assert.equal(f.barcode, '8901234567890');
  // falls back to kJ and to 100 g when no serving is given
  const g = offToFood('1234567', { product_name: 'X', nutriments: { energy_100g: 418.4 } });
  assert.equal(g.calories, 100);
  assert.equal(g.servingSize, 100);
  assert.equal(offToFood('1234567', { product_name: 'No data', nutriments: {} }), null);
  assert.equal(offToFood('1234567', null), null);
});

test('food catalogue is well-formed', () => {
  assert.ok(CATALOGUE.length >= 100);
  for (const f of CATALOGUE) {
    assert.ok(f.name && f.servingSize > 0 && f.calories >= 0, f.name);
    // calories should roughly agree with macros (4/4/9) — catches typos in the data
    const est = f.protein * 4 + f.carbohydrates * 4 + f.fat * 9;
    if (f.calories >= 40) assert.ok(Math.abs(est - f.calories) / f.calories < 0.45, `${f.name}: ${f.calories} kcal vs macros ${Math.round(est)}`);
    for (const u of f.units) assert.ok(u.label && u.quantity > 0, `${f.name} unit`);
  }
});

test('streak freeze bridges one missed day per week, never two in a row', () => {
  const f = { freeze: true };
  assert.equal(computeStreaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], '2026-10-05', f).current, 4, 'one missed day is frozen');
  assert.deepEqual(computeStreaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], '2026-10-05', f).frozen, ['2026-10-04']);
  assert.equal(computeStreaks(['2026-10-01', '2026-10-02', '2026-10-05'], '2026-10-05', f).current, 1, 'two missed days in a row break it');
  assert.equal(computeStreaks(['2026-10-01', '2026-10-03', '2026-10-05'], '2026-10-05', f).current, 2, 'only one freeze per week');
  assert.equal(computeStreaks(['2026-10-01', '2026-10-02', '2026-10-03'], '2026-10-05').current, 0, 'without freeze a missed day still breaks');
});

test('weekly coach: protein tip, boss fight and review', () => {
  const { buildCoach } = require('../lib/weeklyCoach');
  const days = [];
  for (let i = 0; i < 21; i++) { const d = new Date(Date.UTC(2026, 9, 10) - (20 - i) * 86400000).toISOString().slice(0, 10); days.push({ date: d, calories: 1500, protein: 50, waterMl: 3000, exerciseMinutes: i % 2 ? 30 : 0, steps: 6000 }); }
  const out = buildCoach({ days, meals: [], targets: { calories: 1600, protein: 100, waterMl: 3000, steps: 8000 }, today: '2026-10-10' });
  assert.ok(out.tips.length >= 1 && out.tips.length <= 2);
  assert.ok(out.tips.some((t) => t.id.startsWith('protein')));
  assert.ok(['workout', 'water', 'logging'].includes(out.challenge.type));
  assert.ok(out.review.score >= 0 && out.review.score <= 100);
});
