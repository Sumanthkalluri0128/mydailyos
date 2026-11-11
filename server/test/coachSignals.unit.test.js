// Body composition, water-retention wait, rest-of-day re-plan, weakest-meal protein gap, measurement prompts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { weeklyDecision, FRESH } = require('../lib/weeklyDecision');
const { compositionChange, measurePrompts } = require('../lib/bodySignals');
const { retentionFlags, mayWait } = require('../lib/retention');
const { replanRestOfDay } = require('../lib/replanDay');
const { mealProteinGap } = require('../lib/mealGap');
const E = require('../lib/energy');
const { addDays } = require('../lib/dates');

const START = '2026-01-05', TODAY = addDays(START, 34);
const P = { age: 26, sex: 'male', heightCm: 173, currentWeightKg: 79, activityLevel: 'moderate', activityMode: 'manual', training: { weekdays: [0, 1, 2, 4, 5] },
  goals: { targetWeightKg: 69, weeklyPaceKg: 0.65, stepsTarget: 10000 } };
const TARGET = E.expectedEnergy(P).calorieTarget;
const build = (slope, f = () => ({})) => Array.from({ length: 35 }, (_, i) => ({ date: addDays(START, i), calories: TARGET, protein: 140, steps: 10000, exerciseMinutes: 60, caloriesBurned: 350, weightKg: 79 + slope * i, weighIn: true, ...f(i) }));
const COMP = { improving: true, note: 'Your waist is 2.5 cm smaller.' };

test('flat scale + shrinking body: no cut, up to 3 weeks, then the normal ladder resumes', () => {
  const days = build(0);
  let st = null, acts = [];
  for (let k = 0; k < 4; k += 1) { const d = weeklyDecision({ profile: P, days, today: TODAY, state: st, composition: COMP }); acts.push(d.action); st = { ...FRESH, ...d.state, ...(d.onApply || {}) }; }
  assert.deepEqual(acts.slice(0, 3), ['COMPOSITION_IMPROVING', 'COMPOSITION_IMPROVING', 'COMPOSITION_IMPROVING']);
  assert.notEqual(acts[3], 'COMPOSITION_IMPROVING');
  assert.equal(weeklyDecision({ profile: P, days, today: TODAY, state: null, composition: { improving: false } }).action, 'LADDER_STEPS');
});

test('water weight: waits once, never twice within 21 days', () => {
  const days = build(0);
  const ret = { likely: true, reasons: [{ id: 'heavy-day', text: 'A heavier day.' }] };
  const a = weeklyDecision({ profile: P, days, today: TODAY, state: null, retention: ret });
  assert.equal(a.action, 'WAIT_RETENTION');
  assert.equal(a.apply, null);
  const b = weeklyDecision({ profile: P, days, today: addDays(TODAY, 7), state: { ...FRESH, ...a.state }, retention: ret });
  assert.notEqual(b.action, 'WAIT_RETENTION');
  assert.equal(mayWait({ retWaitedOn: TODAY }, addDays(TODAY, 22)), true);
});

test('retention flags: heavy day, diet break, new training, poor sleep; nothing when calm', () => {
  const days = build(0, (i) => (i === 33 ? { calories: TARGET * 1.4 } : {}));
  const r = retentionFlags({ days, today: TODAY, target: TARGET, sleepAvg: 5.2, trainingJump: true, dietBreakEnded: addDays(TODAY, -3), sex: 'female' });
  assert.deepEqual(r.reasons.map((x) => x.id).sort(), ['diet-break', 'heavy-day', 'low-sleep', 'new-training']);
  assert.match(r.note, /cycle/);
  assert.equal(retentionFlags({ days: build(0), today: TODAY, target: TARGET, sleepAvg: 7.5 }).likely, false);
});

