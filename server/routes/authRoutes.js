const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Brute-force protection. Limits live in lib/authLimits.js so they are tested and tuned in one place.
const { loginLimiters, signupLimiters, forgotLimiters, resetLimiters } = require('../lib/authLimits');
const loginLimiter = loginLimiters();
const signupLimiter = signupLimiters();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const session = require('../lib/session');
/** Website in cookie mode (X-Session: cookie): set the httpOnly cookie and leave the token OUT of the response body. Phone and scripts get the token as before. */
function sendSession(req, res, status, user) {
  const token = createToken(user);
  if (session.enabled() && req.headers['x-session'] === 'cookie') { session.issue(res, token); return res.status(status).json({ success: true, user: publicUser(user), session: 'cookie' }); }
  return res.status(status).json({ success: true, token, user: publicUser(user) });
}

function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// A real bcrypt hash used to burn the same CPU time when the email doesn't exist.
let dummyHash = null;
const getDummyHash = async () => dummyHash || (dummyHash = await bcrypt.hash('flexfit-dummy-password', 12));

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

router.post('/signup', signupLimiter, wrap(async (req, res) => {
  const name = v.string(req.body?.name, 'name', { max: 100, required: true });
  const email = v.string(req.body?.email, 'email', { max: 254, required: true }).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (password.length > 128) throw new HttpError(400, 'Password must be at most 128 characters');
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');

  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  // Every new account starts clean and goes through first-run onboarding.
  await Profile.create({ userId: user._id, name: user.name, onboarded: false });

  sendSession(req, res, 201, user);
}));

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const email = v.string(req.body?.email, 'email', { max: 254 }).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const user = email ? await User.findOne({ email }) : null;
  // Always run a bcrypt comparison so response time doesn't reveal whether the email exists.
  const hash = user ? user.passwordHash : await getDummyHash();
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');

  sendSession(req, res, 200, user);
}));

// Sign out of the website: the httpOnly cookie cannot be removed by page scripts, so the server removes it.
router.post('/logout', (req, res) => { session.clear(res); res.json({ success: true }); });

// Google sign-in on the website: the redirect carries a 60-second one-time code (never the real token); the page swaps it for the cookie here.
const usedCodes = new Map();
router.post('/exchange', wrap(async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  let p; try { p = jwt.verify(code, process.env.JWT_SECRET); if (p.purpose !== 'google-exchange' || !p.jti) throw new Error('bad'); } catch { throw new HttpError(400, 'This sign-in link expired. Please try again.'); }
  const now = Date.now(); for (const [k, t] of usedCodes) if (t < now) usedCodes.delete(k);
  if (usedCodes.has(p.jti)) throw new HttpError(400, 'This sign-in link was already used. Please try again.');
  usedCodes.set(p.jti, now + 120_000);
  const user = await User.findById(p.sub);
  if (!user) throw new HttpError(400, 'Account not found');
  if (session.enabled()) { session.issue(res, createToken(user)); return res.json({ success: true, user: publicUser(user), session: 'cookie' }); }
  return res.json({ success: true, token: createToken(user), user: publicUser(user) });
}));

// ---------------------------------------------------------------- password reset (emailed 8-character code)
const crypto = require('crypto');
const { sendMail, mailStatus } = require('../lib/mailer');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid typos
const hashCode = (code) => crypto.createHash('sha256').update(`${code}|${process.env.JWT_SECRET}`).digest('hex');
const forgotLimiter = forgotLimiters();
const resetLimiter = resetLimiters();

router.post('/forgot', forgotLimiter, wrap(async (req, res) => {
  const email = v.string(req.body?.email, 'email', { max: 200, required: true }).toLowerCase();
  // If the server has no way to send email, say so plainly. This does not depend on whether the account exists,
  // so it reveals nothing — and it stops the screen from claiming "code sent" when nothing could ever arrive.
  if (process.env.NODE_ENV === 'production' && !mailStatus().ready) {
    console.error('forgot-password requested but no mail provider is configured (see docs/SETUP_V5.md)');
    throw new HttpError(503, 'Password-reset email is not set up on the server yet. Ask the app owner to finish the email setup.');
  }
  const user = await User.findOne({ email });
  if (user) {
    const code = Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
    user.resetCodeHash = hashCode(code);
    user.resetExpires = new Date(Date.now() + 30 * 60_000);
    user.resetAttempts = 0;
    await user.save();
    try {
      await sendMail({ to: user.email, subject: 'Your FlexFit password reset code', text: `Your FlexFit reset code is ${code}\n\nIt expires in 30 minutes. If you did not ask for this, you can ignore this email.` });
    } catch (e) {
      // Tell the person (instead of pretending it worked). Only reachable when the mail provider itself is failing.
      console.error('mail error:', e.message);
      throw new HttpError(502, 'We could not send the email right now. Please try again in a minute.');
    }
  }
  // Same answer whether or not the account exists, so this can't be used to find registered emails.
  res.json({ success: true, message: 'If that email is registered, a reset code has been sent.' });
}));

router.post('/reset', resetLimiter, wrap(async (req, res) => {
  const email = v.string(req.body?.email, 'email', { max: 200, required: true }).toLowerCase();
  const code = v.string(req.body?.code, 'code', { max: 20, required: true }).toUpperCase().replace(/\s|-/g, '');
  const password = String(req.body?.newPassword || '');
  if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be 8–128 characters');
  const bad = new HttpError(400, 'That code is invalid or has expired. Request a new one.');

  const user = await User.findOne({ email }).select('+resetCodeHash +resetExpires +resetAttempts');
  if (!user || !user.resetCodeHash || !user.resetExpires || user.resetExpires < new Date()) throw bad;
  if (user.resetAttempts >= 5) { user.resetCodeHash = null; user.resetExpires = null; await user.save(); throw bad; }
  const a = Buffer.from(hashCode(code)); const b = Buffer.from(user.resetCodeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { user.resetAttempts += 1; await user.save(); throw bad; }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordChangedAt = new Date();
  user.resetCodeHash = null; user.resetExpires = null; user.resetAttempts = 0;
  await user.save();
  res.json({ success: true, message: 'Password updated. You can sign in now.' });
}));

module.exports = router;
