// Starting a session (password login, sign-up or Google). The one rule: data cached on this phone belongs to ONE person.
// If a different person signs in, everything cached or queued for the previous one is wiped first, so their entries can
// never show up in (or be uploaded to) the new account. Signing in again as the SAME person (email/password today,
// Google tomorrow, same email) keeps the cache, so it opens instantly and nothing waiting to sync is lost.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveSession } from '../config/api';
import { clearOfflineData } from './offline';
import { clearProfileCache } from '../hooks/useProfile';
import { rebindGym } from './gymStore';

const OWNER_KEY = 'ff.cacheOwner';

export async function startSession(token: string, user: { email?: string } & Record<string, any>) {
  const owner = String(user?.email || '').trim().toLowerCase();
  const previous = await AsyncStorage.getItem(OWNER_KEY).catch(() => null);
  if (previous && owner && previous !== owner) {
    await clearOfflineData();
    clearProfileCache();
  }
  await saveSession(token, user);
  if (owner) await AsyncStorage.setItem(OWNER_KEY, owner).catch(() => {});
  await rebindGym();   // the Gym log is kept per account: show this person's
}
