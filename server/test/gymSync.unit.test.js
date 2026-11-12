const test = require('node:test');
const assert = require('node:assert');
const { normalizeEntry, planSync, clientIdFor, activityNameFor } = require('../lib/gymSync');

const entry = (o = {}) => ({ id: 'e-abc12', date: '2026-11-12', name: 'Bench Press', cat: 'chest', unit: 'reps', sets: [{ kg: 40, reps: 10 }, { kg: 40, reps: 8 }], minutes: 6, kcal: 31, bodyKg: 70, ...o });

test('a gym entry becomes one activity row with the device minutes and kcal', () => {
  const n = normalizeEntry(entry());
  assert.strictEqual(n.clientId, 'gym-e-abc12');
  assert.strictEqual(n.durationMinutes, 6); assert.strictEqual(n.caloriesBurned, 31);
  assert.deepStrictEqual(n.sets, [{ reps: 10, weightKg: 40 }, { reps: 8, weightKg: 40 }]);
  assert.strictEqual(n.catalogueName, 'Strength Training'); assert.strictEqual(n.activityName, 'Bench Press');
});

test('the same gym entry always maps to the same client id (so editing updates, never duplicates)', () => {
  assert.strictEqual(normalizeEntry(entry()).clientId, normalizeEntry(entry({ kcal: 99 })).clientId);
  assert.strictEqual(clientIdFor('x1'), 'gym-x1');
});

test('holds and cardio minutes keep their numbers in the note, not in reps x weight', () => {
  const plank = normalizeEntry(entry({ name: 'Plank', cat: 'core', unit: 'sec', sets: [{ kg: 0, reps: 45 }, { kg: 0, reps: 60 }] }));
  assert.deepStrictEqual(plank.sets, []); assert.match(plank.notes, /45 \/ 60 sec/);
  const run = normalizeEntry(entry({ name: 'Treadmill', cat: 'cardio', unit: 'min', sets: [{ kg: 0, reps: 20 }] }));
  assert.strictEqual(run.catalogueName, 'Other workout'); assert.strictEqual(activityNameFor({ unit: 'min', cat: 'x' }), 'Other workout');
});

test('bad entries are dropped and numbers are clamped', () => {
  for (const bad of [null, {}, entry({ id: 'bad id!' }), entry({ date: '12/11/2026' }), entry({ sets: [] }), entry({ sets: [{ kg: 5, reps: 0 }] })]) assert.strictEqual(normalizeEntry(bad), null);
  const big = normalizeEntry(entry({ kcal: 1e9, minutes: 99999 }));
  assert.strictEqual(big.caloriesBurned, 20000); assert.strictEqual(big.durationMinutes, 1440);
  assert.strictEqual(normalizeEntry(entry({ minutes: 0 })).durationMinutes, 3); // no minutes sent: ~90 s a set
});

test('a sync request keeps only valid entries and ids', () => {
  const p = planSync({ entries: [entry(), { nope: 1 }], removeIds: ['e-1', 'bad id', 5] });
  assert.strictEqual(p.entries.length, 1); assert.deepStrictEqual(p.removeIds, ['gym-e-1', 'gym-5']);
  assert.deepStrictEqual(planSync(null), { entries: [], removeIds: [] });
});

test('a treadmill set keeps its pace and distance in the note, and ignores a silly pace', () => {
  const run = normalizeEntry(entry({ name: 'Treadmill', cat: 'cardio', unit: 'min', sets: [{ kg: 0, reps: 30, pace: 6.5 }] }));
  assert.deepStrictEqual(run.sets, []); assert.match(run.notes, /30 min @ 6:30\/km \(4\.62 km\)/);
  const bad = normalizeEntry(entry({ name: 'Treadmill', cat: 'cardio', unit: 'min', sets: [{ kg: 0, reps: 20, pace: 0.5 }] }));
  assert.match(bad.notes, /^20 min/); assert.doesNotMatch(bad.notes, /km/);
});
