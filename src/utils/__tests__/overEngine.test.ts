import { analyseOverDays, walkKcal, OVER_RULES, type HistDay } from '../overEngine';

// Male, 80 kg, light activity, losing 0.5 kg/week: daily target is 1860 kcal (floor 1500).
const profile = { age: 30, sex: 'male', heightCm: 175, currentWeightKg: 80, activityLevel: 'light', goals: { targetWeightKg: 72, weeklyPaceKg: 0.5 } };
const TARGET = 1860;
const TODAY = '2026-10-28';
// Seven kcal values, oldest first, ending today (22nd..28th).
const week = (kcal: number[]): HistDay[] => kcal.map((calories, i) => ({ date: `2026-10-${22 + i}`, calories, caloriesBurned: 0 }));
const run = (kcal: number[], hour = 22, over: Partial<Parameters<typeof analyseOverDays>[0]> = {}) => analyseOverDays({ profile, history: week(kcal), today: TODAY, hour, ...over });

describe('analyseOverDays', () => {
  it('says nothing when everything is on budget', () => {
    const r = run([1860, 1800, 1900, 1860, 1850, 1860, 1870]);
    expect(r.tier).toBe('none');
    expect(r.advice).toBeNull();
  });

  it('treats a small overshoot as noise (within 8 % / 100 kcal)', () => expect(run([1860, 1860, 1860, 1860, 1860, 1860, 1990]).tier).toBe('none'));

  it('one heavy day gives a SMALL spread trim, never a full pay-back', () => {
    const r = run([1860, 1860, 1860, 1860, 1860, 1860, 2600]);
    expect(r.tier).toBe('single');
    expect(r.advice!.skipCut).toBe(false);
    expect(r.advice!.perDay).toBeLessThanOrEqual(220);
    expect(r.ledger.recovered).toBeLessThan(r.ledger.unpaid); // a share, not all
    expect(r.advice!.tomorrowTarget).toBe(TARGET - r.advice!.perDay);
    expect(r.advice!.todayTarget).toBe(TARGET); // today is already over: nothing to trim today
  });

  it('banks earlier lighter days: no cut when the week is still under budget', () => {
    const r = run([1500, 1500, 1500, 1500, 1600, 1500, 2500]);
    expect(r.advice!.skipCut).toBe(true);
    expect(r.plan).toHaveLength(0);
    expect(r.ledger.unpaid).toBe(0);
  });

  it('caps credit from very light days, so under-logging cannot hide a real surplus', () => {
    const r = run([700, 700, 700, 700, 700, 700, 3500]);
    const maxCredit = Math.round(OVER_RULES.creditCap * TARGET) * 6;
    expect(r.ledger.weekNet).toBeGreaterThan(3500 - TARGET - maxCredit - 1); // credit per light day is capped, not unlimited
  });

  it('does not treat unlogged days as zero-calorie days', () => {
    const r = run([0, 0, 0, 0, 1860, 1860, 2500]);
    expect(r.ledger.unloggedDays).toBe(4);
    expect(r.ledger.loggedDays).toBe(3);
    expect(r.ledger.confidence).toBe('low');
    expect(r.ledger.weekNet).toBe(640); // only the real over day counts; no phantom deficit from empty days
    expect(r.advice!.detail).toContain('no food logged');
  });

  it('detects a restrict -> overeat cycle and refuses to cut again', () => {
    const r = run([1860, 1860, 1860, 1860, 1860, 1000, 2900]);
    expect(r.cause).toBe('undereating_cycle');
    expect(r.advice!.skipCut).toBe(true);
    expect(r.advice!.headline).toMatch(/regular meals/);
  });

  it('several heavy days in a row: still capped, never below the floor, spread over days', () => {
    const r = run([1860, 1860, 1860, 1860, 3000, 3200, 3100]);
    expect(r.runDays).toBe(3);
    expect(['streak', 'week']).toContain(r.tier);
    expect(r.advice!.perDay).toBeLessThanOrEqual(250);
    expect(r.advice!.days).toBeLessThanOrEqual(5);
    r.plan.forEach((p) => expect(p.kcal).toBeGreaterThanOrEqual(r.floor));
    expect(r.ledger.leftover).toBeGreaterThan(0); // honest: not everything is paid back by trimming
    expect(r.ledger.delayDays).toBeGreaterThan(0);
  });

  it('a whole week over becomes a review: recommends an easier pace when the plan is aggressive', () => {
    const r = run([2900, 2800, 3000, 2800, 3200, 3000, 3300]);
    expect(r.tier).toBe('week');
    expect(r.needsEasierPace).toBe(true);
    expect(r.cause).toBe('pace_too_aggressive');
  });

  it('never trims when the target is already at the safe minimum', () => {
    const low = { ...profile, sex: 'female', heightCm: 150, currentWeightKg: 50, age: 45, activityLevel: 'sedentary', goals: { targetWeightKg: 45, weeklyPaceKg: 1 } };
    const r = analyseOverDays({ profile: low, history: week([1400, 1400, 1400, 1400, 1400, 1400, 2600]), today: TODAY, hour: 22 });
    expect(r.target).toBe(1200);
    expect(r.advice!.skipCut).toBe(true);
    expect(r.plan).toHaveLength(0);
  });

  it('does not tell someone eating for gain to cut', () => {
    const gain = { ...profile, goals: { targetWeightKg: 90, weeklyPaceKg: 0.3 } };
    const r = analyseOverDays({ profile: gain, history: week([2600, 2600, 2600, 2600, 2600, 2600, 3600]), today: TODAY, hour: 22 });
    expect(r.advice!.skipCut).toBe(true);
  });

  it('judges a day against its own budget: a workout day earns extra food', () => {
    const h = week([1860, 1860, 1860, 1860, 1860, 1860, 2400]);
    h[6] = { ...h[6], caloriesBurned: 900 }; // big activity beyond what the target assumes
    const r = analyseOverDays({ profile, history: h, today: TODAY, hour: 22 });
    expect(r.tier).toBe('none');
  });

  it('leaves today alone while it is still open and under budget, but plans around yesterday', () => {
    const r = run([1860, 1860, 1860, 1860, 1860, 3000, 400], 12, { eatenToday: 400 });
    expect(r.advice).not.toBeNull();
    expect(r.advice!.todayTarget).toBeLessThan(TARGET); // today still has room to be lighter
    expect(r.plan[0].date).toBe(TODAY);
  });

  it('starts the trim tomorrow when today already ate through the trimmed amount', () => {
    const r = run([1860, 1860, 1860, 1860, 1860, 3000, 1800], 19, { eatenToday: 1800 });
    expect(r.plan[0].date).toBe('2026-10-29');
  });

  it('keeps working with no profile (falls back to the saved goal / 1800)', () => {
    const r = analyseOverDays({ profile: null, history: week([1800, 1800, 1800, 1800, 1800, 1800, 2700]), today: TODAY, hour: 22 });
    expect(r.target).toBe(1800);
    expect(r.advice).not.toBeNull();
  });

  it('works across a month boundary', () => {
    const h: HistDay[] = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((date, i) => ({ date, calories: i === 6 ? 2700 : 1860 }));
    const r = analyseOverDays({ profile, history: h, today: '2026-11-05', hour: 22 });
    expect(r.ledger.loggedDays).toBe(7);
    expect(r.plan[0].date).toBe('2026-11-06');
  });
});

describe('walkKcal', () => {
  it('scales with body weight instead of a fixed range', () => {
    expect(walkKcal(80)).toBe(55); // 15 min at MET 3.5 beyond resting: 2.5 x 3.5 x 80 / 200 x 15 = 52.5 -> 55
    expect(walkKcal(55)).toBeLessThan(walkKcal(80));
    expect(walkKcal(null)).toBeGreaterThan(0);
  });
});
