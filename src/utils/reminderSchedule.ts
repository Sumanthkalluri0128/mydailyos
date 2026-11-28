// Pure scheduling maths for reminders. No React Native / Expo imports on purpose,
// so it can be unit-tested with plain Node (see /tests) — this is the code with
// the date/weekday edge cases (weekly offsets, past dates, month ends) that is
// easiest to break.

import { kindMeta } from './workoutPlanView';

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

/** A trigger described independently of expo-notifications' enums. */
export type TriggerSpec =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number } // weekday: 1 = Sunday … 7 = Saturday (expo convention)
  | { type: 'date'; date: Date };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(t: string): boolean {
  return TIME_RE.test(t);
}

export function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = String(t).split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
}

/** "YYYY-MM-DD" -> Date at *local* midnight (avoids the UTC shift of `new Date("2026-09-28")`). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** expo-notifications weekday is 1–7 with Sunday = 1; Date#getDay() is 0–6 with Sunday = 0. */
export function expoWeekday(dateStr: string): number {
  return parseLocalDate(dateStr).getDay() + 1;
}

/** The moment a one-off reminder should fire, or null if that moment has already passed. */
export function onceTarget(dateStr: string, time: string, now: Date = new Date()): Date | null {
  const { hour, minute } = parseTime(time);
  const target = parseLocalDate(dateStr);
  target.setHours(hour, minute, 0, 0);
  return target.getTime() > now.getTime() ? target : null;
}

/** Fire time for a task due at `time` on `dateStr`, `leadMinutes` early. Null when that is already in the past. */
export function taskTarget(dateStr: string, time: string, leadMinutes = 0, now: Date = new Date()): Date | null {
  if (!time || !isValidTime(time)) return null;
  const { hour, minute } = parseTime(time);
  const target = parseLocalDate(dateStr);
  target.setHours(hour, minute, 0, 0);
  const lead = Math.max(0, Math.round(leadMinutes || 0));
  if (lead) target.setMinutes(target.getMinutes() - lead);
  return target.getTime() > now.getTime() ? target : null;
}

/**
 * Times of day for repeating water reminders. Both ends are inclusive and the
 * minute-of-hour of `start` is kept (08:30 → 08:30, 10:30 …), but a slot is
 * never produced *after* `end` (the old code could schedule 20:30 for a 20:00 cut-off).
 */
export function waterSlots(start: string, end: string, intervalHours: number): { hour: number; minute: number }[] {
  const s = parseTime(start);
  const e = parseTime(end);
  const startMin = s.hour * 60 + s.minute;
  const endMin = e.hour * 60 + e.minute;
  const step = Math.max(1, Math.round(intervalHours || 2)) * 60;
  const out: { hour: number; minute: number }[] = [];
  if (endMin < startMin) return out;
  for (let t = startMin; t <= endMin; t += step) out.push({ hour: Math.floor(t / 60), minute: t % 60 });
  return out;
}

/** One-off dates for the rolling "motivation" window, skipping a slot that has already passed today. */
export function motivationDates(time: string, days: number, now: Date = new Date()): { date: Date; dayIndex: number }[] {
  const { hour, minute } = parseTime(time);
  const out: { date: Date; dayIndex: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (date.getTime() <= now.getTime()) continue;
    out.push({ date, dayIndex: i });
  }
  return out;
}

export function snoozeDate(minutes: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + Math.max(1, Math.round(minutes)) * 60000);
}

/** Next date (>= today) on which a monthly reminder anchored to `anchorDate` fires, clamping e.g. the 31st. */
export function nextMonthly(anchorDate: string, time: string, now: Date = new Date()): Date | null {
  const anchorDay = parseLocalDate(anchorDate).getDate();
  const { hour, minute } = parseTime(time);
  for (let i = 0; i < 14; i++) {
    const first = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cand = new Date(first.getFullYear(), first.getMonth(), Math.min(anchorDay, last), hour, minute, 0, 0);
    if (cand.getTime() > now.getTime() && cand.getTime() >= parseLocalDate(anchorDate).getTime()) return cand;
  }
  return null;
}

