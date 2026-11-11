// Adaptive coaching v2: gain / recomp ladder, strength + recovery guards, faster stall path, forecast, noise filter, diet<->gym sync.
const test = require('node:test');
const assert = require('node:assert/strict');
const { weeklyDecision, FRESH } = require('../lib/weeklyDecision');
const { strengthTrend } = require('../lib/strengthTrend');
const { dropOutliers } = require('../lib/robustWeights');
const { goalForecast } = require('../lib/goalForecast');
const { dayPlan, crossCheck } = require('../lib/coachSync');
const R = require('../lib/readiness');
const E = require('../lib/energy');
const { addDays } = require('../lib/dates');

const START = '2026-01-05';
const TODAY = addDays(START, 34);
const P = (over = {}) => ({ age: 26, sex: 'male', heightCm: 173, currentWeightKg: 79, activityLevel: 'moderate', activityMode: 'manual',
  training: { weekdays: [0, 1, 2, 4, 5] }, ...over, goals: { targetWeightKg: 69, weeklyPaceKg: 0.65, stepsTarget: 10000, ...(over.goals || {}) } });
const build = (profile, slope, f = () => ({}), n = 35) => {
  const target = E.expectedEnergy(profile).calorieTarget;
  return Array.from({ length: n }, (_, i) => ({ date: addDays(START, i), calories: target, protein: 140, steps: 10000, exerciseMinutes: 60, caloriesBurned: 350,
    weightKg: profile.currentWeightKg + slope * i, weighIn: true, ...f(i) }));
};
const run = (profile, days, extra = {}) => weeklyDecision({ profile, days, today: TODAY, state: null, ...extra });
const GAIN = P({ currentWeightKg: 70, goals: { targetWeightKg: 76, weeklyPaceKg: 0.25 } });
const MAINT = P({ currentWeightKg: 70, goals: { targetWeightKg: 70 } });

// ---------------------------------------------------------------- lean gain
test('gain: on pace changes nothing and resets the ladder', () => {
  const d = run(GAIN, build(GAIN, 0.25 / 7), undefined);
  assert.equal(d.action, 'ON_TRACK');
  assert.equal(d.apply, null);
});

test('gain: too fast trims calories (never adds)', () => {
  const d = run(GAIN, build(GAIN, 0.7 / 7));
  assert.equal(d.action, 'GAIN_TOO_FAST');
  assert.ok(d.apply && d.apply.calorieTarget < E.expectedEnergy(GAIN).calorieTarget);
});

test('gain: slow because the plan is not eaten is fixed with food habits, not a bigger target', () => {
  const target = E.expectedEnergy(GAIN).calorieTarget;
  const d = run(GAIN, build(GAIN, 0.02 / 7, () => ({ calories: Math.round(target * 0.8) })));
  assert.equal(d.action, 'EAT_THE_PLAN');
  assert.equal(d.apply, null);
});

test('gain: slow with missed training restores training first', () => {
  const d = run(GAIN, build(GAIN, 0.02 / 7, (i) => (i % 7 > 0 ? { exerciseMinutes: 0 } : {})));
  assert.equal(d.action, 'RESTORE_TRAINING');
  assert.equal(d.apply, null);
});

test('gain: slow with good behaviour waits one week, then adds food, never above maintenance + 600', () => {
  const days = build(GAIN, 0.02 / 7);
  const first = run(GAIN, days);
  assert.equal(first.action, 'WAIT_ONE_MORE');
  const second = weeklyDecision({ profile: GAIN, days, today: TODAY, state: { ...FRESH, ...first.state } });
  assert.equal(second.action, 'LADDER_RAISE');
  const e = E.expectedEnergy(GAIN);
  assert.ok(second.apply.calorieTarget > e.calorieTarget && second.apply.calorieTarget <= e.tdee + 600);
});

test('gain: weight up but lifts falling = no calorie change, check sleep, protein, progression', () => {
  const d = run(GAIN, build(GAIN, 0.25 / 7), { strengthTrend: { status: 'down', pct: -6 } });
  assert.equal(d.action, 'GAIN_NO_STRENGTH');
  assert.equal(d.apply, null);
});

// ---------------------------------------------------------------- maintain / recomp
test('maintain: steady weight with a smaller waist is recomposition working', () => {
  const waists = [{ date: addDays(START, 2), value: 86 }, { date: addDays(START, 30), value: 84.5 }];
  const d = run(MAINT, build(MAINT, 0), { waists });
  assert.equal(d.action, 'RECOMP_WORKING');
  assert.equal(d.apply, null);
});

test('maintain: drifting down adds 100 kcal, drifting up trims 100', () => {
  const down = run(MAINT, build(MAINT, -0.3 / 7));
  assert.equal(down.action, 'DRIFT_DOWN');
  assert.ok(down.apply.calorieTarget > E.expectedEnergy(MAINT).calorieTarget);
  const up = run(MAINT, build(MAINT, 0.3 / 7));
  assert.equal(up.action, 'DRIFT_UP');
  assert.ok(up.apply.calorieTarget < E.expectedEnergy(MAINT).calorieTarget);
});

