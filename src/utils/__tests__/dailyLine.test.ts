import { QUOTES, dailyLine, dayNumber } from '../dailyLine';

test('the same line all day, whatever the time', () => {
  expect(dailyLine(new Date(2026, 9, 20, 0, 1))).toBe(dailyLine(new Date(2026, 9, 20, 23, 59)));
});
test('a different line on consecutive days, cycling through every quote', () => {
  const seen = new Set<string>();
  let prev = '';
  for (let i = 0; i < QUOTES.length; i++) { const l = dailyLine(new Date(2026, 0, 1 + i)); expect(l).not.toBe(prev); prev = l; seen.add(l); }
  expect(seen.size).toBe(QUOTES.length);
});
test('day number follows the local calendar date', () => {
  expect(dayNumber(new Date(2026, 9, 21)) - dayNumber(new Date(2026, 9, 20))).toBe(1);
});
