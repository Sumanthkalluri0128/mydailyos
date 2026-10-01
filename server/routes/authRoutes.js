const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Brute-force protection: slow down password guessing per IP+email and mass sign-ups per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyFn: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, max: 20, message: 'Too many sign-ups from this network. Please try again later.' });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  res.status(201).json({ success: true, token: createToken(user), user: publicUser(user) });
}));

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const email = v.string(req.body?.email, 'email', { max: 254 }).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const user = email ? await User.findOne({ email }) : null;
  // Always run a bcrypt comparison so response time doesn't reveal whether the email exists.
  const hash = user ? user.passwordHash : await getDummyHash();
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');

  res.json({ success: true, token: createToken(user), user: publicUser(user) });
}));

module.exports = router;
