// End-to-end flows through the REAL Express app over real HTTP: sign up, forgot/reset password (mail captured),
// Continue with Google (consent -> callback -> session), connect Google + spreadsheet creation/sync/disconnect.
//
// Only the outside world is faked: MongoDB (in-memory stand-ins for the model methods the flows use) and Google/mail
// HTTPS endpoints (an intercepting fetch). Everything between — routing, validation, JWT, OAuth state, redirects,
// encryption, sheet building — is the production code.
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.NODE_ENV = 'production';
process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'csecret';
process.env.SHEET_SYNC_DEBOUNCE_MS = '20';
delete process.env.BREVO_API_KEY; delete process.env.RESEND_API_KEY; delete process.env.SMTP_URL; delete process.env.GMAIL_REFRESH_TOKEN;

const { createApp } = require('../app');
const User = require('../models/User');
const Profile = require('../models/Profile');

// ---------------------------------------------------------------- in-memory DB stand-in
const users = new Map();
const profiles = [];
const chain = (v) => { const p = Promise.resolve(v); p.select = () => p; p.lean = () => p; p.sort = () => p; return p; };
const matches = (u, f) => Object.entries(f).every(([k, want]) => {
  const got = k.split('.').reduce((o, part) => (o == null ? o : o[part]), u);
  if (want && typeof want === 'object' && '$ne' in want) return got !== want.$ne;
  if (want && typeof want === 'object' && '$type' in want) return typeof got === 'string';
  return String(got) === String(want);
});
User.findOne = (f) => chain([...users.values()].find((u) => matches(u, f)) || null);
User.findById = (id) => chain(users.get(String(id)) || null);
User.exists = (f) => chain([...users.values()].some((u) => matches(u, f)) ? { _id: 1 } : null);
User.create = async (d) => { const u = new User(d); users.set(String(u._id), u); return u; };
User.prototype.save = async function save() { users.set(String(this._id), this); return this; };
Profile.create = async (d) => { const p = new Profile(d); profiles.push(p); return p; };
Profile.findOne = () => chain(null);
Profile.prototype.save = async function save() { return this; };
for (const n of ['FoodLog', 'WaterLog', 'WeightLog', 'ActivityLog', 'Task', 'HabitLog', 'HealthLog', 'Fast']) mongoose.model(n).find = () => chain([]);

// ---------------------------------------------------------------- fake outside world
const realFetch = globalThis.fetch;
const calls = [];
let sheetBodies = [];
let googleEmail = 'sumanth@gmail.com';
let mailFails = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
  calls.push({ url: u, init });
  if (u === 'https://oauth2.googleapis.com/token') {
    const body = new URLSearchParams(init.body);
    if (body.get('grant_type') === 'authorization_code') return json({ access_token: 'ACCESS', refresh_token: 'REFRESH-1', expires_in: 3600 });
    if (body.get('grant_type') === 'refresh_token') return body.get('refresh_token') === 'REFRESH-1' || body.get('refresh_token') === 'GMAIL-RT' ? json({ access_token: 'ACCESS2' }) : json({ error: 'invalid_grant' }, 400);
  }
  if (u.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) return json({ sub: 'google-sub-1', email: googleEmail, email_verified: true, name: 'Sumanth K' });
  if (u === 'https://sheets.googleapis.com/v4/spreadsheets') return json({ spreadsheetId: 'SHEET1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SHEET1/edit' });
  if (u.includes('/values:batchClear')) return json({});
  if (u.includes('/values:batchUpdate')) { sheetBodies.push(JSON.parse(init.body)); return json({}); }
  if (u.includes('?fields=sheets.properties.title')) return json({ sheets: [{ properties: { title: 'Food' } }] });
  if (u.endsWith(':batchUpdate')) return json({});
  if (u.startsWith('https://gmail.googleapis.com/')) return mailFails ? json({ error: { message: 'boom' } }, 500) : json({ id: 'm1' });
  if (u.startsWith('https://api.brevo.com/')) return mailFails ? json({ message: 'down' }, 500) : json({ messageId: 'x' });
  throw new Error(`unexpected outbound call in test: ${u}`);
};

// ---------------------------------------------------------------- start the real app
let server; let base;
const allowedOrigins = ['https://mydailyos.vercel.app'];
test.before(async () => {
  const app = createApp({ allowedOrigins });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); globalThis.fetch = realFetch; });

