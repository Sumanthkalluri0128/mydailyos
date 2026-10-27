const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBackupMail, dueForBackup, backupWeek, MAX_ATTACH_BYTES } = require('../lib/backupMail');
let mailer = null; try { mailer = require('../lib/mailer'); } catch {}
let unsub = null; try { unsub = require('../lib/unsubscribe'); } catch {}

const files = [{ filename: 'flexfit-data.json', contentType: 'application/json', content: Buffer.from('{"a":1}') }, { filename: 'food.csv', contentType: 'text/csv', content: Buffer.from('a,b\n1,2') }];
const decode = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

test('backup mail: attaches both files, mentions the CSV only when there is one', () => {
  const m = buildBackupMail({ name: 'Asha Rao', files, unsubscribeUrl: 'https://api.x/u?t=1', appUrl: 'https://app.x', weekLabel: '2026-10-26' });
  assert.equal(m.attached, true); assert.equal(m.attachments.length, 2);
  assert.match(m.text, /Hi Asha,/); assert.match(m.text, /CSV opens in a spreadsheet/); assert.match(m.text, /Stop these backup emails: https:\/\/api\.x\/u/);
  assert.equal(m.headers['List-Unsubscribe'], '<https://api.x/u?t=1>'); assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const only = buildBackupMail({ files: [files[0]] });
  assert.doesNotMatch(only.text, /CSV/); assert.doesNotMatch(only.html, /CSV/); assert.equal(only.headers, undefined);
});

test('backup mail: too big to attach is sent without files and says where to download', () => {
  const big = [{ filename: 'big.json', content: Buffer.alloc(MAX_ATTACH_BYTES + 1) }];
  const m = buildBackupMail({ files: big });
  assert.equal(m.attached, false); assert.deepEqual(m.attachments, []); assert.match(m.text, /too large to attach/);
});

test('backup mail: tone is calm and html escapes names', () => {
  const m = buildBackupMail({ name: '<b>x</b>', files });
  assert.doesNotMatch(m.html, /<b>x<\/b>/);
  const { toneCheck } = require('../lib/safety');
  assert.equal(toneCheck(m.text).ok, true);
});

test('due for backup: opted in and not yet sent this week', () => {
  const wk = backupWeek('2026-10-25').from;
  assert.equal(dueForBackup({ notify: { backupEmail: true } }, wk), true);
  assert.equal(dueForBackup({ notify: { backupEmail: true, lastBackupEmail: wk } }, wk), false);
  assert.equal(dueForBackup({ notify: { backupEmail: false } }, wk), false);
  assert.equal(dueForBackup({}, wk), false); assert.equal(dueForBackup(null, wk), false);
  assert.equal(backupWeek('2026-10-25').from, backupWeek('2026-10-20').from);
});

test('raw MIME: multipart/mixed with base64 attachments and safe file names', { skip: !mailer }, () => {
  const raw = decode(mailer.buildRawMessage({ to: 'a@b.c', subject: 'S', text: 'hello', html: '<p>hello</p>', attachments: [{ filename: '../we ird"name.json', content: Buffer.from('{"k":1}') }], headers: { 'List-Unsubscribe': '<https://x>' } }));
  assert.match(raw, /Content-Type: multipart\/mixed/); assert.match(raw, /List-Unsubscribe: <https:\/\/x>/);
  assert.match(raw, /filename="[^"/\\]+"/); assert.doesNotMatch(raw, /\.\.\//);
  assert.ok(raw.includes(Buffer.from('{"k":1}').toString('base64')));
  const plain = decode(mailer.buildRawMessage({ to: 'a@b.c', subject: 'S', text: 'hi' }));
  assert.doesNotMatch(plain, /multipart\/mixed/);
});

test('unsubscribe: weekly and backup links are separate', { skip: !unsub }, () => {
  const secret = 'test-secret';
  const w = unsub.sign('u1', secret), b = unsub.sign('u1', secret, unsub.BACKUP_PURPOSE);
  assert.equal(unsub.verify(w, secret), 'u1'); assert.equal(unsub.verify(b, secret), null);
  assert.deepEqual(unsub.verifyAny(b, secret), { userId: 'u1', purpose: unsub.BACKUP_PURPOSE });
  assert.equal(unsub.verifyAny('junk', secret), null);
});
