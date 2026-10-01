const test = require('node:test');
const assert = require('node:assert/strict');

const { computeStreak, buildAchievements } = require('../lib/achievements');
const { buildWeeklySummary, weekContaining } = require('../lib/weekly');
const { recurrenceMatches, nextOccurrence } = require('../lib/recurrence');
const { toCsv, cell } = require('../lib/csv');
const v = require('../lib/validate');
const { weekday, addDays } = require('../lib/dates');

// ---------------------------------------------------------------- streaks
test('streak: empty set', () => {
  assert.deepEqual(computeStreak(new Set(), '2026-09-28'), { current: 0, best: 0 });
});

test('streak: counts back from today', () => {
  const s = new Set(['2026-09-26', '2026-09-27', '2026-09-28']);
  assert.deepEqual(computeStreak(s, '2026-09-28'), { current: 3, best: 3 });
});

test('streak: today not done yet keeps yesterday streak alive', () => {
  const s = new Set(['2026-09-25', '2026-09-26', '2026-09-27']);
  assert.equal(computeStreak(s, '2026-09-28').current, 3);
});

test('streak: a gap of a full day breaks the current streak but keeps best', () => {
  const s = new Set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-27']);
  assert.deepEqual(computeStreak(s, '2026-09-28'), { current: 1, best: 4 });
});

test('streak: works across month and year boundaries', () => {
  const s = new Set(['2025-12-30', '2025-12-31', '2026-01-01']);
  assert.equal(computeStreak(s, '2026-01-01').current, 3);
});

// ---------------------------------------------------------------- badges
test('badges: 7-day water streak unlocks only when goal met each day', () => {
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ date: addDays('2026-09-22', i), waterMl: 3000, exerciseMinutes: 0, calories: 0, tasksCompleted: 0, habitsCompleted: 0 });
  const out = buildAchievements({ days, totals: {}, goals: { waterTargetMl: 3000 }, today: '2026-09-28' });
  assert.equal(out.streaks.water.current, 7);
  assert.ok(out.badges.find((b) => b.id === 'water-7').unlocked);
  assert.ok(!out.badges.find((b) => b.id === 'water-30').unlocked);
});

test('badges: 2999 ml does not count toward a 3000 ml goal', () => {
  const days = [{ date: '2026-09-28', waterMl: 2999, exerciseMinutes: 0, calories: 0, tasksCompleted: 0, habitsCompleted: 0 }];
  const out = buildAchievements({ days, totals: {}, goals: { waterTargetMl: 3000 }, today: '2026-09-28' });
  assert.equal(out.streaks.water.current, 0);
});

test('badges: lifetime totals drive task badges and nextUp is the closest one', () => {
  const out = buildAchievements({ days: [], totals: { tasksCompleted: 30 }, goals: {}, today: '2026-09-28' });
  assert.ok(out.badges.find((b) => b.id === 'tasks-30').unlocked);
  assert.ok(!out.badges.find((b) => b.id === 'tasks-100').unlocked);
  assert.equal(out.nextUp.id, 'tasks-100');
});

// ---------------------------------------------------------------- weekly
const day = (date, o = {}) => ({ date, calories: 0, protein: 0, waterMl: 0, exerciseMinutes: 0, caloriesBurned: 0, tasksTotal: 0, tasksCompleted: 0, habitsCompleted: 0, weighIn: false, weightKg: null, ...o });

test('weekContaining returns Monday..Sunday', () => {
  // 2026-09-27 is a Sunday
  assert.equal(weekday('2026-09-27'), 0);
  assert.deepEqual(weekContaining('2026-09-27', weekday), { from: '2026-09-21', to: '2026-09-27' });
  assert.deepEqual(weekContaining('2026-09-21', weekday), { from: '2026-09-21', to: '2026-09-27' });
});

test('weekly summary: totals, averages over logged days only, best day and trends', () => {
  const current = [
    day('2026-09-21', { calories: 1800, protein: 150, waterMl: 3000, exerciseMinutes: 45 }),
    day('2026-09-22', { calories: 2200, protein: 100, waterMl: 1000 }),
    day('2026-09-23'), day('2026-09-24'), day('2026-09-25'), day('2026-09-26'), day('2026-09-27'),
  ];
  const previous = Array.from({ length: 7 }, (_, i) => day(addDays('2026-09-14', i), { waterMl: 1000 }));
  const s = buildWeeklySummary({ current, previous, goals: { calorieTarget: 2000, proteinTarget: 140, waterTargetMl: 3000, exerciseMinutesTarget: 30 } });

  assert.equal(s.totals.calories, 4000);
  assert.equal(s.averages.calories, 2000); // 2 logged days, not 7
  assert.equal(s.totals.waterMl, 4000);
  assert.equal(s.trends.waterMl, -43); // 4000 vs 7000
  assert.equal(s.bestDay.date, '2026-09-21');
  assert.deepEqual(s.goalDays, { water: 1, protein: 1, exercise: 1, calories: 1 });
  assert.equal(s.activeDays, 2);
});

