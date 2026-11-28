// Thin, crash-proof wrapper around expo-haptics. Every call is fire-and-forget and a no-op
// where haptics aren't available (web, simulators, Expo Go quirks) or the user turned them off.
import AsyncStorage from '@react-native-async-storage/async-storage';

let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch { Haptics = null; }

const KEY = 'flexfit_haptics_enabled_v1';
let enabled = true;
AsyncStorage.getItem(KEY).then((v) => { if (v === '0') enabled = false; }).catch(() => {});

export const hapticsEnabled = () => enabled;
export function setHapticsEnabled(on: boolean) {
  enabled = on;
  AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
}

const run = (fn: () => Promise<unknown> | undefined) => {
  if (!enabled || !Haptics) return;
  try { Promise.resolve(fn()).catch(() => {}); } catch {}
};

/** Light tap: selecting a chip, toggling a switch. */
export const tapHaptic = () => run(() => Haptics!.selectionAsync());
/** Task completed, habit checked, water logged, workout logged. */
export const successHaptic = () => run(() => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Success));
export const warningHaptic = () => run(() => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Warning));
export const errorHaptic = () => run(() => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Error));
/** Firm tap: deleting something (paired with the undo toast). */
export const impactHaptic = () => run(() => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Medium));
