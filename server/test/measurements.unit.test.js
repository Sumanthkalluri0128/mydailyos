const test = require('node:test'); const assert = require('node:assert/strict');
const { measureTrends } = require('../lib/measurements');
const { toneCheck } = require('../lib/safety');

test('one point per day (latest entry wins), oldest first, change computed', () => {
  const r = measureTrends({ logs: [
    { type: 'waist', date: '2026-10-10', value: 90, at: '2026-10-10T08:00' }, { type: 'waist', date: '2026-10-10', value: 89.5, at: '2026-10-10T20:00' },
    { type: 'waist', date: '2026-09-10', value: 92 }, { type: 'hips', date: '2026-10-01', value: 100 }] });
  assert.deepEqual(r.types.waist.points.map((p) => p.value), [92, 89.5]);
  assert.equal(r.types.waist.change, -2.5);
  assert.equal(r.types.hips.change, null);          // one reading is not a trend
  assert.equal(r.types.chest, undefined);           // nothing logged -> absent, not zero
});
test('note: waist down while scale flat', () => {
  const r = measureTrends({ weights: [{ date: '2026-09-10', weightKg: 80 }, { date: '2026-10-10', weightKg: 79.6 }], logs: [{ type: 'waist', date: '2026-09-10', value: 92 }, { type: 'waist', date: '2026-10-10', value: 90 }] });
  assert.match(r.note, /waist is down 2 cm/i); assert.ok(toneCheck(r.note).ok);
});
test('note: waist up is neutral, not shaming; no note without both series', () => {
  const up = measureTrends({ weights: [{ date: '2026-09-10', weightKg: 80 }, { date: '2026-10-10', weightKg: 80 }], logs: [{ type: 'waist', date: '2026-09-10', value: 90 }, { type: 'waist', date: '2026-10-10', value: 92 }] });
  assert.ok(up.note && toneCheck(up.note).ok && /same way each time/.test(up.note));
  assert.equal(measureTrends({ logs: [{ type: 'waist', date: '2026-09-10', value: 90 }, { type: 'waist', date: '2026-10-10', value: 88 }] }).note, null);
});
test('junk values are ignored', () => {
  const r = measureTrends({ weights: [{ date: '2026-10-01', weightKg: 'x' }], logs: [{ type: 'waist', date: '2026-10-01', value: 'abc' }] });
  assert.deepEqual(r.types, {}); assert.equal(r.weight.last, null);
});
