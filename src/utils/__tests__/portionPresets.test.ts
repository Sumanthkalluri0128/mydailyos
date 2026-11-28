jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
import { bump, usual, fracLabel, isHousehold, foodKey, MIN_USES } from '../portionPresets';

describe('portion presets', () => {
  it('offers an amount only after it was used twice', () => {
    let d = bump({}, 'roti', 1.5);
    expect(usual(d, 'roti')).toBeNull();
    d = bump(d, 'roti', 1.5);
    expect(MIN_USES).toBe(2);
    expect(usual(d, 'roti')).toBe(1.5);
  });
  it('most-used wins, ties go to the latest, bump never mutates', () => {
    const a = bump(bump(bump({}, 'rice', 1), 'rice', 1), 'rice', 2);
    const b = bump(a, 'rice', 2);
    expect(usual(a, 'rice')).toBe(1);
    expect(usual(b, 'rice')).toBe(2);
    expect(a.rice.n).toEqual({ 1: 2, 2: 1 });
  });
  it('ignores bad input', () => {
    expect(bump({}, '', 1)).toEqual({});
    expect(bump({}, 'x', 0)).toEqual({});
  });
  it('household units and labels', () => {
    expect(isHousehold('roti')).toBe(true);
    expect(isHousehold('g')).toBe(false);
    expect(fracLabel(1.5)).toBe('1½');
    expect(fracLabel(2)).toBe('2');
    expect(foodKey(null, ' Dal Tadka ')).toBe('dal tadka');
  });
});
