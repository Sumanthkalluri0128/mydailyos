import { buildInsights } from '../insights';
import { buildNudges, suggestFoods } from '../suggest';
import { macroTargets, stepCalories, weeksToGoal, expectedEnergy } from '../energy';

const day = (i: number, o: any = {}) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, calories: 1800, protein: 120, waterMl: 2800, exerciseMinutes: 30, caloriesBurned: 300, steps: 9000, ...o });

describe('insights', () => {
  it('asks for more data when there is little', () => {
    expect(buildInsights([day(0), day(1)], {})[0].title).toMatch(/Keep logging/);
  });
  it('praises consistency and on-target calories', () => {
    const days = Array.from({ length: 7 }, (_, i) => day(i));
    const out = buildInsights(days, { calories: 1800, protein: 120, waterMl: 2800, steps: 8000, exerciseMinutes: 30 });
    expect(out.some((i) => i.tone === 'good' && /Calories on target/.test(i.title))).toBe(true);
    expect(out.some((i) => /Logged 7 of 7/.test(i.title))).toBe(true);
  });
  it('flags low protein, low water and being over the calorie goal', () => {
    const days = Array.from({ length: 7 }, (_, i) => day(i, { calories: 2600, protein: 40, waterMl: 500 }));
    const out = buildInsights(days, { calories: 1800, protein: 120, waterMl: 2800 });
    expect(out.some((i) => /over your goal/.test(i.title))).toBe(true);
    expect(out.some((i) => /Protein is low/.test(i.title))).toBe(true);
    expect(out.some((i) => /Drink more water/.test(i.title))).toBe(true);
  });
});

describe('suggestions and nudges', () => {
  const foods = [
    { _id: 'a', name: 'Chips', calories: 150, protein: 2, servingSize: 28, servingUnit: 'g' },
    { _id: 'b', name: 'Boiled egg', calories: 78, protein: 6.3, servingSize: 50, servingUnit: 'g' },
    { _id: 'c', name: 'Biryani', calories: 490, protein: 24, servingSize: 300, servingUnit: 'g' },
  ];
  it('never suggests something that does not fit and favours protein when it is short', () => {
    const s = suggestFoods(foods, 200, 30);
    expect(s.map((x) => x.food.name)).not.toContain('Biryani');
    expect(s[0].food.name).toBe('Boiled egg');
    expect(suggestFoods(foods, 10, 30)).toEqual([]);
  });
  it('nudges depend on time of day', () => {
    const base = { mealsLogged: {}, waterMl: 0, waterTarget: 2800, steps: 1000, stepsTarget: 10000, kcalLeft: 1500 };
    expect(buildNudges({ ...base, hour: 8 })).toEqual([]);
    expect(buildNudges({ ...base, hour: 15 }).map((n) => n.id)).toEqual(expect.arrayContaining(['breakfast', 'lunch', 'water']));
    expect(buildNudges({ ...base, hour: 18 }).length).toBeLessThanOrEqual(3);
    expect(buildNudges({ ...base, hour: 15, mealsLogged: { breakfast: true, lunch: true }, waterMl: 2800, steps: 10000 })).toEqual([]);
  });
});

describe('energy: pace, macros, steps', () => {
  const p = { age: 30, sex: 'male', heightCm: 175, currentWeightKg: 80, activityLevel: 'moderate' };
  it('a faster pace lowers the calorie target, but never below the safe floor', () => {
    const slow = expectedEnergy({ ...p, goals: { targetWeightKg: 70, weeklyPaceKg: 0.25 } })!;
    const fast = expectedEnergy({ ...p, goals: { targetWeightKg: 70, weeklyPaceKg: 1 } })!;
    expect(fast.calorieTarget).toBeLessThan(slow.calorieTarget);
    expect(fast.calorieTarget).toBeGreaterThanOrEqual(1500);
    const tiny = expectedEnergy({ age: 50, sex: 'female', heightCm: 150, currentWeightKg: 55, activityLevel: 'sedentary', goals: { targetWeightKg: 45, weeklyPaceKg: 1 } })!;
    expect(tiny.calorieTarget).toBe(1200);
    expect(tiny.atFloor).toBe(true);
  });
  it('macros add up to the calorie target', () => {
    const m = macroTargets(2000, 80, 'maintain');
    expect(m.protein).toBe(128);
    expect(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - 2000)).toBeLessThan(15);
  });
  it('weeks to goal and step calories', () => {
    expect(weeksToGoal(80, 70, 0.5)).toBe(20);
    expect(weeksToGoal(80, 80.2, 0.5)).toBeNull();
    expect(stepCalories(10000, 70)).toBe(350);
    expect(stepCalories(10000, 80)).toBe(400);
  });
});
