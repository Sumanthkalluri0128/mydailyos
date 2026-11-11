// Daily decision: works UNDER the weekly decision. It never changes the plan, always agrees with the weekly engine, and only speaks early on safety.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dailyDecision, fastTrend, FOCUS } = require('../lib/dailyDecision');
const { weeklyDecision, FRESH } = require('../lib/weeklyDecision');
const { signalsOf, shouldRefresh } = require('../lib/weeklyRefresh');
const E = require('../lib/energy');
const { addDays } = require('../lib/dates');

const P = (over = {}) => ({ age: 26, sex: 'male', heightCm: 173, currentWeightKg: 79, activityLevel: 'moderate', activityMode: 'manual',
  training: { weekdays: [0, 1, 2, 4, 5] }, ...over, goals: { targetWeightKg: 69, weeklyPaceKg: 0.65, stepsTarget: 10000, ...(over.goals || {}) } });
const START = '2026-01-05';
const TODAY = addDays(START, 34);
const TARGET = E.expectedEnergy(P()).calorieTarget;
const build = (slope, f = () => ({}), n = 35) => Array.from({ length: n }, (_, i) => ({ date: addDays(START, i), calories: TARGET, protein: 140, steps: 10000, exerciseMinutes: 60,
  caloriesBurned: 350, weightKg: 79 - slope * i, weighIn: true, ...f(i) }));
const weeklyOf = (days, state = null) => weeklyDecision({ profile: P(), days, today: TODAY, state });
const view = (w) => ({ decision: { action: w.action, headline: w.headline, apply: w.apply, applied: false, metrics: w.metrics }, state: { ...FRESH, ...w.state } });
const run = (days, extra = {}) => dailyDecision({ profile: P(), days, today: TODAY, weekly: view(weeklyOf(days)), ...extra });

test('the daily decision has no apply: it can never change the plan', () => {
  for (const slope of [0, 0.03, 0.093, 0.2, 0.4]) {
    const d = run(build(slope));
    assert.equal(d.apply, undefined);
    assert.equal(d.onApply, undefined);
  }
});

test('daily "fast" and weekly "too fast" are the SAME test (sweep of weight-loss speeds)', () => {
  for (let slope = 0; slope <= 0.45; slope += 0.015) {
    const days = build(slope);
    const w = weeklyOf(days);
    const f = fastTrend({ weights: days.map((x) => ({ date: x.date, weightKg: x.weightKg })), today: TODAY, direction: 'lose', weightKg: 79 });
    assert.equal(f.fast, w.action === 'TOO_FAST_RAISE', `slope ${slope.toFixed(3)}: daily fast=${f.fast}, weekly=${w.action}`);
  }
});

test('only a weight-loss goal can be "fast"; a non-loss goal is left to the weekly ladder', () => {
  const days = build(0.4);
  assert.equal(fastTrend({ weights: days.map((x) => ({ date: x.date, weightKg: x.weightKg })), today: TODAY, direction: 'gain', weightKg: 79 }).fast, false);
});

test('a fast trend raises the early signal that makes the WEEKLY coach re-check (never a daily change)', () => {
  const base = { recoveryLow: false, waistDates: [], weighIns14: 12, foodDays14: 12, sessionStamp: '1:x', strengthStatus: null };
  const dec = { action: 'ON_TRACK', applied: false };
  const v = shouldRefresh({ prev: signalsOf(base), next: signalsOf({ ...base, trendFast: true }), decision: dec, today: TODAY });
  assert.deepEqual(v, { refresh: true, reason: 'trend-fast', adopt: false });
  // already fast and already re-checked: no repeat; an applied decision is never re-checked; one re-check a day
  assert.equal(shouldRefresh({ prev: signalsOf({ ...base, trendFast: true }), next: signalsOf({ ...base, trendFast: true }), decision: dec, today: TODAY }).refresh, false);
  assert.equal(shouldRefresh({ prev: signalsOf(base), next: signalsOf({ ...base, trendFast: true }), decision: { ...dec, applied: true }, today: TODAY }).refresh, false);
  assert.equal(shouldRefresh({ prev: signalsOf(base), next: signalsOf({ ...base, trendFast: true }), decision: dec, refreshedOn: TODAY, today: TODAY }).refresh, false);
});

