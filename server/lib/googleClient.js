// Thin Google OAuth + Sheets client (plain fetch, no SDK). Every function takes an injectable fetch so it can
// be unit-tested without the network.
//
// Scope used: drive.file — the *non-sensitive* scope that only lets FlexFit see files it created itself.
// FlexFit can never read or touch any other file in the person's Drive, and Google needs no app review for it.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'];

class GoogleError extends Error {
  constructor(message, { status = 0, code = '', needsReconnect = false, notFound = false } = {}) {
    super(message);
    this.name = 'GoogleError';
    this.status = status;
    this.code = code;
    this.needsReconnect = needsReconnect;
    this.notFound = notFound;
  }
}

const configured = (env = process.env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

function buildAuthUrl({ clientId, redirectUri, state, loginHint }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // we need a refresh token so the sheet keeps syncing while the app is closed
    prompt: 'consent',      // Google only returns a refresh token when consent is (re)shown
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) p.set('login_hint', loginHint);
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
    throw new GoogleError(String(msg), {
      status: res.status,
      code: String(code),
      needsReconnect: body?.error === 'invalid_grant' || res.status === 401,
      notFound: res.status === 404,
    });
  }
  return body;
}

const form = (obj) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(obj).toString() });
const authed = (token, extra = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(extra.headers || {}) } });

async function exchangeCode({ code, clientId, clientSecret, redirectUri }, fetchImpl = globalThis.fetch) {
  return call(fetchImpl, TOKEN_URL, form({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }));
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }, fetchImpl = globalThis.fetch) {
  const r = await call(fetchImpl, TOKEN_URL, form({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }));
  return r.access_token;
}

const getUserInfo = (accessToken, fetchImpl = globalThis.fetch) => call(fetchImpl, USERINFO_URL, authed(accessToken, { method: 'GET' }));

async function createSpreadsheet(accessToken, { title, tabs }, fetchImpl = globalThis.fetch) {
  const r = await call(fetchImpl, SHEETS, authed(accessToken, {
    method: 'POST',
    body: JSON.stringify({ properties: { title }, sheets: tabs.map((t) => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } })) }),
  }));
  return { id: r.spreadsheetId, url: r.spreadsheetUrl };
}

/** Adds any tab that is missing (e.g. after an app upgrade introduced a new one). */
async function ensureTabs(accessToken, id, tabs, fetchImpl = globalThis.fetch) {
  const meta = await call(fetchImpl, `${SHEETS}/${id}?fields=sheets.properties.title`, authed(accessToken, { method: 'GET' }));
  const have = new Set((meta.sheets || []).map((s) => s.properties.title));
  const missing = tabs.filter((t) => !have.has(t));
  if (missing.length) {
    await call(fetchImpl, `${SHEETS}/${id}:batchUpdate`, authed(accessToken, {
      method: 'POST',
      body: JSON.stringify({ requests: missing.map((t) => ({ addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } } })) }),
    }));
  }
  return missing;
}

/** Replaces the content of every tab in two API calls (clear, then write) — well inside Sheets' quota. */
async function writeTabs(accessToken, id, tabsData, fetchImpl = globalThis.fetch) {
  const names = Object.keys(tabsData);
  await call(fetchImpl, `${SHEETS}/${id}/values:batchClear`, authed(accessToken, { method: 'POST', body: JSON.stringify({ ranges: names.map((n) => `'${n}'!A:Z`) }) }));
  await call(fetchImpl, `${SHEETS}/${id}/values:batchUpdate`, authed(accessToken, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW', // RAW: text such as "=1+1" stays text, so user data can never run as a formula
      data: names.map((n) => ({ range: `'${n}'!A1`, majorDimension: 'ROWS', values: tabsData[n] })),
    }),
  }));
}

module.exports = { GoogleError, configured, buildAuthUrl, exchangeCode, refreshAccessToken, getUserInfo, createSpreadsheet, ensureTabs, writeTabs, SCOPES };
