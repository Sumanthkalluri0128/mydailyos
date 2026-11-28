// Optional app lock rules. Pure, so they are unit tested without the phone. The native part is in utils/appLock.ts.
export type LockSettings = { enabled: boolean; timeoutSec: number };
export const TIMEOUTS = [0, 30, 60, 300]; // seconds in the background before the lock returns; 0 = every time
export const DEFAULT_LOCK: LockSettings = { enabled: false, timeoutSec: 60 };

export function parseLock(raw: string | null | undefined): LockSettings {
  try {
    const j = JSON.parse(raw || 'null');
    if (!j || typeof j !== 'object') return DEFAULT_LOCK;
    return { enabled: j.enabled === true, timeoutSec: TIMEOUTS.includes(Number(j.timeoutSec)) ? Number(j.timeoutSec) : DEFAULT_LOCK.timeoutSec };
  } catch { return DEFAULT_LOCK; }
}

/**
 * Should the lock screen show now?
 * - never when the lock is off (it is off by default)
 * - never when the phone has no screen lock at all (we must not trap anyone out of their own data)
 * - always on a cold start while enabled and not yet unlocked
 * - after returning from the background: when away at least `timeoutSec` (0 = any time away)
 */
export function shouldLock(p: { settings: LockSettings; capable: boolean; unlocked: boolean; backgroundedAt: number | null; now: number }): boolean {
  const { settings, capable, unlocked, backgroundedAt, now } = p;
  if (!settings.enabled || !capable) return false;
  if (!unlocked) return true;
  if (backgroundedAt === null) return false;
  return now - backgroundedAt >= settings.timeoutSec * 1000;
}

export type AuthResult = { success: boolean; error?: string };
export type LockOutcome = 'unlocked' | 'cancelled' | 'locked-out' | 'unavailable' | 'retry';

/** Maps the phone's answer to what we do next. Anything unclear means "try again", never "unlock". */
export function lockOutcome(r: AuthResult | null | undefined): LockOutcome {
  if (r?.success === true) return 'unlocked';
  const e = String(r?.error || '');
  if (['user_cancel', 'system_cancel', 'app_cancel'].includes(e)) return 'cancelled';
  if (e === 'lockout') return 'locked-out';
  if (['not_enrolled', 'passcode_not_set', 'not_available'].includes(e)) return 'unavailable';
  return 'retry';
}

/** Plain words for each outcome. The phone's own PIN / pattern is always offered by the system prompt as the fallback. */
export function lockMessage(o: LockOutcome): string {
  switch (o) {
    case 'unlocked': return '';
    case 'cancelled': return 'Tap Unlock when you are ready. You can also use your phone PIN or pattern.';
    case 'locked-out': return 'Too many tries. Wait a moment, or use your phone PIN or pattern.';
    case 'unavailable': return 'This phone has no screen lock set up, so FlexFit cannot lock itself. You can turn the app lock off in Profile.';
    default: return 'That did not work. Try again, or use your phone PIN or pattern.';
  }
}