test('today\'s focus comes FROM the weekly decision (same story, every action)', () => {
  for (const action of Object.keys(FOCUS)) {
    const d = dailyDecision({ profile: P(), days: build(0.09), today: TODAY, weekly: { decision: { action, headline: action, apply: null, applied: false, metrics: {} }, state: {} } });
    assert.equal(d.focus.kind, FOCUS[action][0], action);
    assert.ok(d.messages.join(' ').includes(FOCUS[action][1]), action);
  }
});

test('a weekly suggestion waiting for a tap: the daily layer stays quiet and adds no second suggestion', () => {
  const dec = { action: 'LADDER_CUT', headline: 'Step 3: cut 100 kcal', apply: { type: 'calorie', calorieTarget: TARGET - 100 }, applied: false, metrics: {} };
  const d = dailyDecision({ profile: P(), days: build(0.03), today: TODAY, weekly: { decision: dec, state: {} } });
  assert.equal(d.action, 'DAILY_WEEKLY_PENDING');
  assert.equal(d.frame.pending, true);
  assert.equal(d.apply, undefined);
});

test('weekly TOO_FAST_RAISE already applied: daily reports it, does not stack another', () => {
  const days = build(0.4);
  const dec = { action: 'TOO_FAST_RAISE', headline: 'Losing faster than is safe', apply: { type: 'calorie', calorieTarget: TARGET + 100 }, applied: true, metrics: {} };
  const d = dailyDecision({ profile: P(), days, today: TODAY, weekly: { decision: dec, state: { lastChange: TODAY } } });
  assert.equal(d.action, 'DAILY_FAST_TREND');
  assert.match(d.messages[0], /already responded/);
  assert.equal(d.frame.cooling, true);
  assert.equal(d.apply, undefined);
});

test('protein aim rises only when the weekly decision is protecting muscle / recovery, and stays inside the range', () => {
  const normal = run(build(0.09));
  assert.equal(normal.targets.protein.aim, normal.targets.protein.goal);
  const dec = { action: 'PROTECT_MUSCLE', headline: 'Protect your muscle', apply: null, applied: false, metrics: {} };
  const d = dailyDecision({ profile: P(), days: build(0.09), today: TODAY, weekly: { decision: dec, state: {} } });
  assert.ok(d.targets.protein.aim >= d.targets.protein.goal && d.targets.protein.aim <= d.targets.protein.max);
});

test('today\'s targets are exactly the plan the weekly engine works from', () => {
  const d = run(build(0.09));
  assert.equal(d.targets.calories, TARGET);
  assert.equal(d.frame.target, TARGET);
  assert.deepEqual({ min: d.targets.carbs.min, max: d.targets.carbs.max, goal: d.targets.carbs.goal }, E.macroRanges(TARGET, 79, 'lose', undefined, undefined).carbs);
  assert.equal(d.targets.waterMl, E.waterTargetMl(79));
});

test('one salty weigh-in does not make the trend "fast"', () => {
  const days = build(0.09, (i) => (i === 33 ? { weightKg: 79 - 0.09 * 33 - 2.5 } : {}));
  assert.equal(fastTrend({ weights: days.map((x) => ({ date: x.date, weightKg: x.weightKg })), today: TODAY, direction: 'lose', weightKg: 79 }).fast, false);
});

test('under-eating for 3 full days: eat more, plan untouched (weekly says the same)', () => {
  const days = build(0.09, (i) => (i >= 31 && i <= 33 ? { calories: 1000 } : {}));
  const d = run(days);
  assert.equal(d.action, 'DAILY_UNDER_EATING');
  assert.equal(d.apply, undefined);
});

test('diet break: targets and plan hold', () => {
  assert.equal(run(build(0.4), { dietBreakActive: true }).action, 'DAILY_HOLD_BREAK');
});

test('a plan edited since the weekly review is flagged stale and re-read, never contradicted', () => {
  const dec = { action: 'ON_TRACK', headline: 'On track', apply: null, applied: false, metrics: { target: TARGET - 200 } };
  const d = dailyDecision({ profile: P(), days: build(0.09), today: TODAY, weekly: { decision: dec, state: {} } });
  assert.equal(d.frame.stale, true);
  assert.equal(d.headline, 'Plan changed: targets updated');
});

test('no profile numbers: asks for them', () => {
  assert.equal(dailyDecision({ profile: { age: 30 }, days: [], today: TODAY }).action, 'NEED_PROFILE');
});
