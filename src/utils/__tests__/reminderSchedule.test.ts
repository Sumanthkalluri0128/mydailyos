import {
  isValidTime, parseTime, parseLocalDate, toDateStr, expoWeekday, onceTarget, taskTarget,
  waterSlots, motivationDates, snoozeDate, nextMonthly, taskTriggers, taskFingerprint,
} from '../reminderSchedule';

describe('isValidTime / parseTime', () => {
  it('accepts valid 24h HH:mm', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('09:05')).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:05')).toBe(false);
    expect(isValidTime('12:60')).toBe(false);
    expect(isValidTime('')).toBe(false);
    expect(isValidTime('noon')).toBe(false);
  });
  it('parses hour/minute', () => {
    expect(parseTime('18:30')).toEqual({ hour: 18, minute: 30 });
    expect(parseTime('bad')).toEqual({ hour: 0, minute: 0 });
  });
});

describe('parseLocalDate / toDateStr', () => {
  it('round-trips without UTC shifting the day', () => {
    const d = parseLocalDate('2026-01-31');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(31);
    expect(toDateStr(d)).toBe('2026-01-31');
  });
  it('handles a leap day', () => {
    expect(toDateStr(parseLocalDate('2028-02-29'))).toBe('2028-02-29');
  });
});

describe('expoWeekday', () => {
  it('maps Sunday to 1 and Saturday to 7 (expo convention)', () => {
    expect(expoWeekday('2026-09-27')).toBe(1); // a Sunday
    expect(expoWeekday('2026-10-03')).toBe(7); // the following Saturday
    expect(expoWeekday('2026-09-30')).toBe(4); // Wednesday
  });
});

describe('onceTarget / taskTarget — past-date edge case', () => {
  const now = new Date(2026, 8, 30, 12, 0, 0); // Sep 30, 2026, 12:00 local
  it('returns null when the date+time is already in the past', () => {
    expect(onceTarget('2026-09-30', '09:00', now)).toBeNull();
    expect(taskTarget('2026-09-30', '09:00', 0, now)).toBeNull();
  });
  it('returns the target when it is still ahead today', () => {
    const t = onceTarget('2026-09-30', '18:00', now);
    expect(t).not.toBeNull();
    expect(t!.getHours()).toBe(18);
  });
  it('returns the target for a future date regardless of time', () => {
    expect(onceTarget('2026-10-01', '00:01', now)).not.toBeNull();
  });
  it('taskTarget applies a lead time and can push a "future" task into the past', () => {
    const target = taskTarget('2026-09-30', '12:05', 10, now); // 5 min from now minus 10 min lead = 5 min ago
    expect(target).toBeNull();
  });
  it('invalid time yields null', () => {
    expect(taskTarget('2026-09-30', '', 0, now)).toBeNull();
    expect(taskTarget('2026-09-30', '99:99', 0, now)).toBeNull();
  });
});

describe('waterSlots', () => {
  it('produces evenly spaced slots inclusive of both ends', () => {
    expect(waterSlots('08:00', '20:00', 2)).toEqual([
      { hour: 8, minute: 0 }, { hour: 10, minute: 0 }, { hour: 12, minute: 0 }, { hour: 14, minute: 0 },
      { hour: 16, minute: 0 }, { hour: 18, minute: 0 }, { hour: 20, minute: 0 },
    ]);
  });
  it('never produces a slot after the end time', () => {
    const slots = waterSlots('08:30', '20:00', 3);
    for (const s of slots) expect(s.hour * 60 + s.minute).toBeLessThanOrEqual(20 * 60);
    expect(slots[slots.length - 1]).toEqual({ hour: 17, minute: 30 });
  });
  it('returns an empty list when the window is inverted', () => {
    expect(waterSlots('20:00', '08:00', 2)).toEqual([]);
  });
});

describe('motivationDates', () => {
  it("skips today's slot once it has passed, keeps future days", () => {
    const now = new Date(2026, 8, 30, 10, 0, 0);
    const dates = motivationDates('08:00', 3, now); // today's 08:00 already passed
    expect(dates.map((d) => d.dayIndex)).toEqual([1, 2]);
  });
  it("keeps today's slot when it hasn't happened yet", () => {
    const now = new Date(2026, 8, 30, 6, 0, 0);
    const dates = motivationDates('08:00', 2, now);
    expect(dates.map((d) => d.dayIndex)).toEqual([0, 1]);
  });
});

