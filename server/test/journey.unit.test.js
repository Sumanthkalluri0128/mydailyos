const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../lib/journey');

const T = { calories: 2000, direction: 'lose', protein: 120, waterMl: 3000, steps: 8000, exerciseMinutes: 30 };
const day = (date, o = {}) => ({ date, calories: 0, protein: 0, waterMl: 0, exerciseMinutes: 0, steps: 0, tasksCompleted: 0, habitsCompleted: 0, weighIn: false, ...o });

test('calorie band: needs a log, not over budget, not crash dieting', () => {
  assert.equal(J.caloriesOnTrack(0, 2000, 'lose'), false);
  assert.equal(J.caloriesOnTrack(1900, 2000, 'lose'), true);
  assert.equal(J.caloriesOnTrack(2160, 2000, 'lose'), true);
  assert.equal(J.caloriesOnTrack(2200, 2000, 'lose'), false);
  assert.equal(J.caloriesOnTrack(1100, 2000, 'lose'), false);
  assert.equal(J.caloriesOnTrack(1900, 2000, 'gain'), true);
  assert.equal(J.caloriesOnTrack(1500, 2000, 'gain'), false);
});
test('level curve is monotonic and consistent at the boundaries', () => {
  assert.equal(J.levelFor(0).level, 1);
  assert.equal(J.levelFor(99).level, 1);
  assert.equal(J.levelFor(100).level, 2);
  assert.equal(J.levelFor(299).level, 2);
  assert.equal(J.levelFor(300).level, 3);
  let prev = 0;
  for (let x = 0; x < 60000; x += 37) { const l = J.levelFor(x); assert.ok(l.level >= prev); prev = l.level; assert.ok(l.xpIntoLevel >= 0 && l.xpIntoLevel < l.xpForNext); assert.equal(l.xpToNext, l.xpForNext - l.xpIntoLevel); }
  assert.equal(J.levelFor(0).rank, 'Rookie');
  assert.equal(J.levelFor(J.xpForLevel(10)).rank, 'Challenger');
});
test('a perfect day pays every quest plus the bonus', () => {
  const d = day('2026-01-02', { calories: 1950, protein: 125, waterMl: 3100, exerciseMinutes: 40, steps: 9000, habitsCompleted: 1, tasksCompleted: 2, weighIn: true });
  const r = J.dayXp(d, T);
  assert.equal(r.perfect, true);
  assert.equal(r.xp, 10 + 20 + 12 + 15 + 20 + 15 + 8 + 5 + 10 + 25);
  assert.equal(J.dayXp(day('2026-01-03'), T).xp, 0);
});
test('daily quests report progress and what is left', () => {
  const q = J.dailyQuests(day('2026-01-02', { calories: 800, waterMl: 1500 }), T);
  const water = q.quests.find((x) => x.id === 'water');
  assert.equal(water.pct, 50); assert.equal(water.done, false); assert.match(water.hint, /1500 ml/);
  assert.equal(q.total, 5); assert.equal(q.done, 0);
});
test('weekly missions use a rolling 7 days ending today', () => {
  const days = []; for (let i = 0; i < 10; i++) days.push(day(`2026-01-${String(i + 1).padStart(2, '0')}`, { calories: 1900, waterMl: 3000 }));
  const w = J.weeklyMissions(days, T, '2026-01-10');
  assert.equal(w.missions.find((m) => m.id === 'wk-log').value, 7);
  assert.equal(w.missions.find((m) => m.id === 'wk-water').done, true);
  assert.equal(w.missions.find((m) => m.id === 'wk-move').value, 0);
});
test('weight journey works for losing, gaining, and being done', () => {
  const l = J.weightJourney({ startKg: 90, currentKg: 85, targetKg: 80, paceKgPerWeek: 0.5 });
  assert.equal(l.direction, 'lose'); assert.equal(l.pct, 50); assert.equal(l.remainingKg, 5); assert.equal(l.weeksLeft, 10);
  assert.deepEqual(l.checkpoints.map((c) => c.reached), [true, true, false, false]);
  assert.deepEqual(l.checkpoints.map((c) => c.kg), [87.5, 85, 82.5, 80]);
  const g = J.weightJourney({ startKg: 60, currentKg: 63, targetKg: 70 });
  assert.equal(g.direction, 'gain'); assert.equal(g.pct, 30);
  assert.equal(J.weightJourney({ startKg: 80, currentKg: 79.9, targetKg: 80 }), null);
  assert.equal(J.weightJourney({ startKg: 90, currentKg: 79, targetKg: 80 }).reached, true);
  assert.equal(J.weightJourney({ startKg: 90, currentKg: 79, targetKg: 80 }).pct, 100);
});
test('goal progress: counts since the start date and flags pace', () => {
  const days = []; for (let i = 1; i <= 10; i++) days.push(day(`2026-02-${String(i).padStart(2, '0')}`, { exerciseMinutes: i % 2 ? 30 : 0 }));
  const g = { metric: 'workouts', target: 10, startDate: '2026-02-01', deadline: '2026-02-20' };
  const p = J.goalProgress(g, days, T, '2026-02-10');
  assert.equal(p.value, 5); assert.equal(p.pct, 50);
  assert.equal(p.daysLeft, 10);
  assert.equal(p.status, 'ahead');            // 50% done, 47% of time used
  const slow = J.goalProgress({ ...g, target: 20 }, days, T, '2026-02-10');
  assert.equal(slow.status, 'behind');
  assert.equal(J.goalProgress(g, days, T, '2026-02-25').status, 'missed');
  assert.equal(J.goalProgress({ ...g, done: true }, days, T, '2026-02-10').status, 'done');
});
test('weight goals measure distance travelled, in both directions', () => {
  const lose = J.goalProgress({ metric: 'weight', startValue: 90, target: 80, startDate: '2026-01-01' }, [], T, '2026-01-30', 85);
  assert.equal(lose.pct, 50);
  const gain = J.goalProgress({ metric: 'weight', startValue: 60, target: 70, startDate: '2026-01-01' }, [], T, '2026-01-30', 66);
  assert.equal(gain.pct, 60);
  const wrongWay = J.goalProgress({ metric: 'weight', startValue: 90, target: 80, startDate: '2026-01-01' }, [], T, '2026-01-30', 92);
  assert.equal(wrongWay.pct, 0);
});
test('buildJourney ties it together', () => {
  const days = []; for (let i = 1; i <= 14; i++) days.push(day(`2026-03-${String(i).padStart(2, '0')}`, { calories: 1900, waterMl: 3000, protein: 120, exerciseMinutes: 35, steps: 9000 }));
  const j = J.buildJourney({ days, targets: T, today: '2026-03-14', weights: [90, 88], profile: { currentWeightKg: 88, goals: { targetWeightKg: 80, weeklyPaceKg: 0.5 } }, goals: [] });
  assert.equal(j.streak.current, 14);
  assert.ok(j.level.level >= 3);
  assert.equal(j.today.done, 5);
  assert.equal(j.weightJourney.pct, 20);
  assert.equal(j.week.done, 4);
});
