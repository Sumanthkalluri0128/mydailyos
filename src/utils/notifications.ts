import { DEFAULT_MEAL_TIMES, DEFAULT_MEALS_ON, DEFAULT_FOLLOW_UP_MIN, MEAL_NUDGE_TEXT, planMealNudges, type MealTimes, type MealsOn } from './mealNudge';
import { planTiffinNudge, TIFFIN_TEXT } from './tiffinNudge';
import { planAnchors, anchorText } from './anchorNudge';
import { toneNotify } from './coachTone';
import { planMedNudges, medText } from './medNudge';
import { planWaterNudges, waterNudgeText } from './waterNudge';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  taskTriggers, taskFingerprint, snoozeDate, windowSlots, countSlots, pickQuotes, dayOfYear, nudgeContent,
  osNotificationLimit, budgetPlan, MOTIVATION_QUOTES, staggerSlots, limitSlots, workoutReminderPlan, toDateStr, WORKOUT_REMINDER_DAYS, type Recurrence,
} from './reminderSchedule';

// Notifications scheduled through this module are LOCAL device notifications
// (no server/push service involved). They are handed off to the OS
// (iOS/Android alarm & notification system), so they keep firing even if the
// app has been fully closed or the phone was restarted — the only
// requirement is that notification permission is granted.

// As of Expo SDK 53, merely `import`-ing expo-notifications throws on
// Android inside Expo Go (it's not just push/remote notifications that were
// removed — the whole native module is unavailable there now). A static
// top-level `import * as Notifications from 'expo-notifications'` runs that
// throwing code the instant this file loads, which took down the whole app
// (including unrelated screens) since this module is imported from the root
// layout. iOS Expo Go and any development build (both platforms) are fine.
//
// So we detect Expo Go up front and, only when it's safe, lazy-require the
// native module instead of statically importing it. Everywhere else in this
// file checks `Notifications` before touching it and fails soft with a
// friendly error/no-op rather than a hard crash.
const isExpoGoAndroid =
  Platform.OS === 'android' &&
  (Constants.appOwnership === 'expo' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

let Notifications: typeof import('expo-notifications') | null = null;
if (!isExpoGoAndroid) {
  try {
    Notifications = require('expo-notifications');
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        // Newer expo-notifications versions look at these two instead of
        // shouldShowAlert; harmless to include both.
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Belt-and-suspenders: if some other environment we didn't anticipate
    // also can't load the native module, don't take the app down for it.
    Notifications = null;
  }
}

/** Whether local reminders can actually be scheduled in this environment. */
export const notificationsAvailable = !!Notifications;

const UNAVAILABLE_MESSAGE =
  "Reminders need a development build — Expo Go on Android no longer supports scheduling local notifications (as of SDK 53). Run this app with `npx expo run:android` or an EAS dev build instead.";

const PREFS_KEY = 'mydailyos_reminder_prefs_v1';
const IDS_PREFIX = 'mydailyos_notif_ids_';
// Android freezes a channel's importance the moment it is created, so the old 'reminders' channel (DEFAULT importance:
// quiet, no heads-up, easily suppressed) can never be upgraded. A NEW id with HIGH importance fixes that for existing installs.
const CHANNEL_ID = 'reminders-v2';
const LEGACY_CHANNEL_IDS = ['reminders'];

// Reminder settings types, defaults and date/time helpers live in notificationPrefs.ts (re-exported here so every existing import still works).
import { DEFAULT_PREFS, parseLocalDate, parseTime, type CustomReminder, type ReminderPrefs, type ReminderRepeat } from './notificationPrefs';
export * from './notificationPrefs';
void parseLocalDate;

// --- scheduled-notification-id bookkeeping, so we can cancel a group later ---

async function getIds(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(IDS_PREFIX + key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setIds(key: string, ids: string[]) {
  try {
    await AsyncStorage.setItem(IDS_PREFIX + key, JSON.stringify(ids));
  } catch {
    // Best-effort — worst case a stale id fails to cancel next time, which
    // is harmless.
  }
}

async function cancelGroup(key: string) {
  const ids = await getIds(key);
  if (Notifications) {
    await Promise.all(
      ids.map((id) => Notifications!.cancelScheduledNotificationAsync(id).catch(() => {}))
    );
  }
  await setIds(key, []);
}

// --- one scheduler at a time ---
// App start, coming back to the foreground, the Tasks screen, the Food screen and the Reminders screen can all ask for a
// reschedule within the same second. Run in parallel they each cancel "the old ids" and then schedule a NEW set — so the
// second run's ids overwrite the first's and the first set is never cancelled: duplicates that all fire together.
// Everything that touches the OS scheduler now goes through this single queue.
let schedulerQueue: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = schedulerQueue.then(job, job);
  schedulerQueue = run.catch(() => undefined);
  return run;
}

/** Cancels any scheduled notification this module has no record of (a leak from an older run), so duplicates cannot pile up. */
async function sweepOrphans(): Promise<void> {
  if (!Notifications) return;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(IDS_PREFIX));
    const known = new Set<string>();
    for (const [, raw] of await AsyncStorage.multiGet(keys)) { try { (JSON.parse(raw || '[]') as string[]).forEach((id) => known.add(id)); } catch { /* ignore */ } }
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter((n: any) => !known.has(n.identifier) && !n.content?.data?.keep).map((n: any) => Notifications!.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  } catch { /* best effort */ }
}

// --- preferences persistence ---

export async function loadPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const saved = JSON.parse(raw);
    const out: ReminderPrefs = { ...DEFAULT_PREFS, ...saved, mealTimes: { ...DEFAULT_MEAL_TIMES, ...(saved.mealTimes || {}) }, mealsOn: { ...DEFAULT_MEALS_ON, ...(saved.mealsOn || {}) } };
    // Older versions had ONE time per day for these two; keep that behaviour ("once a day at that time").
    if (saved.tasksTime && !saved.tasksStart) { out.tasksStart = saved.tasksTime; out.tasksEnd = saved.tasksTime; out.tasksEveryMin = 0; }
    if (saved.motivationTime && !saved.motivationStart) { out.motivationStart = saved.motivationTime; out.motivationEnd = saved.motivationTime; out.motivationEveryMin = 0; }
    return out;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function savePrefs(prefs: ReminderPrefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// --- action buttons (Snooze / Mark done / Log a glass) ---
// Identifiers used both when declaring the categories below and when handling a tap in
// components/NotificationRouter.tsx.
export const TASK_CATEGORY = 'task-reminder';
export const WATER_CATEGORY = 'water-reminder';
export const ACTION_MARK_DONE = 'mark-done';
export const ACTION_SNOOZE = 'snooze-10';
export const ACTION_LOG_WATER = 'log-water';
export const ACTION_LOG_WATER_500 = 'log-water-500';
export const MEAL_CATEGORY = 'meal-reminder';
export const ACTION_SKIP_MEAL = 'skip-meal';
export const ACTION_LOG_NOW = 'log-now';
export const MED_CATEGORY = 'med-reminder';
export const ACTION_MED_TAKEN = 'med-taken';

let categoriesReady: Promise<void> | null = null;
/** Registers the action buttons once. Safe to call repeatedly — idempotent and never throws. */
function ensureCategories(): Promise<void> {
  if (!Notifications) return Promise.resolve();
  if (!categoriesReady) {
    categoriesReady = Promise.all([
      Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
        { identifier: ACTION_MARK_DONE, buttonTitle: '✓ Mark done', options: { opensAppToForeground: false } },
        { identifier: ACTION_SNOOZE, buttonTitle: 'Snooze 10m', options: { opensAppToForeground: false } },
      ]),
      Notifications.setNotificationCategoryAsync(WATER_CATEGORY, [
        { identifier: ACTION_LOG_WATER, buttonTitle: '💧 250 ml', options: { opensAppToForeground: false } },
        { identifier: ACTION_LOG_WATER_500, buttonTitle: '🥤 500 ml', options: { opensAppToForeground: false } },
      ]),
      Notifications.setNotificationCategoryAsync(MED_CATEGORY, [
        { identifier: ACTION_MED_TAKEN, buttonTitle: '✓ Taken', options: { opensAppToForeground: false } },
      ]),
      Notifications.setNotificationCategoryAsync(MEAL_CATEGORY, [
        { identifier: ACTION_LOG_NOW, buttonTitle: 'Log it now', options: { opensAppToForeground: true } },
        { identifier: ACTION_SKIP_MEAL, buttonTitle: 'Skipped it', options: { opensAppToForeground: false } },
      ]),
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }
  return categoriesReady;
}

// --- permissions ---

/** Creates the (high-importance) Android channel. Must exist BEFORE asking for permission on Android 13+, otherwise the
 * system never shows the permission dialog and every reminder is silently blocked. Idempotent. */
async function ensureChannel() {
  if (!Notifications || Platform.OS !== 'android') return;
  try {
    for (const id of LEGACY_CHANNEL_IDS) await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: false,
    });
  } catch { /* best effort */ }
}

