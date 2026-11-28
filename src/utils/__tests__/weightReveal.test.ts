import { REVEAL_MS, a11yText, decoy, hideWeight, isWeightRevealed, revealWeight, rollText, runs, subscribeWeight, toggleWeight } from '../weightReveal';

beforeEach(() => { jest.useFakeTimers(); hideWeight(); });
afterEach(() => { hideWeight(); jest.useRealTimers(); });

test('weight is blurred by default on every load', () => {
  expect(isWeightRevealed()).toBe(false);
});

test('revealing shows weight everywhere, then it re-blurs by itself after about 8 seconds', () => {
  expect(REVEAL_MS).toBe(8000);
  revealWeight();
  expect(isWeightRevealed()).toBe(true);
  jest.advanceTimersByTime(7999);
  expect(isWeightRevealed()).toBe(true);
  jest.advanceTimersByTime(2);
  expect(isWeightRevealed()).toBe(false);
});

test('tapping again hides straight away and cancels the timer', () => {
  expect(toggleWeight()).toBe(true);
  expect(toggleWeight()).toBe(false);
  jest.advanceTimersByTime(20000);
  expect(isWeightRevealed()).toBe(false);
});

test('a second reveal restarts the 8 second window', () => {
  revealWeight();
  jest.advanceTimersByTime(5000);
  revealWeight();
  jest.advanceTimersByTime(5000);
  expect(isWeightRevealed()).toBe(true);
  jest.advanceTimersByTime(3001);
  expect(isWeightRevealed()).toBe(false);
});

test('leaving the screen (hideWeight) blurs again and subscribers hear about it once', () => {
  const calls: boolean[] = [];
  const off = subscribeWeight(() => calls.push(isWeightRevealed()));
  revealWeight(); revealWeight(); hideWeight(); hideWeight();
  off();
  expect(calls).toEqual([true, false]);
});

test('the hidden state never contains the real digits', () => {
  expect(decoy('80.7 kg')).toBe('88.8 kg');
  expect(decoy('5.2 kg to go · target 76.0 kg')).toBe('8.8 kg to go · target 88.8 kg');
  expect(decoy('80.7 kg')).not.toMatch(/[0-79]/);
});

test('screen readers get no number until it is revealed', () => {
  expect(a11yText('80.7 kg', false)).toBe('Weight hidden');
  expect(a11yText('80.7 kg', true)).toBe('80.7 kg');
});

test('the roll-up starts below the real value and lands exactly on it, keeping decimals', () => {
  expect(rollText('80.7 kg', 0, 79.9)).toBe('79.9 kg');
  expect(rollText('80.7 kg', 1, 79.9)).toBe('80.7 kg');
  const mid = parseFloat(rollText('80.7 kg', 0.5, 79.9));
  expect(mid).toBeGreaterThan(79.9); expect(mid).toBeLessThan(80.7);
  expect(parseFloat(rollText('80.7 kg', 0))).toBeCloseTo(80.7 * 0.92, 1);
  expect(rollText('5.2 kg to go · target 76.0 kg', 1)).toBe('5.2 kg to go · target 76.0 kg');
});

test('runs split numbers from the words around them so only digits are blurred', () => {
  expect(runs('5.2 kg to go')).toEqual([{ t: '5.2', num: true }, { t: ' kg to go', num: false }]);
  expect(runs('no digits')).toEqual([{ t: 'no digits', num: false }]);
});
