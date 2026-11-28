import { FLOOR, intakeAdvice, targetSafety } from '../intakeSafety';

const base = { budget: 1500, target: 1500, sex: 'female', hour: 21 };

test('eating very little in the evening gives an alert with effects and steps', () => {
  const a = intakeAdvice({ ...base, eaten: 700 });
  expect(a[0].kind).toBe('low-day');
  expect(a[0].level).toBe('alert');
  expect(a[0].effects.length).toBeGreaterThan(2);
  expect(a[0].doNow.length).toBeGreaterThan(1);
});

test('nothing logged, or a low morning, is not an alert', () => {
  expect(intakeAdvice({ ...base, eaten: 0 })).toEqual([]);
  expect(intakeAdvice({ ...base, eaten: 300, hour: 12 })).toEqual([]);
});

test('three low days in a row is its own alert', () => {
  const a = intakeAdvice({ ...base, eaten: 1400, recentDays: [{ calories: 900 }, { calories: 1000 }, { calories: 950 }] });
  expect(a.map((x) => x.kind)).toContain('low-streak');
});

test('a heavy day explains the effect and spreads the extra without going under the floor', () => {
  const a = intakeAdvice({ ...base, eaten: 2300 });
  expect(a[0].kind).toBe('heavy-day');
  expect(a[0].next?.join(' ')).toMatch(/never below 1200/);
  expect(a[0].doNow.join(' ')).not.toMatch(/punish|cheat|guilt/i);
});

test('typed targets below the floor, deep deficits and fast paces are flagged with a safer way', () => {
  expect(targetSafety({ kcal: 1000, sex: 'female' })?.level).toBe('alert');
  expect(targetSafety({ kcal: 1300, tdee: 2200, sex: 'female' })?.fix.length).toBeGreaterThan(0);
  expect(targetSafety({ weightKg: 70, weeklyPaceKg: 0.9 })?.title).toMatch(/pace/);
  expect(targetSafety({ kcal: 1700, tdee: 2200, sex: 'female', weightKg: 70, weeklyPaceKg: 0.5 })).toBeNull();
  expect(FLOOR('male')).toBe(1500);
});