export async function ensurePermission(): Promise<boolean> {
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  await ensureChannel(); // channel first — see above
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  await ensureCategories();
  return status === 'granted';
}

/** Called once from Home: sets up the channel and asks for permission the first time, so timed tasks always get their reminder. */
export async function ensureNotificationSetup(): Promise<boolean> {
  if (!Notifications) return false;
  try { return await ensurePermission(); } catch { return false; }
}

// --- schedulers ---

// Repeating inside a daily window. Each slot is a DAILY repeating trigger, which the OS keeps firing every day without
// the app having to run (and which never "runs out" the way a pre-scheduled list of one-offs would). The text per slot is
// refreshed whenever the app is opened (new quotes each day, current open-task count).

async function openTaskTitles(): Promise<string[]> {
  try {
    const { read } = require('./offline');
    const { today } = require('../config/api');
    const res: any = await read(`/api/tasks?date=${today()}`);
    const all: any[] = res.tasks || [];
    // Everything planned for today is done -> no more "N tasks still open" nudges until tomorrow.
    if (all.length > 0 && all.every((t) => t.completed)) {
      try { const raw = await AsyncStorage.getItem(DONE_KEY); const v = raw ? JSON.parse(raw) : {}; const cur = v.date === localDateKey() ? v : { date: localDateKey() }; cur.tasks = true; await AsyncStorage.setItem(DONE_KEY, JSON.stringify(cur)); } catch { /* ignore */ }
    }
    else {
      try { const raw = await AsyncStorage.getItem(DONE_KEY); const v = raw ? JSON.parse(raw) : null; if (v && v.date === localDateKey() && v.tasks) { v.tasks = false; await AsyncStorage.setItem(DONE_KEY, JSON.stringify(v)); } } catch { /* ignore */ }
    }
    return all.filter((t) => !t.completed).map((t) => String(t.title));
  } catch { return []; }
}

/** The daily slots of every repeating kind, spread so two kinds never fire together (see staggerSlots). */
function plannedSlots(prefs: ReminderPrefs) {
  const customTimes = prefs.customReminders.map((r) => { const { hour, minute } = parseTime(r.time); return { hour, minute }; });
  const mealTimes = prefs.mealEnabled ? Object.values(prefs.mealTimes).map((t) => { const { hour, minute } = parseTime(t); return { hour, minute }; }) : [];
  const spread = staggerSlots([
    { key: 'tasks', slots: prefs.tasksEnabled ? windowSlots(prefs.tasksStart, prefs.tasksEnd, prefs.tasksEveryMin) : [] },
    { key: 'water', slots: prefs.waterEnabled && prefs.waterMode !== 'adaptive' ? windowSlots(prefs.waterStart, prefs.waterEnd, Math.max(1, Math.round(prefs.waterIntervalHours || 2)) * 60) : [] },
    { key: 'motivation', slots: prefs.motivationEnabled ? windowSlots(prefs.motivationStart, prefs.motivationEnd, prefs.motivationEveryMin) : [] },
  ], [...customTimes, ...mealTimes]);
  return limitSlots(spread, { quiet: prefs.quietEnabled ? { start: prefs.quietStart, end: prefs.quietEnd } : null, cap: prefs.maxPerDay });
}

// --- "done for today" (smart skip) ---
// A local notification cannot check your log at the moment it fires, so once the water goal is met / every task is done the
// remaining repeating slots are swapped for ONE-OFF slots starting tomorrow. The next time the app opens on a new day, the normal
// repeating schedule is restored (refreshReminders re-applies once per calendar day).
const DONE_KEY = 'flexfit_nudges_done_today';
type DoneKind = 'water' | 'tasks';
async function doneToday(kind: DoneKind): Promise<boolean> {
  try { const raw = await AsyncStorage.getItem(DONE_KEY); const v = raw ? JSON.parse(raw) : null; return !!v && v.date === localDateKey() && !!v[kind]; } catch { return false; }
}
const localDateKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function tomorrowAt(hour: number, minute: number): Date { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, minute, 0, 0); return d; }

/** Call when the water goal is met / no open tasks remain (or false to undo). Re-plans that group right away. */
export function markDoneToday(kind: DoneKind, done = true): Promise<void> {
  return exclusive(async () => {
    try {
      const prefs = await loadPrefs();
      if (!prefs.smartSkip || !Notifications) return;
      const raw = await AsyncStorage.getItem(DONE_KEY); const v = raw ? JSON.parse(raw) : {};
      const cur = v.date === localDateKey() ? v : { date: localDateKey() };
      if (!!cur[kind] === done) return; // nothing changed — avoid rescheduling on every screen load
      cur[kind] = done;
      await AsyncStorage.setItem(DONE_KEY, JSON.stringify(cur));
      if (kind === 'water') await scheduleWaterReminders(prefs); else await scheduleTaskNudges(prefs);
    } catch { /* never break the screen that called us */ }
  });
}

