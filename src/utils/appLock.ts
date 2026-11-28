// Native side of the optional app lock (expo-local-authentication). Off by default. Loaded lazily so the web, tests and a build
// without the module never crash: if the module is missing the lock simply reports "not possible".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { DEFAULT_LOCK, LockSettings, parseLock, AuthResult } from './appLockPure';

const KEY = 'flexfit_applock_v1';
function lib(): any | null {
  if (Platform.OS === 'web') return null;
  try { return require('expo-local-authentication'); } catch { return null; }
}

export async function loadLock(): Promise<LockSettings> {
  return parseLock(await AsyncStorage.getItem(KEY).catch(() => null));
}
export async function saveLock(s: LockSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
}

/** True if the phone has a fingerprint / face OR at least a PIN / pattern set (so the system prompt can always be passed). */
export async function lockCapable(): Promise<boolean> {
  const la = lib();
  if (!la) return false;
  try { return (await la.getEnrolledLevelAsync()) !== (la.SecurityLevel?.NONE ?? 0); } catch { return false; }
}

/** Shows the system prompt. Device PIN / pattern fallback stays ON (disableDeviceFallback: false). */
export async function authenticate(message = 'Unlock FlexFit'): Promise<AuthResult> {
  const la = lib();
  if (!la) return { success: false, error: 'not_available' };
  try {
    const r = await la.authenticateAsync({ promptMessage: message, cancelLabel: 'Cancel', disableDeviceFallback: false });
    return { success: r?.success === true, error: r?.success ? undefined : r?.error };
  } catch { return { success: false, error: 'unknown' }; }
}

export { DEFAULT_LOCK };
