#!/usr/bin/env node
// Diagnoses password-reset email. Run it with the SAME values you set on Render:
//
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... node scripts/check-mail.js
//   ... node scripts/check-mail.js you@example.com        (also sends a real test email)
//
// It prints the exact reason Google/your provider gives, e.g. "invalid_grant" (token expired/revoked),
// "invalid_client" (wrong client id/secret) or "Gmail API has not been used in project…" (API not enabled).
const { providerList, sendMail, resetGmailTokenCache } = require('../lib/mailer');

(async () => {
  const providers = providerList();
  console.log('Configured providers:', providers.length ? providers.join(', ') : '(none)');
  if (!providers.length) { console.error('\nNothing configured. Set GMAIL_REFRESH_TOKEN (+ GOOGLE_CLIENT_ID/SECRET), BREVO_API_KEY, RESEND_API_KEY or SMTP_URL.'); process.exit(1); }

  if (providers.includes('gmail')) {
    resetGmailTokenCache();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: process.env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.access_token) console.log('PASS  Gmail refresh token works (scope:', body.scope || 'n/a', ')');
    else {
      console.log(`FAIL  Gmail refresh token rejected: ${body.error || res.status} — ${body.error_description || ''}`);
      if (body.error === 'invalid_grant') console.log('      -> Token expired or revoked. In Google Cloud set the consent screen to "In production", then re-run scripts/gmail-token.js and put the NEW token in Render.');
      if (body.error === 'invalid_client') console.log('      -> GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET do not match the client that issued the token.');
    }
  }

  const to = process.argv[2];
  if (to) {
    try { await sendMail({ to, subject: 'FlexFit mail test', text: 'If you can read this, FlexFit can send email.' }); console.log(`PASS  Test email sent to ${to}`); }
    catch (e) { console.log(`FAIL  Could not send: ${e.message}`); process.exit(1); }
  }
})();