const api = async (path, { method = 'GET', body, token, redirect = 'manual' } = {}) => {
  const res = await realFetch(base + path, { method, redirect, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* redirect/html */ }
  return { status: res.status, json, location: res.headers.get('location'), text };
};
const wait = async (cond, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };
const mailCodeFrom = (call) => {
  if (call.url.includes('gmail')) { const raw = JSON.parse(call.init.body).raw; const msg = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(); const b64 = msg.split('\r\n\r\n')[1]; return /code is ([A-Z2-9]{8})/.exec(Buffer.from(b64, 'base64').toString())[1]; }
  return /code is ([A-Z2-9]{8})/.exec(JSON.parse(call.init.body).textContent)[1];
};

// ================================================================= forgot / reset password
test('forgot password: with no mail provider the server says so (instead of pretending it sent a code)', async () => {
  await api('/api/auth/signup', { method: 'POST', body: { name: 'Sumanth', email: 'pw@example.com', password: 'OldPassw0rd!' } });
  const r = await api('/api/auth/forgot', { method: 'POST', body: { email: 'pw@example.com' } });
  assert.equal(r.status, 503);
  assert.match(r.json.message, /not set up/i);
});

test('forgot -> email via Gmail API -> reset with the emailed code -> old password dead, new one works', async () => {
  process.env.GMAIL_REFRESH_TOKEN = 'GMAIL-RT';
  calls.length = 0;
  const f = await api('/api/auth/forgot', { method: 'POST', body: { email: 'pw@example.com' } });
  assert.equal(f.status, 200);
  const mail = calls.find((c) => c.url.startsWith('https://gmail.googleapis.com/'));
  assert.ok(mail, 'an email was actually sent');
  assert.equal(mail.init.headers.Authorization, 'Bearer ACCESS2');
  const code = mailCodeFrom(mail);

  const bad = await api('/api/auth/reset', { method: 'POST', body: { email: 'pw@example.com', code: 'AAAAAAAA', newPassword: 'NewPassw0rd!' } });
  assert.equal(bad.status, 400);
  const ok = await api('/api/auth/reset', { method: 'POST', body: { email: 'pw@example.com', code: code.toLowerCase().replace(/(....)(....)/, '$1 $2'), newPassword: 'NewPassw0rd!' } }); // typed lower-case with a space
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'pw@example.com', password: 'OldPassw0rd!' } })).status, 401);
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'pw@example.com', password: 'NewPassw0rd!' } });
  assert.equal(login.status, 200);
  assert.ok(login.json.token);
  const reuse = await api('/api/auth/reset', { method: 'POST', body: { email: 'pw@example.com', code, newPassword: 'Another1234!' } });
  assert.equal(reuse.status, 400, 'a code can only be used once');
});

test('forgot: a failing mail provider is reported to the user, not swallowed', async () => {
  mailFails = true;
  const r = await api('/api/auth/forgot', { method: 'POST', body: { email: 'pw@example.com' } });
  mailFails = false;
  assert.equal(r.status, 502);
  assert.match(r.json.message, /could not send/i);
});

test('forgot: unknown email gets the same success answer as a known one (no account enumeration)', async () => {
  const r = await api('/api/auth/forgot', { method: 'POST', body: { email: 'nobody@example.com' } });
  assert.equal(r.status, 200);
  assert.match(r.json.message, /if that email is registered/i);
});

test('health endpoint shows which mail provider is active', async () => {
  const r = await api('/api/health');
  assert.equal(r.json.mail, 'gmail');
  assert.equal(r.json.google, 'configured');
});

// ================================================================= Google sign-in (web redirect flow)
test('google config is public so login screens can hide the button when it is not set up', async () => {
  const r = await api('/api/google/config');
  assert.deepEqual(r.json, { success: true, available: true });
});

test('google start: refuses a return address that is not ours', async () => {
  const r = await api('/api/google/start?returnTo=' + encodeURIComponent('https://evil.example/x'));
  assert.equal(r.status, 400);
});

let webToken;
test('Continue with Google (web): consent URL -> callback -> new account + session token in the redirect hash', async () => {
  const start = await api('/api/google/start?returnTo=' + encodeURIComponent('https://mydailyos.vercel.app/'));
  assert.equal(start.status, 302);
  const g = new URL(start.location);
  assert.equal(g.origin + g.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(g.searchParams.get('redirect_uri'), `${base}/api/google/callback`);
  assert.match(g.searchParams.get('scope'), /drive\.file/);
  const state = g.searchParams.get('state');

  const cb = await api(`/api/google/callback?code=AUTHCODE&state=${encodeURIComponent(state)}`);
  assert.equal(cb.status, 302);
  const back = new URL(cb.location);
  assert.equal(back.origin, 'https://mydailyos.vercel.app');
  const hash = new URLSearchParams(back.hash.slice(1));
  assert.equal(hash.get('google'), 'ok');
  webToken = hash.get('token');
  assert.ok(webToken, 'session token returned');

  const me = await api('/api/account/me', { token: webToken });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, 'sumanth@gmail.com');
  assert.equal(profiles.length >= 1, true, 'a profile was created for the new account');
});

