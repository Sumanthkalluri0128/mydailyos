import { patchRow } from '../logEditLocal';
import { editRequest } from '../logEdit';

const row = { _id: 'L1', activityName: 'Strength Training', date: '2026-11-23', durationMinutes: 60, caloriesBurned: 336, caloriesSource: 'estimated', notes: '', met: 5, weightKg: 80 };

describe('a logged workout right after an edit', () => {
  it('new minutes: the calories follow them (net: (MET-1) x 3.5 x kg / 200 per minute) and are estimated again', () => {
    const r = patchRow({ ...row, caloriesSource: 'manual', caloriesBurned: 410 }, { durationMinutes: 30 });
    expect(r.durationMinutes).toBe(30);
    expect(Math.round(r.caloriesBurned)).toBe(168);
    expect(r.caloriesSource).toBe('estimated');
  });
  it('calories typed by the person are kept and marked as entered by them', () => {
    const r = patchRow(row, { caloriesBurned: 250 });
    expect(r.caloriesBurned).toBe(250); expect(r.caloriesSource).toBe('manual'); expect(r.durationMinutes).toBe(60);
    const both = patchRow(row, { durationMinutes: 20, caloriesBurned: 100 });
    expect(both.caloriesBurned).toBe(100); expect(both.durationMinutes).toBe(20);
  });
  it('a note-only or day-only edit leaves the calories alone', () => {
    const r = patchRow({ ...row, caloriesSource: 'manual', caloriesBurned: 410 }, { notes: 'felt good', date: '2026-11-22' });
    expect(r.caloriesBurned).toBe(410); expect(r.caloriesSource).toBe('manual'); expect(r.notes).toBe('felt good'); expect(r.date).toBe('2026-11-22');
  });
  it('without the entry\'s MET and weight the calories are left for the server to settle', () => {
    const r = patchRow({ _id: 'x', durationMinutes: 60, caloriesBurned: 300 }, { durationMinutes: 30 });
    expect(r.durationMinutes).toBe(30); expect(r.caloriesBurned).toBe(300);
  });
  it('the row passed in is not changed', () => {
    const copy = { ...row }; patchRow(row, { durationMinutes: 10, notes: 'x' });
    expect(row).toEqual(copy);
  });
  it('works with what the shared edit builder produces (only changed fields)', () => {
    const q = editRequest({ durationMinutes: 60, caloriesBurned: 336, notes: '', date: '2026-11-23' }, { minutes: '45', kcal: '336', kcalTouched: false, notes: 'x', date: '2026-11-23' }, '2026-11-24');
    expect(q.ok && q.body).toEqual({ durationMinutes: 45, notes: 'x' });
    const r = patchRow(row, (q as any).body);
    expect(r.durationMinutes).toBe(45); expect(r.notes).toBe('x'); expect(Math.round(r.caloriesBurned)).toBe(252);
  });
});
