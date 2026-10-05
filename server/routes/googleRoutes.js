// "Continue with Google" sign-in (creates/links the account by verified Google email).
//
// Flow (works for the mobile app and the website, no native Google SDK needed):
//   client asks for /start  ->  system browser  ->  Google account chooser  ->  /callback on this server
//   ->  we redirect back to the app (flexfit://…) or the website with a FlexFit session token.
//
// Only identity scopes (openid/email/profile) are requested and nothing from Google is stored except the
// Google account id, so there is no refresh token, no Drive/Sheets access and no Google app review needed.
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { wrap, HttpError } = require('../lib/http');
const { rateLimit } = require('../middleware/rateLimit');
const g = require('../lib/googleClient');
const { gmailVariantRegex } = require('../lib/emailMatch');

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
  const signState = (payload) => jwt.sign({ purpose: 'google-oauth', nonce: crypto.randomBytes(8).toString('hex'), ...payload }, process.env.JWT_SECRET, { expiresIn: '10m' });

  // Public: lets login screens hide the Google button when the server isn't set up for it.
  router.get('/config', (req, res) => res.json({ success: true, available: g.configured() }));

  // Public: start "Continue with Google" (the client opens this URL in a browser).
  router.get('/start', limiter, wrap(async (req, res) => {
    const returnTo = safeReturnTo(req.query.returnTo, allowedOrigins);
    if (!returnTo) throw new HttpError(400, 'Invalid returnTo');
    if (!g.configured()) return res.redirect(redirectWith(returnTo, { google: 'error', reason: 'Google sign-in is not set up on the server yet.' }));
    const url = g.buildAuthUrl({ clientId: process.env.GOOGLE_CLIENT_ID, redirectUri: redirectUri(req), state: signState({ returnTo }) });
    res.redirect(url);
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
      if (!g.configured()) return back({ reason: 'Google sign-in is not set up on the server yet.' });
      const tokens = await g.exchangeCode({ code: String(req.query.code || ''), clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: redirectUri(req) });
      const info = await g.getUserInfo(tokens.access_token);
      if (!info.email || info.email_verified === false) return back({ reason: 'Your Google email is not verified.' });
      const email = String(info.email).toLowerCase();

      // Same person, same data: match by Google account id, then by the exact email, then by any other spelling of the same
      // Gmail mailbox (dots / +tags). Only when none match do we create a new account.
      let user = (await User.findOne({ googleId: info.sub })) || (await User.findOne({ email }));
      if (!user) {
        const rx = gmailVariantRegex(email);
        if (rx) {
          const hits = await User.find({ email: rx }).sort({ createdAt: 1 }).limit(2);
          if (hits.length === 1) user = hits[0]; // exactly one candidate -> unambiguous; two or more -> don't guess
        }
      }
      let created = false;
      if (!user) {
        // New account created through Google. Random password hash: they can set a real one via "Forgot password".
        user = await User.create({ name: info.name || email.split('@')[0], email, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12) });
        await Profile.create({ userId: user._id, name: user.name, onboarded: false });
        created = true;
      }
      if (user.googleId !== info.sub) { user.googleId = info.sub; await user.save(); }

      const sessionToken = jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
      // `existing=1` lets the app say "your data is here" instead of starting onboarding for someone who already has an account.
      return back({ google: 'ok', token: sessionToken, email: user.email, existing: created ? '' : '1' });
    } catch (e) {
      console.error('google callback error:', e.message);
      return back({ reason: e instanceof g.GoogleError ? e.message : 'Google sign-in failed. Please try again.' });
    }
  }));

  return router;
}

module.exports = { createGoogleRouter, safeReturnTo, redirectWith };