/** Repeating when not done today; otherwise one-offs from tomorrow. */
function slotTrigger(hour: number, minute: number, skipToday: boolean) {
  if (!Notifications) return null;
  return skipToday
    ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tomorrowAt(hour, minute), channelId: CHANNEL_ID }
    : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID };
}

async function scheduleTaskNudges(prefs: ReminderPrefs) {
  await cancelGroup('tasks');
  if (!prefs.tasksEnabled) return;
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  await ensureCategories();
  const slots = plannedSlots(prefs).tasks;
  const { title, body } = nudgeContent(await openTaskTitles());
  const skip = prefs.smartSkip && (await doneToday('tasks'));
  const ids: string[] = [];
  for (const { hour, minute } of slots) {
    // IMPORTANT: the trigger's `type` must be set explicitly, otherwise it fires immediately.
    ids.push(await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: { screen: '/(tabs)/tasks' } },
      trigger: slotTrigger(hour, minute, skip) as any,
    }));
  }
  await setIds('tasks', ids);
}

/** Rough-day mode (set from Home): for that one day, reminders become fewer: no motivation quotes and at most 2 water reminders. */
export const ROUGH_KEY = 'ff-rough-day';
async function roughToday(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ROUGH_KEY); if (!v) return false;
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
    return v === `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  } catch { return false; }
}

async function scheduleWaterReminders(prefs: ReminderPrefs, state?: WaterState) {
  await cancelGroup('water');
  if (!prefs.waterEnabled) return;
  if (await roughToday()) prefs = { ...prefs, waterMaxPerDay: Math.min(prefs.waterMaxPerDay, 2) };
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  await ensureCategories();
  const ids: string[] = [];
  if (prefs.waterMode === 'adaptive') {
    // Anchored to the LAST water entry: a reminder only exists for a moment when the gap since that entry will have passed.
    // Logging water (or opening the app) rebuilds this chain from the new "last logged" time.
    const st = state || (await readWaterState());
    const others = plannedSlots(prefs);
    const avoid = [...others.tasks, ...others.motivation].map((x) => x.hour * 60 + x.minute)
      .concat(prefs.mealEnabled ? Object.values(prefs.mealTimes).map((t) => { const q = parseTime(t); return q.hour * 60 + q.minute; }) : [])
      .concat(prefs.customReminders.map((r) => { const q = parseTime(r.time); return q.hour * 60 + q.minute; }));
    const plan = planWaterNudges({
      now: new Date(), lastLogAt: st.lastLogAt, totalMl: st.totalMl, goalMl: st.goalMl, start: prefs.waterStart, end: prefs.waterEnd,
      gapMin: prefs.waterGapMin, quiet: prefs.quietEnabled ? { start: prefs.quietStart, end: prefs.quietEnd } : null,
      maxPerDay: prefs.waterMaxPerDay, days: 2, skipWhenDone: prefs.smartSkip, avoid,
    });
    for (const n of plan) {
      const { title, body } = waterNudgeText(n.remainingMl, prefs.waterGapMin);
      ids.push(await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, categoryIdentifier: WATER_CATEGORY, data: { screen: '/water', type: 'water' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL_ID } as any,
      }));
    }
    await setIds('water', ids);
    return;
  }
  const skipWater = prefs.smartSkip && (await doneToday('water'));
  for (const { hour, minute } of plannedSlots(prefs).water) {
    ids.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: '💧 Hydration check',
        body: 'Time for a glass of water — log it in FlexFit, or tap Log a glass below.',
        sound: true,
        categoryIdentifier: WATER_CATEGORY,
        data: { screen: '/water', type: 'water' },
      },
      trigger: slotTrigger(hour, minute, skipWater) as any,
    }));
  }
  await setIds('water', ids);
}

// --- water state: when water was last logged today, how much, and the goal ---
export type WaterState = { lastLogAt: Date | null; totalMl: number; goalMl: number };
const GOAL_KEY = 'flexfit_water_goal_ml';
/** The water screens save the goal here so background code (a notification action) knows it without loading the profile. */
export async function rememberWaterGoal(ml: number) { try { if (ml > 0) await AsyncStorage.setItem(GOAL_KEY, String(Math.round(ml))); } catch { /* ignore */ } }
async function readWaterState(): Promise<WaterState> {
  let goalMl = 3000;
  try { const g = Number(await AsyncStorage.getItem(GOAL_KEY)); if (g > 0) goalMl = g; } catch { /* default */ }
  try {
    const { peek } = require('./offline'); const { today } = require('../config/api');
    const res: any = await peek(`/api/water?date=${today()}`);
    const logs: any[] = res?.logs || [];
    const times = logs.map((l) => new Date(l.createdAt).getTime()).filter((t) => Number.isFinite(t));
    return { lastLogAt: times.length ? new Date(Math.max(...times)) : null, totalMl: logs.reduce((t, l) => t + (Number(l.amountMl) || 0), 0), goalMl };
  } catch { return { lastLogAt: null, totalMl: 0, goalMl }; }
}

/**
 * Call right after water is logged or deleted (pass what you know to skip a read), and on app start: re-plans the "no water in the
 * last hour" reminders from the latest entry. Never throws.
 */
export function refreshWaterNudges(state?: Partial<WaterState>): Promise<void> { return exclusive(() => refreshWaterNudgesNow(state)); }
async function refreshWaterNudgesNow(state?: Partial<WaterState>): Promise<void> {
  if (!Notifications) return;
  try {
    const prefs = await loadPrefs();
    if (!prefs.waterEnabled || prefs.waterMode !== 'adaptive') return;
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;
    const base = await readWaterState();
    await ensureChannel();
    await scheduleWaterReminders(prefs, { ...base, ...(state || {}) } as WaterState);
  } catch { /* a reminder failing to schedule must never break logging */ }
}

// Motivation: every N minutes/hours inside a window, a different quote each time.
async function scheduleMotivationReminders(prefs: ReminderPrefs) {
  await cancelGroup('motivation');
  if (!prefs.motivationEnabled) return;
  if (await roughToday()) return;
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  const slots = plannedSlots(prefs).motivation;
  const quotes = pickQuotes(slots.length, dayOfYear());
  const ids: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    ids.push(await Notifications.scheduleNotificationAsync({
      content: { title: '🔥 Time to start', body: quotes[i], sound: true, data: { screen: '/(tabs)/tasks' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: slots[i].hour, minute: slots[i].minute, channelId: CHANNEL_ID },
    }));
  }
  await setIds('motivation', ids);
}

// Custom reminders behave like calendar events: "once" fires a single time
// at an exact date+time, "daily" repeats at that time every day, and
// "weekly" repeats on the weekday derived from the chosen date. Each one
// gets its own id-group ("custom:<id>") so an individual reminder can be
// edited or deleted without touching the others.
async function scheduleOneCustomReminder(r: CustomReminder) {
  const groupKey = `custom:${r.id}`;
  await cancelGroup(groupKey);
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);

  const { hour, minute } = parseTime(r.time);
  const content = {
    title: `🗓️ ${r.title}`,
    body: r.note?.trim() || 'Reminder from FlexFit.',
    sound: true,
    data: { screen: '/reminders', type: 'custom', reminderId: r.id },
  };

  if (r.repeat === 'daily') {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
    });
    await setIds(groupKey, [id]);
    return;
  }

  if (r.repeat === 'weekly') {
    // expo-notifications weekday is 1-7 with Sunday = 1; Date#getDay() is
    // 0-6 with Sunday = 0, so the two are off by exactly one.
    const weekday = parseLocalDate(r.date).getDay() + 1;
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute, channelId: CHANNEL_ID },
    });
    await setIds(groupKey, [id]);
    return;
  }

  // 'once': an exact calendar-event-style date + time, fires a single time.
  const target = parseLocalDate(r.date);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= Date.now()) {
    // Already in the past — nothing to schedule, and silently skipping
    // (rather than throwing) keeps re-saving the whole reminder list safe.
    await setIds(groupKey, []);
    return;
  }
  const id = await Notifications.scheduleNotificationAsync({
    content,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target, channelId: CHANNEL_ID },
  });
  await setIds(groupKey, [id]);
}

async function scheduleCustomReminders(prefs: ReminderPrefs) {
  for (const r of prefs.customReminders) {
    await scheduleOneCustomReminder(r);
  }
}

async function cancelOneCustomReminder(id: string) {
  await cancelGroup(`custom:${id}`);
}

// --- per-task due-time reminders ---
// Each open, timed task gets its own scheduled notification (group key "task:<id>"), with
// Mark done / Snooze action buttons and a tap target that opens the Tasks screen.
// `taskTriggers()` (utils/reminderSchedule.ts) turns the task's date/time/recurrence into
// concrete expo-notifications triggers — that's the part covered by unit tests.

const TASK_FP_KEY = 'flexfit_task_reminder_fp_v1';

async function loadTaskFingerprints(): Promise<Record<string, string>> {
  try { const raw = await AsyncStorage.getItem(TASK_FP_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
async function saveTaskFingerprints(map: Record<string, string>) {
  try { await AsyncStorage.setItem(TASK_FP_KEY, JSON.stringify(map)); } catch {}
}

function triggerToExpo(spec: ReturnType<typeof taskTriggers>[number]) {
  if (!Notifications) return null;
  if (spec.type === 'daily') return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: spec.hour, minute: spec.minute, channelId: CHANNEL_ID };
  if (spec.type === 'weekly') return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: spec.weekday, hour: spec.hour, minute: spec.minute, channelId: CHANNEL_ID };
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: spec.date, channelId: CHANNEL_ID };
}

export type ReminderTask = { id: string; title: string; date: string; time: string; recurrence?: Recurrence; completed?: boolean };

/** Schedules (or reschedules, if the task changed) the due-time reminder for one task. */
export function scheduleTaskReminder(task: ReminderTask, leadMinutes = 0): Promise<void> { return exclusive(() => scheduleTaskReminderNow(task, leadMinutes)); }
async function scheduleTaskReminderNow(task: ReminderTask, leadMinutes = 0): Promise<void> {
  const groupKey = `task:${task.id}`;
  if (!Notifications || task.completed || !task.time) {
    await cancelGroup(groupKey);
    const fps = await loadTaskFingerprints();
    delete fps[task.id];
    await saveTaskFingerprints(fps);
    return;
  }
  const fp = taskFingerprint(task, leadMinutes);
  const fps = await loadTaskFingerprints();
  if (fps[task.id] === fp) return; // unchanged since last sync — leave the existing schedule alone

  await cancelGroup(groupKey);
  await ensureCategories();
  const specs = taskTriggers((task.recurrence || 'none') as Recurrence, task.date, task.time, leadMinutes);
  const ids: string[] = [];
  for (const spec of specs) {
    const trigger = triggerToExpo(spec);
    if (!trigger) continue;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ ${task.title}`,
        body: 'Due now in FlexFit.',
        sound: true,
        categoryIdentifier: TASK_CATEGORY,
        data: { screen: '/(tabs)/tasks', type: 'task', taskId: task.id },
      },
      trigger: trigger as any,
    });
    ids.push(id);
  }
  await setIds(groupKey, ids);
  fps[task.id] = fp;
  await saveTaskFingerprints(fps);
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  await cancelGroup(`task:${taskId}`);
  const fps = await loadTaskFingerprints();
  if (fps[taskId]) { delete fps[taskId]; await saveTaskFingerprints(fps); }
}

