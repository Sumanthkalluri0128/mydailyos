import { hydrateSmartPlan } from '../utils/smartPlanStore';
import { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotificationProvider } from '../components/Notifications';
import { NotificationRouter } from '../components/NotificationRouter';
import { OfflineBanner } from '../components/OfflineBanner';
import { NetworkActivity } from '../components/NetworkActivity';
import { ServerWakeBanner } from '../components/ServerWakeBanner';
import { refreshFlags } from '../utils/flagStore';
import { refreshReminders, migrateLegacyReminders } from '../utils/notifications';
import { ThemeProvider, useTheme } from '../utils/theme';
import { OfflineProvider } from '../utils/offline';
import { initSentry } from '../utils/sentry';
import { TapMarker } from '../motion/TapMarker';
import Companions from '../motion/Companions';
import { TourHost } from '../tour/TourHost';
import { syncHealthConnect } from '../utils/hcSync';
import { AppLockGate } from '../components/AppLockGate';
import { startGymSync } from '../utils/gymSyncRunner';
import { startRecordSync } from '../utils/gymRecordRunner';

initSentry();

/** Themed shell: status-bar icons that stay readable in both themes, and a background behind every screen
 * (without it the white default flashes between screens in dark mode). */
function Shell() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <AppLockGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </AppLockGate>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // One-time cleanup/migration of reminders scheduled by older app versions, then keep them fresh:
    // rotate quotes daily, refresh the "N tasks open" text, re-create anything the OS dropped, and schedule
    // per-task reminders (including tasks added offline). Never throws.
    migrateLegacyReminders().then(() => refreshReminders());
    hydrateSmartPlan().catch(() => {});   // the right workout plan (Smart or Classic) is active before any workout screen opens
    refreshFlags().catch(() => {}); // feature flags (cached 6 h)
    syncHealthConnect().catch(() => {}); // extra Health Connect data the person switched on (sleep, heart rate, workouts)
    startGymSync(); // gym log exercises -> calories burned and exercise minutes on Exercise and Home
    startRecordSync(); // the Gym log itself, across devices (only when the person turned it on)
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { refreshReminders(); syncHealthConnect().catch(() => {}); } });
    return () => sub.remove();
  }, []);
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <NotificationProvider>
          <OfflineProvider>
            <TapMarker>
              <NotificationRouter />
              <ServerWakeBanner />
              <OfflineBanner />
              <Shell />
              <Companions />
              <NetworkActivity />
              <TourHost />
            </TapMarker>
          </OfflineProvider>
        </NotificationProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
