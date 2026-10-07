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
// Every configured provider is tried in the order above: if Gmail fails (e.g. its token expired) the next configured
// provider is used, so a single broken credential no longer blocks password resets.
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

/** All configured providers, best first. */
function providerList(env = process.env) {
  const list = [];
  if (env.GMAIL_REFRESH_TOKEN && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) list.push('gmail');
  if (env.BREVO_API_KEY) list.push('brevo');
  if (env.RESEND_API_KEY) list.push('resend');
  if (env.SMTP_URL) list.push('smtp');
  return list;
}

function chooseProvider(env = process.env) {
  return providerList(env)[0] || null;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeHeader = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`);

/** RFC 822 message for the Gmail API. From is left out on purpose: Gmail sets it to the authenticated account. */
function buildRawMessage({ to, subject, text, html, headers: extra }) {
  const extraLines = Object.entries(extra || {}).map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]+/g, ' ')}`);
  const wrap64 = (str) => Buffer.from(str, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  if (!html) {
    const headers = [`To: ${to}`, `Subject: ${encodeHeader(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', ...extraLines];
    return b64url(`${headers.join('\r\n')}\r\n\r\n${Buffer.from(text, 'utf8').toString('base64')}`);
  }
  // text + HTML versions: mail apps show the best one they can render.
  const boundary = `ff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const headers = [`To: ${to}`, `Subject: ${encodeHeader(subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, ...extraLines];
  const body = [
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap64(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap64(html),
    `--${boundary}--`, '',
  ].join('\r\n');
  return b64url(`${headers.join('\r\n')}\r\n\r\n${body}`);
}

// The access token lives ~1 hour; reuse it instead of asking Google for a new one on every email.
let cachedToken = { key: '', value: '', expiresAt: 0 };

async function gmailAccessToken(fetchImpl, env) {
  const key = `${env.GOOGLE_CLIENT_ID}|${env.GMAIL_REFRESH_TOKEN}`;
  if (cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal,
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString(),
    });
  } finally { clearTimeout(timer); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const why = body.error === 'invalid_grant'
      ? 'Gmail permission expired or was revoked (invalid_grant) — set the Google consent screen to "In production", then run scripts/gmail-token.js again and update GMAIL_REFRESH_TOKEN'
      : (body.error_description || body.error || res.status);
    throw new Error(`gmail token refresh failed: ${why}`);
  }
  cachedToken = { key, value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3000) * 1000 };
  return body.access_token;
}

const resetGmailTokenCache = () => { cachedToken = { key: '', value: '', expiresAt: 0 }; };

function mailStatus(env = process.env) {
  const provider = chooseProvider(env);
  return { provider, ready: !!provider };
}

async function sendVia(provider, { to, subject, text, html, headers }, { env, fetchImpl, nodemailer }) {
  const from = env.MAIL_FROM || FROM_DEFAULT;

  if (provider === 'gmail') {
    const send = async () => {
      const token = await gmailAccessToken(fetchImpl, env);
      await postJson(fetchImpl, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { Authorization: `Bearer ${token}` }, { raw: buildRawMessage({ to, subject, text, html, headers }) });
    };
    try { await send(); }
    catch (e) {
      // A 401 means the cached access token was rejected: drop it and try once more with a fresh one.
      if (/answered 401/.test(e.message)) { resetGmailTokenCache(); await send(); } else throw e;
    }
    return;
  }

  if (provider === 'brevo') {
    await postJson(fetchImpl, 'https://api.brevo.com/v3/smtp/email', { 'api-key': env.BREVO_API_KEY }, { sender: parseFrom(from), to: [{ email: to }], subject, textContent: text, ...(html ? { htmlContent: html } : {}), ...(headers ? { headers } : {}) });
    return;
  }

  if (provider === 'resend') {
    await postJson(fetchImpl, 'https://api.resend.com/emails', { Authorization: `Bearer ${env.RESEND_API_KEY}` }, { from, to: [to], subject, text, ...(html ? { html } : {}), ...(headers ? { headers } : {}) });
    return;
  }

  if (provider === 'smtp') {
    const nm = nodemailer || require('nodemailer');
    const transport = nm.createTransport(env.SMTP_URL, {
      family: 4, // Render (and many hosts) have no IPv6 egress; Gmail resolves to IPv6 first -> ENETUNREACH
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}), ...(headers ? { headers } : {}) });
  }
}

async function sendMail({ to, subject, text, html, headers }, { env = process.env, fetchImpl = globalThis.fetch, nodemailer } = {}) {
  const providers = providerList(env);

  if (!providers.length) {
    if (env.NODE_ENV === 'production') {
      console.warn('No mail provider configured (set GMAIL_REFRESH_TOKEN, BREVO_API_KEY, RESEND_API_KEY or SMTP_URL) — email was NOT sent');
      return false;
    }
    console.log(`\n[mail:dev] to=${to}\n${subject}\n${text}\n`);
    return true;
  }

  const failures = [];
  for (const provider of providers) {
    try {
      await sendVia(provider, { to, subject, text, html, headers }, { env, fetchImpl, nodemailer });
      if (failures.length) console.warn(`mail: sent via ${provider} after ${failures.map((f) => f.split(':')[0]).join(', ')} failed`);
      return true;
    } catch (e) {
      console.error(`mail: ${provider} failed — ${e.message}`);
      failures.push(`${provider}: ${e.message}`);
    }
  }
  // Every configured provider failed. Keep the first (preferred) provider's error as the main message.
  throw new Error(failures.join(' | '));
}

module.exports = { sendMail, chooseProvider, providerList, parseFrom, mailStatus, buildRawMessage, resetGmailTokenCache };
