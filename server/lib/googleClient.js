// Thin Google OAuth client for "Continue with Google" sign-in (plain fetch, no SDK). Every function takes an
// injectable fetch so it can be unit-tested without the network.
//
// Scopes: openid + email + profile ONLY. These are Google's non-sensitive "sign-in" scopes, so the app can be
// published ("In production") without any Google verification/review, and ANY Google account can sign in —
// not just the test users you added by hand. FlexFit does not ask for access to Drive, Sheets or anything else.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPES = ['openid', 'email', 'profile'];

class GoogleError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'GoogleError';
    this.status = status;
    this.code = code;
  }
}

const configured = (env = process.env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

function buildAuthUrl({ clientId, redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    prompt: 'select_account', // let the person pick which Google account to use; no refresh token is needed for sign-in
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

async function call(fetchImpl, url, init = {}) {
  let res;
  try { res = await fetchImpl(url, init); }
  catch (e) { throw new GoogleError(`Could not reach Google (${e.message})`); }
  let body = null;
  const text = await res.text().catch(() => '');
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const code = body?.error?.status || body?.error || '';
    const msg = body?.error?.message || body?.error_description || body?.error || `Google answered ${res.status}`;
    throw new GoogleError(String(msg), { status: res.status, code: String(code) });
  }
  return body;
}

const form = (obj) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(obj).toString() });

async function exchangeCode({ code, clientId, clientSecret, redirectUri }, fetchImpl = globalThis.fetch) {
  return call(fetchImpl, TOKEN_URL, form({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }));
}

const getUserInfo = (accessToken, fetchImpl = globalThis.fetch) =>
  call(fetchImpl, USERINFO_URL, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });

module.exports = { GoogleError, configured, buildAuthUrl, exchangeCode, getUserInfo, SCOPES };
