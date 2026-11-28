import { DEFAULT_LOCK, lockMessage, lockOutcome, parseLock, shouldLock } from '../appLockPure';

const on = { enabled: true, timeoutSec: 60 };
const base = { capable: true, unlocked: true, backgroundedAt: null as number | null, now: 1_000_000 };

describe('app lock rules', () => {
  it('is off by default and ignores junk settings', () => {
    expect(DEFAULT_LOCK.enabled).toBe(false);
    expect(parseLock(null).enabled).toBe(false);
    expect(parseLock('not json').enabled).toBe(false);
    expect(parseLock(JSON.stringify({ enabled: true, timeoutSec: 7 })).timeoutSec).toBe(60);
    expect(parseLock(JSON.stringify({ enabled: true, timeoutSec: 300 }))).toEqual({ enabled: true, timeoutSec: 300 });
  });
  it('never locks when off or when the phone has no screen lock (nobody is trapped out)', () => {
    expect(shouldLock({ ...base, settings: DEFAULT_LOCK, unlocked: false })).toBe(false);
    expect(shouldLock({ ...base, settings: on, capable: false, unlocked: false })).toBe(false);
  });
  it('locks on a cold start and after the timeout in the background', () => {
    expect(shouldLock({ ...base, settings: on, unlocked: false })).toBe(true);
    expect(shouldLock({ ...base, settings: on, backgroundedAt: base.now - 30_000 })).toBe(false);
    expect(shouldLock({ ...base, settings: on, backgroundedAt: base.now - 60_000 })).toBe(true);
    expect(shouldLock({ ...base, settings: { enabled: true, timeoutSec: 0 }, backgroundedAt: base.now - 1 })).toBe(true);
    expect(shouldLock({ ...base, settings: on, backgroundedAt: null })).toBe(false);
  });
  it('maps the phone answer: only a clear success unlocks; the device PIN stays the fallback', () => {
    expect(lockOutcome({ success: true })).toBe('unlocked');
    expect(lockOutcome({ success: false, error: 'user_cancel' })).toBe('cancelled');
    expect(lockOutcome({ success: false, error: 'lockout' })).toBe('locked-out');
    expect(lockOutcome({ success: false, error: 'not_enrolled' })).toBe('unavailable');
    expect(lockOutcome({ success: false, error: 'authentication_failed' })).toBe('retry');
    expect(lockOutcome(null)).toBe('retry');
    expect(lockOutcome({ success: 'yes' as any })).toBe('retry');
    expect(lockMessage('locked-out')).toMatch(/PIN or pattern/);
    expect(lockMessage('unlocked')).toBe('');
  });
});
