import { windowSlots, countSlots, pickQuotes, MOTIVATION_QUOTES, nudgeContent, intervalLabel, budgetPlan, osNotificationLimit, dayOfYear } from '../reminderSchedule';

const fmt = (s: { hour: number; minute: number }[]) => s.map((x) => `${String(x.hour).padStart(2, '0')}:${String(x.minute).padStart(2, '0')}`);

describe('interval windows', () => {
  it('every hour between 09:00 and 12:00 includes both ends', () => {
    expect(fmt(windowSlots('09:00', '12:00', 60))).toEqual(['09:00', '10:00', '11:00', '12:00']);
  });
  it('every 2 hours never goes past the end time', () => {
    expect(fmt(windowSlots('09:00', '18:00', 120))).toEqual(['09:00', '11:00', '13:00', '15:00', '17:00']);
  });
  it('keeps the start minute and supports 30-minute steps', () => {
    expect(fmt(windowSlots('08:30', '10:00', 30))).toEqual(['08:30', '09:00', '09:30', '10:00']);
  });
  it('"once" gives exactly one slot at the start time (the old single-time behaviour)', () => {
    expect(fmt(windowSlots('08:30', '20:00', 0))).toEqual(['08:30']);
  });
  it('an end before the start gives nothing for interval modes', () => {
    expect(windowSlots('18:00', '09:00', 60)).toEqual([]);
  });
  it('counts slots', () => { expect(countSlots('08:00', '20:00', 60)).toBe(13); });
  it('labels intervals for the UI', () => {
    expect(intervalLabel(0)).toBe('once a day'); expect(intervalLabel(30)).toBe('every 30 min'); expect(intervalLabel(120)).toBe('every 2 hr');
  });
});

describe('motivation quotes', () => {
  it('a day never repeats a quote across slots, even with 13 hourly slots', () => {
    const q = pickQuotes(13, 200);
    expect(new Set(q).size).toBe(13);
  });
  it('different days put different quotes on the first slot', () => {
    const firsts = new Set([1, 2, 3, 4, 5, 6, 7].map((d) => pickQuotes(1, d)[0]));
    expect(firsts.size).toBeGreaterThan(4);
  });
  it('the pool is big enough to vary and every quote fits a notification', () => {
    expect(MOTIVATION_QUOTES.length).toBeGreaterThanOrEqual(30);
    expect(MOTIVATION_QUOTES.every((s) => s.length < 120)).toBe(true);
  });
  it('day of year is stable for a date', () => { expect(dayOfYear(new Date(2026, 0, 1))).toBe(1); expect(dayOfYear(new Date(2026, 9, 3))).toBe(276); });
});

describe('task nudges', () => {
  it('names the first open tasks and counts the rest', () => {
    expect(nudgeContent(['A', 'B', 'C', 'D', 'E'])).toEqual({ title: '✅ 5 tasks still open', body: 'A, B, C +2 more. Tap to knock one out.' });
  });
  it('singular wording and the empty state', () => {
    expect(nudgeContent(['Only']).title).toBe('✅ 1 task still open');
    expect(nudgeContent([]).title).toBe('✅ Plan your day');
  });
});

describe('notification budget', () => {
  it('iOS is capped below its 64-notification limit, Android has plenty', () => {
    expect(osNotificationLimit('ios')).toBeLessThan(64);
    expect(osNotificationLimit('android')).toBeGreaterThan(100);
  });
  it('per-task reminders get what the daily slots leave', () => {
    expect(budgetPlan(60, [13, 13, 13])).toEqual({ fixed: 39, taskAllowance: 21, overBy: 0 });
  });
  it('reports when the daily slots alone are over the limit', () => {
    expect(budgetPlan(60, [48, 48])).toEqual({ fixed: 96, taskAllowance: 0, overBy: 36 });
  });
});