/**
 * Triggers for a task reminder.
 *  - one-off tasks   → a single DATE trigger (or none if the time has passed)
 *  - daily           → DAILY
 *  - weekdays        → one WEEKLY trigger per Mon–Fri
 *  - weekly          → WEEKLY on the anchor's weekday
 *  - monthly         → the next occurrence as a DATE trigger (refreshed whenever tasks sync)
 */
export function taskTriggers(
  recurrence: Recurrence,
  dateStr: string,
  time: string,
  leadMinutes = 0,
  now: Date = new Date()
): TriggerSpec[] {
  if (!time || !isValidTime(time)) return [];
  const { hour, minute } = parseTime(time);
  // Repeating triggers can't express "N minutes earlier" across midnight cleanly, so shift the
  // clock time by total minutes-of-day instead of constructing a Date — building a Date with a
  // negative minute always rolls back to the *previous month's* last day (28–31), which would
  // corrupt the day-shift used below to rewind the weekday by exactly one day.
  const totalMinutes = hour * 60 + minute - Math.max(0, Math.round(leadMinutes || 0));
  const dayShift = totalMinutes < 0 ? -1 : 0; // lead time is always < 24h, so at most one day back
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const wrapDay = (weekday: number) => ((weekday - 1 + dayShift + 7) % 7) + 1;

  switch (recurrence) {
    case 'daily':
      return [{ type: 'daily', hour: h, minute: m }];
    case 'weekdays':
      return [2, 3, 4, 5, 6].map((wd) => ({ type: 'weekly' as const, weekday: wrapDay(wd), hour: h, minute: m }));
    case 'weekly':
      return [{ type: 'weekly', weekday: wrapDay(expoWeekday(dateStr)), hour: h, minute: m }];
    case 'monthly': {
      const next = nextMonthly(dateStr, time, now);
      if (!next) return [];
      next.setMinutes(next.getMinutes() - Math.max(0, Math.round(leadMinutes || 0)));
      return next.getTime() > now.getTime() ? [{ type: 'date', date: next }] : [];
    }
    default: {
      const target = taskTarget(dateStr, time, leadMinutes, now);
      return target ? [{ type: 'date', date: target }] : [];
    }
  }
}

/** Stable fingerprint: when it changes, the reminder needs rescheduling. */
export function taskFingerprint(t: { title: string; date: string; time: string; recurrence?: string }, leadMinutes: number): string {
  return [t.title, t.date, t.time, t.recurrence || 'none', leadMinutes].join('|');
}

// ============================================================================================================
// Interval windows: "every 1 h / 2 h … between 09:00 and 18:00" — used by motivation quotes, task nudges, water.
// ============================================================================================================

/** Choices offered in the UI. 0 means "just once a day, at the start time". */
export const INTERVAL_OPTIONS: { min: number; label: string }[] = [
  { min: 0, label: 'Once' }, { min: 30, label: '30 min' }, { min: 60, label: '1 hr' },
  { min: 120, label: '2 hr' }, { min: 180, label: '3 hr' }, { min: 240, label: '4 hr' },
];

export function intervalLabel(everyMin: number): string {
  if (!everyMin) return 'once a day';
  if (everyMin < 60) return `every ${everyMin} min`;
  const h = everyMin / 60;
  return `every ${Number.isInteger(h) ? h : h.toFixed(1)} hr`;
}

/**
 * Daily clock times between `start` and `end` (both inclusive), `everyMin` apart. everyMin = 0 gives a single slot
 * at `start`. A slot is never produced after `end`.
 */
export function windowSlots(start: string, end: string, everyMin: number): { hour: number; minute: number }[] {
  const s = parseTime(start);
  const startMin = s.hour * 60 + s.minute;
  if (!everyMin || everyMin <= 0) return [{ hour: s.hour, minute: s.minute }];
  const e = parseTime(end);
  const endMin = e.hour * 60 + e.minute;
  const out: { hour: number; minute: number }[] = [];
  if (endMin < startMin) return out;
  const step = Math.max(15, Math.round(everyMin));
  for (let t = startMin; t <= endMin; t += step) out.push({ hour: Math.floor(t / 60), minute: t % 60 });
  return out;
}

