// Weekly decision: reads two weeks and changes ONE thing at a time; events are explained, never cut for; the floor is never crossed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { weeklyDecision, FRESH } = require('../lib/weeklyDecision');
const E = require('../lib/energy');
const { addDays } = require('../lib/dates');

const P = (over = {}) => ({ age: 26, sex: 'male', heightCm: 173, currentWeightKg: 79, activityLevel: 'moderate', activityMode: 'manual',
  training: { weekdays: [0, 1, 2, 4, 5] }, ...over, goals: { targetWeightKg: 69, weeklyPaceKg: 0.65, stepsTarget: 10000, ...(over.goals || {}) } });
const START = '2026-01-05';
const TODAY = addDays(START, 34);
const TARGET = E.expectedEnergy(P()).calorieTarget;
const build = (slope, f = () => ({}), n = 35) => Array.from({ length: n }, (_, i) => ({ date: addDays(START, i), calories: TARGET, protein: 140, steps: 10000, exerciseMinutes: 60,
  caloriesBurned: 350, weightKg: 79 - slope * i, weighIn: true, ...f(i) }));
const run = (days, state = null, profile = P()) => weeklyDecision({ profile, days, today: TODAY, state });

test('floor setting: your number wins, otherwise the old defaults', () => {
  assert.equal(E.calorieFloorOf({ sex: 'male' }), 1500);
  assert.equal(E.calorieFloorOf({ sex: 'female' }), 1200);
  assert.equal(E.calorieFloorOf({ sex: 'male', goals: { calorieFloor: 1700 } }), 1700);
  assert.equal(E.calorieFloorOf({ sex: 'male', goals: { calorieFloor: 500 } }), 1500);      // nonsense is ignored
  const e = E.expectedEnergy({ ...P(), goals: { targetWeightKg: 60, weeklyPaceKg: 1, calorieFloor: 1900 } });
  assert.ok(e.calorieTarget >= 1900 && e.atFloor);
});

test('on track: change nothing and reset the ladder', () => {
  const d = run(build(0.093), { ...FRESH, slowWeeks: 1, level: 2 });
  assert.equal(d.action, 'ON_TRACK');
  assert.equal(d.apply, null);
  assert.deepEqual([d.state.slowWeeks, d.state.level], [0, 0]);
});

test('too few weigh-ins or food days: no change, and it says what to do', () => {
  assert.equal(run(build(0.03, (i) => (i % 5 ? { weighIn: false } : {}))).action, 'NEED_DATA');
  assert.equal(run(build(0.03, (i) => (i % 2 ? { calories: 0 } : {}))).action, 'NEED_FOOD_LOGS');
});

test('under-eating is fixed with food, never with a plan change', () => {
  const d = run(build(0.03, () => ({ calories: 1100 })));
  assert.equal(d.action, 'UNDER_EATING');
  assert.equal(d.apply, null);
});

test('losing too fast raises calories (never a cut)', () => {
  const d = run(build(0.2));
  assert.equal(d.action, 'TOO_FAST_RAISE');
  assert.ok(d.apply && (d.apply.calorieTarget || 0) > TARGET);
});

test('poor adherence is a behaviour problem: no cut', () => {
  const d = run(build(0.03, (i) => (i % 2 ? { calories: TARGET + 900 } : {})));
  assert.equal(d.action, 'FIX_ADHERENCE');
  assert.equal(d.apply, null);
});

test('two heavy days in a week, one heavy day, missed training and low steps are explained, never cut', () => {
  assert.equal(run(build(0.03, (i) => (i === 31 || i === 33 ? { calories: TARGET + 1300 } : {}))).action, 'FIX_HEAVY_DAYS');
  assert.equal(run(build(0.06, (i) => (i === 25 ? { calories: TARGET + 1300 } : {}))).action, 'EXPLAINED_BY_HEAVY_DAY');
  const lazy = run(build(0.03, (i) => (i % 7 > 1 ? { exerciseMinutes: 0 } : {})));
  assert.equal(lazy.action, 'RESTORE_TRAINING');
  const steps = run(build(0.03, () => ({ steps: 5000 })));
  assert.equal(steps.action, 'HIT_STEPS');
  for (const d of [lazy, steps]) assert.equal(d.apply, null);
});

