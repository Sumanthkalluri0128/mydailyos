// Weekly backup email: opt-in, with the person's data export attached (complete JSON + a CSV for spreadsheets).
// Own unsubscribe link (separate from the weekly summary), sent at most once per week, never fails the whole run on one bad account.
const Profile = require('../models/Profile');
const User = require('../models/User');
const { sendMail } = require('./mailer');
const { unsubscribeUrl, appUrl, BACKUP_PURPOSE } = require('./unsubscribe');
const { todayUtc } = require('./dates');
const { dueForBackup, buildBackupMail, backupWeek, MAX_ATTACH_BYTES } = require('./backupMail');

/**
 * Sends this week's backup to everyone opted in who has not had it. Safe to run repeatedly (once per week each).
 * `exportFiles(userId)` is injected so it can be tested without a database.
 */
async function sendWeeklyBackups({ today = todayUtc(), send = sendMail, exportFiles } = {}) {
  const thisWeek = backupWeek(today);
  const people = await Profile.find({ 'notify.backupEmail': true, 'notify.lastBackupEmail': { $ne: thisWeek.from } }).select('userId').lean();
  let sent = 0, failed = 0;
  for (const p of people) {
    try {
      const user = await User.findById(p.userId).select('name email').lean();
      if (!user || !user.email) continue;
      const files = await exportFiles(p.userId);
      const mail = buildBackupMail({ name: user.name, files, unsubscribeUrl: unsubscribeUrl(p.userId, process.env, BACKUP_PURPOSE), appUrl: appUrl(), weekLabel: thisWeek.from });
      await send({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers, attachments: mail.attachments });
      await Profile.updateOne({ userId: p.userId }, { $set: { 'notify.lastBackupEmail': thisWeek.from } });
      sent += 1;
    } catch (e) { failed += 1; console.warn('Backup email failed:', e.message); }
  }
  return { week: thisWeek, sent, failed };
}

module.exports = { dueForBackup, buildBackupMail, sendWeeklyBackups, MAX_ATTACH_BYTES };
