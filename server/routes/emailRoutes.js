// Public (no login) endpoints for email links. GET only shows a confirm page — mail scanners "click" links, so a GET must never change anything.
const express = require('express');
const Profile = require('../models/Profile');
const { wrap } = require('../lib/http');
const { verifyAny, verifyDownload, BACKUP_PURPOSE, page } = require('../lib/unsubscribe');
const { rateLimit } = require('../middleware/rateLimit');

const WORDS = { 'unsub-weekly': ['weekly summaries', 'notify.weeklyEmail', 'No more weekly emails.'], [BACKUP_PURPOSE]: ['weekly backup emails', 'notify.backupEmail', 'No more weekly backup emails.'] };

const router = express.Router();

// The weekly backup email links here instead of attaching your data. The link is signed, expires after 48 hours, and is limited to a few tries.
router.get('/backup-download', rateLimit({ windowMs: 15 * 60_000, max: 10, keyFn: (req) => `bk|${req.ip}`, message: 'Too many tries. Please wait a few minutes.' }), wrap(async (req, res) => {
  const userId = verifyDownload(req.query.token);
  if (!userId) return res.status(410).type('html').send(page('Link expired', '<h2>This link has expired</h2><p>For your privacy, backup links stop working after 48 hours. Open the app: Profile, Download my data.</p>'));
  const files = await require('./accountRoutes').buildExportFiles(userId);
  const wantCsv = String(req.query.format || '').toLowerCase() === 'csv';
  const f = files.find((x) => (wantCsv ? /\.csv$/ : /\.json$/).test(x.filename)) || files[0];
  res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.filename}"`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }).send(f.content);
}));

router.get('/unsubscribe', (req, res) => {
  const token = String(req.query.token || '');
  const who = verifyAny(token);
  if (!who) return res.status(400).type('html').send(page('Link expired', '<h2>This link isn’t valid any more</h2><p>Open FlexFit → Profile → Reports &amp; emails to change your email settings.</p>'));
  res.type('html').send(page('Unsubscribe', `<h2>Stop ${WORDS[who.purpose][0]}?</h2><p>You can turn them back on any time in Profile → Reports &amp; emails.</p>
    <form method="POST" action="/api/email/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit">Yes, unsubscribe me</button></form>`));
});

// Used by the confirm button AND by mail apps' built-in one-tap "Unsubscribe" (List-Unsubscribe-Post).
router.post('/unsubscribe', express.urlencoded({ extended: false }), wrap(async (req, res) => {
  const who = verifyAny(String(req.query.token || ''));
  if (!who) return res.status(400).type('html').send(page('Link expired', '<h2>This link isn’t valid any more</h2>'));
  await Profile.updateOne({ userId: who.userId }, { $set: { [WORDS[who.purpose][1]]: false } });
  res.type('html').send(page('Unsubscribed', `<h2>You’re unsubscribed</h2><p>${WORDS[who.purpose][2]} Changed your mind? Turn them back on in Profile → Reports &amp; emails.</p>`));
}));

module.exports = router;
