import { planMealNudges, DEFAULT_MEAL_TIMES } from '../mealNudge';

const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m, 0, 0); // 5 Oct 2026
const firsts = (out: ReturnType<typeof planMealNudges>) => out.filter((n) => !n.followUp);

describe('planMealNudges', () => {
  it('schedules only meals whose time is still ahead today, plus the next days (snacks are off by default)', () => {
    const out = firsts(planMealNudges(at(12), DEFAULT_MEAL_TIMES, [], 3));
    expect(out.filter((n) => n.at.getDate() === 5).map((n) => n.meal)).toEqual(['lunch', 'dinner']);
    expect(out.filter((n) => n.at.getDate() === 6)).toHaveLength(3);
    expect(out.filter((n) => n.at.getDate() === 7)).toHaveLength(3);
  });

  it('skips today\'s nudge for a meal that is already logged, but keeps tomorrow\'s', () => {
    const out = firsts(planMealNudges(at(8), DEFAULT_MEAL_TIMES, ['lunch']));
    expect(out.filter((n) => n.at.getDate() === 5).map((n) => n.meal)).toEqual(['breakfast', 'dinner']);
    expect(out.some((n) => n.meal === 'lunch' && n.at.getDate() === 6)).toBe(true);
  });

  it('a logged meal also drops its follow-up, so nothing fires for a meal you already logged', () => {
    const out = planMealNudges(at(8), DEFAULT_MEAL_TIMES, ['lunch']);
    expect(out.filter((n) => n.meal === 'lunch' && n.at.getDate() === 5)).toEqual([]);
  });

  it('a skipped meal is left alone today only', () => {
    const out = planMealNudges(at(8), DEFAULT_MEAL_TIMES, [], 2, { skipped: ['dinner'] });
    expect(out.some((n) => n.meal === 'dinner' && n.at.getDate() === 5)).toBe(false);
    expect(out.some((n) => n.meal === 'dinner' && n.at.getDate() === 6)).toBe(true);
  });

  it('each meal can be switched on or off on its own, including snacks', () => {
    const out = planMealNudges(at(8), DEFAULT_MEAL_TIMES, [], 1, { on: { breakfast: false, snacks: true }, followUpMin: 0 });
    expect(out.map((n) => n.meal)).toEqual(['lunch', 'snacks', 'dinner'].sort((a, b) => DEFAULT_MEAL_TIMES[a as 'lunch'].localeCompare(DEFAULT_MEAL_TIMES[b as 'lunch'])));
  });

  it('adds one follow-up after the first nudge when the meal is still missing, and none when disabled', () => {
    const out = planMealNudges(at(8), DEFAULT_MEAL_TIMES, [], 1, { followUpMin: 45 });
    const lunch = out.filter((n) => n.meal === 'lunch');
    expect(lunch.map((n) => [n.followUp, n.at.getHours(), n.at.getMinutes()])).toEqual([[false, 14, 30], [true, 15, 15]]);
    expect(planMealNudges(at(8), DEFAULT_MEAL_TIMES, [], 1, { followUpMin: 0 }).some((n) => n.followUp)).toBe(false);
  });

  it('if the first nudge already passed but the follow-up is ahead, only the follow-up is kept', () => {
    const out = planMealNudges(at(14, 40), DEFAULT_MEAL_TIMES, [], 1);
    expect(out.filter((n) => n.meal === 'lunch').map((n) => n.followUp)).toEqual([true]);
  });

  it('a late follow-up never spills into the next day', () => {
    const out = planMealNudges(at(8), { ...DEFAULT_MEAL_TIMES, dinner: '23:30' }, [], 1);
    expect(out.some((n) => n.meal === 'dinner' && n.followUp)).toBe(false);
  });

  it('returns results in time order and never in the past', () => {
    const now = at(15);
    const out = planMealNudges(now, DEFAULT_MEAL_TIMES, []);
    expect(out.every((n) => n.at.getTime() > now.getTime())).toBe(true);
    expect([...out].sort((a, b) => a.at.getTime() - b.at.getTime())).toEqual(out);
  });
});