export const countSlots = (start: string, end: string, everyMin: number) => windowSlots(start, end, everyMin).length;

export const MOTIVATION_QUOTES = [
  "Small steps today, big wins tomorrow. Let's go! 💪",
  "You don't have to be great to start, but you have to start to be great.",
  'One task at a time. You\u2019ve got this. ✨',
  'Discipline beats motivation on the hard days. Show up anyway.',
  'Future you is thanking present you right now.',
  'Progress, not perfection. Start now.',
  'The hardest part is starting — and you just did. Keep going.',
  'Every big goal is just a lot of small tasks. Pick one.',
  'Your only competition is who you were yesterday.',
  'Focus for 20 minutes. Momentum will do the rest.',
  'Done is better than perfect. Begin.',
  'Consistency compounds. Show up today too.',
  'You\u2019ve handled harder days than this one.',
  'Get up, get after it, get it done. 🔥',
  'Open FlexFit and knock out one task right now.',
  'Two minutes. Start the thing you\u2019ve been avoiding.',
  'Energy follows action. Move first, motivation catches up.',
  'Not today\u2019s mood — today\u2019s goals. Back to it.',
  'Stand up, stretch, then do the next small thing.',
  'You\u2019re one focused hour away from a better day.',
  'Make it easy to start: open the doc, lace the shoes, press play.',
  'The version of you that you want to be does the work.',
  'Slow progress is still progress. Keep moving.',
  'Pick the smallest next step and take it.',
  'Don\u2019t wait to feel ready. Start messy.',
  'Your future self is built by what you do this hour.',
  'Win the next 25 minutes. Then do it again.',
  'A little every day beats a lot once in a while.',
  'You said you would. Go prove yourself right.',
  'Break it down, start small, finish strong. 🚀',
  'Hydrate, breathe, and begin.',
  'Action creates clarity. Start now.',
  'Be proud of showing up — and show up again.',
  'Today counts. Make it count.',
  'What\u2019s one thing that would make today a win? Do that.',
  'Reset. Refocus. Restart. You\u2019ve got this.',
  'Great things are built from boring, consistent effort.',
  'Doubt kills more dreams than failure. Begin anyway.',
  'Finish one thing before checking anything else.',
  'You are closer than you were this morning. Keep going.',
];

/**
 * Picks `count` quotes in a rotating, non-repeating-within-a-day order. `seed` changes daily (day of year), so each
 * day the quotes land on different slots — without needing a notification per day to be pre-scheduled.
 */
export function pickQuotes(count: number, seed: number, pool: string[] = MOTIVATION_QUOTES): string[] {
  const n = pool.length;
  const stride = 7; // coprime with 40, so consecutive slots look unrelated
  return Array.from({ length: count }, (_, i) => pool[(((seed * 11 + i * stride) % n) + n) % n]);
}

export function dayOfYear(d: Date = new Date()): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
}

/** Notification text for the repeating "task nudge": names the first open tasks. null = nothing open. */
export function nudgeContent(openTitles: string[], max = 3): { title: string; body: string } {
  const n = openTitles.length;
  if (n === 0) return { title: '✅ Plan your day', body: 'Nothing on your list yet — add today\u2019s tasks in FlexFit.' };
  const shown = openTitles.slice(0, max).join(', ');
  const more = n > max ? ` +${n - max} more` : '';
  return { title: `✅ ${n} task${n === 1 ? '' : 's'} still open`, body: `${shown}${more}. Tap to knock one out.` };
}

/**
 * How many notifications the OS lets us keep scheduled. iOS silently drops everything past 64 — which looks exactly
 * like "sometimes I don't get my reminders" — so we plan under that ceiling. Android has a far higher limit.
 */
export function osNotificationLimit(platform: string): number {
  return platform === 'ios' ? 60 : 400;
}

