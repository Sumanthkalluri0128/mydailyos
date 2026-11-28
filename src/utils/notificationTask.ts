// Background handler for notification buttons. Android runs this when someone presses "Skipped it", "Mark done", "Snooze" or "250 ml" while
// the app is in the background or closed (expo-notifications registerTaskAsync). Without it, those taps went nowhere: no JavaScript was alive
// to receive them, so the button looked dead.
//
// Both calls must run at module scope in a file loaded at startup (index.ts imports this), because the background run loads the bundle
// and only executes top-level code.
import * as TaskManager from 'expo-task-manager';
import { runNotificationResponse } from './notificationActions';
import { notificationsAvailable } from './notifications';

export const NOTIFICATION_ACTION_TASK = 'mydailyos-notification-actions';

try {
  TaskManager.defineTask(NOTIFICATION_ACTION_TASK, async ({ data, error }: any) => {
    if (error || !data || typeof data !== 'object') return;
    // The task receives received notifications too; only a button press or tap carries an actionIdentifier.
    if (!('actionIdentifier' in data)) return;
    try { await runNotificationResponse(data, { appActive: false, background: true }); } catch { /* a failed background tap is retried by nothing; the queue in write() already holds the data */ }
  });
  if (notificationsAvailable) {
    const Notifications = require('expo-notifications');
    Promise.resolve(Notifications.registerTaskAsync(NOTIFICATION_ACTION_TASK)).catch(() => {});
  }
} catch {
  // Expo Go or a build without the native module: buttons then work only while the app is open, as before.
}