/** Cancels every per-task due-time reminder (used on logout/account deletion, so a stale
 * reminder never points at a task that belonged to a different account on this device). */
export async function cancelAllTaskReminders(): Promise<void> {
  const fps = await loadTaskFingerprints();
  await Promise.all(Object.keys(fps).map((id) => cancelGroup(`task:${id}`)));
  await saveTaskFingerprints({});
}

/**
 * Reconciles scheduled reminders against the given list of open, timed tasks (e.g. the result of
 * GET /api/tasks/upcoming): schedules new/changed ones, cancels any that are no longer in the list
 * (completed or deleted elsewhere — another device, the web app, an offline sync). Silently no-ops
 * if notifications aren't available or permission was never granted, so it's safe to call on every fetch.
 */
export async function syncTaskReminders(tasks: ReminderTask[], leadMinutes = 0): Promise<void> {
  if (!Notifications) return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;
  } catch { return; }

  // iOS silently drops everything past 64 pending notifications, so per-task reminders only get the room the
  // daily slots leave, soonest first. (Everything else still shows in the app; the next sync tops the list up.)
  const prefs = await loadPrefs();
  const plan = budgetPlan(osNotificationLimit(Platform.OS), [
    prefs.waterEnabled ? (prefs.waterMode === 'adaptive' ? Math.min(prefs.waterMaxPerDay, countSlots(prefs.waterStart, prefs.waterEnd, prefs.waterGapMin)) * 2 : countSlots(prefs.waterStart, prefs.waterEnd, Math.max(1, Math.round(prefs.waterIntervalHours || 2)) * 60)) : 0,
    prefs.mealEnabled ? Object.values(prefs.mealsOn).filter(Boolean).length * (prefs.mealFollowUpMin > 0 ? 2 : 1) * 3 : 0,
    prefs.motivationEnabled ? countSlots(prefs.motivationStart, prefs.motivationEnd, prefs.motivationEveryMin) : 0,
    prefs.tasksEnabled ? countSlots(prefs.tasksStart, prefs.tasksEnd, prefs.tasksEveryMin) : 0,
    prefs.customReminders.length,
    prefs.workoutEnabled ? WORKOUT_REMINDER_DAYS : 0,   // up to one planned-workout reminder per day, 7 days ahead
  ]);
  const ordered = [...tasks].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  let used = 0;
  const keep: ReminderTask[] = [];
  for (const t of ordered) {
    const per = t.recurrence && t.recurrence !== 'none' ? (t.recurrence === 'weekdays' ? 5 : 1) : 1;
    if (used + per > plan.taskAllowance) continue;
    used += per; keep.push(t);
  }

  const fps = await loadTaskFingerprints();
  const liveIds = new Set(keep.map((t) => t.id));
  for (const id of Object.keys(fps)) {
    if (!liveIds.has(id)) await cancelTaskReminder(id);
  }
  for (const task of keep) {
    await scheduleTaskReminderNow(task, leadMinutes).catch(() => {});
  }
}

