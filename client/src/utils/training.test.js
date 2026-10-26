import test from 'node:test';
import assert from 'node:assert';
import * as T from './training.js';

test('1RM formulas match the server', () => {
  assert.strictEqual(T.epley(100, 5), 116.7); assert.strictEqual(T.brzycki(100, 5), 112.5);
  assert.strictEqual(T.brzycki(100, 11), null); assert.strictEqual(T.epley(100, 1), 100);
  assert.match(T.FORMULAS.epley, /30/); assert.match(T.FORMULAS.brzycki, /37/);
});
test('jump check asks, never blocks', () => {
  assert.strictEqual(T.checkJump(105, 100).needsConfirm, false);
  assert.strictEqual(T.checkJump(130, 100).needsConfirm, true);
  assert.strictEqual(T.checkJump(50, 0).needsConfirm, false);
});
test('plate calculator kg and lb', () => {
  assert.deepStrictEqual(T.plateCalc(100).perSide, [{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
  assert.deepStrictEqual(T.plateCalc(135, { unit: 'lb' }).perSide, [{ plate: 45, count: 1 }]);
  const odd = T.plateCalc(61, { plates: [10, 5] });
  assert.strictEqual(odd.achieved, 60); assert.match(odd.note, /short/);
  assert.strictEqual(T.plateCalc(15).achieved, 20);
  assert.strictEqual(T.plateCalc(60, { barWeight: 15 }).bar, 15);
  assert.strictEqual(T.lbToKg(100), 45.4); assert.strictEqual(T.kgToLb(100), 220.5);
});
test('breathing phases and cues', () => {
  assert.deepStrictEqual([0, 4, 6, 12, 16].map((s) => T.breathPhase(s).phase), ['inhale', 'hold', 'exhale', 'inhale', 'hold']);
  assert.strictEqual(T.breathPhase(1).progress, 0.25);
  const cues = [{ atSec: 0, text: 'a' }, { atSec: 30, text: 'b' }];
  assert.strictEqual(T.cueAt(cues, 10).text, 'a'); assert.strictEqual(T.cueAt(cues, 30).text, 'b');
  assert.strictEqual(T.clock(65), '1:05');
});
test('workout mode prefills from last time and only sends finished sets', () => {
  const sets = T.planSets({ sets: 3, reps: 8 }, { sets: [{ reps: 10, weightKg: 40 }, { reps: 9, weightKg: 40 }] });
  assert.deepStrictEqual(sets.map((s) => s.reps), ['10', '9', '9']); assert.strictEqual(sets[0].kg, '40');
  const fresh = T.planSets({ targetSets: 2, targetReps: 12, targetWeightKg: 5 }, null);
  assert.deepStrictEqual(fresh.map((s) => [s.reps, s.kg]), [['12', '5'], ['12', '5']]);
  sets[0].done = true; sets[1].done = true; sets[1].reps = '0';
  const r = T.toResults([{ name: 'Squat', sets }, { name: 'Skipped', sets: T.planSets({}, null) }]);
  assert.strictEqual(r.length, 1); assert.deepStrictEqual(r[0].sets, [{ reps: 10, weightKg: 40 }]); assert.strictEqual(r[0].index, 0);
});
