// Google: "Continue with Google" sign-in only.
// All OAuth happens on the server (see web/server/routes/googleRoutes.js); the phone just opens the system browser
// and receives a flexfit:// deep link back — so there is no native Google SDK to configure.
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_URL, get, saveSession } from '../config/api';
import { startSession } from './session';

WebBrowser.maybeCompleteAuthSession();

const returnUrl = () => Linking.createURL('google');

function parseResult(url: string) {
  const q = Linking.parse(url).queryParams || {};
  return { status: String(q.google || ''), token: q.token ? String(q.token) : '', email: String(q.email || ''), reason: String(q.reason || ''), existing: String(q.existing || '') === '1' };
}

/** "Continue with Google" on the login screen. Resolves { existing } when a session was saved, or null if cancelled. */
export async function loginWithGoogle(): Promise<{ existing: boolean } | null> {
  const back = returnUrl();
  const res = await WebBrowser.openAuthSessionAsync(`${API_URL}/api/google/start?returnTo=${encodeURIComponent(back)}`, back);
  if (res.type !== 'success') return null;
  const r = parseResult(res.url);
  if (r.status === 'ok' && r.token) {
    await startSession(r.token, { email: r.email });
    // The link only carries the email; fetch the full account so the name etc. are stored like after a password login.
    try { const me: any = await get('/api/account/me'); if (me?.user) await saveSession(r.token, me.user); } catch { /* offline: the email is enough for now */ }
    return { existing: r.existing };
  }
  if (r.status === 'cancelled') return null;
  throw new Error(r.reason || 'Google sign-in failed. Please try again.');
}