describe('snoozeDate', () => {
  it('adds minutes and floors below 1', () => {
    const now = new Date(2026, 0, 1, 0, 0, 0);
    expect(snoozeDate(10, now).getTime() - now.getTime()).toBe(10 * 60000);
    expect(snoozeDate(0, now).getTime() - now.getTime()).toBe(60000); // clamped to at least 1 minute
  });
});

describe('nextMonthly — clamped month-end anchor (the classic drift bug)', () => {
  it('lands on Feb 28 for a Jan 31 anchor once January has passed, then back on Mar 31', () => {
    const afterJan = new Date(2027, 0, 31, 10, 0, 0); // Jan 31 already happened this month
    const feb = nextMonthly('2027-01-31', '09:00', afterJan);
    expect(feb!.getMonth()).toBe(1);
    expect(feb!.getDate()).toBe(28); // 2027 is not a leap year

    const afterFeb = new Date(2027, 1, 28, 10, 0, 0);
    const mar = nextMonthly('2027-01-31', '09:00', afterFeb);
    expect(mar!.getMonth()).toBe(2);
    expect(mar!.getDate()).toBe(31); // back to the 31st once the month has one
  });
  it('handles a leap-year February for a Jan 31 anchor', () => {
    const afterJan = new Date(2028, 0, 31, 10, 0, 0);
    const feb = nextMonthly('2028-01-31', '09:00', afterJan);
    expect(feb!.getDate()).toBe(29);
  });
  it('still fires this month when the anchor day has not happened yet', () => {
    const midJan = new Date(2027, 0, 15, 0, 0, 0);
    const jan = nextMonthly('2027-01-31', '09:00', midJan);
    expect(jan!.getMonth()).toBe(0);
    expect(jan!.getDate()).toBe(31);
  });
});

describe('taskTriggers', () => {
  const now = new Date(2026, 8, 30, 8, 0, 0); // Wed Sep 30, 2026, 08:00

  it('one-off (recurrence "none") in the future yields a single DATE trigger', () => {
    const t = taskTriggers('none', '2026-09-30', '18:00', 0, now);
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe('date');
  });
  it('one-off in the past yields nothing', () => {
    expect(taskTriggers('none', '2026-09-30', '07:00', 0, now)).toEqual([]);
  });
  it('no time set yields nothing, for any recurrence', () => {
    expect(taskTriggers('daily', '2026-09-30', '', 0, now)).toEqual([]);
  });
  it('daily yields one DAILY trigger at the given clock time', () => {
    const t = taskTriggers('daily', '2026-09-30', '07:30', 0, now);
    expect(t).toEqual([{ type: 'daily', hour: 7, minute: 30 }]);
  });
  it('weekdays yields five WEEKLY triggers, Monday through Friday', () => {
    const t = taskTriggers('weekdays', '2026-09-30', '09:00', 0, now);
    expect(t).toHaveLength(5);
    expect(t.map((x: any) => x.weekday).sort((a: number, b: number) => a - b)).toEqual([2, 3, 4, 5, 6]);
  });
  it('weekly anchors to the origin date\'s weekday (expo convention)', () => {
    // 2026-09-27 is a Sunday -> expo weekday 1
    const t = taskTriggers('weekly', '2026-09-27', '09:00', 0, now);
    expect(t).toEqual([{ type: 'weekly', weekday: 1, hour: 9, minute: 0 }]);
  });
  it('a lead time can shift a daily/weekly trigger to the previous day', () => {
    // 00:05 minus 10 minutes lead = 23:55 the day before; weekday must wrap back by one.
    const t = taskTriggers('weekly', '2026-09-27', '00:05', 10, now); // Sunday -> shifts to Saturday (7)
    expect(t).toEqual([{ type: 'weekly', weekday: 7, hour: 23, minute: 55 }]);
  });
  it('monthly resolves via nextMonthly and respects lead time', () => {
    const t = taskTriggers('monthly', '2026-09-30', '09:00', 15, now);
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe('date');
  });
});

describe('taskFingerprint', () => {
  it('changes when any relevant field changes, and only then', () => {
    const base = { title: 'Run', date: '2026-09-30', time: '07:00', recurrence: 'daily' };
    const fp = taskFingerprint(base, 0);
    expect(taskFingerprint({ ...base }, 0)).toBe(fp);
    expect(taskFingerprint({ ...base, title: 'Walk' }, 0)).not.toBe(fp);
    expect(taskFingerprint({ ...base, time: '07:05' }, 0)).not.toBe(fp);
    expect(taskFingerprint(base, 5)).not.toBe(fp);
  });
});
