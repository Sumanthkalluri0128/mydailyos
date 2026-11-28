import { planMedNudges, medText } from '../medNudge';

const Q = { start: '22:00', end: '07:00' };
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0, 0);
const med = (o: any = {}) => ({ id: 'm1', name: 'Vitamin D', dose: '1 tablet', times: ['08:00', '20:00'], days: [], ...o });

describe('medicine reminders', () => {
  it('plans what is left today, then tomorrow', () => {
    const r = planMedNudges(at(25, 9), [med()], { quiet: Q });
    expect(r.map((x) => [x.at.getDate(), x.at.getHours()])).toEqual([[25, 20], [26, 8], [26, 20]]);
  });
  it('never rings inside quiet hours: moves to the end of quiet time', () => {
    const r = planMedNudges(at(25, 6), [med({ times: ['06:30', '23:00'] })], { quiet: Q, daysAhead: 1 });
    expect(r.map((x) => [x.at.getDate(), x.at.getHours(), x.at.getMinutes(), x.shifted])).toEqual([[25, 7, 0, true], [26, 7, 0, true]]);
    for (const x of planMedNudges(at(25, 0, 5), [med({ times: ['06:30', '23:00', '12:00'] })], { quiet: Q, daysAhead: 2 })) {
      const m = x.at.getHours() * 60 + x.at.getMinutes();
      expect(m >= 7 * 60 && m < 22 * 60).toBe(true);
    }
  });
  it('quiet hours switched off means exact times', () => {
    const r = planMedNudges(at(25, 0, 5), [med({ times: ['23:00'] })], { quiet: null, daysAhead: 1 });
    expect(r[0].at.getHours()).toBe(23);
  });
  it('skips taken doses, other weekdays and inactive items', () => {
    expect(planMedNudges(at(25, 9), [med()], { quiet: Q, daysAhead: 1, taken: new Set(['2026-10-25|m1|20:00']) }).length).toBe(0);
    expect(planMedNudges(at(25, 9), [med({ days: [1] })], { quiet: Q, daysAhead: 1 }).length).toBe(0);   // 25 Oct 2026 is a Sunday
    expect(planMedNudges(at(25, 9), [med({ active: false })], { quiet: Q }).length).toBe(0);
  });
  it('text has no medical claims', () => {
    const t = medText(planMedNudges(at(25, 9), [med()], { quiet: Q })[0]);
    expect(t.body).toBe('Vitamin D · 1 tablet');
  });
  it('two doses of one medicine pushed onto the same minute by quiet hours ring once, and cover both doses', () => {
    const r = planMedNudges(at(25, 0, 5), [med({ times: ['06:00', '06:30'] })], { quiet: Q, daysAhead: 1 });
    expect(r).toHaveLength(1);
    expect(r[0].doses.map((d) => d.time)).toEqual(['06:00', '06:30']);
  });
  it('a taken dose is not part of the merged ring', () => {
    const r = planMedNudges(at(25, 0, 5), [med({ times: ['06:00', '06:30'] })], { quiet: Q, daysAhead: 1, taken: new Set(['2026-10-25|m1|06:00']) });
    expect(r).toHaveLength(1);
    expect(r[0].doses.map((d) => d.time)).toEqual(['06:30']);
  });
  it('ticking the first dose leaves only the second dose its own reminder', () => {
    const r = planMedNudges(at(25, 5), [med({ times: ['08:00', '20:00'] })], { quiet: Q, daysAhead: 1, taken: new Set(['2026-10-25|m1|08:00']) });
    expect(r.map((x) => [x.at.getHours(), x.doses[0].date, x.doses[0].time])).toEqual([[20, '2026-10-25', '20:00']]);
  });
  it('each ring carries the day and time of its dose, for the Taken button', () => {
    const r = planMedNudges(at(25, 9), [med()], { quiet: Q });
    expect(r[0].doses).toEqual([{ date: '2026-10-25', time: '20:00' }]);
    expect(r[1].doses).toEqual([{ date: '2026-10-26', time: '08:00' }]);
  });
});
