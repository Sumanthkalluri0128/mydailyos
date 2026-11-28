// Reminder settings (types + defaults) and the small date/time helpers they need. Pure: no device or storage access.
// Split out of notifications.ts (which still re-exports everything here, so existing imports keep working).
import { DEFAULT_MEAL_TIMES, DEFAULT_MEALS_ON, DEFAULT_FOLLOW_UP_MIN, type MealTimes, type MealsOn } from './mealNudge';

// A custom, calendar-event-style reminder: pick any title, any date, any
// time, and how it repeats (or doesn't). Unlike the three built-in
// categories below (which are always "every day at HH:mm"), these behave
// like a normal calendar event — "once, on this exact date and time" is a
// first-class option, alongside daily/weekly repeats.
export type ReminderRepeat = 'once' | 'daily' | 'weekly';

export type CustomReminder = {
  id: string;
  title: string;
  note?: string;
  repeat: ReminderRepeat;
  date: string; // "YYYY-MM-DD" — the event date for `once`, and the source of the weekday for `weekly`
  time: string; // "HH:mm", 24h
};

export type ReminderPrefs = {
  /** Task nudges: "3 tasks still open: …" repeating inside a daily window. */
  tasksEnabled: boolean;
  tasksStart: string; // "HH:mm"
  tasksEnd: string;   // "HH:mm"
  /** Minutes between nudges; 0 = just once a day at the start time. */
  tasksEveryMin: number;

  waterEnabled: boolean;
  waterStart: string; // "HH:mm"
  waterEnd: string; // "HH:mm"
  waterIntervalHours: number;
  /** 'adaptive' = remind only when no water was logged for `waterGapMin` minutes; 'fixed' = the old fixed clock times. */
  waterMode: 'adaptive' | 'fixed';
  waterGapMin: number;
  /** Most adaptive water reminders on any one day. */
  waterMaxPerDay: number;

  /** Motivation quotes: a different quote each time, repeating inside a daily window. */
  motivationEnabled: boolean;
  motivationStart: string;
  motivationEnd: string;
  motivationEveryMin: number;

  /** Per-task reminders at each task's own due time (see "per-task due-time reminders" below). */
  taskDueRemindersEnabled: boolean;
  /** Fire this many minutes before the task's due time (0 = exactly on time). */
  taskReminderLeadMinutes: number;

  /** "You haven't logged lunch yet" nudges (skipped for meals already logged today). */
  mealEnabled: boolean;
  mealTimes: MealTimes;
  /** Which meals get a nudge (each one only fires if THAT meal is still not logged). */
  mealsOn: MealsOn;
  /** Ask once more this many minutes after the first nudge if the meal is still missing (0 = never). */
  mealFollowUpMin: number;

  /** Evening "plan tomorrow's lunch" reminder (one a day; follows quiet hours; skipped when tomorrow's lunch is already planned). */
  tiffinEnabled: boolean;
  tiffinTime: string; // "HH:mm"

  /** Planned workouts: one reminder, at this time, on each day (the next 7) that still has a workout to do. It stops when the workout is done or skipped. Exact time: quiet hours do not move it. */
  workoutEnabled: boolean;
  workoutTime: string; // "HH:mm"

  /** Quiet hours: repeating nudges (water / tasks / motivation) are never scheduled inside this window. */
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  /** Hard cap on repeating nudges per day, spread across the day. 0 = no cap. */
  maxPerDay: number;
  /** Skip water / task nudges for the rest of today once the goal is met / nothing is left to do. */
  smartSkip: boolean;

  customReminders: CustomReminder[];
};

export const DEFAULT_PREFS: ReminderPrefs = {
  tasksEnabled: false,
  tasksStart: '09:00',
  tasksEnd: '18:00',
  tasksEveryMin: 120,
  waterEnabled: false,
  waterStart: '08:00',
  waterEnd: '20:00',
  waterIntervalHours: 2,
  waterMode: 'adaptive',
  waterGapMin: 60,
  waterMaxPerDay: 10,
  motivationEnabled: false,
  motivationStart: '09:00',
  motivationEnd: '18:00',
  motivationEveryMin: 120,
  taskDueRemindersEnabled: true,
  taskReminderLeadMinutes: 0,
  mealEnabled: false,
  mealTimes: { ...DEFAULT_MEAL_TIMES },
  mealsOn: { ...DEFAULT_MEALS_ON },
  mealFollowUpMin: DEFAULT_FOLLOW_UP_MIN,
  tiffinEnabled: false,
  workoutEnabled: false,
  workoutTime: '18:00',
  tiffinTime: '20:30',
  quietEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
  maxPerDay: 8,
  smartSkip: true,
  customReminders: [],
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "YYYY-MM-DD" -> a Date at local midnight, without the UTC-shift bugs of `new Date(str)`. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/** Weekday name for a "YYYY-MM-DD" string, for display (e.g. "Every Tue at 7:00 PM"). */
export function weekdayLabel(dateStr: string): string {
  return WEEKDAY_LABELS[parseLocalDate(dateStr).getDay()];
}

export function formatFriendlyDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatFriendlyTime(time: string): string {
  const { hour, minute } = parseTime(time);
  const d = new Date(2000, 0, 1, hour, minute);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(t: string) {
  return TIME_RE.test(t);
}

export function parseTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