/**
 * Fixed daily slots (water / motivation / nudges / custom) are always scheduled; per-task reminders get whatever is left,
 * soonest first. `overBy` > 0 means even the fixed slots exceed the limit (the UI warns).
 */
export function budgetPlan(limit: number, fixedCounts: number[]): { fixed: number; taskAllowance: number; overBy: number } {
  const fixed = fixedCounts.reduce((a, b) => a + b, 0);
  return { fixed, taskAllowance: Math.max(0, limit - fixed), overBy: Math.max(0, fixed - limit) };
}


// ============================================================================================================
// Anti-burst: never let two different kinds of reminder fire at (nearly) the same moment.
// ============================================================================================================

export type SlotGroup = { key: string; slots: { hour: number; minute: number }[] };

/**
 * Spreads daily slots from different reminder kinds (tasks / motivation / water / meals …) so that no two kinds land within
 * `gapMin` minutes of each other. Earlier groups in the list keep their exact times; later groups are nudged forward by the
 * smallest amount that clears every slot already placed (and never past 23:59). `fixed` are exact times that must not move and
 * must be avoided too (custom reminders). Slots inside one group keep the spacing the person chose.
 * Without this, "tasks every 2 h" and "motivation every 2 h" both default to 09:00, 11:00, 13:00 … and arrive as a pile.
 */
export function staggerSlots(groups: SlotGroup[], fixed: { hour: number; minute: number }[] = [], gapMin = 12): Record<string, { hour: number; minute: number }[]> {
  const placed: { min: number; key: string }[] = fixed.map((f) => ({ min: f.hour * 60 + f.minute, key: '__fixed' }));
  const out: Record<string, { hour: number; minute: number }[]> = {};
  for (const g of groups) {
    out[g.key] = g.slots.map(({ hour, minute }) => {
      let t = hour * 60 + minute;
      const clash = (m: number) => placed.some((p) => p.key !== g.key && Math.abs(p.min - m) < gapMin);
      let guard = 0;
      while (clash(t) && t < 23 * 60 + 59 && guard < 240) { t += 1; guard += 1; }
      if (t > 23 * 60 + 59) t = hour * 60 + minute; // no room before midnight: keep the original time rather than skipping the reminder
      placed.push({ min: t, key: g.key });
      return { hour: Math.floor(t / 60), minute: t % 60 };
    });
  }
  return out;
}

/** Time-of-day, in minutes, of the soonest slot gap violation — used by tests/diagnostics: the smallest distance between any two placed slots of different kinds. */
export function minGapBetweenGroups(placed: Record<string, { hour: number; minute: number }[]>): number {
  const all = Object.entries(placed).flatMap(([k, v]) => v.map((s) => ({ k, m: s.hour * 60 + s.minute })));
  let best = Infinity;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].k !== all[j].k) best = Math.min(best, Math.abs(all[i].m - all[j].m));
  return best;
}


// ============================================================================================================
// Quiet hours + a hard daily cap
// ============================================================================================================

/** True when `minute` (0–1439) falls inside the quiet window; handles overnight windows such as 22:00 → 07:00. */
export function inQuietHours(minute: number, start: string, end: string): boolean {
  const s = parseTime(start); const e = parseTime(end);
  const a = s.hour * 60 + s.minute; const b = e.hour * 60 + e.minute;
  if (a === b) return false;
  return a < b ? minute >= a && minute < b : minute >= a || minute < b;
}

/**
 * Drops repeating slots that fall in quiet hours, then — if more than `cap` remain across all kinds — keeps an evenly spread
 * subset of exactly `cap`, so the day is covered from morning to evening rather than front-loaded. cap 0 = no cap.
 * Exact-time reminders (custom, per-task due times) are never passed through here: the person asked for those at that time.
 */
