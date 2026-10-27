// Pure parts of the weekly backup email (no database, no mailer), so they can be tested on their own.
const { weekContaining } = require('./weekly');
const { weekday } = require('./dates');

const MAX_ATTACH_BYTES = 12 * 1024 * 1024; // Gmail allows 25 MB per message and base64 adds a third, so stay well under

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Is this person due a backup for the week starting `weekKey` (a Monday)? */
function dueForBackup(profile, weekKey) {
  return profile?.notify?.backupEmail === true && profile?.notify?.lastBackupEmail !== weekKey;
}

const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * The email itself. If the files together are too big to attach, it is sent without them and says where to download.
 * Calm wording only; the health data warning is plain, not alarming.
 */
function buildBackupMail({ name, files, unsubscribeUrl: unsub, appUrl: app, weekLabel }) {
  const list = (files || []).filter((f) => f && f.filename && f.content !== undefined);
  const total = list.reduce((t, f) => t + Buffer.byteLength(f.content), 0);
  const attach = list.length > 0 && total <= MAX_ATTACH_BYTES;
  const hasCsv = list.some((f) => /\.csv$/i.test(f.filename));
  const what = hasCsv ? 'The JSON file has everything; the CSV opens in a spreadsheet.' : 'The JSON file has everything.';
  const hi = name ? `Hi ${String(name).split(' ')[0]},` : 'Hi,';
  const lines = [
    hi, '',
    `Here is your weekly FlexFit backup${weekLabel ? ` (week of ${weekLabel})` : ''}.`,
    attach ? `Attached: ${list.map((f) => `${f.filename} (${kb(Buffer.byteLength(f.content))})`).join(' and ')}. ${what}`
      : 'Your data is too large to attach this week. Download it any time in the app: Profile, Download my data.',
    '',
    'This file contains your personal health and food data. Keep it somewhere safe, and delete this email when you no longer need it.',
    app ? `Open FlexFit: ${app}` : '',
    '', unsub ? `Stop these backup emails: ${unsub}` : 'You can stop these emails in Profile, Reports & emails.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''));
  const text = lines.join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2340;max-width:520px;margin:auto;line-height:1.5"><p>${esc(hi)}</p><p>Here is your weekly FlexFit backup${weekLabel ? ` (week of ${esc(weekLabel)})` : ''}.</p><p>${attach ? `Attached: ${list.map((f) => `<strong>${esc(f.filename)}</strong> (${kb(Buffer.byteLength(f.content))})`).join(' and ')}. ${what}` : 'Your data is too large to attach this week. Download it any time in the app: Profile, Download my data.'}</p><p style="color:#6b7090">This file contains your personal health and food data. Keep it somewhere safe, and delete this email when you no longer need it.</p>${app ? `<p><a href="${esc(app)}">Open FlexFit</a></p>` : ''}<p style="font-size:12px;color:#6b7090">${unsub ? `<a href="${esc(unsub)}">Stop these backup emails</a>` : 'You can stop these emails in Profile, Reports &amp; emails.'}</p></div>`;
  return {
    subject: 'Your weekly FlexFit backup', text, html, attached: attach, attachments: attach ? list : [],
    headers: unsub ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
  };
}


/** Monday (YYYY-MM-DD) of the week containing `today`: the key stored in notify.lastBackupEmail. */
const backupWeek = (today) => weekContaining(today, weekday);

module.exports = { MAX_ATTACH_BYTES, dueForBackup, buildBackupMail, backupWeek };
