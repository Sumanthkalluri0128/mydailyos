// "Why does it say behind?" lines on the goal card: every reason is one plain, kind sentence.
const test = require('node:test');
const assert = require('node:assert');
const { goalCard, statusWhy } = require('../lib/simpleGoals');
const { toneCheck } = require('../lib/safety');
const { addDays } = require('../lib/dates');

const TODAY = '2026-10-27';
const plan = (daysAgo) => ({ active: true, startKg: 80, startDate: addDays(TODAY, -daysAgo), targetKg: 72, paceKg: 0.5 });
const rows = (...ago) => ago.map((n) => ({ date: addDays(TODAY, -n) }));

test('no weigh-in since the plan began', () => {
  const w = statusWhy({ plan: plan(20), weighIns: rows(40), today: TODAY, trendKg: 80 });
  assert.match(w, /No weigh-in since your plan started/);
  assert.equal(toneCheck(w).ok, true);
});
test('gone quiet: names the number of days', () => {
  const w = statusWhy({ plan: plan(30), weighIns: rows(25, 20, 9), today: TODAY, trendKg: 80 });
  assert.match(w, /No weigh-in for 9 days/);
  assert.equal(toneCheck(w).ok, true);
});
test('too few weigh-ins, singular and plural', () => {
  assert.match(statusWhy({ plan: plan(20), weighIns: rows(2), today: TODAY, trendKg: 80 }), /Only 1 weigh-in since/);
  assert.match(statusWhy({ plan: plan(20), weighIns: rows(5, 2), today: TODAY, trendKg: 80 }), /Only 2 weigh-ins since/);
});
test('enough recent data: gives the real gap to the plan line', () => {
  const w = statusWhy({ plan: plan(28), weighIns: rows(14, 7, 1), today: TODAY, trendKg: 79.5 });
  assert.match(w, /about \d+(\.\d)? kg above where your plan expected/);
  assert.equal(toneCheck(w).ok, true);
});
test('goalCard only explains when the status is behind', () => {
  const behind = goalCard({ plan: plan(28), trendKg: 79.8, today: TODAY, weighIns: rows(25, 20, 9) });
  assert.equal(behind.status, 'behind');
  assert.match(behind.statusWhy, /9 days/);
  const start = goalCard({ plan: plan(3), trendKg: 80, today: TODAY, weighIns: [] });
  assert.equal(start.statusWhy, '');
  assert.equal(goalCard({ plan: plan(28), trendKg: 79.8, today: TODAY }).statusWhy, '', 'old callers without weigh-ins keep working');
});
