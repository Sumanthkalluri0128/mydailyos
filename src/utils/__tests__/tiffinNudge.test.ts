import { planTiffinNudge, tiffinMinute, inQuiet } from '../tiffinNudge';

const Q = { start: '22:00', end: '07:00' };
const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m, 0, 0);

describe('tiffin reminder', () => {
  it('is off until switched on', () => {
    expect(planTiffinNudge(at(10), { enabled: false, time: '20:30', quiet: Q, plannedTomorrow: false })).toBeNull();
  });
  it('fires tonight at the chosen time', () => {
    const d = planTiffinNudge(at(10), { enabled: true, time: '20:30', quiet: Q, plannedTomorrow: false })!;
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([23, 20, 30]);
  });
  it('moves to tomorrow when the time has passed', () => {
    const d = planTiffinNudge(at(21), { enabled: true, time: '20:30', quiet: Q, plannedTomorrow: false })!;
    expect(d.getDate()).toBe(24);
  });
  it('skips tonight when tomorrow lunch is already planned', () => {
    const d = planTiffinNudge(at(10), { enabled: true, time: '20:30', quiet: Q, plannedTomorrow: true })!;
    expect(d.getDate()).toBe(24);
  });
  it('never lands inside quiet hours', () => {
    expect(inQuiet(23 * 60, Q)).toBe(true);
    expect(tiffinMinute('23:00', Q)).toBe(21 * 60 + 30);
    expect(tiffinMinute('20:30', Q)).toBe(20 * 60 + 30);
    expect(tiffinMinute('23:00', null)).toBe(23 * 60);
  });
});
