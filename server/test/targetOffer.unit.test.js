// "N weeks behind plan" becomes a choice: move the date, or raise the pace safely. Never automatic.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/energy');
const { goalForecast } = require('../lib/goalForecast');
const { targetOffer, OFFER } = require('../lib/targetOffer');
const H = require('../lib/coachHub');

const today = '2026-11-10';
const profile = (o = {}) => ({ age: 30, sex: 'male', heightCm: 175, currentWeightKg: 90, activityLevel: 'moderate', goals: { targetWeightKg: 80, weeklyPaceKg: 0.5, calorieMode: 'auto', ...(o.goals || {}) }, ...o });
const make = ({ p = profile(), rate = -0.2, plan = { active: true, byDate: '2027-02-01', paceKg: 0.5 }, adherence = 0.9, blockers = {}, snoozedUntil = '', pending = false, currentKg = 90 } = {}) => {
  const e = E.expectedEnergy(p);
  const forecast = goalForecast({ currentKg, targetKg: p.goals.targetWeightKg, rateKgWk: rate, planKgWk: 0.5, today });
  return targetOffer({ today, direction: e.direction, e, floor: E.calorieFloorOf(p), plan, forecast, currentKg, adherence, blockers, snoozedUntil, pending });
};

test('far behind the date: offers a date that matches the real trend, and a safe pace raise', () => {
  const o = make();
  assert.ok(o && o.behindWeeks >= OFFER.behindWeeks);
  assert.equal(o.date.apply.type, 'targetDate');
  assert.ok(o.date.newDate > '2027-02-01');
  assert.equal(o.pace.apply.type, 'pace');
  assert.ok(o.pace.toPace >= 0.6 && o.pace.toPace <= 0.75 + 1e-9, 'a raise of at most 0.25 kg a week at once');
  assert.ok(o.pace.kcal >= E.calorieFloorOf(profile()), 'never below the calorie floor');
  assert.equal(o.paceBlocked, '');
});

test('on pace or only a little behind: nothing is offered', () => {
  assert.equal(make({ rate: -0.5, plan: { active: true, byDate: '2027-04-10', paceKg: 0.5 } }), null);
  assert.equal(make({ rate: -0.45, plan: { active: true, byDate: '2027-04-01', paceKg: 0.5 } }), null);
});

test('the pace raise is held back, with a reason, when the basics are not in place; the date offer stays', () => {
  for (const [b, why] of [[{ recoveryLow: true }, 'recovery'], [{ strengthDown: true }, 'strength'], [{ dietBreak: true }, 'diet-break'], [{ underEating: true }, 'under-eating']]) {
    const o = make({ blockers: b });
    assert.equal(o.pace, null, why); assert.equal(o.paceBlocked, why); assert.ok(o.date, `${why}: the date offer is still there`);
  }
  const lowAdh = make({ adherence: 0.5 }); assert.equal(lowAdh.paceBlocked, 'adherence'); assert.equal(lowAdh.pace, null);
  const noAdh = make({ adherence: null }); assert.equal(noAdh.paceBlocked, 'adherence');
});

test('the safe weekly limit and the calorie floor can never be crossed by an offer', () => {
  const light = profile({ currentWeightKg: 55, goals: { targetWeightKg: 50, weeklyPaceKg: 0.5 } });
  const o = make({ p: light, currentKg: 55, plan: { active: true, byDate: '2027-01-01', paceKg: 0.5 } });
  if (o && o.pace) assert.ok(o.pace.toPace <= 0.55 + 1e-9 && o.pace.kcal >= E.calorieFloorOf(light));
  const tight = profile({ goals: { targetWeightKg: 80, weeklyPaceKg: 0.5, calorieFloor: 2600 } });
  const t = make({ p: tight });
  assert.ok(!t || t.pace === null);
});

test('no goal plan: the pace can still be offered, but there is no date to move', () => {
  const o = make({ plan: { active: false } });
  assert.ok(!o || o.date === null);
});

test('manual calorie mode gets a calorie change that keeps the plan pace in step; one change at a time and snoozing are respected', () => {
  const manual = profile({ goals: { targetWeightKg: 80, weeklyPaceKg: 0.5, calorieMode: 'manual', calorieTarget: 2000 } });
  const o = make({ p: manual });
  assert.equal(o.pace.apply.type, 'calorie'); assert.ok(o.pace.apply.planPaceKg > 0.5);
  assert.equal(make({ pending: true }), null);
  assert.equal(make({ snoozedUntil: '2026-11-20' }), null);
  assert.ok(make({ snoozedUntil: '2026-11-10' }));       // the snooze has ended
});

test('maintain goals never get an offer', () => {
  assert.equal(make({ p: profile({ goals: { targetWeightKg: 90 } }), currentKg: 90 }), null);
});

test('undo remembers the target date and plan pace only for changes that touched them', () => {
  const p = { goals: { stepsTarget: 10000 }, plan: { active: true, byDate: '2027-02-01', paceKg: 0.5 } };
  assert.deepEqual(Object.keys(H.snapshotGoals(p)).sort(), ['calorieMode', 'calorieTarget', 'stepsTarget', 'weeklyPaceKg']);
  const snap = H.snapshotGoals(p, { withPlan: true });
  assert.equal(snap.planByDate, '2027-02-01');
  const set = H.restoreSet(snap);
  assert.equal(set['plan.byDate'], '2027-02-01'); assert.equal(set['plan.paceKg'], 0.5);
  assert.equal(H.restoreSet({ ...snap, planByDate: '' })['plan.byDate'], '');            // "there was no date" is put back too
  assert.equal(H.describeChange({ type: 'targetDate', from: '2027-02-01', byDate: '2027-06-01' }), 'Target date 2027-02-01 to 2027-06-01');
  assert.equal(H.autoSafe({ type: 'targetDate', byDate: '2027-06-01' }, { target: 2000, floor: 1500 }), false);   // never applied by itself
});

test('the forecast also gives an honest earliest and latest date, never faster than the safe limit', () => {
  const f = goalForecast({ currentKg: 90, targetKg: 80, rateKgWk: -0.5, planKgWk: 0.5, today });
  assert.ok(f.range && f.range.earliest.weeks < f.atCurrent.weeks && f.range.latest.weeks > f.atCurrent.weeks);
  assert.ok(f.range.earliest.date < f.range.latest.date);
  const fast = goalForecast({ currentKg: 90, targetKg: 80, rateKgWk: -0.95, planKgWk: 0.5, today });
  const { maxSafeWeeklyLossKg } = require('../lib/trendWeight');
  assert.ok(10 / fast.range.earliest.weeks <= maxSafeWeeklyLossKg(90) + 0.15);
  assert.equal(goalForecast({ currentKg: 90, targetKg: 80, rateKgWk: 0.1, planKgWk: 0.5, today }).range, null);
});