export function limitSlots(
  groups: Record<string, { hour: number; minute: number }[]>,
  opts: { quiet?: { start: string; end: string } | null; cap?: number },
): Record<string, { hour: number; minute: number }[]> {
  const flat = Object.entries(groups)
    .flatMap(([key, slots]) => slots.map((s) => ({ key, hour: s.hour, minute: s.minute, m: s.hour * 60 + s.minute })))
    .filter((x) => !(opts.quiet && inQuietHours(x.m, opts.quiet.start, opts.quiet.end)))
    .sort((a, b) => a.m - b.m);
  let kept = flat;
  const cap = Math.max(0, Math.round(opts.cap || 0));
  if (cap > 0 && flat.length > cap) kept = Array.from({ length: cap }, (_, i) => flat[Math.min(flat.length - 1, Math.floor(((i + 0.5) * flat.length) / cap))]);
  const out: Record<string, { hour: number; minute: number }[]> = {};
  for (const key of Object.keys(groups)) out[key] = [];
  for (const k of kept) out[k.key].push({ hour: k.hour, minute: k.minute });
  return out;
}


// ============================================================================================================
// Planned-workout reminders: one reminder on each day that still has a workout to do, at the time the person chose.
// ============================================================================================================

/** A planned workout as GET /api/workout-plan returns it (only the fields the reminder needs). */
export type WorkoutReminderItem = { _id?: string; id?: string; date: string; kind: string; title?: string; minutes?: number; status?: string; done?: boolean };
export type WorkoutReminder = { date: string; at: Date; title: string; body: string; ids: string[] };

/** How many days ahead get a reminder. Each one is a single scheduled notification, so this also keeps us far under the iOS limit of 64. */
export const WORKOUT_REMINDER_DAYS = 7;

/** Still to do: not a rest day, not skipped, not done (ticked, or matched by a logged exercise), and not known done on this phone. */
export const workoutIsPending = (it: WorkoutReminderItem, doneIds?: Set<string>): boolean => {
  if (!it || it.kind === 'rest' || it.status === 'skipped' || it.status === 'done' || it.done) return false;
  const id = String(it._id ?? it.id ?? '');
  return !(id && doneIds?.has(id));
};

const workoutLine = (it: WorkoutReminderItem): string => {
  const name = String(it.title || '').trim() || kindMeta(it.kind).label;
  const min = Math.round(Number(it.minutes) || 0);
  return min > 0 ? `${name} \u00b7 ${min} min` : name;
};

/**
 * One reminder per day, from `today` for `days` days, at `time` (HH:mm). A day with several workouts to do gets ONE reminder naming them.
 * A day with nothing left to do (all done / skipped / rest) gets none, and a time that has already passed today is skipped.
 * The text says "today" because it is shown on that day. Call again whenever a workout is done, skipped, moved, added or removed.
 */
export function workoutReminderPlan(
  items: WorkoutReminderItem[],
  opts: { today: string; time: string; now?: Date; days?: number; doneIds?: Iterable<string> },
): WorkoutReminder[] {
  if (!isValidTime(opts.time)) return [];
  const now = opts.now ?? new Date();
  const days = Math.max(1, Math.min(WORKOUT_REMINDER_DAYS, Math.round(opts.days ?? WORKOUT_REMINDER_DAYS)));
  const first = parseLocalDate(opts.today);
  const window = new Set(Array.from({ length: days }, (_, i) => toDateStr(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i))));
  const done = new Set(Array.from(opts.doneIds ?? [], String));
  const byDate = new Map<string, WorkoutReminderItem[]>();
  for (const it of items || []) {
    if (!it || !window.has(it.date) || !workoutIsPending(it, done)) continue;
    byDate.set(it.date, [...(byDate.get(it.date) || []), it]);
  }
  const out: WorkoutReminder[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const at = onceTarget(date, opts.time, now);
    if (!at) continue;
    const list = byDate.get(date)!;
    const shown = list.slice(0, 2).map(workoutLine).join(', ');
    const more = list.length > 2 ? ` +${list.length - 2} more` : '';
    out.push({
      date, at,
      title: list.length === 1 ? '\ud83c\udfcb\ufe0f Workout today' : `\ud83c\udfcb\ufe0f ${list.length} workouts today`,
      body: `${shown}${more}. Tap to open your plan.`,
      ids: list.map((x) => String(x._id ?? x.id ?? '')).filter(Boolean),
    });
  }
  return out;
}
