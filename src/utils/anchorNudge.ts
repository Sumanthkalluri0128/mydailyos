// Habit anchors: "after brushing my teeth, drink water". A habit with an anchor time gets ONE reminder at that time.
// Obeys quiet hours (moved to 30 minutes before they start) and a daily cap (earliest reminders win; the rest wait for tomorrow).
// Pure maths, no Expo imports, so it can be tested with plain Node.
import { tiffinMinute } from './tiffinNudge';
import { isValidTime, parseTime } from './reminderSchedule';

export type AnchorHabit = { id: string; name: string; anchorText: string; time: string; doneToday: boolean };
export type AnchorNudge = { habitId: string; name: string; anchorText: string; at: Date };

export function planAnchors(now: Date, habits: AnchorHabit[], o: { quiet: { start: string; end: string } | null; maxPerDay: number; rough?: boolean }): AnchorNudge[] {
  const cap = Math.max(0, o.rough ? Math.min(o.maxPerDay, 2) : o.maxPerDay);
  const out: AnchorNudge[] = [];
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const perDay: Record<string, number> = {};
  const items = habits.filter((h) => h.anchorText && isValidTime(h.time)).map((h) => ({ h, m: tiffinMinute(h.time, o.quiet) })).sort((a, b) => a.m - b.m);
  for (const { h, m } of items) {
    const at = (dayOffset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, Math.floor(m / 60), m % 60, 0, 0);
    let when = at(0);
    if (when.getTime() <= now.getTime() + 60_000 || h.doneToday) when = at(1);
    // daily cap: if that day is full, try the following days (never more than a week ahead)
    let tries = 0;
    while ((perDay[dayKey(when)] || 0) >= cap && tries < 7) { when = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1, when.getHours(), when.getMinutes(), 0, 0); tries += 1; }
    if (cap === 0 || tries >= 7) continue;
    perDay[dayKey(when)] = (perDay[dayKey(when)] || 0) + 1;
    out.push({ habitId: h.id, name: h.name, anchorText: h.anchorText, at: when });
  }
  return out;
}
export const anchorText = (n: { anchorText: string; name: string }) => ({ title: `After ${n.anchorText.replace(/^after\s+/i, '')}`, body: `Time for: ${n.name}` });
export { parseTime };
