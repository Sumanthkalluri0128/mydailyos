// Sends email through SMTP when SMTP_URL is set (e.g. smtps://user:pass@smtp.example.com). Without it, the
// message is printed to the server log in development so the flow can still be tested end to end.
async function sendMail({ to, subject, text }) {
  if (process.env.SMTP_URL) {
    const nodemailer = require('nodemailer');
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.MAIL_FROM || 'FlexFit <no-reply@flexfit.app>', to, subject, text });
    return true;
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('SMTP_URL is not set — password reset email was NOT sent');
    return false;
  }
  console.log(`\n[mail:dev] to=${to}\n${subject}\n${text}\n`);
  return true;
}
module.exports = { sendMail };
