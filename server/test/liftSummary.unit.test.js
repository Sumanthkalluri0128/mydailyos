const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, est1RM, dayTop } = require('../lib/liftSummary');

const row = (exerciseId, date, mode, sets, extra = {}) => ({ exerciseId, name: extra.name || exerciseId, mode, hands: mode === 'each' ? 2 : 0, date, sets, volumeKg: sets.reduce((n, s) => n + (s.totalKg || 0) * s.reps, 0), ...extra });
const s = (reps, weightKg, totalKg = weightKg) => ({ reps, weightKg, totalKg });

test('est1RM: Epley, zero for unloaded sets', () => {
  assert.equal(est1RM(100, 1), 100);
  assert.equal(est1RM(60, 10), 80);
  assert.equal(est1RM(0, 10), 0);
  assert.equal(est1RM(50, 0), 0);
});

test('a dumbbell lift keeps the per-dumbbell number and tracks the trend', () => {
  const out = summarize([
    row('db-curl', '2026-11-01', 'each', [s(10, 10, 20), s(10, 10, 20)]),
    row('db-curl', '2026-11-08', 'each', [s(10, 12, 24), s(8, 12, 24)]),
    row('db-curl', '2026-11-15', 'each', [s(10, 14, 28)]),
  ]);
  assert.equal(out.length, 1);
  const x = out[0];
  assert.equal(x.mode, 'each');
  assert.equal(x.sessions, 3);
  assert.equal(x.best.topKg, 14);
  assert.equal(x.best.date, '2026-11-15');
  assert.deepEqual(x.change, { kg: 4, since: '2026-11-01' });
  assert.equal(x.last.totalKg, 28);          // 2 x 14 moved in all
  assert.deepEqual(x.series.map((p) => p.topKg), [10, 12, 14]);
  assert.equal(x.series[0].volumeKg, 400);   // 20 kg x 10 reps x 2 sets
});

test('assisted machine: LESS help is better', () => {
  const out = summarize([
    row('assist-pull', '2026-11-01', 'assist', [s(8, 30, 40)]),
    row('assist-pull', '2026-11-10', 'assist', [s(8, 20, 50)]),
    row('assist-pull', '2026-11-20', 'assist', [s(8, 25, 45)]),
  ]);
  assert.equal(out[0].best.topKg, 20);
  assert.equal(out[0].best.date, '2026-11-10');
  assert.equal(dayTop({ mode: 'assist', sets: [s(5, 30), s(5, 15)] }), 15);
});

test('body weight with nothing added reports 0 extra and still counts reps', () => {
  const out = summarize([row('pushup', '2026-11-02', 'bw', [s(12, 0, 70), s(10, 0, 70)])]);
  assert.equal(out[0].last.topKg, 0);
  assert.equal(out[0].last.reps, 22);
  assert.equal(out[0].series[0].bestReps, 12);
  assert.equal(out[0].change, null);       // one day is not a trend
});

test('exercises come back most recent first and unknown modes fall back to total', () => {
  const out = summarize([
    row('a', '2026-10-01', 'total', [s(5, 50)]),
    row('b', '2026-11-20', 'weird', [s(5, 20)]),
    row('c', '2026-11-05', 'total', [s(5, 20)]),
    { exerciseId: '', date: '2026-11-01', sets: [] },   // junk is ignored
  ]);
  assert.deepEqual(out.map((x) => x.id), ['b', 'c', 'a']);
  assert.equal(out[0].mode, 'total');
});

test('the series is capped to the newest points', () => {
  const rows = Array.from({ length: 60 }, (_, i) => row('squat', `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, 'total', [s(5, 40 + i)]));
  const out = summarize(rows, { maxSeries: 40 });
  assert.equal(out[0].series.length, 40);
  assert.equal(out[0].series[39].topKg, 99);
  assert.equal(out[0].sessions, 60);
});
