import { accumulate, shouldPost } from '../stepSync';

describe('shouldPost', () => {
  it('skips zero, unchanged and tiny changes; sends big ones and stale ones', () => {
    expect(shouldPost(null, 0, 0, 1)).toBe(false);
    expect(shouldPost(null, 120, 0, 1)).toBe(true);
    expect(shouldPost(1000, 1000, 0, 999999)).toBe(false);
    expect(shouldPost(1000, 1020, 0, 1000)).toBe(false);
    expect(shouldPost(1000, 1060, 0, 1000)).toBe(true);
    expect(shouldPost(1000, 1010, 0, 6 * 60_000)).toBe(true);
  });
});
describe('accumulate (Android)', () => {
  it('adds deltas and survives a sensor restart', () => {
    let s = { total: 500, lastSeen: 0 };
    s = accumulate(s.total, s.lastSeen, 30); expect(s.total).toBe(530);
    s = accumulate(s.total, s.lastSeen, 80); expect(s.total).toBe(580);
    s = accumulate(s.total, s.lastSeen, 10); expect(s.total).toBe(590); // restarted from 0
  });
});