test('the slow ladder: wait, steps, walk, small cut - one at a time, floor-aware, only advancing when applied', () => {
  const days = build(0.03);
  let d = run(days);
  assert.equal(d.action, 'WAIT_ONE_MORE');
  let st = d.state;
  d = run(days, st);
  assert.equal(d.action, 'LADDER_STEPS');
  assert.deepEqual([d.apply.type, d.apply.stepsTarget], ['steps', 11500]);
  assert.equal(d.state.level, 0);                                   // ignored = comes back, not skipped
  assert.equal(run(days, d.state).action, 'LADDER_STEPS');
  st = { ...d.state, ...d.onApply, lastChange: addDays(TODAY, -12) };    // applied 12 days ago
  d = run(days, st);
  assert.equal(d.action, 'LADDER_WALK');
  st = { ...d.state, lastChange: addDays(TODAY, -12) };
  d = run(days, st);
  assert.equal(d.action, 'LADDER_CUT');
  assert.ok(d.apply.calorieTarget >= E.calorieFloorOf(P()) && d.apply.calorieTarget < TARGET);
  assert.equal(d.apply.type, 'pace');                                 // calorie mode "auto": the pace is what moves the target
  const manual = run(days, { ...FRESH, slowWeeks: 3, level: 2, lastChange: addDays(TODAY, -12) }, P({ goals: { calorieMode: 'manual', calorieTarget: TARGET } }));
  assert.equal(manual.action, 'LADDER_CUT');
  assert.deepEqual([manual.apply.type, manual.apply.calorieTarget], ['calorie', TARGET - 100]);   // manual mode: the typed number moves
});

test('a change inside the 10-day cool-down waits for its effect', () => {
  const d = run(build(0.03), { ...FRESH, slowWeeks: 3, level: 1, lastChange: addDays(TODAY, -4) });
  assert.equal(d.action, 'WAIT_EFFECT');
});

test('the safe floor blocks a cut: the ladder goes to a diet break instead', () => {
  const profile = P({ goals: { calorieFloor: TARGET } });
  const d = run(build(0.03), { ...FRESH, slowWeeks: 3, level: 2, lastChange: addDays(TODAY, -12) }, profile);
  assert.equal(d.action, 'LADDER_BREAK');
  assert.equal(d.apply.type, 'dietBreak');
});

test('a cut in automatic calorie mode raises the pace a little', () => {
  const d = run(build(0.03), { ...FRESH, slowWeeks: 3, level: 2, lastChange: addDays(TODAY, -12) });
  assert.equal(d.apply.type, 'pace');
  assert.ok(d.apply.weeklyPaceKg > 0.65 && d.apply.weeklyPaceKg <= 0.75);
});

test('after 8 weeks of deficit and on track: a planned diet break', () => {
  const d = run(build(0.093), { ...FRESH, deficitSince: addDays(TODAY, -60) });
  assert.equal(d.action, 'DIET_BREAK_DUE');
  assert.equal(d.apply.days, 7);
});

test('entry check: evening protein nudge before the day is over', () => {
  const D = require('../lib/dailyCoach');
  const c = D.entryCheck({ profile: P(), today: TODAY, row: { calories: 900, protein: 50, steps: 0, caloriesBurned: 0 }, target: TARGET, floor: 1500, proteinTarget: 140, hour: 19, diet: 'veg' });
  assert.ok(c.messages.some((m) => /evening/.test(m)));
  assert.ok(c.proteinFixes.length > 0);
  assert.equal(D.entryCheck({ profile: P(), today: TODAY, row: { calories: 900, protein: 50 }, target: TARGET, floor: 1500, proteinTarget: 140, hour: 11 }).messages.some((m) => /evening/.test(m)), false);
});

test('a worn-out week brings the diet break forward (never before four weeks of deficit)', () => {
  const E = require('../lib/energy'); const { addDays } = require('../lib/dates');
  const START = '2026-01-05', TODAY = addDays(START, 34);
  const profile = { age: 26, sex: 'male', heightCm: 178, currentWeightKg: 80, activityLevel: 'moderate', activityMode: 'manual', training: { weekdays: [0, 2, 4] }, goals: { targetWeightKg: 72, weeklyPaceKg: 0.5, stepsTarget: 10000, calorieMode: 'auto' } };
  const t = E.expectedEnergy(profile).calorieTarget;
  const days = Array.from({ length: 35 }, (_, i) => ({ date: addDays(START, i), calories: t, protein: 140, steps: 10000, exerciseMinutes: 45, caloriesBurned: 300, weightKg: 80 - i * 0.07, weighIn: true }));
  const run = (deficitDaysAgo, fatigue) => weeklyDecision({ profile, days, today: TODAY, strengthDates: new Set(days.map((d) => d.date)), state: { deficitSince: addDays(TODAY, -deficitDaysAgo) }, fatigue });
  assert.equal(run(35, null).action, 'ON_TRACK');                                         // five weeks, rested: carry on
  assert.equal(run(35, { breakSuggested: true }).action, 'DIET_BREAK_DUE');               // five weeks and worn out: break now
  assert.equal(run(20, { breakSuggested: true }).action, 'ON_TRACK');                     // under four weeks: never
});
