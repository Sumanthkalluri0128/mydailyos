import { checkinItems, shouldShow, parseGrams, proteinKcal } from '../dailyCheckin';

const base = { hour: 9, weighedToday: false, proteinG: 0, proteinTarget: 139, waterMl: 0, waterTargetMl: 3000 };

describe('dailyCheckin', () => {
  it('morning: only the weigh-in is asked for', () => {
    expect(checkinItems(base)).toEqual(['weight']);
  });
  it('afternoon: weigh-in, protein and water when all are missing', () => {
    expect(checkinItems({ ...base, hour: 16 })).toEqual(['weight', 'protein', 'water']);
  });
  it('asks only for what is still missing', () => {
    expect(checkinItems({ ...base, hour: 18, weighedToday: true, proteinG: 130, waterMl: 1000 })).toEqual(['water']);
    expect(checkinItems({ ...base, hour: 18, weighedToday: true, proteinG: 125, waterMl: 2200 })).toEqual([]);
  });
  it('no targets, no questions about them', () => {
    expect(checkinItems({ ...base, hour: 18, weighedToday: true, proteinTarget: 0, waterTargetMl: 0 })).toEqual([]);
  });
  it('"Not today" hides the card for that date only', () => {
    expect(shouldShow(['weight'], '2026-11-03', '2026-11-03')).toBe(false);
    expect(shouldShow(['weight'], '2026-11-02', '2026-11-03')).toBe(true);
    expect(shouldShow([], null, '2026-11-03')).toBe(false);
  });
  it('parses grams safely', () => {
    expect(parseGrams('32')).toBe(32);
    expect(parseGrams('32,6')).toBe(33);
    expect(parseGrams('0')).toBeNull();
    expect(parseGrams('abc')).toBeNull();
    expect(parseGrams('900')).toBeNull();
    expect(proteinKcal(25)).toBe(100);
  });
});
