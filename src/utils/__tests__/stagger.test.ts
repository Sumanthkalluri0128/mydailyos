import { staggerSlots, minGapBetweenGroups, windowSlots } from '../reminderSchedule';

describe('staggerSlots', () => {
  const groups = [
    { key: 'tasks', slots: windowSlots('09:00', '18:00', 120) },
    { key: 'water', slots: windowSlots('08:00', '20:00', 120) },
    { key: 'motivation', slots: windowSlots('09:00', '18:00', 120) },
  ];
  it('keeps different kinds of reminder at least 12 minutes apart', () => {
    const out = staggerSlots(groups, [{ hour: 10, minute: 0 }]);
    expect(minGapBetweenGroups(out)).toBeGreaterThanOrEqual(12);
  });
  it('never drops or reorders a group and keeps the first group untouched', () => {
    const out = staggerSlots(groups);
    expect(out.tasks).toEqual(groups[0].slots);
    expect(out.motivation).toHaveLength(groups[2].slots.length);
  });
});

import { limitSlots, inQuietHours } from '../reminderSchedule';
describe('quiet hours and cap', () => {
  it('handles overnight quiet windows', () => { expect(inQuietHours(23 * 60, '22:00', '07:00')).toBe(true); expect(inQuietHours(6 * 60, '22:00', '07:00')).toBe(true); expect(inQuietHours(12 * 60, '22:00', '07:00')).toBe(false); });
  it('drops quiet slots and caps the total, spread across the day', () => {
    const g = { water: windowSlots('06:00', '23:00', 60), tasks: windowSlots('09:00', '18:00', 60) };
    const out = limitSlots(g, { quiet: { start: '22:00', end: '07:00' }, cap: 6 });
    const all = [...out.water, ...out.tasks];
    expect(all.length).toBe(6);
    expect(all.every((s) => !inQuietHours(s.hour * 60 + s.minute, '22:00', '07:00'))).toBe(true);
    const mins = all.map((s) => s.hour * 60 + s.minute).sort((a, b) => a - b);
    expect(mins[mins.length - 1] - mins[0]).toBeGreaterThan(6 * 60);
  });
});
