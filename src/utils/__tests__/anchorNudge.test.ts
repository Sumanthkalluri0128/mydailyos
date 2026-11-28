import { planAnchors } from '../anchorNudge';

const Q = { start: '22:00', end: '07:00' };
const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m, 0, 0);
const hab = (id: string, time: string, extra: any = {}) => ({ id, name: `Habit ${id}`, anchorText: 'brushing my teeth', time, doneToday: false, ...extra });

describe('habit anchor reminders', () => {
  it('schedules only habits with an anchor and a valid time', () => {
    const out = planAnchors(at(6), [hab('a', '07:30'), hab('b', ''), hab('c', 'nope'), { ...hab('d', '08:00'), anchorText: '' }], { quiet: Q, maxPerDay: 3 });
    expect(out.map((n) => n.habitId)).toEqual(['a']);
    expect([out[0].at.getDate(), out[0].at.getHours(), out[0].at.getMinutes()]).toEqual([23, 7, 30]);
  });
  it('moves to tomorrow when the time has passed or the habit is already done', () => {
    expect(planAnchors(at(9), [hab('a', '07:30')], { quiet: Q, maxPerDay: 3 })[0].at.getDate()).toBe(24);
    expect(planAnchors(at(6), [hab('a', '07:30', { doneToday: true })], { quiet: Q, maxPerDay: 3 })[0].at.getDate()).toBe(24);
  });
  it('never lands inside quiet hours', () => {
    const n = planAnchors(at(6), [hab('a', '23:00'), hab('b', '03:00')], { quiet: Q, maxPerDay: 5 });
    for (const x of n) { const m = x.at.getHours() * 60 + x.at.getMinutes(); expect(m >= 22 * 60 || m < 7 * 60).toBe(false); }
    expect(planAnchors(at(6), [hab('a', '23:00')], { quiet: null, maxPerDay: 5 })[0].at.getHours()).toBe(23);
  });
  it('respects the daily cap by pushing extras to the next day', () => {
    const out = planAnchors(at(6), [hab('a', '07:00'), hab('b', '08:00'), hab('c', '09:00')], { quiet: Q, maxPerDay: 2 });
    const byDay = out.reduce((acc: Record<number, number>, n) => ({ ...acc, [n.at.getDate()]: (acc[n.at.getDate()] || 0) + 1 }), {});
    expect(Math.max(...Object.values(byDay))).toBeLessThanOrEqual(2);
    expect(out.length).toBe(3);
  });
  it('rough day lowers the cap to 2 and a cap of 0 sends nothing', () => {
    const hs = [hab('a', '07:00'), hab('b', '08:00'), hab('c', '09:00')];
    const out = planAnchors(at(6), hs, { quiet: Q, maxPerDay: 5, rough: true });
    expect(out.filter((n) => n.at.getDate() === 23).length).toBe(2);
    expect(planAnchors(at(6), hs, { quiet: Q, maxPerDay: 0 })).toEqual([]);
  });
});
