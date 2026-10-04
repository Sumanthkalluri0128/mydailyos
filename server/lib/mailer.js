// Sends transactional email. Providers, in priority order:
//
//   1. Gmail   (GMAIL_REFRESH_TOKEN + GOOGLE_CLIENT_ID/SECRET) — sends FROM your own Gmail over HTTPS (Gmail API).
//              Free, no domain, and the mail genuinely comes from gmail.com so it passes SPF/DKIM/DMARC.
//   2. Brevo   (BREVO_API_KEY)  — HTTPS API, 300/day free. NOTE: Brevo cannot authenticate gmail.com senders, so it
//              swaps in its own sender address (works, but more likely to land in spam). Best with your own domain.
//   3. Resend  (RESEND_API_KEY) — HTTPS API, needs a verified domain to mail anyone but yourself
//   4. SMTP    (SMTP_URL)       — only works where outbound SMTP is allowed (NOT on Render's free tier)
//
// WHY HTTPS FIRST: Render's free web services block outbound SMTP ports 25/465/587 (since 26 Sep 2025),
// and have no IPv6 egress — which is exactly the `connect ENETUNREACH 2607:f8b0:…:465` error in the logs
// (smtp.gmail.com resolved to an IPv6 address). HTTPS (port 443) is never blocked.
//
// Without any provider configured, development prints the message to the log so flows can still be tested.

const FROM_DEFAULT = 'FlexFit <no-reply@flexfit.app>';
const TIMEOUT_MS = 10_000;

function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].trim() || 'FlexFit', email: m[2].trim() } : { name: 'FlexFit', email: String(from || '').trim() };
}

async function postJson(fetchImpl, url, headers, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      throw new Error(`mail provider answered ${res.status}${detail ? `: ${detail}` : ''}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function chooseProvider(env = process.env) {
  if (env.GMAIL_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) return 'gmail';
  if (env.BREVO_API_KEY) return 'brevo';
  if (env.RESEND_API_KEY) return 'resend';
  if (env.SMTP_URL) return 'smtp';
  return null;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeHeader = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`);

/** RFC 822 message for the Gmail API. From is left out on purpose: Gmail sets it to the authenticated account. */
function buildRawMessage({ to, subject, text }) {
  const headers = [`To: ${to}`, `Subject: ${encodeHeader(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  return b64url(`${headers.join('\r\n')}\r\n\r\n${Buffer.from(text, 'utf8').toString('base64')}`);
}

async function gmailAccessToken(fetchImpl, env) {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const why = body.error === 'invalid_grant' ? 'Gmail permission expired or was revoked — run scripts/gmail-token.js again (and set the Google consent screen to "In production" so it stops expiring)' : (body.error_description || body.error || res.status);
    throw new Error(`gmail token refresh failed: ${why}`);
  }
  return body.access_token;
}

function mailStatus(env = process.env) {
  const provider = chooseProvider(env);
  return { provider, ready: !!provider };
}

async function sendMail({ to, subject, text }, { env = process.env, fetchImpl = globalThis.fetch, nodemailer } = {}) {
  const provider = chooseProvider(env);
  const from = env.MAIL_FROM || FROM_DEFAULT;

  if (provider === 'gmail') {
    const token = await gmailAccessToken(fetchImpl, env);
    await postJson(fetchImpl, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { Authorization: `Bearer ${token}` }, { raw: buildRawMessage({ to, subject, text }) });
    return true;
  }

  if (provider === 'brevo') {
    const sender = parseFrom(from);
    await postJson(fetchImpl, 'https://api.brevo.com/v3/smtp/email', { 'api-key': env.BREVO_API_KEY }, { sender, to: [{ email: to }], subject, textContent: text });
    return true;
  }

  if (provider === 'resend') {
    await postJson(fetchImpl, 'https://api.resend.com/emails', { Authorization: `Bearer ${env.RESEND_API_KEY}` }, { from, to: [to], subject, text });
    return true;
  }

  if (provider === 'smtp') {
    const nm = nodemailer || require('nodemailer');
    const transport = nm.createTransport(env.SMTP_URL, {
      family: 4, // Render (and many hosts) have no IPv6 egress; Gmail resolves to IPv6 first -> ENETUNREACH
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    await transport.sendMail({ from, to, subject, text });
    return true;
  }

  if (env.NODE_ENV === 'production') {
    console.warn('No mail provider configured (set BREVO_API_KEY, RESEND_API_KEY or SMTP_URL) — email was NOT sent');
    return false;
  }
  console.log(`\n[mail:dev] to=${to}\n${subject}\n${text}\n`);
  return true;
}

module.exports = { sendMail, chooseProvider, parseFrom, mailStatus, buildRawMessage };