test('composition: waist down with muscle kept is improving; waist up is worsening; too little data says nothing', () => {
  const w = Array.from({ length: 50 }, (_, i) => ({ date: addDays('2026-09-20', i), weightKg: 84 - i * 0.02 }));
  const m = (a, b) => ({ waist: [{ date: '2026-09-28', value: a }, { date: '2026-11-05', value: b }], neck: [{ date: '2026-09-28', value: 38 }, { date: '2026-11-05', value: 38 }] });
  const good = compositionChange({ measures: m(92, 89.5), weights: w, sex: 'male', heightCm: 175, today: '2026-11-08' });
  assert.equal(good.improving, true); assert.ok(good.fatMassChangeKg < 0);
  assert.equal(compositionChange({ measures: m(89, 91), weights: w, sex: 'male', heightCm: 175, today: '2026-11-08' }).worsening, true);
  assert.equal(compositionChange({ measures: { waist: [{ date: '2026-11-01', value: 90 }] }, weights: w, sex: 'male', heightCm: 175, today: '2026-11-08' }).hasData, false);
  const tapeOnly = compositionChange({ measures: { waist: m(92, 90).waist }, weights: w, sex: 'male', heightCm: 175, today: '2026-11-08' });
  assert.equal(tapeOnly.improving, true);
});

test('measurement prompts: at most two, weigh-in first, none when everything is fresh', () => {
  const p = measurePrompts({ today: '2026-11-09', lastWaistDate: '2026-10-01', lastWeighInDate: '2026-11-01' });
  assert.deepEqual(p.map((x) => x.id), ['weigh', 'waist']);
  assert.equal(measurePrompts({ today: '2026-11-09', lastWaistDate: '2026-11-05', lastNeckDate: '2026-11-05', lastWeighInDate: '2026-11-08' }).length, 0);
});

test('rest of day: splits what is left, protects protein, never skips a meal, never below a minimum meal', () => {
  const a = replanRestOfDay({ budget: 1900, floor: 1500, eaten: 1000, proteinEaten: 40, proteinTarget: 130, logged: { breakfast: true, lunch: true }, hour: 15 });
  assert.deepEqual(a.plan.map((x) => x.slot), ['snack', 'dinner']);
  assert.ok(a.plan.every((x) => x.kcal >= 0) && a.plan.find((x) => x.slot === 'dinner').kcal >= 300);
  assert.ok(a.plan.find((x) => x.slot === 'dinner').proteinG >= 20);
  const over = replanRestOfDay({ budget: 1900, floor: 1500, eaten: 2100, proteinEaten: 60, proteinTarget: 130, logged: { breakfast: true, lunch: true, snack: true }, hour: 19 });
  assert.equal(over.over, true);
  assert.equal(over.plan.length, 1);
  assert.ok(over.plan[0].kcal >= 300);
  assert.match(over.message, /Do not skip meals/);
  assert.equal(replanRestOfDay({ budget: 1900, logged: { breakfast: true, lunch: true, snack: true, dinner: true }, hour: 20 }), null);
  assert.equal(replanRestOfDay({ budget: 0 }), null);
});

test('weakest meal: finds the low-protein meal, respects the diet, needs enough days', () => {
  const rows = [];
  for (let i = 0; i < 8; i += 1) { rows.push({ date: addDays('2026-11-01', i), mealType: 'breakfast', protein: 8 }, { date: addDays('2026-11-01', i), mealType: 'lunch', protein: 35 }, { date: addDays('2026-11-01', i), mealType: 'dinner', protein: 38 }); }
  const g = mealProteinGap({ rows, proteinTarget: 120, diet: 'vegetarian' });
  assert.equal(g.meal, 'breakfast');
  assert.ok(g.shortG > 20);
  assert.ok(!/chicken|egg|fish/i.test(g.swaps.join(' ')));
  assert.ok(/tofu|soy/i.test(mealProteinGap({ rows, proteinTarget: 120, diet: 'vegan' }).swaps.join(' ')));
  assert.equal(mealProteinGap({ rows: rows.slice(0, 6), proteinTarget: 120 }), null);       // only 2 days of each meal
  assert.equal(mealProteinGap({ rows: rows.map((r) => ({ ...r, protein: 40 })), proteinTarget: 120 }), null);
});
