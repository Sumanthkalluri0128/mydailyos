const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/weightScales');
const { dropOutliers } = require('../lib/robustWeights');

const base = () => W.normalizeScales([{ id: 'main', name: 'Home' }, { id: 'gym', name: 'Gym' }], 'main');

test('no scales stored = one main scale, offset 0', () => {
  const { scales, referenceId } = W.normalizeScales([], '');
  assert.equal(scales.length, 1); assert.equal(referenceId, 'main'); assert.equal(scales[0].offsetKg, 0);
});

test('offset is learned from same-day pairs (median) and calibrates the other scale', () => {
  let { scales, referenceId } = base();
  const logs = [
    { date: '2026-11-02', weightKg: 77.5 }, { date: '2026-11-02', weightKg: 78.5, scaleId: 'gym' },
    { date: '2026-11-03', weightKg: 77.9 }, { date: '2026-11-03', weightKg: 78.9, scaleId: 'gym' },
    { date: '2026-11-04', weightKg: 78.6, scaleId: 'gym' },
  ];
  scales = W.learnOffsets(scales, logs, referenceId);
  assert.equal(scales.find((s) => s.id === 'gym').offsetKg, 1);
  const d = W.daily(W.calibrate(logs, scales));
  assert.deepEqual(d.map((p) => p.weightKg), [77.5, 77.9, 77.6]);   // the gym-only day is brought to main-scale terms
});

test('manual offset wins over learning', () => {
  const { scales: s0, referenceId } = base();
  const scales = s0.map((s) => (s.id === 'gym' ? { ...s, mode: 'manual', offsetKg: 0.4 } : s));
  const out = W.learnOffsets(scales, [{ date: 'a', weightKg: 70 }, { date: 'a', weightKg: 72, scaleId: 'gym' }], referenceId);
  assert.equal(out.find((s) => s.id === 'gym').offsetKg, 0.4);
  assert.equal(out.find((s) => s.id === 'gym').learnedKg, 2);   // still reported, so the UI can suggest it
});

test('entries from before scales existed belong to the main scale', () => {
  const { scales } = base();
  assert.equal(W.calibrate([{ date: 'x', weightKg: 80 }], scales)[0].scaleId, 'main');
});

test('changing the reference keeps every calibrated number consistent', () => {
  let { scales } = base();
  scales = scales.map((s) => (s.id === 'gym' ? { ...s, mode: 'manual', offsetKg: 1 } : s));
  const logs = [{ date: 'd1', weightKg: 78 }, { date: 'd2', weightKg: 79, scaleId: 'gym' }];
  const before = W.daily(W.calibrate(logs, scales)).map((p) => p.weightKg);       // [78, 78] in main terms
  const re = W.rebase(scales, 'gym');
  const after = W.daily(W.calibrate(logs, re)).map((p) => p.weightKg);            // [79, 79] in gym terms
  assert.deepEqual(before, [78, 78]); assert.deepEqual(after, [79, 79]);
  assert.equal(re.find((s) => s.id === 'gym').offsetKg, 0);
});

test('a scale switch is not mistaken for weight change or an outlier', () => {
  const { scales } = base();
  const sc = scales.map((s) => (s.id === 'gym' ? { ...s, mode: 'manual', offsetKg: 1.2 } : s));
  const logs = [];
  for (let i = 1; i <= 12; i++) logs.push({ date: `2026-11-${String(i).padStart(2, '0')}`, weightKg: 78 + (i > 6 ? 1.2 : 0), scaleId: i > 6 ? 'gym' : 'main' });
  const pts = W.daily(W.calibrate(logs, sc));
  assert.ok(pts.every((p) => Math.abs(p.weightKg - 78) < 0.01));
  assert.equal(dropOutliers(pts).dropped.length, 0);
  const raw = dropOutliers(logs.map((l) => ({ date: l.date, weightKg: l.weightKg })));
  assert.ok(raw.kept.length >= 11); // (uncalibrated, the jump would show as a 1.2 kg gain)
});

test('deleting a scale: toReference converts a reading into main-scale terms', () => {
  const { scales } = base();
  const sc = scales.map((s) => (s.id === 'gym' ? { ...s, offsetKg: -0.7 } : s));
  assert.equal(W.toReference(77, 'gym', sc), 77.7);
  assert.equal(W.fromReference(77.7, 'gym', sc), 77);
});
