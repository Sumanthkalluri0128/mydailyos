// One gentle nudge from the coach, only when something is waiting for you. Pure planning (testable, no React Native imports) plus a
// thin scheduler. Rules: at most ONE coach notification scheduled at a time, never between 22:00 and 07:00, never when nothing is pending,
// never twice for the same thing on the same day.
export type NudgeInput = {
  now: Date;
  nextKind: string;                 // hub.nextAction.kind: 'decision' | 'checkin' | 'train' | 'log' | 'steady'
  headline?: string;                // the weekly decision headline when a change waits for a tap
  recoveryLow?: boolean;
  quiet?: { start: string; end: string } | null;   // the person's own quiet hours from reminder settings, 'HH:mm'
};
export type Nudge = { key: string; at: Date; title: string; body: string; screen: string };

const at = (now: Date, hour: number, minute = 0, plusDays = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + plusDays, hour, minute, 0, 0);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const mins = (hhmm: string) => { const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** Is this moment inside the quiet window? Handles windows that cross midnight (22:00 to 07:00). */
export function inQuiet(d: Date, q?: { start: string; end: string } | null): boolean {
  if (!q) return false;
  const t = d.getHours() * 60 + d.getMinutes(), s = mins(q.start), e = mins(q.end);
  return s === e ? false : s < e ? t >= s && t < e : t >= s || t < e;
}
/** Moves a time that falls in quiet hours to the moment quiet hours end. */
export function afterQuiet(d: Date, q?: { start: string; end: string } | null): Date {
  if (!inQuiet(d, q)) return d;
  const e = mins(q!.end);
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(e / 60), e % 60, 0, 0);
  return out.getTime() <= d.getTime() ? new Date(out.getTime() + 24 * 3600 * 1000) : out;
}

export function planCoachNudge(input: NudgeInput): Nudge | null {
  const n = planRaw(input);
  if (!n) return null;
  const at2 = afterQuiet(n.at, input.quiet);
  // A check-in is only useful in the morning: if quiet hours push it past 14:00 it is simply skipped today.
  if (n.key.startsWith('checkin') && (at2.getHours() >= 14 || at2.getDate() !== n.at.getDate())) return null;
  return { ...n, at: at2 };
}

function planRaw({ now, nextKind, headline, recoveryLow }: NudgeInput): Nudge | null {
  const hour = now.getHours();
  const day = ymd(now);
  // A pending plan change is the most useful nudge: a reminder around 19:00 (or the next morning at 09:00 once it is late).
  if (nextKind === 'decision') {
    const when = hour < 18 ? at(now, 19) : hour < 21 ? new Date(now.getTime() + 30 * 60000) : at(now, 9, 0, 1);
    return { key: `decision-${day}`, at: when, title: 'Your coach has one change for this week', body: `${headline || 'Review it'}. One tap to apply, or leave it.`, screen: '/coach' };
  }
  if (nextKind === 'checkin') {
    // The 10-second check-in is only useful before training and early in the day.
    if (hour >= 14) return null;
    const when = hour < 7 ? at(now, 8) : new Date(now.getTime() + 45 * 60000);
    return { key: `checkin-${day}`, at: when, title: 'Ten-second check-in', body: recoveryLow ? 'Recovery has been low. Tell your coach how you feel today so it can lighten the plan.' : 'Sleep, energy, soreness. Your workout fits how you feel.', screen: '/coach' };
  }
  return null;
}

/** Schedules (replacing any previous coach nudge). Safe to call on every app open; silently does nothing without notification permission. */
export async function scheduleCoachNudge(input: NudgeInput): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const prev = await AsyncStorage.getItem('ff-coach-nudge');
    let quiet = input.quiet;
    if (quiet === undefined) { try { const prefs = await (await import('./notifications')).loadPrefs(); quiet = prefs.quietEnabled ? { start: prefs.quietStart, end: prefs.quietEnd } : null; } catch { quiet = null; } }
    const plan = planCoachNudge({ ...input, quiet });
    if (prev) { const p = JSON.parse(prev); if (p.id) await Notifications.cancelScheduledNotificationAsync(p.id).catch(() => {}); if (plan && p.key === plan.key && Number(p.at) <= Date.now()) return; }     // already delivered today: never twice for the same thing
    if (!plan || plan.at.getTime() <= Date.now()) { await AsyncStorage.removeItem('ff-coach-nudge'); return; }
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: plan.title, body: plan.body, sound: true, data: { screen: plan.screen, type: 'coach' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.at, channelId: 'reminders-v2' } as any,
    });
    await AsyncStorage.setItem('ff-coach-nudge', JSON.stringify({ id, key: plan.key, at: plan.at.getTime() }));
  } catch { /* a nudge is a nicety: never break the screen */ }
}