/** Push a task's reminder back by N minutes from now (used by the "Snooze" notification action). */
export async function snoozeTaskReminder(taskId: string, title: string, minutes = 10): Promise<void> {
  if (!Notifications) return;
  await ensureCategories();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ ${title}`,
      body: 'Snoozed reminder from FlexFit.',
      sound: true,
      categoryIdentifier: TASK_CATEGORY,
      data: { screen: '/(tabs)/tasks', type: 'task', taskId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: snoozeDate(minutes), channelId: CHANNEL_ID } as any,
  });
  await setIds(`task:${taskId}`, [...(await getIds(`task:${taskId}`)), id]); // add to — never replace — the task's own reminder ids
}

/**
 * Fetches open, timed tasks for the next two weeks and reconciles reminders against them.
 * Respects the `taskDueRemindersEnabled` / `taskReminderLeadMinutes` preferences. Call this after
 * any task create/edit/complete/delete, and once on app start — it's cheap and safe to call often.
 */
export function resyncTaskReminders(): Promise<void> { return exclusive(resyncTaskRemindersNow); }
async function resyncTaskRemindersNow(): Promise<void> {
  const prefs = await loadPrefs();
  if (!prefs.taskDueRemindersEnabled) {
    const fps = await loadTaskFingerprints();
    await Promise.all(Object.keys(fps).map((id) => cancelTaskReminder(id)));
    return;
  }
  try {
    // Lazy require: config/api.ts never imports this module, so there's no cycle risk, but this
    // keeps the pure-logic parts of this file free of a hard dependency on the network layer.
    const { get } = require('../config/api');
    const { today } = require('../config/api');
    const res: any = await Promise.race([
      get(`/api/tasks/upcoming?days=14&from=${today()}`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 8000)), // never let a sleeping server stall the scheduler
    ]);
    const mapped: ReminderTask[] = (res.tasks || []).map((t: any) => ({
      id: t._id, title: t.title, date: t.date, time: t.time, recurrence: t.recurrence, completed: t.completed,
    }));
    await syncTaskReminders(mapped, prefs.taskReminderLeadMinutes || 0);
    if (prefs.tasksEnabled) await scheduleTaskNudges(prefs).catch(() => {}); // keeps "3 tasks still open: …" current
  } catch {
    // Offline or not logged in yet — the next successful sync will catch up.
  }
}

// ---- Meal-log nudges -------------------------------------------------------------------------------------------------
// One-off notifications for the next few days, PER MEAL: each fires only if that particular meal is still not logged (today's is
// dropped the moment the meal has an entry or you tap "Skipped it"). An optional follow-up asks once more.
const SKIPPED_KEY = 'flexfit_meals_skipped';
async function skippedMealsToday(): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(SKIPPED_KEY); const v = raw ? JSON.parse(raw) : null; return v && v.date === localDateKey() ? v.meals || [] : []; } catch { return []; }
}
/** Meals marked skipped today (for the Food screen to show). */
export const getSkippedMeals = (): Promise<string[]> => skippedMealsToday();
/** Takes a meal off today's skipped list (Undo) and brings its reminders back. */
export async function unskipMeal(meal: string): Promise<void> {
  try {
    const cur = await skippedMealsToday();
    await AsyncStorage.setItem(SKIPPED_KEY, JSON.stringify({ date: localDateKey(), meals: cur.filter((m) => m !== meal) }));
  } catch { /* ignore */ }
  await refreshMealNudges();
}
/** "I didn't eat this meal today": stops that meal's nudge and follow-up for the rest of today, and re-plans. */
export async function markMealSkipped(meal: string): Promise<void> {
  try {
    const cur = await skippedMealsToday();
    if (!cur.includes(meal)) await AsyncStorage.setItem(SKIPPED_KEY, JSON.stringify({ date: localDateKey(), meals: [...cur, meal] }));
  } catch { /* ignore */ }
  await refreshMealNudges();
}

/** Takes one delivered reminder out of the notification shade (a button press does not do that by itself). Never throws. */
export async function dismissNotification(id?: string): Promise<void> {
  if (!Notifications || !id) return;
  try { await Notifications.dismissNotificationAsync(id); } catch { /* already gone */ }
}

/** A short, silent notice right now ("Lunch skipped"), for a button pressed while the app is closed: the only way to show the tap worked.
 * Removed again after a few seconds where the app is still alive to do it. Never throws. */
export async function postConfirmation(title: string, body: string): Promise<void> {
  if (!Notifications) return;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: false, data: { type: 'confirmation', keep: true } },
      trigger: Platform.OS === 'android' ? ({ channelId: CHANNEL_ID } as any) : null,
    });
    setTimeout(() => { Notifications!.dismissNotificationAsync(id).catch(() => {}); }, 8000);
  } catch { /* no permission or no channel yet: the tap still worked */ }
}

/** Meals with an entry today: fresh from the server when it answers within 4 s, otherwise the last saved copy (plus anything queued offline). */
async function loggedMealsToday(): Promise<string[]> {
  try {
    const { read, peek } = require('./offline');
    const d = new Date(), path = `/api/food-logs?date=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // padded: the API wants YYYY-MM-DD (localDateKey() is not)
    const res: any = await Promise.race([read(path), new Promise((resolve) => setTimeout(() => resolve(null), 4000))]) || (await peek(path));
    return (res?.logs || []).map((l: any) => String(l.mealType));
  } catch { return []; }
}

