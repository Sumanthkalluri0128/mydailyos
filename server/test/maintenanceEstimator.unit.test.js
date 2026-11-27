// One maintenance estimator: the calorie target, the daily and weekly coach and the body view all read the same numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { adaptiveMaintenance, maintenanceNeed } = require('../lib/adaptiveTdee');
const { calibratedMaintenance } = require('../lib/bodyAnalysis');
const { measuredFrom } = require('../lib/measuredMaintenance');
const E = require('../lib/energy');
const { addDays } = require('../lib/dates');

const START = '2026-10-01', TODAY = addDays(START, 34), TRUE = 2500;

// A reproducible person who really burns TRUE kcal, eats about 2000 and weighs in as often as asked, with scale noise.
function person({ seed = 1, every = 2, noise = 0.3, half = false, empty = 0 } = {}) {
  let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i += 1) u += rnd(); return (u - 3) / Math.sqrt(0.5); };
  let w = 80, last = null; const rows = [];
  for (let i = 0; i < 35; i += 1) {
    const intake = 2000 + gauss() * 200; w += (intake - TRUE) / 7700;
    const weighIn = i % every === 0; if (weighIn) last = w + gauss() * noise;
    let calories = intake; const r = rnd();
    if (half && r < 0.2) calories = 250 + rnd() * 350; else if (r > 1 - empty) calories = 0;
    rows.push({ date: addDays(START, i), calories, weightKg: last, weighIn });   // carried-forward weight, exactly like buildHistory
  }
  return rows;
}
const opts = { target: 2000, today: TODAY };

test('one estimator: the body view and the coaches give the same numbers on the same data', () => {
  for (const o of [{ seed: 1 }, { seed: 2, noise: 0.8 }, { seed: 3, every: 4 }, { seed: 4, half: true, empty: 0.08 }]) {
    const rows = person(o);
    const a = adaptiveMaintenance(rows, 2500, opts), b = calibratedMaintenance(rows, 2500, opts);
    assert.equal(b.ready, true, JSON.stringify(o));
    for (const k of ['estimate', 'low', 'high', 'diff', 'avgIntake', 'kgPerWeek', 'loggedShare', 'confidence']) assert.equal(b[k], a[k], `${k} ${JSON.stringify(o)}`);
  }
});

test('half-logged days are not read as "ate very little" in the body view either', () => {
  const rows = person({ seed: 9, half: true, empty: 0.08 });
  const b = calibratedMaintenance(rows, 2500, opts);
  assert.ok(Math.abs(b.estimate - TRUE) <= 150, `estimate ${b.estimate} should be near ${TRUE}`);
  assert.ok(b.avgIntake > 1800, `average intake ${b.avgIntake} must not be dragged down by skipped meals`);
});

test('today is not finished: a half-logged today changes nothing', () => {
  const rows = person({ seed: 5 });
  const withPartialToday = rows.map((d) => (d.date === TODAY ? { ...d, calories: 600 } : d));
  assert.deepEqual(adaptiveMaintenance(withPartialToday, 2500, opts), adaptiveMaintenance(rows, 2500, opts));
  assert.equal(calibratedMaintenance(withPartialToday, 2500, opts).estimate, calibratedMaintenance(rows, 2500, opts).estimate);
  // and a weigh-in made today is not used for the slope either (the window is whole days)
  const todayWeight = rows.map((d) => (d.date === TODAY ? { ...d, weightKg: 70, weighIn: true } : d));
  assert.equal(adaptiveMaintenance(todayWeight, 2500, opts).estimate, adaptiveMaintenance(rows, 2500, opts).estimate);
});

test('carried-forward weights are not weigh-ins', () => {
  const weekly = person({ seed: 6, every: 7 });                     // 5 real weigh-ins, 35 rows that show a weight
  const r = adaptiveMaintenance(weekly, 2500, opts);
  assert.ok(r.weighIns <= 5, `counted ${r.weighIns} weigh-ins, the person made 5`);
  assert.notEqual(r.confidence, 'high', 'five weekly readings are never a high-confidence answer');
  // two real weigh-ins carried across 35 days used to look like plenty of data; it is nothing
  const two = person({ seed: 7, every: 20 });
  assert.equal(adaptiveMaintenance(two, 2500, opts), null);
  assert.equal(calibratedMaintenance(two, 2500, opts).ready, false);
  // rows without a weighIn flag (older callers, plain data) still count as measurements
  assert.ok(adaptiveMaintenance(person({ seed: 8 }).map(({ weighIn, ...d }) => ({ ...d, weightKg: weighIn ? d.weightKg : null })), 2500, opts));
});

