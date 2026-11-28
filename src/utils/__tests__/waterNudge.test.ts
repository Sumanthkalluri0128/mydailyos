import { planWaterNudges, remainingText, waterNudgeText } from '../waterNudge';

const at = (h: number, m = 0, day = 5) => new Date(2026, 9, day, h, m, 0, 0);
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const base = { totalMl: 500, goalMl: 3000, start: '08:00', end: '20:00', gapMin: 60, quiet: { start: '22:00', end: '07:00' }, maxPerDay: 20, days: 1 };

describe('planWaterNudges (remind only when an hour has passed without a log)', () => {
  it('nothing logged yet today: the first reminder is the window start, then every hour', () => {
    const out = planWaterNudges({ ...base, now: at(6, 30), lastLogAt: null });
    expect(out.map((n) => hm(n.at)).slice(0, 3)).toEqual(['08:00', '09:00', '10:00']);
    expect(out[out.length - 1] && hm(out[out.length - 1].at)).toBe('20:00');
  });

  it('after a log, the next reminder is exactly one gap later (not on a fixed clock)', () => {
    const out = planWaterNudges({ ...base, now: at(10, 20), lastLogAt: at(10, 20) });
    expect(out.map((n) => hm(n.at)).slice(0, 3)).toEqual(['11:20', '12:20', '13:20']);
  });

  it('logging again pushes the whole chain back: the old 11:20 reminder is gone', () => {
    const first = planWaterNudges({ ...base, now: at(10, 20), lastLogAt: at(10, 20) });
    const second = planWaterNudges({ ...base, now: at(11, 5), lastLogAt: at(11, 5) });
    expect(hm(first[0].at)).toBe('11:20');
    expect(hm(second[0].at)).toBe('12:05');
  });

  it('opening the app after a long gap continues the cadence instead of buzzing immediately', () => {
    const out = planWaterNudges({ ...base, now: at(13, 40), lastLogAt: at(10, 0) });
    expect(hm(out[0].at)).toBe('14:00'); // 11:00 and 13:00 slots already passed; next on the cadence
    expect(out[0].at.getTime()).toBeGreaterThan(at(13, 40).getTime());
  });

  it('a log from yesterday does not anchor today', () => {
    const out = planWaterNudges({ ...base, now: at(9, 30), lastLogAt: at(22, 0, 4) });
    expect(hm(out[0].at)).toBe('10:00');
  });

  it('stops for the day once the goal is met (and resumes tomorrow with the default cadence)', () => {
    const out = planWaterNudges({ ...base, days: 2, now: at(15), lastLogAt: at(15), totalMl: 3200 });
    expect(out.every((n) => n.dayIndex === 1)).toBe(true);
    expect(hm(out[0].at)).toBe('08:00');
  });

  it('never fires in quiet hours or after the window', () => {
    const out = planWaterNudges({ ...base, start: '06:00', end: '23:00', now: at(5), lastLogAt: null });
    for (const n of out) { const m = n.at.getHours() * 60 + n.at.getMinutes(); expect(m >= 7 * 60 && m < 22 * 60).toBe(true); }
  });

  it('respects the daily cap by spreading reminders across the day', () => {
    const out = planWaterNudges({ ...base, maxPerDay: 4, now: at(6), lastLogAt: null });
    expect(out).toHaveLength(4);
    expect(out[0].at.getHours()).toBeLessThan(12);
    expect(out[3].at.getHours()).toBeGreaterThanOrEqual(15);
  });

  it('supports other gaps (90 min) and shifts off a clashing reminder', () => {
    const out = planWaterNudges({ ...base, gapMin: 90, now: at(8, 5), lastLogAt: at(8, 0), avoid: [9 * 60 + 30] });
    expect(hm(out[0].at)).toBe('09:35'); // 09:30 collides with another reminder, so it shifts 5 min
  });

  it('plans tomorrow too, and every reminder is in the future', () => {
    const now = at(12);
    const out = planWaterNudges({ ...base, days: 2, now, lastLogAt: at(11) });
    expect(out.some((n) => n.dayIndex === 1)).toBe(true);
    expect(out.every((n) => n.at.getTime() > now.getTime())).toBe(true);
  });

  it('carries the remaining amount for the notification text', () => {
    const [n] = planWaterNudges({ ...base, now: at(10), lastLogAt: at(10) });
    expect(n.remainingMl).toBe(2500);
    expect(remainingText(2500)).toBe('2.5 L');
    expect(remainingText(450)).toBe('450 ml');
    expect(waterNudgeText(2500, 60).body).toContain('No water logged in the last hour');
  });
});