/** Schedules the single evening "plan tomorrow's lunch" reminder (or cancels it). `plannedTomorrow` skips tonight when lunch is already planned. */
export async function scheduleTiffinNudge(prefs: ReminderPrefs, plannedTomorrow = false) {
  await cancelGroup('tiffin');
  if (!prefs.tiffinEnabled) return;
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  const at = planTiffinNudge(new Date(), { enabled: true, time: prefs.tiffinTime, quiet: prefs.quietEnabled ? { start: prefs.quietStart, end: prefs.quietEnd } : null, plannedTomorrow });
  if (!at) return;
  await ensureCategories();
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: (toneNotify('tiffin') || TIFFIN_TEXT).title, body: (toneNotify('tiffin') || TIFFIN_TEXT).body, sound: true, data: { screen: '/food', type: 'tiffin' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
  });
  await setIds('tiffin', [id]);
}
/** Habit anchors: one reminder per habit that has an anchor time. Follows quiet hours and the daily cap; fewer on a rough day. */
/** Medicine and supplement reminders (2 days ahead). Quiet hours move a reminder to the end of quiet time. A reminder tool, not medical advice. */
export async function scheduleMedReminders(prefs: ReminderPrefs, justTaken: string[] = []): Promise<void> {
  await cancelGroup('meds');
  if (!Notifications) return;
  let res: any = null;
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  try { const { read } = require('./offline'); res = await Promise.race([read(`/api/meds?date=${date}&now=00:00`), new Promise((r) => setTimeout(() => r(null), 4000))]); } catch { return; }
  const meds = (res?.meds || []).map((m: any) => ({ id: String(m._id), name: m.name, dose: m.dose, times: m.times || [], days: m.days || [], active: m.active !== false }));
  if (!meds.length) return;
  // `justTaken` ("YYYY-MM-DD|medId|HH:mm") covers the dose that was ticked a moment ago, in case the read above came from an older saved copy.
  const taken = new Set<string>([...(res?.checklist?.items || []).filter((i: any) => i.taken).map((i: any) => `${date}|${i.medId}|${i.time}`), ...justTaken]);
  const plan = planMedNudges(new Date(), meds, { quiet: prefs.quietEnabled ? { start: prefs.quietStart, end: prefs.quietEnd } : null, taken });
  if (!plan.length) return;
  await ensureCategories();
  const ids: string[] = [];
  for (const n of plan) {
    const t = medText(n);
    try { ids.push(await Notifications.scheduleNotificationAsync({
      content: { title: t.title, body: t.body, sound: true, categoryIdentifier: MED_CATEGORY, data: { screen: '/medicines', type: 'med', medId: n.medId, doses: n.doses } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL_ID },
    })); } catch { /* no permission or OS limit */ }
  }
  await setIds('meds', ids);
}
/** Re-plans medicine reminders after the list changes or a dose is ticked. Never throws, never asks for permission by itself.
 * `justTaken` = keys ("YYYY-MM-DD|medId|HH:mm") of doses just marked taken, so they are dropped even if the server copy is not fresh yet.
 * Runs through the single scheduler queue: a tick, the screen reload and the app-foreground refresh can all land together, and run in
 * parallel they each cancel "the old ids" and schedule a new set, leaving the first set ringing forever (the "two reminders" bug). */
export function refreshMedsNow(justTaken: string[] = []): Promise<void> { return exclusive(() => refreshMedsNowInner(justTaken)); }
async function refreshMedsNowInner(justTaken: string[] = []): Promise<void> {
  if (!Notifications) return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;
    await ensureChannel();
    await scheduleMedReminders(await loadPrefs(), justTaken);
    await sweepOrphans(); // also clears reminders an older run leaked (ids no longer tracked), which is where repeat rings came from
  } catch { /* a reminder failing to schedule must never break the app */ }
}
export async function scheduleAnchorReminders(prefs: ReminderPrefs): Promise<void> {
  await cancelGroup('anchors');
  if (!Notifications) return;
  let habits: any[] = [];
  try {
    const { read } = require('./offline');
    habits = ((await read('/api/habits'))?.habits || []).filter((h: any) => h.anchor?.text && h.anchor?.time);
  } catch { return; }
  if (!habits.length) return;
  const done = new Set<string>();
  try {
    const { read } = require('./offline'); const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
    for (const l of ((await read(`/api/habits/logs?date=${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`))?.logs || [])) if (l.completed) done.add(String(l.habitId));
  } catch { /* offline: assume not done */ }
  const plan = planAnchors(new Date(), habits.map((h: any) => ({ id: String(h._id), name: h.name, anchorText: h.anchor.text, time: h.anchor.time, doneToday: done.has(String(h._id)) })),
    { quiet: prefs.quietEnabled ? { start: prefs.quietStart, end: prefs.quietEnd } : null, maxPerDay: prefs.maxPerDay, rough: await roughToday() });
  if (!plan.length) return;
  await ensureCategories();
  const ids: string[] = [];
  for (const n of plan) {
    const t = anchorText(n);
    try { ids.push(await Notifications.scheduleNotificationAsync({
      content: { title: t.title, body: t.body, sound: true, data: { screen: '/habits', type: 'anchor', habitId: n.habitId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL_ID },
    })); } catch { /* no permission or OS limit: skip this one */ }
  }
  await setIds('anchors', ids);
}

/** Re-plans anchor reminders after a habit changes or is completed. Never throws, never asks for permission by itself. */
export async function refreshAnchorsNow(): Promise<void> {
  if (!Notifications) return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;
    await ensureChannel();
    await scheduleAnchorReminders(await loadPrefs());
  } catch { /* a reminder failing to schedule must never break the app */ }
}

async function tomorrowLunchPlanned(): Promise<boolean> {
  try {
    const { read, peek } = require('./offline');
    const d = new Date(); d.setDate(d.getDate() + 1);
    const p = (n: number) => String(n).padStart(2, '0');
    const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const path = `/api/tiffin?date=${t}`;
    const res: any = await Promise.race([read(path), new Promise((resolve) => setTimeout(() => resolve(null), 3000))]) || (await peek(path));
    return !!res?.planAlready;
  } catch { return false; }
}

export async function scheduleMealNudges(prefs: ReminderPrefs, loggedMeals: Iterable<string> = []) {
  await cancelGroup('meals');
  if (!prefs.mealEnabled) return;
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  await ensureCategories();
  const ids: string[] = [];
  const plan = planMealNudges(new Date(), prefs.mealTimes, loggedMeals, 3, { on: prefs.mealsOn, skipped: await skippedMealsToday(), followUpMin: prefs.mealFollowUpMin });
  for (const n of plan) {
    const t = MEAL_NUDGE_TEXT[n.meal];
    ids.push(await Notifications.scheduleNotificationAsync({
      content: { title: (!n.followUp && toneNotify('meal', { meal: n.meal === 'snacks' ? 'snacks' : n.meal })?.title) || (n.followUp ? t.followTitle : t.title), body: (!n.followUp && toneNotify('meal', { meal: n.meal === 'snacks' ? 'snacks' : n.meal })?.body) || (n.followUp ? t.followBody : t.body), sound: true, categoryIdentifier: MEAL_CATEGORY, data: { screen: `/food?meal=${n.meal}`, type: 'meal', meal: n.meal } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL_ID },
    }));
  }
  await setIds('meals', ids);
}

