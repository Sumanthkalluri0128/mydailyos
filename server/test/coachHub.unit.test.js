const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/coachHub');
const { nextAction } = require('../lib/coachSync');

test('auto-adjust only for small, reversible changes above the floor', () => {
  const ctx = { target: 2000, floor: 1500 };
  assert.equal(H.autoSafe({ type: 'steps', from: 10000, stepsTarget: 11500 }, ctx), true);
  assert.equal(H.autoSafe({ type: 'steps', from: 10000, stepsTarget: 15000 }, ctx), false);          // over the cap
  assert.equal(H.autoSafe({ type: 'calorie', from: 2000, calorieTarget: 1900 }, ctx), true);
  assert.equal(H.autoSafe({ type: 'calorie', from: 2000, calorieTarget: 1800 }, ctx), false);         // 200 kcal is too big to do silently
  assert.equal(H.autoSafe({ type: 'calorie', from: 1560, calorieTarget: 1460 }, { target: 1560, floor: 1500 }), false);   // below the floor
  assert.equal(H.autoSafe({ type: 'pace', from: 0.5, weeklyPaceKg: 0.45, calorieTarget: 1930 }, ctx), true);
  assert.equal(H.autoSafe({ type: 'dietBreak', days: 7 }, ctx), false);                                // always a tap
  assert.equal(H.autoSafe(null, ctx), false);
});

test('snapshot and restore only touch the goals a weekly change can move', () => {
  const snap = H.snapshotGoals({ goals: { stepsTarget: 10000, calorieMode: 'auto', calorieTarget: 1900, weeklyPaceKg: 0.5, proteinTarget: 120 } });
  assert.deepEqual(Object.keys(snap).sort(), ['calorieMode', 'calorieTarget', 'stepsTarget', 'weeklyPaceKg']);
  assert.deepEqual(H.restoreSet(snap), { 'goals.stepsTarget': 10000, 'goals.calorieMode': 'auto', 'goals.calorieTarget': 1900, 'goals.weeklyPaceKg': 0.5 });
  assert.deepEqual(H.restoreSet({ stepsTarget: null, calorieMode: 'x' }), {});
  assert.deepEqual(H.restoreSet(null), {});
});

test('changelog keeps 30, newest first, and judges a change only after 10 days', () => {
  let list = [];
  for (let i = 0; i < 35; i += 1) list = H.pushLog(list, { date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, action: 'X' });
  assert.equal(list.length, 30);
  const e = { date: '2026-10-20', action: 'LADDER_CUT', headline: 'h', change: 'c', rateBefore: -0.1, undone: false };
  const young = H.changelogView([{ ...e, date: '2026-11-05' }], { today: '2026-11-09', rateNow: -0.5, direction: 'lose' });
  assert.equal(young[0].after, undefined);
  const better = H.changelogView([e], { today: '2026-11-09', rateNow: -0.5, direction: 'lose' })[0].after;
  assert.equal(better.verdict, 'better');
  assert.equal(H.changelogView([e], { today: '2026-11-09', rateNow: 0.2, direction: 'lose' })[0].after.verdict, 'worse');
  assert.equal(H.changelogView([e], { today: '2026-11-09', rateNow: -0.12, direction: 'lose' })[0].after.verdict, 'same');
  assert.equal(H.changelogView([{ ...e, undone: true }], { today: '2026-11-09', rateNow: -0.5 })[0].after, undefined);
});

test('undo window and the 14-day pause after an undo', () => {
  assert.ok(H.undoView({ date: '2026-11-01', action: 'LADDER_CUT' }, '2026-11-09'));
  assert.equal(H.undoView({ date: '2026-10-01', action: 'LADDER_CUT' }, '2026-11-09'), null);
  assert.equal(H.undoView(null, '2026-11-09'), null);
  assert.equal(H.undoneRecently({ undoneOn: '2026-11-05' }, '2026-11-09'), true);
  assert.equal(H.undoneRecently({ undoneOn: '2026-10-01' }, '2026-11-09'), false);
  assert.equal(H.undoneRecently(null, '2026-11-09'), false);
});

test('one next action: decision > check-in > lift > first meal > steady', () => {
  const dec = { apply: { type: 'steps' }, applied: false, headline: 'Step 1' };
  assert.equal(nextAction({ decision: dec, checkedIn: false }).kind, 'decision');
  assert.equal(nextAction({ decision: { ...dec, applied: true }, checkedIn: false }).kind, 'checkin');
  assert.equal(nextAction({ checkedIn: true, gym: { kind: 'train', text: 'Push day' } }).kind, 'train');
  assert.equal(nextAction({ checkedIn: true, gym: { kind: 'rest', text: 'Rest' }, loggedFood: false }).kind, 'log');
  assert.equal(nextAction({ checkedIn: true, gym: { kind: 'rest', text: 'Rest' }, loggedFood: true }).kind, 'steady');
  const red = nextAction({ checkedIn: true, gym: { kind: 'train', text: 'Push day' }, readiness: { band: 'red', note: 'Low recovery today.' } });
  assert.match(red.detail, /Low recovery/);
});
