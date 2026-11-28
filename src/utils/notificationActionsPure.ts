// Pure helpers for notification button taps ("Skipped it", "Mark done", "Snooze", "+250 ml"). No React Native imports, so they run in plain Node tests.
//
// Why this exists: the buttons are declared with opensAppToForeground:false, so a tap never opens the app. When the app was in the
// background or closed, nothing ran and the tap looked broken. The same normalising, de-duplication and wording is now shared by the
// in-app listener and by the background task that Android runs for a tap while the app is closed (see notificationTask.ts).

export type NormalizedResponse = {
  /** The notification's identifier (what the OS calls it), '' if unknown. */
  id: string;
  /** The button that was pressed, or the default "open" action. */
  action: string;
  /** The data we attached when scheduling: screen, type, meal, taskId. */
  data: Record<string, any>;
  title: string;
  /** When the notification was delivered (ms since 1970), 0 if unknown. */
  deliveredAt: number;
};

export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';
/** Buttons that just open a screen (the app comes to the front): they are routed by the app, never run in the background. */
export const OPEN_ACTIONS = [DEFAULT_ACTION, 'log-now'];
export const opensScreen = (action: string) => OPEN_ACTIONS.includes(action);

/** Accepts the response shape from the in-app listener AND from the background task payload, and tolerates missing pieces. */
export function normalizeResponse(raw: any): NormalizedResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const notification = raw.notification || (raw.request ? raw : null);
  const request = notification?.request || {};
  const content = request.content || {};
  const action = typeof raw.actionIdentifier === 'string' ? raw.actionIdentifier : DEFAULT_ACTION;
  let data = content.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  if (!data || typeof data !== 'object') data = {};
  const date = Number(notification?.date);
  return {
    id: typeof request.identifier === 'string' ? request.identifier : '',
    action,
    data,
    title: typeof content.title === 'string' ? content.title : '',
    // expo reports seconds on some platforms and milliseconds on others
    deliveredAt: Number.isFinite(date) && date > 0 ? (date < 1e12 ? Math.round(date * 1000) : Math.round(date)) : 0,
  };
}

/**
 * One key per physical tap. A repeating reminder keeps the same identifier every day, so the delivery time is part of the key:
 * tomorrow's tap is a new tap, but the same tap seen twice (listener + background task, or a cold start replaying the last response) is one.
 */
export const responseKey = (r: NormalizedResponse): string => `${r.id}|${r.action}|${r.deliveredAt}`;

/** Remembers the last N handled taps (newest last). Returns the new list and whether this key was already there. */
export function claim(list: string[], key: string, keep = 40): { list: string[]; already: boolean } {
  if (list.includes(key)) return { list, already: true };
  return { list: [...list, key].slice(-keep), already: false };
}

const MEAL_NAME: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
export const mealName = (m: string) => MEAL_NAME[m] || 'That meal';

/** What to tell the person after a button tap, so it never looks like nothing happened. Null for a plain tap that just opens a screen. */
export function confirmationText(r: NormalizedResponse, ids: { done: string; snooze: string; water: string; water500: string; skipMeal: string; medTaken?: string }): { title: string; body: string } | null {
  if (r.action === ids.skipMeal && r.data.meal) return { title: `${mealName(String(r.data.meal))} skipped`, body: `No more ${mealName(String(r.data.meal)).toLowerCase()} reminders today. You can still log it any time.` };
  if (r.action === ids.done && r.data.taskId) return { title: 'Task done ✓', body: r.title ? r.title.replace(/^⏰\s*/, '') : 'Marked as done.' };
  if (r.action === ids.snooze && r.data.taskId) return { title: 'Snoozed for 10 minutes', body: r.title ? r.title.replace(/^⏰\s*/, '') : 'I will remind you again.' };
  if (r.action === ids.water) return { title: '💧 250 ml logged', body: 'Nice. The next water reminder restarts from now.' };
  if (r.action === ids.water500) return { title: '🥤 500 ml logged', body: 'Nice. The next water reminder restarts from now.' };
  if (ids.medTaken && r.action === ids.medTaken) return { title: 'Marked as taken ✓', body: r.title && r.title !== 'Medicine reminder' ? r.title : 'Logged in your medicine checklist.' };
  return null;
}