test('maintain: flat on every measure waits, then raises steps, never a surprise cut', () => {
  const days = build(MAINT, 0);
  let state = null, last;
  for (let k = 0; k < 4; k += 1) { last = weeklyDecision({ profile: MAINT, days, today: TODAY, state }); state = { ...FRESH, ...last.state, ...(last.onApply || {}) }; }
  assert.ok(['LADDER_STEPS', 'REASSESS'].includes(last.action));
  assert.ok(!last.apply || last.apply.type === 'steps');
});

test('gain and maintain still need weigh-ins and food logs', () => {
  assert.equal(run(GAIN, build(GAIN, 0.03, (i) => (i % 5 ? { weighIn: false } : {}))).action, 'NEED_DATA');
  assert.equal(run(GAIN, build(GAIN, 0.03, (i) => (i % 2 ? { calories: 0 } : {}))).action, 'NEED_FOOD_LOGS');
});

// ---------------------------------------------------------------- fat loss: strength / recovery / faster stall
test('fat loss: on plan but lifts falling adds a little food', () => {
  const p = P(); const e = E.expectedEnergy(p);
  const d = run(p, build(p, -(((e.tdee - e.calorieTarget) * 7) / E.KCAL_PER_KG) / 7), { strengthTrend: { status: 'down', pct: -7 } });
  assert.equal(d.action, 'PROTECT_MUSCLE');
  assert.ok(d.apply && d.apply.calorieTarget > e.calorieTarget);
});

test('fat loss: slow progress with falling strength never cuts', () => {
  const p = P();
  const days = build(p, -0.02 / 7);
  const st = { ...FRESH, slowWeeks: 3, level: 2 };
  const d = weeklyDecision({ profile: p, days, today: TODAY, state: st, strengthTrend: { status: 'down', pct: -6 } });
  assert.equal(d.action, 'HOLD_STRENGTH');
  assert.equal(d.apply, null);
});

test('fat loss: low recovery holds the cut until sleep returns', () => {
  const p = P();
  const d = weeklyDecision({ profile: p, days: build(p, -0.02 / 7), today: TODAY, state: { ...FRESH, slowWeeks: 3, level: 2 }, recovery: { low: true, note: 'Recovery has been low.' } });
  assert.equal(d.action, 'HOLD_RECOVERY');
  assert.equal(d.apply, null);
});

test('fat loss: a clear stall with excellent adherence skips the extra waiting week', () => {
  const p = P();
  const d = run(p, build(p, 0));
  assert.equal(d.action, 'LADDER_STEPS');
});

test('fat loss: steps changes wait 7 days, calorie changes wait 10', () => {
  const p = P(); const days = build(p, -0.02 / 7);
  const soon = (kind, ago) => weeklyDecision({ profile: p, days, today: TODAY, state: { ...FRESH, slowWeeks: 3, level: 1, lastChange: addDays(TODAY, -ago), lastChangeKind: kind } }).action;
  assert.equal(soon('steps', 8), 'LADDER_WALK');
  assert.equal(soon('calorie', 8), 'WAIT_EFFECT');
});

test('a single salty-dinner weigh-in does not change the decision', () => {
  const p = P(); const e = E.expectedEnergy(p);
  const slope = -(((e.tdee - e.calorieTarget) * 7) / E.KCAL_PER_KG) / 7;
  const clean = run(p, build(p, slope));
  const noisy = run(p, build(p, slope, (i) => (i === 28 ? { weightKg: 79 + slope * i + 3.2 } : {})));
  assert.equal(noisy.action, clean.action);
  assert.equal(noisy.droppedWeighIns.length, 1);
});

test('decisions carry a goal forecast', () => {
  const p = P();
  const d = run(p, build(p, -0.3 / 7));
  assert.equal(d.forecast.direction, 'lose');
  assert.ok(d.forecast.atCurrent && d.forecast.atPlan && d.forecast.atCurrent.weeks > d.forecast.atPlan.weeks);
});

// ---------------------------------------------------------------- helpers
test('outlier filter keeps real change and the newest reading', () => {
  const pts = [80, 79.8, 79.5, 79.2, 78.9, 78.6, 78.3].map((w, i) => ({ date: addDays(START, i), weightKg: w }));
  assert.equal(dropOutliers(pts).dropped.length, 0);
  const last = [...pts, { date: addDays(START, 7), weightKg: 84 }];
  assert.equal(dropOutliers(last).dropped.length, 0);       // newest can never be confirmed, so it stays
});

