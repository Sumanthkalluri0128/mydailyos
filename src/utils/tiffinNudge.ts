// "Plan tomorrow's lunch" evening reminder. One a day, no follow-up, never repeating. Follows the reminder rules the rest of the app uses:
// it is off until switched on, it never fires inside quiet hours (it moves to 30 minutes before they start), and it is skipped for tonight
// when tomorrow's lunch is already planned. Pure maths, no Expo imports, so it can be tested with plain Node.
import { parseTime, isValidTime } from './reminderSchedule';

export type TiffinOpts = {
  enabled: boolean;
  time: string;                                   // "HH:mm"
  quiet: { start: string; end: string } | null;   // quiet hours, or null when switched off
  plannedTomorrow: boolean;                       // tomorrow's lunch already has a plan
};

const mins = (t: string) => { const p = parseTime(t); return p.hour * 60 + p.minute; };
/** True when minute-of-day `m` is inside the quiet window (which may wrap past midnight). */
export function inQuiet(m: number, q: { start: string; end: string }): boolean {
  const s = mins(q.start), e = mins(q.end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/** Minute of day to fire at, after the quiet-hours rule. */
export function tiffinMinute(time: string, quiet: TiffinOpts['quiet']): number {
  const m = isValidTime(time) ? mins(time) : 20 * 60 + 30;
  if (!quiet || !inQuiet(m, quiet)) return m;
  return (mins(quiet.start) - 30 + 1440) % 1440;
}

/** The next moment to remind, or null when off. */
export function planTiffinNudge(now: Date, o: TiffinOpts): Date | null {
  if (!o.enabled) return null;
  const m = tiffinMinute(o.time, o.quiet);
  const at = (dayOffset: number) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, Math.floor(m / 60), m % 60, 0, 0); return d; };
  const tonight = at(0);
  if (tonight.getTime() > now.getTime() + 60_000 && !o.plannedTomorrow) return tonight;
  return at(1);                                    // already planned, or tonight's time has passed: remind tomorrow evening
}

export const TIFFIN_TEXT = { title: "Plan tomorrow's lunch?", body: 'Takes a minute: pick a favourite and tomorrow is sorted.' };