test('the Google sheet is created in the background and filled with every tab', async () => {
  assert.ok(await wait(() => sheetBodies.length > 0), 'first sync happened');
  assert.ok(calls.some((c) => c.url === 'https://sheets.googleapis.com/v4/spreadsheets'), 'spreadsheet created');
  const tabs = sheetBodies[0].data.map((d) => d.range.split('!')[0].replace(/'/g, ''));
  assert.deepEqual(tabs, ['Daily summary', 'Food', 'Water', 'Weight', 'Exercise', 'Tasks', 'Habits', 'Health', 'Fasting', 'Profile']);
  const profileTab = sheetBodies[0].data.find((d) => d.range.startsWith("'Profile'"));
  assert.equal(profileTab.values.find((r) => r[0] === 'Email')[1], 'sumanth@gmail.com');
  // refresh token is stored encrypted, never in clear
  const u = [...users.values()].find((x) => x.googleId === 'google-sub-1');
  assert.ok(u.google.refreshTokenEnc && !u.google.refreshTokenEnc.includes('REFRESH-1'));
});

test('status / sync now / disconnect work for the signed-in person', async () => {
  const s = await api('/api/google/status', { token: webToken });
  assert.equal(s.json.connected, true);
  assert.equal(s.json.spreadsheetUrl, 'https://docs.google.com/spreadsheets/d/SHEET1/edit');
  assert.ok(s.json.lastSyncAt);

  const before = sheetBodies.length;
  const sync = await api('/api/google/sync', { method: 'POST', token: webToken, body: {} });
  assert.equal(sync.status, 200, sync.text);
  assert.equal(sheetBodies.length, before + 1);

  const d = await api('/api/google/disconnect', { method: 'POST', token: webToken, body: {} });
  assert.equal(d.status, 200);
  const s2 = await api('/api/google/status', { token: webToken });
  assert.equal(s2.json.connected, false);
});

test('a tampered or expired OAuth state is rejected', async () => {
  const r = await api('/api/google/callback?code=x&state=not-a-real-token');
  assert.equal(r.status, 400);
});

test('cancelled consent sends the person back with a clear status', async () => {
  const start = await api('/api/google/start?returnTo=' + encodeURIComponent('flexfit://google'));
  const state = new URL(start.location).searchParams.get('state');
  const r = await api(`/api/google/callback?error=access_denied&state=${encodeURIComponent(state)}`);
  assert.equal(new URL(r.location).searchParams.get('google'), 'cancelled');
});

// ================================================================= connect Google to an existing password account
test('Connect Google (signed-in, mobile deep link): consent -> callback -> sheet; account stays the same', async () => {
  googleEmail = 'pw.person@gmail.com';
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'pw@example.com', password: 'NewPassw0rd!' } });
  const t = login.json.token;
  const urlRes = await api('/api/google/connect-url', { method: 'POST', token: t, body: { returnTo: 'flexfit://google' } });
  assert.equal(urlRes.status, 200);
  const g = new URL(urlRes.json.url);
  assert.equal(g.searchParams.get('login_hint'), 'pw@example.com');
  sheetBodies = [];
  const cb = await api(`/api/google/callback?code=AUTHCODE&state=${encodeURIComponent(g.searchParams.get('state'))}`);
  const back = new URL(cb.location);
  assert.equal(back.protocol, 'flexfit:');
  assert.equal(back.searchParams.get('google'), 'ok');
  assert.equal(back.searchParams.get('token'), null, 'connect mode must not mint a new session');
  assert.ok(await wait(() => sheetBodies.length > 0));
  const s = await api('/api/google/status', { token: t });
  assert.equal(s.json.connected, true);
  assert.equal(s.json.email, 'pw.person@gmail.com');
});

test('Continue with Google for an email that already has a password account links to it (no duplicate)', async () => {
  const before = users.size;
  googleEmail = 'pw@example.com';
  const start = await api('/api/google/start?returnTo=' + encodeURIComponent('flexfit://google'));
  const state = new URL(start.location).searchParams.get('state');
  const cb = await api(`/api/google/callback?code=AUTHCODE&state=${encodeURIComponent(state)}`);
  const back = new URL(cb.location);
  assert.equal(back.searchParams.get('google'), 'ok');
  assert.ok(back.searchParams.get('token'));
  assert.equal(users.size, before);
});

test('when Google is not configured, /start sends the person back with an explanation instead of a raw JSON error', async () => {
  const id = process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_ID;
  const r = await api('/api/google/start?returnTo=' + encodeURIComponent('https://mydailyos.vercel.app/'));
  process.env.GOOGLE_CLIENT_ID = id;
  assert.equal(r.status, 302);
  assert.match(new URLSearchParams(new URL(r.location).hash.slice(1)).get('reason'), /not set up/i);
  const cfg = await api('/api/google/config');
  assert.equal(cfg.json.available, true);
});
