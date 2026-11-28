// Mounted once at the app root. Handles:
//  1. Tapping a notification -> navigates to the relevant screen (data.screen).
//  2. Action buttons (Mark done / Snooze / Log a glass / Skipped it) -> performs the action directly, without opening the app, using the
//     same offline-safe write path as the screens, then clears the reminder and says what happened (see utils/notificationActions.ts).
//
// This covers taps while the app is running. A button pressed while the app is in the background or closed is handled by the background
// task in utils/notificationTask.ts, which runs the very same code. (Before that task existed those taps did nothing at all.)
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { notificationsAvailable } from '../utils/notifications';
import { runNotificationResponse } from '../utils/notificationActions';
import { useNotifications } from './Notifications';

let Notifications: typeof import('expo-notifications') | null = null;
if (notificationsAvailable) { try { Notifications = require('expo-notifications'); } catch { Notifications = null; } }

export function NotificationRouter() {
  const { success } = useNotifications();

  useEffect(() => {
    if (!Notifications) return;
    const N = Notifications;

    const handle = async (response: any) => {
      // The same code runs when the app is closed (notificationTask.ts). It remembers every tap it has handled, so a response seen twice
      // (this listener plus the background task, or a cold start replaying the last response) only ever runs once.
      const out = await runNotificationResponse(response, { appActive: AppState.currentState === 'active' });
      if (out.kind === 'navigate') router.push(out.screen as any);
      else if (out.kind === 'done' && AppState.currentState === 'active') success(out.title, out.body);
      // Done with this response: stop it being handed to us again on the next launch.
      try { await (N as any).clearLastNotificationResponseAsync?.(); } catch { /* older expo-notifications */ }
    };

    // Cold start: the app was opened by tapping a notification.
    N.getLastNotificationResponseAsync().then((r) => { if (r) handle(r); }).catch(() => {});
    const sub = N.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [success]);

  return null;
}
