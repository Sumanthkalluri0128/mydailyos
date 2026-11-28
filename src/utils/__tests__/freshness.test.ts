import { ageLabel, freshness, usableCopy, MIN, HOUR } from '../freshness';

const now = Date.UTC(2026, 9, 26, 12, 0, 0);
describe('saved-copy freshness', () => {
  it('labels the age', () => {
    expect(ageLabel(now - 30_000, now)).toBe('just now');
    expect(ageLabel(now - 5 * MIN, now)).toBe('5 min ago');
    expect(ageLabel(now - 3 * HOUR, now)).toBe('3 h ago');
    expect(ageLabel(now - 26 * HOUR, now)).toBe('yesterday');
    expect(ageLabel(undefined, now)).toBe('');
  });
  it('bands', () => {
    expect(freshness(now - MIN, now)).toBe('fresh');
    expect(freshness(now - 7 * HOUR, now)).toBe('old');
  });
  it('uses a copy only for the same person and day', () => {
    const saved = { date: '2026-10-26', owner: 'a' };
    expect(usableCopy(saved, { date: '2026-10-26', owner: 'a' })).toBe(saved);
    expect(usableCopy(saved, { date: '2026-10-27', owner: 'a' })).toBe(null);
    expect(usableCopy(saved, { date: '2026-10-26', owner: 'b' })).toBe(null);
  });
});