/** Re-plans the meal nudges from today's food log (pass the meals that have entries, or omit to read the log). Never throws. */
export function refreshMealNudges(loggedMeals?: Iterable<string>): Promise<void> { return exclusive(() => refreshMealNudgesNow(loggedMeals)); }
async function refreshMealNudgesNow(loggedMeals?: Iterable<string>): Promise<void> {
  if (!Notifications) return;
  try {
    const prefs = await loadPrefs();
    if (!prefs.mealEnabled) { await cancelGroup('meals'); return; }
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;
    const meals: string[] = loggedMeals ? [...loggedMeals] : await loggedMealsToday();
    await ensureChannel();
    await scheduleMealNudges(prefs, meals);
  } catch { /* a nudge failing to schedule must never break logging */ }
}

async function refreshTiffinNow(): Promise<void> {
  if (!Notifications) return;
  try {
    const prefs = await loadPrefs();
    if (!prefs.tiffinEnabled) { await cancelGroup('tiffin'); return; }
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;
    await ensureChannel();
    await scheduleTiffinNudge(prefs, await tomorrowLunchPlanned());
  } catch { /* a reminder failing to schedule must never break the app */ }
}

// ---------------------------------------------------------------- planned-workout reminders
// One reminder, at the time the person chose, on each of the next 7 days that still has a workout to do (the planner's items, not the Smart program).
// A notification's text cannot change once scheduled, so "stop when done or skipped" means: re-plan whenever that can have changed (see refreshWorkoutReminders).
const WORKOUT_DONE_KEY = 'flexfit_workout_done_ids';
/** Workout ids marked done on THIS phone, with the day they were marked. The server may not know yet (offline), and would otherwise bring the reminder back. Kept for 21 days. */
async function loadWorkoutDone(): Promise<Record<string, string>> {
  try { const v = JSON.parse((await AsyncStorage.getItem(WORKOUT_DONE_KEY)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
async function rememberWorkoutsDone(ids: string[], notDone: string[] = []): Promise<Record<string, string>> {
  const cur = await loadWorkoutDone();
  for (const id of notDone) delete cur[id];      // ticked back to "not done" in the planner
  const today = toDateStr(new Date());
  const keep = toDateStr(new Date(Date.now() - 21 * 86400000));
  for (const id of ids) if (id) cur[id] = today;
  for (const k of Object.keys(cur)) if (cur[k] < keep) delete cur[k];
  try { await AsyncStorage.setItem(WORKOUT_DONE_KEY, JSON.stringify(cur)); } catch { /* best effort */ }
  return cur;
}

/** The planner's items for the reminder window, from the network (3 s at most) or the saved copy. null = could not tell. */
async function loadWorkoutItems(from: string, to: string): Promise<any[] | null> {
  try {
    const { read, peek } = require('./offline');
    const path = `/api/workout-plan?from=${from}&to=${to}`;
    const res: any = await Promise.race([read(path).catch(() => null), new Promise((resolve) => setTimeout(() => resolve(null), 3000))]) || (await peek(path));
    return Array.isArray(res?.items) ? res.items : null;
  } catch { return null; }
}

export async function scheduleWorkoutReminders(prefs: ReminderPrefs, items: any[], doneIds: string[] = []) {
  await cancelGroup('workouts');
  if (!prefs.workoutEnabled) return;
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  const plan = workoutReminderPlan(items, { today: toDateStr(new Date()), time: prefs.workoutTime, doneIds });
  const ids: string[] = [];
  for (const r of plan) {
    ids.push(await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, sound: true, data: { screen: '/workout-planner', type: 'workout', date: r.date } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL_ID },
    }));
  }
  await setIds('workouts', ids);
}

/**
 * Re-plans the workout reminders from the planner. Call after anything that can change what is left to do: a workout done / skipped / moved / added / removed,
 * an exercise logged. `doneIds` = workouts just marked done on this phone (remembered, so an offline "done" still cancels the reminder); `notDoneIds` = ticked back. Never throws.
 * If the plan cannot be read (offline, nothing saved) the reminders already scheduled are left alone, never wiped.
 */
export function refreshWorkoutReminders(opts: { doneIds?: string[]; notDoneIds?: string[] } = {}): Promise<void> { return exclusive(() => refreshWorkoutRemindersNow(opts)); }
async function refreshWorkoutRemindersNow(opts: { doneIds?: string[]; notDoneIds?: string[] } = {}): Promise<void> {
  if (!Notifications) return;
  try {
    const prefs = await loadPrefs();
    if (opts.doneIds?.length || opts.notDoneIds?.length) await rememberWorkoutsDone(opts.doneIds || [], opts.notDoneIds || []);
    if (!prefs.workoutEnabled) { await cancelGroup('workouts'); return; }
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== 'granted') return;
    const from = toDateStr(new Date());
    const to = toDateStr(new Date(Date.now() + (WORKOUT_REMINDER_DAYS - 1) * 86400000));
    const items = await loadWorkoutItems(from, to);
    if (!items) return;
    await ensureChannel();
    await scheduleWorkoutReminders(prefs, items, Object.keys(await loadWorkoutDone()));
  } catch { /* a reminder failing to schedule must never break the screen that asked */ }
}

/**
 * Applies (schedules/reschedules/cancels) all reminder categories to match
 * the given preferences, requesting notification permission first. Throws if
 * permission is denied so the UI can show a clear message.
 */
export function applyReminders(prefs: ReminderPrefs): Promise<void> { return exclusive(() => applyRemindersNow(prefs)); }
async function applyRemindersNow(prefs: ReminderPrefs): Promise<void> {
  const anyEnabled =
    prefs.tasksEnabled || prefs.waterEnabled || prefs.motivationEnabled || prefs.mealEnabled || prefs.tiffinEnabled || prefs.workoutEnabled || prefs.customReminders.length > 0;

  if (anyEnabled) {
    const granted = await ensurePermission();
    if (!granted) {
      throw new Error('Notifications are turned off for FlexFit in your device settings.');
    }
  }

  await scheduleTaskNudges(prefs);
  await scheduleWaterReminders(prefs);
  await scheduleMotivationReminders(prefs);
  await scheduleCustomReminders(prefs);
  // Pass what is already logged: without it, saving reminder settings would re-add today's nudge for a meal you have already logged.
  await scheduleMealNudges(prefs, prefs.mealEnabled ? await loggedMealsToday() : []);
  await scheduleTiffinNudge(prefs, prefs.tiffinEnabled ? await tomorrowLunchPlanned() : false);
  await scheduleAnchorReminders(prefs);
  await scheduleMedReminders(prefs);
  await refreshWorkoutRemindersNow();   // reads the planner itself; a switch turned off cancels its group
  await sweepOrphans();
}

