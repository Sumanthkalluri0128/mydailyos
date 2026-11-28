// Adaptive water reminders: "if I haven't logged water in the last hour, remind me."
//
// A local notification can't check the log at the moment it fires. So instead of fixed clock times, the reminder chain is anchored to
// the LAST water entry: one hour (or your chosen gap) after you last logged, then every gap after that until the end of your window.
// Every time you log water (or open the app) the chain is rebuilt from the new "last logged" time, so a reminder only ever fires when
// the gap has genuinely passed without an entry. Pure maths, no React Native imports.

export type Hm = { hour: number; minute: number };

export type WaterPlanInput = {
  now: Date;
  /** When water was last logged today (null/undefined = nothing yet today). */
  lastLogAt?: Date | null;
  totalMl: number;
  goalMl: number;
  /** "HH:mm" window the reminders may fire in. */
  start: string;
  end: string;
  /** Minutes without a log before a reminder (default 60). */
  gapMin?: number;
  /** Quiet hours "HH:mm" (nothing fires inside). */
  quiet?: { start: string; end: string } | null;
  /** Most reminders on any one day. */
  maxPerDay?: number;
  /** Days to plan, today first (default 2: today + tomorrow). */
  days?: number;
  /** Stop for today once the goal is met. */
  skipWhenDone?: boolean;
  /** Minutes-of-day used by other reminders; water shifts a few minutes to avoid landing on top of them. */
  avoid?: number[];
};

export type WaterNudge = { at: Date; dayIndex: number; remainingMl: number };

const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const inQuiet = (minute: number, q?: { start: string; end: string } | null) => {
  if (!q) return false;
  const a = mins(q.start), b = mins(q.end);
  if (a === b) return false;
  return a < b ? minute >= a && minute < b : minute >= a || minute < b;
};
const dayStart = (d: Date, plus = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus, 0, 0, 0, 0);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Nudge a minute-of-day forward (up to 10 min) so it doesn't collide with another reminder; unchanged if no free spot before `endMin`. */
function clear(minute: number, avoid: number[], endMin: number): number {
  for (let shift = 0; shift <= 10; shift += 1) {
    const t = minute + shift;
    if (t > endMin) break;
    if (!avoid.some((a) => Math.abs(a - t) < 5)) return t;
  }
  return minute;
}

/** "1.2 L" / "500 ml" style remaining text. */
export function remainingText(ml: number): string {
  const r = Math.max(0, Math.round(ml / 50) * 50);
  return r >= 1000 ? `${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)} L` : `${r} ml`;
}

export function planWaterNudges(i: WaterPlanInput): WaterNudge[] {
  const gap = Math.max(30, Math.round(i.gapMin ?? 60));
  const startMin = mins(i.start), endMin = mins(i.end);
  if (endMin < startMin) return [];
  const cap = Math.max(1, Math.round(i.maxPerDay ?? 8));
  const days = Math.max(1, Math.min(3, Math.round(i.days ?? 2)));
  const remaining = Math.max(0, i.goalMl - i.totalMl);
  const nowMs = i.now.getTime();
  const out: WaterNudge[] = [];
  const avoid = i.avoid || [];

  for (let d = 0; d < days; d += 1) {
    const base = dayStart(i.now, d);
    const times: number[] = []; // minutes of day

    if (d === 0) {
      if ((i.skipWhenDone ?? true) && i.goalMl > 0 && i.totalMl >= i.goalMl) continue; // goal met: nothing more today
      // Anchor: the last log today, or the start of the window when there is none yet.
      const last = i.lastLogAt && sameDay(i.lastLogAt, i.now) ? i.lastLogAt : null;
      const anchor = last ? last.getHours() * 60 + last.getMinutes() : startMin - gap; // no log yet: the first reminder is the window start
      const nowMin = i.now.getHours() * 60 + i.now.getMinutes();
      // First time that is >= anchor + gap (continuing the cadence), at least 2 minutes from now so opening the app doesn't buzz instantly.
      let t = anchor + gap;
      while (t < Math.max(nowMin + 2, startMin)) t += gap;
      for (; t <= endMin; t += gap) times.push(t);
    } else {
      // Future days: we can't know yet, so use the default cadence from the window start.
      for (let t = startMin; t <= endMin; t += gap) times.push(t);
    }

    let kept = times.filter((t) => !inQuiet(t, i.quiet));
    if (kept.length > cap) kept = Array.from({ length: cap }, (_, k) => kept[Math.min(kept.length - 1, Math.floor(((k + 0.5) * kept.length) / cap))]);
    for (const t0 of kept) {
      const t = clear(t0, avoid, endMin);
      const at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(t / 60), t % 60, 0, 0);
      if (at.getTime() > nowMs + 60_000) out.push({ at, dayIndex: d, remainingMl: remaining });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function waterNudgeText(remainingMl: number, gapMin: number): { title: string; body: string } {
  const hrs = gapMin === 60 ? 'the last hour' : gapMin % 60 === 0 ? `the last ${gapMin / 60} hours` : `the last ${gapMin} minutes`;
  return {
    title: '💧 Water check',
    body: remainingMl > 0 ? `No water logged in ${hrs}. About ${remainingText(remainingMl)} to go today. Tap to log a glass.` : `No water logged in ${hrs}. Tap to log a glass.`,
  };
}