test('confidence follows the noise: a steady scale is usually high, a jumpy one almost never', () => {
  // A single person can be lucky, so this looks at the rate over 100 simulated people each.
  const rate = (o, level) => { let hit = 0, made = 0; const widths = []; for (let k = 0; k < 100; k += 1) { const r = adaptiveMaintenance(person({ seed: 300 + k, ...o }), 2500, opts); if (!r) continue; made += 1; widths.push(r.high - r.low); if (r.confidence === level) hit += 1; } widths.sort((x, y) => x - y); return { share: hit / made, median: widths[Math.floor(widths.length / 2)] }; };
  const steady = rate({ noise: 0.15, every: 2 }, 'high');
  const jumpy = rate({ noise: 1.2, every: 3 }, 'high');
  const wild = rate({ noise: 2.5, every: 4 }, 'low');
  assert.ok(steady.share >= 0.9, `a steady scale was "high" ${Math.round(steady.share * 100)}% of the time`);
  assert.ok(jumpy.share <= 0.05, `a jumpy scale was "high" ${Math.round(jumpy.share * 100)}% of the time`);
  assert.ok(wild.share >= 0.9, `a very jumpy scale was "low" ${Math.round(wild.share * 100)}% of the time: it must not steer the target`);
  assert.ok(jumpy.median > 2 * steady.median, 'a noisier scale gives a clearly wider range');
});

test('the stated range holds the truth about as often as it claims (>= 85 % of 150 simulated people)', () => {
  let inside = 0, made = 0;
  for (let k = 0; k < 150; k += 1) {
    const r = adaptiveMaintenance(person({ seed: 100 + k, every: 2 + (k % 3), noise: 0.3 + (k % 4) * 0.2 }), 2500, opts);
    if (!r) continue; made += 1;
    assert.ok(r.low < r.estimate && r.estimate < r.high);
    if (r.low <= TRUE && TRUE <= r.high) inside += 1;
  }
  assert.ok(made >= 120, `only ${made} estimates`);
  assert.ok(inside / made >= 0.85, `range held the truth ${Math.round((100 * inside) / made)}% of the time`);
});

test('"what is still missing" uses the same minimum as the estimate', () => {
  const few = person({ seed: 13, every: 20 }).slice(0, 10);
  const need = maintenanceNeed(few, 2500, opts);
  assert.ok(need.weighIns >= 0 && need.spanDays > 0 && need.loggedDays >= 0);
  assert.deepEqual(calibratedMaintenance(few, 2500, opts).need, need);
  assert.deepEqual(calibratedMaintenance([], 2500).need, { weighIns: 4, spanDays: 14, loggedDays: 10 });
});

test('the calorie target steering (measuredFrom) also leaves today out', () => {
  const man = { sex: 'male', age: 30, heightCm: 178, currentWeightKg: 80, activityLevel: 'moderate', goals: { targetWeightKg: 75, weeklyPaceKg: 0.5, calorieMode: 'auto' } };
  const rows = person({ seed: 21 }).map((d) => ({ ...d, weightKg: d.weightKg }));
  const a = measuredFrom(man, rows, TODAY);
  const b = measuredFrom(man, rows.map((d) => (d.date === TODAY ? { ...d, calories: 1000 } : d)), TODAY);
  assert.ok(a && b);
  assert.equal(a.kcal, b.kcal);
  assert.equal(a.ratio, b.ratio);
});

test('7700 kcal per kg lives in energy.js only', () => {
  assert.equal(E.KCAL_PER_KG, 7700);
  const bad = [];
  for (const dir of ['lib', 'routes']) {
    for (const f of fs.readdirSync(path.join(__dirname, '..', dir)).filter((x) => x.endsWith('.js'))) {
      if (dir === 'lib' && f === 'energy.js') continue;
      fs.readFileSync(path.join(__dirname, '..', dir, f), 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');                 // comments may mention the number
        if (/\b7700\b/.test(code)) bad.push(`${dir}/${f}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(bad, [], 'use E.KCAL_PER_KG instead of typing 7700');
});
