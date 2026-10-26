const test = require('node:test'); const assert = require('node:assert/strict');
const W = require('../lib/wrapped');

const logs = [
  ...['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-09-30'].map((date, i) => ({ date, foodName: i % 2 ? 'Idli' : 'Dal rice', calories: 400 })),
  { date: '2026-10-20', foodName: 'Idli', calories: 300 },
];
test('streak, best week and day count stay inside the month', () => {
  const r = W.buildWrapped({ month: '2026-10', foodLogs: logs });
  assert.equal(r.daysLogged, 10); assert.equal(r.longestStreak, 5);          // 12-16 Oct
  assert.deepEqual(r.bestWeek, { start: '2026-10-12', days: 5 });
  assert.equal(r.from, '2026-10-01'); assert.equal(r.to, '2026-10-31');
});
test('favourite foods ranked by count then name', () => {
  assert.deepEqual(W.topFoods(['b', 'a', 'a', 'b', 'c', ' ']).map((x) => x.name), ['a', 'b', 'c']);
});
test('favourite character = most stickers owned', () => {
  assert.deepEqual(W.favouriteCharacter(['zoro/a', 'zoro/b', 'goku/a']), { who: 'zoro', stickers: 2 });
  assert.equal(W.favouriteCharacter([]), null);
  const r = W.buildWrapped({ month: '2026-10', owned: ['zoro/a', 'goku/a', 'goku/b'], ownedBefore: 1 });
  assert.equal(r.character.who, 'goku'); assert.equal(r.charactersUnlocked, 2); assert.equal(r.stickersThisMonth, 2);
});
test('health numbers only appear when switched on', () => {
  const base = { month: '2026-10', foodLogs: logs, activityDates: ['2026-10-02', '2026-10-02', '2026-10-09'], weights: [{ date: '2026-10-01', weightKg: 80 }, { date: '2026-10-28', weightKg: 79.2 }] };
  const off = W.buildWrapped(base);
  assert.deepEqual([off.workoutDays, off.avgCalories, off.weightChangeKg, off.showHealth], [null, null, null, false]);
  const on = W.buildWrapped({ ...base, showHealth: true });
  assert.deepEqual([on.workoutDays, on.weightChangeKg, on.showHealth], [2, -0.8, true]); assert.ok(on.avgCalories > 0);
});
test('empty month is safe', () => {
  const r = W.buildWrapped({ month: '2026-02' });
  assert.deepEqual([r.daysLogged, r.longestStreak, r.bestWeek, r.favouriteFoods, r.character], [0, 0, null, [], null]);
  assert.equal(r.to, '2026-02-28');
});
