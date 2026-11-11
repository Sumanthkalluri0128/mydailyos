// Daily coach: yesterday-based maintenance, heavy-day recovery, missed workouts, entry feedback, "what am I?".
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/dailyCoach');
const E = require('../lib/energy');
const { addDays } = require('../lib/dates');

const P = (over = {}) => ({ age: 26, sex: 'male', heightCm: 173, currentWeightKg: 79, activityLevel: 'moderate', activityMode: 'auto',
  goals: { targetWeightKg: 69, weeklyPaceKg: 0.65, stepsTarget: 10000 }, training: { weekdays: [0, 1, 2, 4, 5] }, ...over });
const START = '2026-01-05'; // a Monday
const row = (i, o = {}) => ({ date: addDays(START, i), calories: 1750, protein: 140, steps: 10000, exerciseMinutes: 60, caloriesBurned: 350, weightKg: 79 - 0.09 * i, weighIn: true, ...o });
const days = (n, f = () => ({})) => Array.from({ length: n }, (_, i) => row(i, f(i)));
const TODAY = addDays(START, 15); // Tue 20 Jan

test('activity labels and the app level they map to', () => {
  assert.equal(D.activityLabel({ steps: 3000 }, false), 'no_activity');
  assert.equal(D.activityLabel({ steps: 8000 }, false), 'moderate');
  assert.equal(D.activityLabel({ steps: 3000 }, true), 'moderate');
  assert.equal(D.activityLabel({ steps: 12000 }, true), 'active');
  assert.equal(D.activityLabel({ steps: 0 }, false), null);              // steps not synced + nothing trained: unknown, not "no activity"
  assert.equal(D.appLevelFor('no_activity', { steps: 3000 }, false), 'sedentary');
  assert.equal(D.appLevelFor('moderate', { steps: 6000 }, false), 'light');
  assert.equal(D.appLevelFor('moderate', { steps: 6000 }, true), 'moderate');
});

test('day kinds follow the day budget; an unlogged day is unknown', () => {
  const k = (c) => D.dayKind(c, 1750, 1500, 1750);
  assert.deepEqual([k(1750), k(2100), k(2300), k(3000), k(1500), k(1300), k(300)], ['on_plan', 'over', 'heavy', 'cheat_day', 'low', 'under', 'unknown']);
});

test('auto mode lowers the calorie target only through targetLevel; manual ignores it', () => {
  const base = E.expectedEnergy(P({ activityMode: 'manual' })).tdee;
  const low = E.expectedEnergy(P({ autoActivity: { targetLevel: 'sedentary' } })).tdee;
  assert.ok(low < base - 400);
  assert.equal(E.expectedEnergy(P({ activityMode: 'manual', autoActivity: { targetLevel: 'sedentary' } })).tdee, base);
  assert.equal(E.expectedEnergy(P({ autoActivity: null })).tdee, base);
});

test('one lazy day never moves the target level; two in a row do; coming back also takes two', () => {
  const lazy = (d) => ({ row: { date: d, steps: 3000, exerciseMinutes: 0 }, trained: false });
  const good = (d) => ({ row: { date: d, steps: 10000, exerciseMinutes: 60 }, trained: true });
  const pr = P();
  let a = D.nextAutoActivity(null, pr, lazy('d1'), good('d0'), 'd2');
  assert.equal(a.targetLevel, 'moderate');
  a = D.nextAutoActivity(a, pr, lazy('d2'), lazy('d1'), 'd3');
  assert.equal(a.targetLevel, 'sedentary');
  a = D.nextAutoActivity(a, pr, good('d3'), lazy('d2'), 'd4');
  assert.equal(a.targetLevel, 'sedentary');
  a = D.nextAutoActivity(a, pr, good('d4'), good('d3'), 'd5');
  assert.equal(a.targetLevel, 'moderate');
  a = D.nextAutoActivity(a, pr, { row: { date: 'd5', steps: 0, exerciseMinutes: 0 }, trained: false }, good('d4'), 'd6'); // not synced
  assert.equal(a.targetLevel, 'moderate');
});

test('maintenance: yesterday decides in auto, your choice wins in manual', () => {
  const lazyY = { date: 'y', steps: 3000, exerciseMinutes: 0 }, goodY = { date: 'y', steps: 10000, exerciseMinutes: 60 };
  const auto = D.selectMaintenance(P(), lazyY, false);
  assert.equal(auto.level, 'sedentary');
  assert.ok(Math.abs(auto.tdee - 1746 * 1.2) < 25);
  assert.equal(D.selectMaintenance(P(), goodY, true).level, 'moderate');
  const man = D.selectMaintenance(P({ activityMode: 'manual' }), lazyY, false);
  assert.equal(man.level, 'moderate');
  assert.equal(man.source, 'manual');
  assert.equal(D.selectMaintenance(P(), { date: 'y', steps: 0, exerciseMinutes: 0 }, false).source, 'fallback');
});

