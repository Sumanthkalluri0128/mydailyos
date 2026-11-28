// What happens when someone presses a button on a reminder ("Skipped it", "Mark done", "Snooze 10m", "250 ml"), or taps the reminder itself.
// Used by BOTH the in-app listener (components/NotificationRouter.tsx) and the background task Android runs while the app is closed
// (notificationTask.ts). One code path, so the button behaves the same everywhere:
//   1. do the action through the same offline-safe write path as the screens,
//   2. take the reminder out of the notification shade (the button used to leave it sitting there),
//   3. say what happened (a banner in the app, a short notice when the app is closed),
//   4. remember the tap, so it is never run twice (a cold start used to replay the last tap: a "250 ml" button could log water again).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACTION_LOG_WATER, ACTION_LOG_WATER_500, ACTION_MARK_DONE, ACTION_MED_TAKEN, ACTION_SKIP_MEAL, ACTION_SNOOZE,
  cancelTaskReminder, dismissNotification, markMealSkipped, postConfirmation, refreshMedsNow, refreshWaterNudges, snoozeTaskReminder,
} from './notifications';
import { write, newClientId } from './offline';
import { successHaptic } from './haptics';
import { today } from '../config/api';
import { claim, confirmationText, normalizeResponse, opensScreen, responseKey, type NormalizedResponse } from './notificationActionsPure';

const HANDLED_KEY = 'mydailyos_notif_handled';
const inflight = new Set<string>(); // taps being handled right now (the listener and the background task can both see the same tap)

async function claimTap(key: string): Promise<boolean> {
  if (inflight.has(key)) return false;
  inflight.add(key);
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    let list: string[] = [];
    try { const v = raw ? JSON.parse(raw) : []; if (Array.isArray(v)) list = v.filter((x) => typeof x === 'string'); } catch { list = []; }
    const res = claim(list, key);
    if (res.already) return false;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify(res.list));
    return true;
  } catch {
    return true; // storage trouble must never swallow a tap
  }
}

export type ActionOutcome =
  | { kind: 'ignored' }
  | { kind: 'navigate'; screen: string }
  | { kind: 'done'; title: string; body: string };

/**
 * Runs one notification response. `appActive` says whether the app is on screen: then the caller shows its own in-app banner, otherwise a short
 * confirmation notice is posted so the button visibly did something.
 */
export async function runNotificationResponse(raw: any, opts: { appActive?: boolean; background?: boolean } = {}): Promise<ActionOutcome> {
  const r: NormalizedResponse | null = normalizeResponse(raw);
  if (!r) return { kind: 'ignored' };
  // "Log it now" and a plain tap open the app. The background task leaves them alone (without claiming them) so the app can navigate.
  if (opts.background && opensScreen(r.action)) return { kind: 'ignored' };
  if (!(await claimTap(responseKey(r)))) return { kind: 'ignored' };

  const ids = { done: ACTION_MARK_DONE, snooze: ACTION_SNOOZE, water: ACTION_LOG_WATER, water500: ACTION_LOG_WATER_500, skipMeal: ACTION_SKIP_MEAL, medTaken: ACTION_MED_TAKEN };
  const isDefault = opensScreen(r.action);
  if (isDefault) return r.data?.screen ? { kind: 'navigate', screen: String(r.data.screen) } : { kind: 'ignored' };

  let acted = false;
  try {
    if (r.action === ACTION_MARK_DONE && r.data.taskId) {
      await write('PATCH', `/api/tasks/${r.data.taskId}/toggle`, { completed: true }, 'Mark task done');
      await cancelTaskReminder(String(r.data.taskId));
      acted = true;
    } else if (r.action === ACTION_SNOOZE && r.data.taskId) {
      await snoozeTaskReminder(String(r.data.taskId), String(r.title || 'Task').replace(/^⏰\s*/, ''), 10);
      acted = true;
    } else if (r.action === ACTION_LOG_WATER || r.action === ACTION_LOG_WATER_500) {
      const ml = r.action === ACTION_LOG_WATER_500 ? 500 : 250;
      await write('POST', '/api/water', { date: today(), amountMl: ml, clientId: newClientId('w') }, `Water ${ml} ml`);
      await refreshWaterNudges({ lastLogAt: new Date() }); // restart the "no water in an hour" clock from this entry
      acted = true;
    } else if (r.action === ACTION_MED_TAKEN && r.data.medId) {
      // "✓ Taken" on a medicine reminder: tick every dose this ring covers (same offline-safe write as the checklist), then re-plan so none of them rings again.
      const doses: { date: string; time: string }[] = Array.isArray(r.data.doses) ? r.data.doses.filter((d: any) => d && typeof d.date === 'string' && typeof d.time === 'string') : [];
      const keys: string[] = [];
      for (const d of doses) {
        try { await write('POST', `/api/meds/${r.data.medId}/take`, { date: d.date, time: d.time, taken: true, now: '23:59' }, 'Medicine taken'); } catch { /* queued or rejected: the loop must not stop for one dose */ }
        keys.push(`${d.date}|${r.data.medId}|${d.time}`);
      }
      await refreshMedsNow(keys);
      acted = true;
    } else if (r.action === ACTION_SKIP_MEAL && r.data.meal) {
      await markMealSkipped(String(r.data.meal)); // saves "skipped today" and re-plans: no nudge, no follow-up for that meal until tomorrow
      acted = true;
    }
  } catch {
    // Offline or a slow server: write() already queued it, so it syncs later. Still treat the tap as done so the person gets feedback.
    acted = true;
  }
  if (!acted) return { kind: 'ignored' };

  await dismissNotification(r.id); // the button used to leave the reminder in the shade, which looked like "nothing happened"
  try { successHaptic(); } catch { /* no haptics while the app is closed */ }
  const text = confirmationText(r, ids);
  if (!text) return { kind: 'ignored' };
  if (!opts.appActive) await postConfirmation(text.title, text.body);
  return { kind: 'done', title: text.title, body: text.body };
}
