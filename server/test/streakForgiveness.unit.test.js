const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStreaks } = require('../lib/streaks');
const { computeStreak } = require('../lib/achievements');

const run = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'];   // Thu-Sat, miss Sun 4th, Mon 5th

test('a rest day does not reset the streak and does not use the weekly freeze', () => {
  const r = computeStreaks(run, '2026-10-05', { freeze: true, restDates: ['2026-10-04'] });
  assert.equal(r.current, 4);
  assert.deepEqual(r.restDays, ['2026-10-04']);
  assert.equal(r.freezeUsedThisWeek, false);
  assert.equal(r.last14.find((d) => d.date === '2026-10-04').rest, true);
});
test('several planned rest days in a row are fine, they are not counted as logged', () => {
  const r = computeStreaks(['2026-10-01', '2026-10-02', '2026-10-06'], '2026-10-06', { restDates: ['2026-10-03', '2026-10-04', '2026-10-05'] });
  assert.equal(r.current, 3); assert.equal(r.longest, 3);
});
test('today or yesterday being a rest day keeps the streak alive', () => {
  assert.equal(computeStreaks(['2026-10-01', '2026-10-02', '2026-10-03'], '2026-10-05', { restDates: ['2026-10-04', '2026-10-05'] }).current, 3);
});
test('one missed day a week is forgiven, two in a row still end the streak', () => {
  assert.equal(computeStreaks(run, '2026-10-05', { freeze: true }).current, 4);
  assert.equal(computeStreaks(['2026-10-01', '2026-10-02', '2026-10-05'], '2026-10-05', { freeze: true }).current, 1);
});
test('a day you logged is never treated as a rest day', () => {
  assert.equal(computeStreaks(['2026-10-01', '2026-10-02'], '2026-10-02', { restDates: ['2026-10-02'] }).current, 2);
});
test('strict mode is unchanged by default', () => {
  assert.equal(computeStreaks(run, '2026-10-05').current, 1);
});
test('home / habit / badge streak: forgive option bridges one missed day, default stays strict', () => {
  const s = new Set(run);
  assert.deepEqual(computeStreak(s, '2026-10-05'), { current: 1, best: 3 });
  assert.deepEqual(computeStreak(s, '2026-10-05', { forgive: true }), { current: 4, best: 4 });
  assert.equal(computeStreak(s, '2026-10-05', { forgive: true, restDates: ['2026-10-04'] }).current, 4);
});
