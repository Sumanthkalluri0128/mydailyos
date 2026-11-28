import { afterQuiet, inQuiet, planCoachNudge } from '../coachNudge';

const d = (h: number, m = 0) => new Date(2026, 10, 9, h, m, 0, 0);

describe('coach nudge', () => {
  it('reminds about a waiting plan change at 19:00, never at night', () => {
    expect(planCoachNudge({ now: d(10), nextKind: 'decision', headline: 'Step 1' })!.at.getHours()).toBe(19);
    const late = planCoachNudge({ now: d(22, 30), nextKind: 'decision', headline: 'Step 1' })!;
    expect(late.at.getDate()).toBe(10);
    expect(late.at.getHours()).toBe(9);
  });
  it('asks for the check-in only in the morning', () => {
    expect(planCoachNudge({ now: d(7, 30), nextKind: 'checkin' })).not.toBeNull();
    expect(planCoachNudge({ now: d(16), nextKind: 'checkin' })).toBeNull();
  });
  it('says nothing when nothing is waiting', () => {
    expect(planCoachNudge({ now: d(9), nextKind: 'steady' })).toBeNull();
    expect(planCoachNudge({ now: d(9), nextKind: 'train' })).toBeNull();
  });

  it('respects the person\'s own quiet hours, including windows that cross midnight', () => {
    const q = { start: '22:00', end: '07:00' };
    expect(inQuiet(d(23), q)).toBe(true);
    expect(inQuiet(d(6, 59), q)).toBe(true);
    expect(inQuiet(d(7), q)).toBe(false);
    expect(afterQuiet(d(23), q).getDate()).toBe(10);
    expect(afterQuiet(d(23), q).getHours()).toBe(7);
    // a 19:00 reminder for someone whose quiet hours start at 18:30 moves to the next morning
    const late = planCoachNudge({ now: d(10), nextKind: 'decision', headline: 'x', quiet: { start: '18:30', end: '08:00' } })!;
    expect(late.at.getDate()).toBe(10);
    expect(late.at.getHours()).toBe(8);
  });
  it('skips the morning check-in when quiet hours push it past midday', () => {
    expect(planCoachNudge({ now: d(7, 30), nextKind: 'checkin', quiet: { start: '06:00', end: '15:00' } })).toBeNull();
    expect(planCoachNudge({ now: d(7, 30), nextKind: 'checkin', quiet: null })).not.toBeNull();
  });
});