test('weekly summary: empty week has no best day and null trend from a zero baseline', () => {
  const current = Array.from({ length: 7 }, (_, i) => day(addDays('2026-09-21', i)));
  const s = buildWeeklySummary({ current, previous: [], goals: {} });
  assert.equal(s.bestDay, null);
  assert.equal(s.trends.waterMl, 0);
  assert.equal(s.weight, null);
});

test('weekly summary: weight change uses real weigh-ins, not carried-forward values', () => {
  const current = [
    day('2026-09-21', { weighIn: true, weightKg: 82 }),
    day('2026-09-22', { weightKg: 82 }), // carried forward – ignored
    day('2026-09-27', { weighIn: true, weightKg: 81.4 }),
  ];
  const s = buildWeeklySummary({ current, goals: {} });
  assert.deepEqual(s.weight, { start: 82, end: 81.4, change: -0.6 });
});

// ---------------------------------------------------------------- recurrence
test('recurrence: daily / weekdays / weekly', () => {
  assert.ok(recurrenceMatches('daily', '2026-09-28', '2026-09-29'));
  assert.ok(!recurrenceMatches('daily', '2026-09-28', '2026-09-28'), 'never matches the anchor itself');
  assert.ok(!recurrenceMatches('daily', '2026-09-28', '2026-09-20'), 'never matches earlier dates');
  // 2026-10-03 is a Saturday, 2026-10-05 a Monday
  assert.ok(!recurrenceMatches('weekdays', '2026-09-28', '2026-10-03'));
  assert.ok(recurrenceMatches('weekdays', '2026-09-28', '2026-10-05'));
  assert.ok(recurrenceMatches('weekly', '2026-09-28', '2026-10-05'));
  assert.ok(!recurrenceMatches('weekly', '2026-09-28', '2026-10-06'));
});

test('recurrence: monthly clamps 31st to short months', () => {
  assert.ok(recurrenceMatches('monthly', '2026-01-31', '2026-02-28'));
  assert.ok(!recurrenceMatches('monthly', '2026-01-31', '2026-02-27'));
  assert.ok(recurrenceMatches('monthly', '2026-01-31', '2026-03-31'));
});

test('recurrence: nextOccurrence', () => {
  assert.equal(nextOccurrence('daily', '2026-09-28'), '2026-09-29');
  assert.equal(nextOccurrence('weekly', '2026-09-28'), '2026-10-05');
  assert.equal(nextOccurrence('weekdays', '2026-10-02'), '2026-10-05'); // Fri -> Mon
  assert.equal(nextOccurrence('none', '2026-09-28'), null);
});

// ---------------------------------------------------------------- csv
test('csv: quotes, commas, newlines and formula injection', () => {
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(cell(-5), '-5', 'numbers are never prefixed');
  assert.equal(cell(null), '');
  assert.equal(toCsv(['a', 'b'], [{ a: 1, b: 'x,y' }]), 'a,b\r\n1,"x,y"\r\n');
});

// ---------------------------------------------------------------- validators
test('validate: dates, times, numbers', () => {
  assert.ok(v.isValidDate('2026-02-28'));
  assert.ok(!v.isValidDate('2026-02-30'));
  assert.ok(!v.isValidDate('26-1-1'));
  assert.equal(v.time('09:30'), '09:30');
  assert.equal(v.time(''), '');
  assert.throws(() => v.time('24:00'), /HH:mm/);
  assert.throws(() => v.number('abc', 'x'), /number/);
  assert.throws(() => v.number(-1, 'x', { min: 0 }), /between/);
  assert.equal(v.number(undefined, 'x', { required: false, def: 7 }), 7);
  assert.equal(v.escapeRegex('a.b(c)'), 'a\\.b\\(c\\)');
  assert.throws(() => v.clientId('bad id!'), /invalid/);
});