/** Cancels and forgets a single custom reminder, without touching the rest of `prefs` — the caller still owns removing it from the saved list. */
export async function removeCustomReminder(id: string): Promise<void> {
  await cancelOneCustomReminder(id);
}

/**
 * One-time cleanup for devices that scheduled reminders under the old,
 * untyped triggers (see the `type:` fix in the schedule* functions above).
 * Those could leave duplicate/instant-firing notifications sitting in the
 * OS scheduler that our id-based cancelGroup() doesn't know about. Wipes
 * everything this app has scheduled and re-applies current prefs cleanly.
 * Safe to call multiple times — it's a no-op once the flag is set.
 */
const MIGRATION_FLAG = 'mydailyos_notif_migration_v3'; // v3: new high-importance channel + interval windows
export async function migrateLegacyReminders(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(MIGRATION_FLAG);
    if (done) return;
    if (Notifications) {
      await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      await ensureChannel();
    }
    await Promise.all([setIds('tasks', []), setIds('water', []), setIds('motivation', [])]);
    await saveTaskFingerprints({}); // everything was wiped, so per-task reminders must be re-created
    const prefs = await loadPrefs();
    const anyEnabled = prefs.tasksEnabled || prefs.waterEnabled || prefs.motivationEnabled || prefs.mealEnabled || prefs.customReminders.length > 0;
    if (anyEnabled && Notifications) {
      const granted = await ensurePermission();
      if (granted) await applyReminders(prefs);
    }
    await AsyncStorage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // Best-effort — never block app startup on this.
  }
}

const LAST_REFRESH_KEY = 'flexfit_reminders_refreshed_on';

/**
 * Keeps scheduled reminders fresh. Safe to call often (app start, coming back to the foreground, after task changes):
 *  - rotates the motivation quotes once per calendar day,
 *  - refreshes the "N tasks still open" text,
 *  - re-schedules per-task reminders (also the ones created offline).
 * It also guards against the OS having dropped our alarms: if reminders are enabled but nothing is scheduled, rebuild them.
 */
export function refreshReminders(force = false): Promise<void> { return exclusive(() => refreshRemindersNow(force)); }
async function refreshRemindersNow(force = false): Promise<void> {
  if (!Notifications) return;
  try {
    const prefs = await loadPrefs();
    const anyEnabled = prefs.tasksEnabled || prefs.waterEnabled || prefs.motivationEnabled || prefs.mealEnabled || prefs.workoutEnabled || prefs.customReminders.length > 0;
    if (anyEnabled) {
      const perms = await Notifications.getPermissionsAsync();
      if (perms.status === 'granted') {
        await ensureChannel();
        const todayKey = String(dayOfYear()) + ':' + new Date().getFullYear();
        const last = await AsyncStorage.getItem(LAST_REFRESH_KEY);
        const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => [] as any[]);
        if (force || last !== todayKey || scheduled.length === 0) {
          await applyRemindersNow(prefs);
          await AsyncStorage.setItem(LAST_REFRESH_KEY, todayKey);
        }
      }
    }
  } catch { /* never let a background refresh crash the app */ }
  await refreshMealNudgesNow();
  await refreshTiffinNow();
  await refreshMedsNowInner();
  await refreshWaterNudgesNow();
  await resyncTaskRemindersNow();
  await refreshWorkoutRemindersNow();   // every start and return to the app: also catches a workout done elsewhere (a logged exercise)
}

/** Back-compat name used by older call sites. */
export const refreshMotivationWindow = () => refreshReminders();

// ---------------------------------------------------------------- diagnostics ("why didn't I get it?")
export type ReminderDiagnostics = {
  available: boolean;
  permission: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  scheduledCount: number;
  limit: number;
  next: { title: string; when: string }[];
  platform: string;
};

export async function getReminderDiagnostics(): Promise<ReminderDiagnostics> {
  const base = { limit: osNotificationLimit(Platform.OS), platform: Platform.OS };
  if (!Notifications) return { ...base, available: false, permission: 'unavailable', scheduledCount: 0, next: [] };
  const perms = await Notifications.getPermissionsAsync().catch(() => ({ status: 'undetermined' } as any));
  const all: any[] = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const toWhen = (t: any): string => {
    if (!t) return '';
    if (t.type === 'daily') return `daily at ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    if (t.type === 'weekly') return `weekly at ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    if (t.type === 'date' && t.value) return new Date(t.value).toLocaleString();
    return t.type || '';
  };
  return {
    ...base, available: true,
    permission: perms.status === 'granted' ? 'granted' : perms.status === 'denied' ? 'denied' : 'undetermined',
    scheduledCount: all.length,
    next: all.slice(0, 6).map((n) => ({ title: String(n.content?.title || ''), when: toWhen(n.trigger) })),
  };
}

/** Fires a real scheduled notification a few seconds from now — close the app straight after to prove background delivery works. */
export async function sendTestNotification(seconds = 10): Promise<void> {
  if (!Notifications) throw new Error(UNAVAILABLE_MESSAGE);
  if (!(await ensurePermission())) throw new Error('Notifications are turned off for FlexFit in your device settings.');
  await Notifications.scheduleNotificationAsync({
    content: { title: '✅ FlexFit test', body: 'If you can read this with the app closed, reminders are working.', sound: true, data: { keep: true } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID } as any,
  });
}

// Android: exact alarms and battery optimisation decide whether a reminder fires ON TIME while the app is closed.
// Without the "Alarms & reminders" permission Android 12+ delivers them inexactly (minutes late in Doze), and many phones
// (Xiaomi, Oppo, Vivo, Samsung…) also kill background apps that aren't exempt from battery optimisation.
const PKG = 'com.flexfit.app';
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const IL = require('expo-intent-launcher');
  try { await IL.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', { data: `package:${PKG}` }); }
  catch { await IL.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${PKG}` }); }
}
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const IL = require('expo-intent-launcher');
  try { await IL.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'); }
  catch { await IL.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${PKG}` }); }
}

export async function cancelAllReminders(): Promise<void> {
  const prefs = await loadPrefs();
  const taskFps = await loadTaskFingerprints();
  await Promise.all([
    cancelGroup('tasks'),
    cancelGroup('water'),
    cancelGroup('motivation'),
    cancelGroup('meals'),
    cancelGroup('workouts'),
    ...prefs.customReminders.map((r) => cancelGroup(`custom:${r.id}`)),
    ...Object.keys(taskFps).map((id) => cancelGroup(`task:${id}`)),
  ]);
  await saveTaskFingerprints({});
}
