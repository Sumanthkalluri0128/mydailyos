const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateWeight, analysisRate, estimateNote } = require('../lib/weightEstimate');
const { detectPlateau } = require('../lib/plateau');
const { analyseOverDays } = require('../lib/overEngine');
const { expectedEnergy } = require('../lib/energy');
const { addDays } = require('../lib/dates');

const profile = { sex: 'male', age: 30, heightCm: 175, currentWeightKg: 82, activityLevel: 'light', goals: { targetWeightKg: 74, weeklyPaceKg: 0.5 } };
const today = '2026-06-15';
const tdee = expectedEnergy(profile).tdee;
const mkDays = (n, kcal, skip = []) => Array.from({ length: n }, (_, i) => { const date = addDays(today, -(n - 1 - i)); return { date, calories: skip.includes(date) ? 0 : kcal, caloriesBurned: 0 }; });

test('heavy logged days with no weigh-in imply a gain', () => {
  const est = estimateWeight({ days: mkDays(10, tdee + 700), weights: [], profile, today });
  assert.ok(est && est.meaningful);
  assert.ok(est.deltaKg > 0.5, `expected a gain, got ${est.deltaKg}`);
  assert.ok(est.ratePerWeek > 0);
  assert.equal(est.hasAnchor, false);
  assert.equal(est.estimatedKg, null);
  assert.equal(est.basis, 'estimate');
});

test('the estimate starts from the last real weigh-in and covers only the days after it', () => {
  const weights = [{ date: addDays(today, -8), weightKg: 80 }];
  const est = estimateWeight({ days: mkDays(20, tdee + 600), weights, profile, today });
  assert.equal(est.anchorKg, 80);
  assert.equal(est.anchorAgeDays, 8);
  assert.equal(est.windowDays, 7); // the 7 days after the weigh-in, today excluded
  assert.ok(est.estimatedKg > 80);
  assert.equal(est.stale, true);
});

test('a weigh-in from today or yesterday leaves nothing to estimate: the scale already says it', () => {
  assert.equal(estimateWeight({ days: mkDays(10, tdee + 700), weights: [{ date: addDays(today, -1), weightKg: 81 }], profile, today }), null);
});

test('unlogged days are unknown, never a deficit or a gain', () => {
  const all = mkDays(14, tdee + 700);
  const skip = all.slice(0, 5).map((d) => d.date);
  const full = estimateWeight({ days: all, weights: [], profile, today });
  const gappy = estimateWeight({ days: mkDays(14, tdee + 700, skip), weights: [], profile, today });
  assert.ok(gappy.unloggedDays >= 4, 'missing days are counted as unknown');
  assert.ok(gappy.deltaKg > 0 && gappy.deltaKg <= full.deltaKg, 'they add nothing, so the estimate is a minimum');
  assert.equal(gappy.confidence, 'low');
  assert.equal(estimateWeight({ days: mkDays(8, 0), weights: [], profile, today }), null, 'nothing logged means no estimate at all');
  assert.equal(estimateWeight({ days: mkDays(8, tdee + 700, mkDays(8, 0).slice(0, 6).map((d) => d.date)), weights: [], profile, today }), null, 'fewer than 3 logged days means no estimate');
});

test('the estimate is capped so a week of food cannot claim an absurd gain', () => {
  const est = estimateWeight({ days: mkDays(28, tdee + 3000), weights: [], profile, today });
  assert.ok(est.ratePerWeek <= 1);
  assert.ok(est.deltaKg <= 3);
});

test('eating at maintenance gives no meaningful change', () => {
  const est = estimateWeight({ days: mkDays(10, tdee), weights: [], profile, today });
  assert.equal(est.meaningful, false);
  assert.equal(estimateNote(est), null);
});

test('without a body profile there is no estimate', () => {
  assert.equal(estimateWeight({ days: mkDays(10, 3000), weights: [], profile: {}, today }), null);
});

test('analysisRate: a fresh scale wins; a stale scale never reports "flat"', () => {
  const est = estimateWeight({ days: mkDays(10, tdee + 700), weights: [], profile, today });
  assert.deepEqual(analysisRate({ measuredRate: -0.3, lastWeighIn: addDays(today, -1), today, estimate: est }), { ratePerWeek: -0.3, source: 'scale' });
  const stale = analysisRate({ measuredRate: 0, lastWeighIn: addDays(today, -9), today, estimate: est });
  assert.equal(stale.source, 'estimate');
  assert.ok(stale.ratePerWeek > 0);
  assert.deepEqual(analysisRate({ measuredRate: 0, lastWeighIn: addDays(today, -9), today, estimate: null }), { ratePerWeek: null, source: null });
});

test('plateau: with too few weigh-ins the heavy log is no longer ignored', () => {
  const est = estimateWeight({ days: mkDays(10, tdee + 700), weights: [], profile, today });
  const out = detectPlateau({ weights: [], profile, today, target: 1800, estimate: est });
  assert.equal(out.status, 'estimated_up');
  assert.match(out.message, /estimate/i);
  assert.equal(out.weighIns, 0);
  assert.equal(out.slopeKgPerWeek, null, 'the scale slope is untouched');
  // without an estimate nothing changes
  assert.equal(detectPlateau({ weights: [], profile, today, target: 1800 }).status, 'insufficient_data');
});

test('plateau: a stale "on track" scale does not hide a heavy week', () => {
  const weights = [{ date: addDays(today, -23), weightKg: 84 }, { date: addDays(today, -16), weightKg: 83.2 }, { date: addDays(today, -9), weightKg: 82.4 }];
  const est = estimateWeight({ days: mkDays(30, tdee + 800), weights, profile, today });
  const out = detectPlateau({ weights, profile, today, target: 1800, estimate: est });
  assert.notEqual(out.status, 'on_track');
  assert.ok(out.estimate && out.estimate.deltaKg > 0);
});

test('plateau: a fresh scale keeps its verdict, the estimate adds context only', () => {
  const weights = [{ date: addDays(today, -16), weightKg: 83 }, { date: addDays(today, -9), weightKg: 82.4 }, { date: addDays(today, -1), weightKg: 81.8 }];
  const out = detectPlateau({ weights, profile, today, target: 1800, estimate: null });
  assert.equal(out.status, 'on_track');
});

test('over engine: an estimated rate can never claim "your weight is not going up"', () => {
  const days = mkDays(7, tdee + 900);
  const common = { profile, days, today, target: 1800, floor: 1500, direction: 'lose', hour: 22, paceKg: 0.5 };
  const scale = analyseOverDays({ ...common, weightTrendPerWeek: 0, weightTrendSource: 'scale' });
  const est = analyseOverDays({ ...common, weightTrendPerWeek: 0, weightTrendSource: 'estimate' });
  assert.equal(scale.cause, 'target_or_log');
  assert.notEqual(est.cause, 'target_or_log');
});
