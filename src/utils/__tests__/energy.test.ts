import { dailyTarget, dayBalance, estimateBurn, expectedEnergy, stepCalories, stepDistanceKm, waterTargetMl, macroTargets, limitTargets, weeksToGoal, SESSION_MET, sessionMet } from '../energy';
import fx from './energy-fixtures.json';

describe('waterTargetMl', () => {
  it('is ~35 ml per kg rounded to 50 ml', () => {
    expect(waterTargetMl(70)).toBe(2450);
    expect(waterTargetMl(82)).toBe(2850);
  });
  it('clamps to a sane range and handles missing weight', () => {
    expect(waterTargetMl(30)).toBe(1500);
    expect(waterTargetMl(200)).toBe(5000);
    expect(waterTargetMl(null)).toBeNull();
  });
});

describe('expectedEnergy', () => {
  const base = { age: 30, sex: 'male', heightCm: 175, currentWeightKg: 80, activityLevel: 'moderate' };
  it('returns null until weight, height and age are known', () => {
    expect(expectedEnergy({ ...base, currentWeightKg: null })).toBeNull();
    expect(expectedEnergy(null)).toBeNull();
  });
  it('eats less to lose and more to gain, relative to maintenance', () => {
    const lose = expectedEnergy({ ...base, goals: { targetWeightKg: 70 } })!;
    const keep = expectedEnergy({ ...base, goals: { targetWeightKg: 80 } })!;
    const gain = expectedEnergy({ ...base, goals: { targetWeightKg: 90 } })!;
    expect(lose.direction).toBe('lose');
    expect(lose.calorieTarget).toBeLessThan(keep.calorieTarget);
    expect(gain.calorieTarget).toBeGreaterThan(keep.calorieTarget);
    expect(keep.calorieTarget).toBeCloseTo(keep.tdee, -2);
  });
});

describe('shared fixtures (identical to the server and the website)', () => {
  for (const c of fx.plans) {
    it(`plan ${c.name}`, () => {
      const got: any = expectedEnergy(c.profile as any);
      for (const [k, v] of Object.entries(c.expect)) expect(got[k]).toBe(v);
    });
  }
  for (const c of fx.targets) it(`target: ${c.name}`, () => expect(dailyTarget(c.profile as any)).toBe(c.expect));
  for (const c of fx.balances) {
    it(`balance: ${c.name}`, () => {
      const got: any = dayBalance((fx.plans as any)[c.plan].profile, c.day);
      for (const [k, v] of Object.entries(c.expect)) expect(got[k]).toBe(v);
    });
  }
  it(`balance: ${fx.balanceWithoutPlan.name}`, () => {
    const got: any = dayBalance(fx.balanceWithoutPlan.profile as any, fx.balanceWithoutPlan.day);
    for (const [k, v] of Object.entries(fx.balanceWithoutPlan.expect)) expect(got[k]).toBe(v);
  });
  for (const c of fx.steps) it(`steps ${c.steps} @ ${c.weightKg}kg`, () => { expect(stepCalories(c.steps, c.weightKg)).toBe(c.kcal); expect(stepDistanceKm(c.steps)).toBe(c.km); });
  for (const c of fx.water) it(`water ${c.weightKg}kg`, () => expect(waterTargetMl(c.weightKg)).toBe(c.ml));
});

describe('dayBalance', () => {
  const p = { age: 30, sex: 'male', heightCm: 175, currentWeightKg: 80, activityLevel: 'moderate', goals: { targetWeightKg: 72 } };
  it('does not give extra food for activity the target already assumes', () => {
    const b = dayBalance(p, { eaten: 1500, workout: 0, steps: 350 });
    expect(b.bonus).toBe(0);
    expect(b.budget).toBe(b.target);
  });
  it('gives extra food only for 70% of the part beyond that baseline (devices over-count)', () => {
    const b = dayBalance(p, { eaten: 1500, workout: 500, steps: 400 }); // 900 burned, baseline 612
    expect(b.bonus).toBe(202);                 // 70% of the 288 kcal above the baseline
    expect(b.budget).toBe(b.target + 202);
  });
  it('without a plan nothing is awarded and the saved goal is the target', () => {
    const b = dayBalance({ goals: { calorieTarget: 2000 } }, { eaten: 500, workout: 400, steps: 300 });
    expect(b.hasPlan).toBe(false);
    expect(b.budget).toBe(2000);
    expect(b.net).toBeNull();
  });
});

describe('macro and limit targets (shared fixtures)', () => {
  for (const c of (fx as any).macros) it(c.name, () => expect(macroTargets(c.calories, c.weightKg, c.direction, c.override)).toEqual(c.expect));
  for (const c of (fx as any).limits) it(`limits at ${c.calories} kcal`, () => expect(limitTargets(c.calories)).toEqual(c.expect));
});

describe('estimateBurn', () => {
  it('counts only what the exercise burns: (MET - 1) x 3.5 x kg / 200 per minute (same as the server)', () => {
    expect(estimateBurn(8, 70, 30)).toBeCloseTo(257.25, 5); // 7 x 3.5 x 70 / 200 x 30
    expect(estimateBurn(5, 80, 60)).toBe(336);
    expect(estimateBurn(1, 80, 60)).toBe(0);               // lying still burns nothing extra
    expect(estimateBurn(0.5, 80, 60)).toBe(0);             // never negative
  });
  it('session types share one MET table; the phone\'s "active" means recovery', () => {
    expect(SESSION_MET).toEqual({ strength: 5, conditioning: 6, recovery: 3.5, rest: 2.5 });
    expect(sessionMet('active')).toBe(3.5);
    expect(sessionMet('nonsense')).toBe(5);
  });
});
