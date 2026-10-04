// Google account features:
//   * "Continue with Google" sign-in (creates/links the account by verified Google email)
//   * Connect Google -> FlexFit creates a "FlexFit data" spreadsheet in THAT person's Drive and mirrors their data into it
//
// Flow (works for the mobile app and the website, no native Google SDK needed):
//   client asks us for a URL  ->  opens it in the system browser  ->  Google consent  ->  /callback on this server
//   ->  we redirect back to the app (flexfit://…) or the website with the result.
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { rateLimit } = require('../middleware/rateLimit');
const g = require('../lib/googleClient');
const { encrypt } = require('../lib/cryptoBox');
const { syncUser } = require('../lib/sheetSync');

/** Only ever redirect back to our own app (custom scheme) or to an allowed web origin — never an arbitrary URL. */
function safeReturnTo(raw, allowedOrigins = []) {
  try {
    const u = new URL(String(raw));
    if (u.protocol === 'flexfit:' || u.protocol === 'exp:') return u.toString();
    const origin = u.origin;
    if ((u.protocol === 'https:' || u.protocol === 'http:') && allowedOrigins.includes(origin)) return u.toString();
  } catch { /* fall through */ }
  return null;
}

function redirectWith(returnTo, params) {
  const u = new URL(returnTo);
  const target = u.protocol === 'http:' || u.protocol === 'https:' ? 'hash' : 'query';
  const sp = new URLSearchParams(target === 'hash' ? u.hash.replace(/^#/, '') : u.search.replace(/^\?/, ''));
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  if (target === 'hash') u.hash = sp.toString(); else u.search = sp.toString();
  return u.toString();
}

function createGoogleRouter({ allowedOrigins = [] } = {}) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: 30, message: 'Too many Google requests. Please wait a few minutes.' });

  const redirectUri = (req) => process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/google/callback`;
  const needConfig = () => { if (!g.configured()) throw new HttpError(503, 'Google is not set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).'); };
  const signState = (payload) => jwt.sign({ purpose: 'google-oauth', nonce: crypto.randomBytes(8).toString('hex'), ...payload }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const authUrlFor = (req, state, loginHint) => g.buildAuthUrl({ clientId: process.env.GOOGLE_CLIENT_ID, redirectUri: redirectUri(req), state, loginHint });

  // Public: lets login screens hide the Google button when the server isn't set up for it.
  router.get('/config', (req, res) => res.json({ success: true, available: g.configured() }));

  // Public: start "Continue with Google" (the client opens this URL in a browser).
  router.get('/start', limiter, wrap(async (req, res) => {
    const returnTo = safeReturnTo(req.query.returnTo, allowedOrigins);
    if (!returnTo) throw new HttpError(400, 'Invalid returnTo');
    if (!g.configured()) return res.redirect(redirectWith(returnTo, { google: 'error', reason: 'Google sign-in is not set up on the server yet.' }));
    res.redirect(authUrlFor(req, signState({ mode: 'login', returnTo })));
  }));

  // Public: Google redirects here.
  router.get('/callback', wrap(async (req, res) => {
    let st;
    try { st = jwt.verify(String(req.query.state || ''), process.env.JWT_SECRET); if (st.purpose !== 'google-oauth') throw new Error('bad purpose'); }
    catch { return res.status(400).send('This sign-in link expired. Please go back to FlexFit and try again.'); }
    const returnTo = safeReturnTo(st.returnTo, allowedOrigins);
    if (!returnTo) return res.status(400).send('Invalid return address.');
    const back = (params) => res.redirect(redirectWith(returnTo, { google: params.google || 'error', ...params }));

    if (req.query.error) return back({ google: 'cancelled', reason: String(req.query.error).slice(0, 80) });
    try {
      needConfig();
      const tokens = await g.exchangeCode({ code: String(req.query.code || ''), clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: redirectUri(req) });
      const info = await g.getUserInfo(tokens.access_token);
      if (!info.email || info.email_verified === false) return back({ reason: 'Your Google email is not verified.' });
      const email = String(info.email).toLowerCase();

      let user;
      if (st.mode === 'connect') {
        user = await User.findById(st.uid);
        if (!user) return back({ reason: 'Account not found.' });
        const other = await User.findOne({ googleId: info.sub, _id: { $ne: user._id } }).select('_id');
        if (other) return back({ reason: 'That Google account is already linked to another FlexFit account.' });
      } else {
        user = (await User.findOne({ googleId: info.sub })) || (await User.findOne({ email }));
        if (!user) {
          // New account created through Google. Random password hash: they can set a real one via "Forgot password".
          user = await User.create({ name: info.name || email.split('@')[0], email, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12) });
          await Profile.create({ userId: user._id, name: user.name, onboarded: false });
        }
      }
      user.googleId = info.sub;
      user.google.email = email;
      if (tokens.refresh_token) user.google.refreshTokenEnc = encrypt(tokens.refresh_token);
      user.google.connectedAt = user.google.connectedAt || new Date();
      user.google.needsReconnect = false;
      await user.save();

      // First sync in the background (creates the spreadsheet) — don't make the person wait on it.
      syncUser(user._id).catch((e) => console.warn('first sheet sync failed:', e.message));
      const sessionToken = st.mode === 'login' ? jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' }) : undefined;
      return back({ google: 'ok', token: sessionToken, email });
    } catch (e) {
      console.error('google callback error:', e.message);
      return back({ reason: e instanceof g.GoogleError ? e.message : 'Google sign-in failed. Please try again.' });
    }
  }));

  // ---- signed-in endpoints
  router.use(requireAuth);

  router.get('/status', wrap(async (req, res) => {
    const u = await User.findById(req.user.id).select('google googleId');
    if (!u) throw new HttpError(404, 'Account not found');
    const has = !!(await User.exists({ _id: u._id, 'google.connectedAt': { $ne: null } }));
    res.json({
      success: true, available: g.configured(), connected: has && !!u.google?.connectedAt,
      email: u.google?.email || '', spreadsheetUrl: u.google?.spreadsheetUrl || '', lastSyncAt: u.google?.lastSyncAt || null,
      lastSyncError: u.google?.lastSyncError || '', needsReconnect: !!u.google?.needsReconnect,
    });
  }));

  router.post('/connect-url', limiter, wrap(async (req, res) => {
    needConfig();
    const returnTo = safeReturnTo(req.body?.returnTo, allowedOrigins);
    if (!returnTo) throw new HttpError(400, 'Invalid returnTo');
    const me = await User.findById(req.user.id).select('email');
    res.json({ success: true, url: authUrlFor(req, signState({ mode: 'connect', uid: req.user.id, returnTo }), me?.email) });
  }));

  router.post('/sync', rateLimit({ windowMs: 60_000, max: 6, keyFn: (req) => `gsync|${req.user?.id || req.ip}`, message: 'Slow down — try again in a minute.' }), wrap(async (req, res) => {
    const r = await syncUser(req.user.id);
    if (!r.ok) return res.status(r.needsReconnect ? 409 : 502).json({ success: false, message: r.error, needsReconnect: !!r.needsReconnect });
    res.json({ success: true, spreadsheetUrl: r.url, lastSyncAt: new Date().toISOString() });
  }));

  router.post('/disconnect', wrap(async (req, res) => {
    const u = await User.findById(req.user.id).select('+google.refreshTokenEnc');
    if (!u) throw new HttpError(404, 'Account not found');
    // The spreadsheet stays in their Drive — it's theirs. We only forget the token (and stop writing to it).
    u.google = { email: '', refreshTokenEnc: '', spreadsheetId: u.google?.spreadsheetId || '', spreadsheetUrl: u.google?.spreadsheetUrl || '', connectedAt: null, lastSyncAt: u.google?.lastSyncAt || null, lastSyncError: '', needsReconnect: false, autoSync: true };
    u.googleId = undefined;
    await u.save();
    res.json({ success: true });
  }));

  return router;
}

module.exports = { createGoogleRouter, safeReturnTo, redirectWith };
