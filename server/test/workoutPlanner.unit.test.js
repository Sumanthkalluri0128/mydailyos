const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/workoutPlanner');

test('cleanItem: defaults, limits and clean exercises', () => {
  const a = P.cleanItem({ kind: 'strength' });
  assert.deepEqual(a, { kind: 'strength', title: 'Strength', minutes: 0, note: '', exercises: [] });
  const b = P.cleanItem({ kind: 'cardio', title: '  Easy   run  ', minutes: 999, note: 'x'.repeat(500), exercises: [{ name: ' Squat ', sets: 3, reps: 8, kg: 60.26 }, { name: '' }, null, { name: 'Plank', sets: -2, reps: 'abc' }] });
  assert.equal(b.title, 'Easy run'); assert.equal(b.minutes, 300); assert.equal(b.note.length, 300);
  assert.deepEqual(b.exercises, [{ name: 'Squat', sets: 3, reps: 8, kg: 60.3 }, { name: 'Plank', sets: 0, reps: 0, kg: 0 }]);
  assert.equal(P.cleanItem({}).kind, 'custom');
  assert.throws(() => P.cleanItem({ kind: 'yoga' }), /kind must be/);
  assert.throws(() => P.cleanItem({ kind: 'strength', exercises: 'squat' }), /list/);
  assert.equal(P.cleanItem({ exercises: Array.from({ length: 50 }, (_, i) => ({ name: `e${i}` })) }).exercises.length, 30);
});
test('cleanItem partial: only what was sent, and a title cannot be blanked', () => {
  assert.deepEqual(P.cleanItem({ minutes: 30 }, { partial: true }), { minutes: 30 });
  assert.deepEqual(P.cleanItem({}, { partial: true }), {});
  assert.throws(() => P.cleanItem({ title: '   ' }, { partial: true }), /title/);
});
test('mondayOf: any day maps to the Monday of its week (Monday-first)', () => {
  assert.equal(P.mondayOf('2026-11-16'), '2026-11-16');   // Monday
  assert.equal(P.mondayOf('2026-11-17'), '2026-11-16');
  assert.equal(P.mondayOf('2026-11-22'), '2026-11-16');   // Sunday belongs to the week before it
  assert.equal(P.mondayOf('2026-11-23'), '2026-11-23');
  assert.equal(P.mondayOf('2027-01-01'), '2026-12-28');   // across a year end
});
test('expandPattern: real dates, nothing in the past, stable slots', () => {
  const pattern = [{ dow: 1, kind: 'strength', minutes: 45 }, { dow: 3, kind: 'cardio', title: 'Run' }, { dow: 7, kind: 'rest' }];
  const out = P.expandPattern({ pattern, from: '2026-11-17', weeks: 2, today: '2026-11-17' });
  assert.deepEqual(out.map((x) => `${x.date} ${x.kind} #${x.slot}`), ['2026-11-18 cardio #1', '2026-11-22 rest #2', '2026-11-23 strength #0', '2026-11-25 cardio #1', '2026-11-29 rest #2']);
  assert.equal(out[0].title, 'Run'); assert.equal(out[2].minutes, 45);
  assert.equal(P.expandPattern({ pattern, from: '2026-11-17', weeks: 1, today: '2026-11-17' }).length, 2, 'the Monday before today is not planned');
  const full = P.expandPattern({ pattern, from: '2026-11-02', weeks: 12, today: '2026-11-02' });
  assert.equal(full.length, 36);
  assert.equal(P.expandPattern({ pattern, from: '2026-11-02', weeks: 99, today: '2026-11-02' }).length, 36, 'at most 12 weeks');
});
test('expandPattern: bad patterns are refused', () => {
  assert.throws(() => P.expandPattern({ pattern: [], from: '2026-11-02', weeks: 1 }), /at least one/i);
  assert.throws(() => P.expandPattern({ pattern: [{ dow: 8, kind: 'strength' }], from: '2026-11-02', weeks: 1 }), /weekday/);
  assert.throws(() => P.expandPattern({ pattern: [{ dow: 0, kind: 'strength' }], from: '2026-11-02', weeks: 1 }), /weekday/);
  assert.throws(() => P.expandPattern({ pattern: Array.from({ length: 22 }, () => ({ dow: 1, kind: 'strength' })), from: '2026-11-02', weeks: 1 }), /21/);
});

const it = (id, date, kind, minutes, status = 'planned') => ({ id, date, kind, minutes, status });
const log = (date, category, durationMinutes) => ({ date, category, durationMinutes });
test('matchItems: what you logged covers the plan (>= 40 % of its minutes, same kind, same day)', () => {
  const m = P.matchItems([it('a', 'd1', 'strength', 60)], [log('d1', 'Strength', 25)]);
  assert.deepEqual([...m], ['a']);
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 60)], [log('d1', 'Strength', 20)]).size, 0, '20 of 60 is under 40 %');
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 60)], [log('d2', 'Strength', 60)]).size, 0, 'another day');
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 60)], [log('d1', 'Walking', 60)]).size, 0, 'a walk is not a lifting session');
  assert.equal(P.matchItems([it('a', 'd1', 'cardio', 40)], [log('d1', 'Running', 30)]).size, 1, 'running counts as cardio');
});
test('matchItems: a rest day or an already-set status is never matched; minutes are shared out', () => {
  assert.equal(P.matchItems([it('r', 'd1', 'rest', 0)], [log('d1', 'Strength', 60)]).size, 0);
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 60, 'done'), it('b', 'd1', 'strength', 60, 'skipped')], [log('d1', 'Strength', 60)]).size, 0);
  const two = P.matchItems([it('a', 'd1', 'strength', 60), it('b', 'd1', 'strength', 60)], [log('d1', 'Strength', 60)]);
  assert.deepEqual([...two], ['a'], '60 logged minutes cover one 60-minute plan, not two');
  const split = P.matchItems([it('a', 'd1', 'strength', 45), it('b', 'd1', 'strength', 30)], [log('d1', 'Strength', 60)]);
  assert.equal(split.size, 2, '60 minutes: the 45-minute plan takes 45, the other still gets its 40 % (12 of 30)');
});
test('matchItems: several Gym log rows add up; a plan with no minutes needs 10 logged', () => {
  const rows = Array.from({ length: 5 }, () => log('d1', 'Strength', 6));
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 60)], rows).size, 1, '5 x 6 = 30 of 60');
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 0)], [log('d1', 'Strength', 9)]).size, 0);
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 0)], [log('d1', 'Strength', 10)]).size, 1);
  assert.equal(P.matchItems([it('a', 'd1', 'strength', 60)], [log('d1', 'Strength', 'abc'), log('d1', 'Strength', -5)]).size, 0);
});
