import * as T from '../training';

describe('training maths (same as the server)', () => {
  it('1RM formulas', () => {
    expect(T.epley(100, 5)).toBe(116.7);
    expect(T.brzycki(100, 5)).toBe(112.5);
    expect(T.brzycki(100, 11)).toBe(null);
    expect(T.epley(100, 1)).toBe(100);
  });
  it('jump check asks but never blocks', () => {
    expect(T.checkJump(105, 100).needsConfirm).toBe(false);
    expect(T.checkJump(130, 100).needsConfirm).toBe(true);
    expect(T.checkJump(50, 0).needsConfirm).toBe(false);
  });
  it('plate calculator in kg and lb', () => {
    expect(T.plateCalc(100).perSide).toEqual([{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
    expect(T.plateCalc(135, { unit: 'lb' }).perSide).toEqual([{ plate: 45, count: 1 }]);
    expect(T.plateCalc(61, { plates: [10, 5] }).achieved).toBe(60);
    expect(T.plateCalc(15).achieved).toBe(20);
    expect(T.lbToKg(100)).toBe(45.4);
    expect(T.kgToLb(100)).toBe(220.5);
  });
  it('breathing phases and cues', () => {
    expect([0, 4, 6, 12, 16].map((s) => T.breathPhase(s).phase)).toEqual(['inhale', 'hold', 'exhale', 'inhale', 'hold']);
    expect(T.cueAt([{ atSec: 0, text: 'a' }, { atSec: 30, text: 'b' }], 31).text).toBe('b');
    expect(T.clock(65)).toBe('1:05');
  });
  it('workout mode prefills from last time and sends only finished sets', () => {
    const sets = T.planSets({ sets: 3, reps: 8 }, { sets: [{ reps: 10, weightKg: 40 }, { reps: 9, weightKg: 40 }] });
    expect(sets.map((s: any) => s.reps)).toEqual(['10', '9', '9']);
    sets[0].done = true;
    const r = T.toResults([{ name: 'Squat', sets }]);
    expect(r[0].sets).toEqual([{ reps: 10, weightKg: 40 }]);
  });
});