test('day after a cheat day: recovery with no fasting, steps +2,000, never a cut', () => {
  const ds = days(15, (i) => (i === 14 ? { calories: 3000 } : {}));       // 19 Jan = cheat
  const g = D.dayGuide({ profile: P(), days: ds, today: TODAY, target: 1750, floor: 1500 });
  assert.equal(g.recovery.dayIndex, 1);
  assert.equal(g.recovery.stepsTarget, 12000);
  assert.equal(g.recovery.days.length, 3);
  assert.ok(g.recovery.days.every((x) => x.fasting === false && x.steps === 12000));
  assert.ok(g.notes.some((n) => /NO fasting/.test(n)));
  assert.ok(g.recovery.floor >= 1700);
});

test('missed training and a no-activity day change nothing in the calories, and say so', () => {
  const ds = days(15, (i) => (i === 14 ? { steps: 3000, exerciseMinutes: 0 } : {}));   // Mon 19 Jan = planned gym day, lazy
  const g = D.dayGuide({ profile: P(), days: ds, today: TODAY, target: 1750, floor: 1500 });
  assert.equal(g.yesterday.missedWorkout, true);
  assert.equal(g.maintenance.label, 'no_activity');
  assert.ok(g.notes.some((n) => /missed yesterday/i.test(n) && /no calorie cut/i.test(n)));
  assert.ok(g.notes.some((n) => /changes nothing in your calories/.test(n)));
  assert.equal(g.recovery, null);
});

test('4+ days without training lowers the first loads', () => {
  const ds = days(15, (i) => (i >= 10 ? { exerciseMinutes: 0, steps: 9000 } : {}));
  const g = D.dayGuide({ profile: P(), days: ds, today: TODAY, target: 1750, floor: 1500 });
  assert.ok(g.daysOffTraining >= 4);
  assert.equal(g.gap.loadFactor, 0.95);
});

test('what am I: sedentary data says no activity, and a manual "moderate" is told to switch', () => {
  const ds = days(35, (i) => ({ steps: 3000, exerciseMinutes: 0, calories: 1700, weightKg: 79 - 0.04 * i }));
  const r = D.suggestActivityLevel({ profile: P({ activityMode: 'manual' }), days: ds, today: addDays(START, 34) });
  assert.equal(r.suggested, 'no_activity');
  assert.equal(r.scaleLevel, 'no_activity');
  assert.equal(r.confidence, 'high');
  assert.equal(r.switch, true);
  assert.equal(r.suggestedAppLevel, 'sedentary');
  assert.equal(D.suggestActivityLevel({ profile: P(), days: ds, today: addDays(START, 34) }).switch, false);   // auto: nothing to switch
});

test('what am I: not enough data says so', () => {
  const r = D.suggestActivityLevel({ profile: P(), days: days(3), today: addDays(START, 2) });
  assert.equal(r.suggested, null);
  assert.match(r.message, /week/);
});

test('entry check: cheat day gets recovery days and no fasting advice', () => {
  const c = D.entryCheck({ profile: P(), today: TODAY, row: { calories: 3000, protein: 110, steps: 9000, exerciseMinutes: 60, caloriesBurned: 600 }, target: 1750, floor: 1500, proteinTarget: 140, complete: true, trained: true });
  assert.equal(c.status, 'CHEAT_DAY');
  assert.equal(c.nextDays.length, 3);
  assert.ok(c.nextDays.every((x) => x.fasting === false));
  assert.ok(c.messages.some((m) => /No fasting/i.test(m)));
});

test('entry check: on plan, and a small overshoot trims carbs only (max 150 kcal)', () => {
  const ok = D.entryCheck({ profile: P(), today: TODAY, row: { calories: 1000, protein: 80, steps: 0, caloriesBurned: 0 }, target: 1750, floor: 1500, proteinTarget: 140 });
  assert.equal(ok.status, 'ON_PLAN');
  const bud = E.dayBalance(P(), { eaten: 0, workout: 0 }).budget;           // the app's own budget for the day
  const over = D.entryCheck({ profile: P(), today: TODAY, row: { calories: bud + 350, protein: 90, caloriesBurned: 0 }, target: bud, floor: 1500, proteinTarget: 140 });
  assert.equal(over.status, 'OVER');
  assert.ok(over.messages.some((m) => /Trim about 150 kcal/.test(m) && /Protein foods stay/.test(m)));
});

test('entry check: protein fixes respect the diet', () => {
  const run = (diet) => D.entryCheck({ profile: P(), today: TODAY, row: { calories: 1700, protein: 80, steps: 10000, caloriesBurned: 350 }, target: 1750, floor: 1500, proteinTarget: 140, complete: true, trained: true, diet }).proteinFixes.map((f) => f.key);
  assert.ok(run('veg').every((k) => ['whey', 'yogurt', 'soya'].includes(k)));
  assert.deepEqual(run('vegan'), ['soya']);
  assert.ok(run('nonveg').some((k) => k === 'white' || k === 'chicken'));
});

test('entry check: no-activity day and a missed session are explained, never punished', () => {
  const c = D.entryCheck({ profile: P(), today: TODAY, row: { calories: 1750, protein: 140, steps: 3000, exerciseMinutes: 0, caloriesBurned: 100 }, target: 1750, floor: 1500, proteinTarget: 140, complete: true, trained: false, plannedGym: true });
  const t = c.messages.join(' ');
  assert.match(t, /No-activity day/);
  assert.match(t, /no penalty/);
  assert.ok(!/fast|skip dinner|burn it off/i.test(t.replace(/no fasting/gi, '')));
});
