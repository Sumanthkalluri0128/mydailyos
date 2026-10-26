const test = require('node:test');
const assert = require('node:assert');
const H = require('../lib/hcImport');
const { ACTIVITIES } = require('../lib/activityCatalogue');

const sess = (over = {}) => ({ id: 'abc-1', type: 56, startTime: '2026-10-26T01:00:00.000Z', endTime: '2026-10-26T01:30:00.000Z', date: '2026-10-26', app: 'com.sec.android.app.shealth', avgHr: 141, maxHr: 170, title: 'Morning run', ...over });

test('every mapped exercise type points at a real catalogue activity', () => {
  const names = new Set(ACTIVITIES.map((a) => a.name));
  for (const [t, n] of Object.entries(H.TYPE_TO_ACTIVITY)) assert.ok(names.has(n), `${t} -> ${n}`);
  assert.ok(names.has(H.FALLBACK));
  assert.strictEqual(H.mapExercise(56), 'Running - Moderate');
  assert.strictEqual(H.mapExercise(70), 'Strength Training');
  assert.strictEqual(H.mapExercise(9999), 'Other workout');
});

test('a session is cleaned: minutes, source app, heart rate range', () => {
  const s = H.normalizeSession(sess());
  assert.strictEqual(s.durationMinutes, 30); assert.strictEqual(s.sourceApp, 'Samsung Health'); assert.strictEqual(s.clientId, 'hc:abc-1');
  assert.strictEqual(s.avgHeartRate, 141); assert.strictEqual(H.normalizeSession(sess({ avgHr: 400 })).avgHeartRate, null);
  assert.strictEqual(H.normalizeSession(sess({ app: 'com.unknown.app' })).sourceApp, 'com.unknown.app');
  for (const bad of [sess({ id: '' }), sess({ endTime: '2026-10-26T00:00:00Z' }), sess({ date: 'x' }), sess({ endTime: '2026-10-28T01:30:00Z' }), null]) assert.strictEqual(H.normalizeSession(bad), null);
});

test('duplicate protection: same session twice, same workout from two apps, and a repeat run', () => {
  const first = H.planImport([sess(), sess()], []);
  assert.strictEqual(first.fresh.length, 1); assert.strictEqual(first.skipped[0].reason, 'already-imported');
  const again = H.planImport([sess()], first.fresh);
  assert.strictEqual(again.fresh.length, 0); assert.strictEqual(again.skipped[0].reason, 'already-imported');
  const otherApp = H.planImport([sess({ id: 'watch-9', app: 'com.fitbit.FitbitMobile', startTime: '2026-10-26T01:02:00.000Z', endTime: '2026-10-26T01:31:00.000Z' })], first.fresh);
  assert.strictEqual(otherApp.skipped[0].reason, 'overlaps');
  const later = H.planImport([sess({ id: 'evening', startTime: '2026-10-26T12:00:00.000Z', endTime: '2026-10-26T12:20:00.000Z' })], first.fresh);
  assert.strictEqual(later.fresh.length, 1);
  assert.strictEqual(H.planImport([{ id: 'x' }], []).skipped[0].reason, 'invalid');
});

test('overlap ratio is measured against the shorter session', () => {
  const a = { startMs: 0, endMs: 60 * 60000 }, b = { startMs: 50 * 60000, endMs: 70 * 60000 };
  assert.strictEqual(H.overlapRatio(a, b), 0.5);
  assert.strictEqual(H.overlapRatio(a, { startMs: 61 * 60000, endMs: 70 * 60000 }), 0);
});