test('strength trend: down, up, flat and unknown', () => {
  const lift = (name, date, w, r = 8) => ({ date, activityName: name, sets: [{ reps: r, weightKg: w }] });
  const mk = (a1, a2, b1, b2) => strengthTrend({ today: '2026-11-09', activity: [lift('Bench', '2026-09-25', a1), lift('Bench', '2026-11-02', a2), lift('Squat', '2026-09-26', b1), lift('Squat', '2026-11-03', b2)] });
  assert.equal(mk(60, 55, 80, 74).status, 'down');
  assert.equal(mk(60, 65, 80, 85).status, 'up');
  assert.equal(mk(60, 60, 80, 80).status, 'flat');
  assert.equal(strengthTrend({ today: '2026-11-09', activity: [] }).status, 'unknown');
  const easyOnly = strengthTrend({ today: '2026-11-09', sessions: [{ date: '2026-11-02', status: 'done', phase: 'easy', exercises: [{ id: 'a', sets: [{ reps: 8, weightKg: 10 }] }] }] });
  assert.equal(easyOnly.status, 'unknown');
});

test('goal forecast is honest: behind plan, not moving, never an unsafe pace', () => {
  const f = goalForecast({ currentKg: 79, targetKg: 69, rateKgWk: -0.3, planKgWk: 0.65, today: '2026-11-09' });
  assert.ok(f.behindWeeks > 10);
  const flat = goalForecast({ currentKg: 79, targetKg: 69, rateKgWk: 0.0, planKgWk: 0.65, today: '2026-11-09' });
  assert.equal(flat.atCurrent, null);
  const wild = goalForecast({ currentKg: 60, targetKg: 50, rateKgWk: -0.4, planKgWk: 1, today: '2026-11-09' });
  assert.ok(wild.atPlan.ratePerWeek <= 0.6);               // 1 % of 60 kg
  assert.equal(goalForecast({ currentKg: 70, targetKg: 70.1, today: '2026-11-09' }).direction, 'maintain');
});

test('readiness: needs two answers, bands, today-only session adjustment, weekly pattern', () => {
  assert.equal(R.readinessScore({ sleepHours: 8 }), null);
  assert.equal(R.bandOf(R.readinessScore({ sleepHours: 8, energy: 5, soreness: 1, stress: 1 })), 'green');
  assert.equal(R.sessionAdjust({ sleepHours: 4.5, energy: 1, soreness: 5, stress: 5 }).band, 'red');
  assert.ok(R.sessionAdjust({ sleepHours: 4.5, energy: 1, soreness: 5, stress: 5 }).setDelta < 0);
  assert.equal(R.sessionAdjust({ sleepHours: 8, energy: 5 }).loadFactor, 1);
  const bad = Array.from({ length: 4 }, (_, i) => ({ date: addDays('2026-11-05', i), sleepHours: 5, energy: 2, soreness: 4, stress: 4 }));
  assert.equal(R.recoverySummary(bad, '2026-11-08').low, true);
  assert.equal(R.recoverySummary(bad.slice(0, 2), '2026-11-08').low, false);   // two days is not a pattern
  assert.equal(R.cleanEntry({ sleepHours: 99, energy: 9 }).sleepHours, null);
});

test('effort: easy sets get a bigger jump, grinding sets hold the weight', () => {
  assert.equal(R.topSetRpe([{ reps: 8, weightKg: 50, rpe: 6 }, { reps: 8, weightKg: 60, rpe: 7 }, { reps: 8, weightKg: 60, rpe: 8 }]), 7.5);
  assert.equal(R.topSetRpe([{ reps: 8, weightKg: 50 }]), null);
  assert.ok(R.effortAdvice(6.5).jump > 1);
  assert.equal(R.effortAdvice(9.5).hold, true);
  assert.equal(R.effortAdvice(null).jump, 1);
});

test('diet and gym sync: lifting-day macros, advisories', () => {
  const t = dayPlan({ kcal: 2000, weightKg: 80, direction: 'lose', training: true });
  const r = dayPlan({ kcal: 2000, weightKg: 80, direction: 'lose', training: false });
  assert.ok(t.carbsG > r.carbsG && t.fatG < r.fatG && t.proteinG === r.proteinG && t.pre && t.post && !r.pre);
  assert.equal(dayPlan({ kcal: 0, weightKg: 80 }), null);
  const ids = (o) => crossCheck(o).map((x) => x.id);
  assert.ok(ids({ direction: 'lose', rateKgWk: -0.9, planKgWk: 0.6, strength: { status: 'down', note: 'n', pct: -6 } }).includes('strength-down'));
  assert.ok(ids({ direction: 'lose', rateKgWk: -0.5, planKgWk: 0.6, strength: { status: 'up', pct: 4 } }).includes('deficit-protected'));
  assert.ok(ids({ direction: 'lose', phaseKey: 'easy', deficitWeeks: 7 }).includes('break-with-deload'));
  assert.equal(crossCheck({ direction: 'lose', strength: { status: 'down', note: 'n', pct: -6 } })[0].level, 'warn');
});
