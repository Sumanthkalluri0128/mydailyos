const test = require('node:test');
const assert = require('node:assert/strict');

const { sendMail, chooseProvider, providerList, parseFrom, resetGmailTokenCache } = require('../lib/mailer');
const gc = require('../lib/googleClient');
const { safeReturnTo, redirectWith } = require('../routes/googleRoutes');

const okRes = (body = {}) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const errRes = (status, body) => ({ ok: false, status, text: async () => JSON.stringify(body) });

// ---------------------------------------------------------------- mailer
test('mailer: picks HTTPS providers before SMTP', () => {
  assert.equal(chooseProvider({ BREVO_API_KEY: 'k', SMTP_URL: 'smtps://x' }), 'brevo');
  assert.equal(chooseProvider({ RESEND_API_KEY: 'k', SMTP_URL: 'smtps://x' }), 'resend');
  assert.equal(chooseProvider({ SMTP_URL: 'smtps://x' }), 'smtp');
  assert.equal(chooseProvider({}), null);
});

test('mailer: parses "Name <addr>" sender', () => {
  assert.deepEqual(parseFrom('FlexFit <me@gmail.com>'), { name: 'FlexFit', email: 'me@gmail.com' });
  assert.deepEqual(parseFrom('me@gmail.com'), { name: 'FlexFit', email: 'me@gmail.com' });
});

test('mailer: Brevo call goes over HTTPS with the api-key header', async () => {
  let seen;
  await sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: { BREVO_API_KEY: 'KEY', MAIL_FROM: 'FlexFit <me@gmail.com>' }, fetchImpl: async (url, init) => { seen = { url, init }; return okRes(); } });
  assert.equal(seen.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(seen.init.headers['api-key'], 'KEY');
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.to, [{ email: 'a@b.com' }]);
  assert.equal(body.sender.email, 'me@gmail.com');
  assert.equal(body.textContent, 'T');
});

test('mailer: a provider error surfaces with its status', async () => {
  await assert.rejects(
    sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: { RESEND_API_KEY: 'k' }, fetchImpl: async () => errRes(403, { message: 'domain not verified' }) }),
    /403/
  );
});

test('mailer: SMTP fallback forces IPv4 and sets timeouts (the ENETUNREACH fix)', async () => {
  let opts;
  const nodemailer = { createTransport: (_url, o) => { opts = o; return { sendMail: async () => ({}) }; } };
  await sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: { SMTP_URL: 'smtps://u:p@smtp.gmail.com' }, nodemailer });
  assert.equal(opts.family, 4);
  assert.ok(opts.connectionTimeout > 0 && opts.connectionTimeout <= 15000);
});

// ---------------------------------------------------------------- mailer resilience
const gmailEnv = { GMAIL_REFRESH_TOKEN: 'rt', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs' };
const jsonRes = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

test('mailer: lists every configured provider, best first', () => {
  assert.deepEqual(providerList({ ...gmailEnv, BREVO_API_KEY: 'k', SMTP_URL: 'smtps://x' }), ['gmail', 'brevo', 'smtp']);
  assert.deepEqual(providerList({}), []);
});

test('mailer: Gmail access token is cached, so a second email does not hit the token endpoint again', async () => {
  resetGmailTokenCache();
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return url.includes('oauth2') ? jsonRes(200, { access_token: 'AT', expires_in: 3600 }) : jsonRes(200, {}); };
  await sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: gmailEnv, fetchImpl });
  await sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: gmailEnv, fetchImpl });
  assert.equal(urls.filter((u) => u.includes('oauth2')).length, 1);
  assert.equal(urls.filter((u) => u.includes('gmail.googleapis.com')).length, 2);
});

test('mailer: a rejected cached token (401) is dropped and the send is retried once with a fresh one', async () => {
  resetGmailTokenCache();
  let tokens = 0; let sends = 0;
  const fetchImpl = async (url) => {
    if (url.includes('oauth2')) { tokens += 1; return jsonRes(200, { access_token: `AT${tokens}`, expires_in: 3600 }); }
    sends += 1;
    return sends === 1 ? jsonRes(401, { error: { message: 'expired' } }) : jsonRes(200, {});
  };
  await sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: gmailEnv, fetchImpl });
  assert.equal(tokens, 2);
  assert.equal(sends, 2);
});

test('mailer: if Gmail is broken (expired token) the next configured provider still delivers the email', async () => {
  resetGmailTokenCache();
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('oauth2')) return jsonRes(400, { error: 'invalid_grant' });
    return jsonRes(200, {});
  };
  const ok = await sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: { ...gmailEnv, BREVO_API_KEY: 'k' }, fetchImpl });
  assert.equal(ok, true);
  assert.ok(urls.some((u) => u.startsWith('https://api.brevo.com/')));
});

test('mailer: when every provider fails, the error names the reason (invalid_grant is explained)', async () => {
  resetGmailTokenCache();
  const fetchImpl = async (url) => (url.includes('oauth2') ? jsonRes(400, { error: 'invalid_grant' }) : jsonRes(200, {}));
  await assert.rejects(sendMail({ to: 'a@b.com', subject: 'S', text: 'T' }, { env: gmailEnv, fetchImpl }), /invalid_grant/);
});

// ---------------------------------------------------------------- google client
test('google: auth url asks for identity scopes only (no Drive, Sheets or offline access)', () => {
  const u = new URL(gc.buildAuthUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's1' }));
  assert.equal(u.searchParams.get('scope'), 'openid email profile');
  assert.equal(u.searchParams.get('access_type'), null);
  assert.equal(u.searchParams.get('prompt'), 'select_account');
  assert.equal(u.searchParams.get('state'), 's1');
  assert.doesNotMatch(u.search, /drive|spreadsheets|gmail/);
});

test('google: Sheets helpers are gone from the client', () => {
  for (const fn of ['createSpreadsheet', 'ensureTabs', 'writeTabs', 'refreshAccessToken']) assert.equal(gc[fn], undefined, fn);
});

test('google: a failing token exchange surfaces Google\'s message', async () => {
  await assert.rejects(
    gc.exchangeCode({ code: 'c', clientId: 'a', clientSecret: 'b', redirectUri: 'https://x/cb' }, async () => errRes(400, { error: 'invalid_grant', error_description: 'Bad code' })),
    /Bad code/
  );
});

// ---------------------------------------------------------------- redirect safety
test('returnTo: only the app scheme or an allowed web origin may be redirected to', () => {
  const allowed = ['https://mydailyos.vercel.app'];
  assert.ok(safeReturnTo('flexfit://google', allowed));
  assert.ok(safeReturnTo('https://mydailyos.vercel.app/profile', allowed));
  assert.equal(safeReturnTo('https://evil.example/steal', allowed), null);
  assert.equal(safeReturnTo('javascript:alert(1)', allowed), null);
  assert.equal(safeReturnTo('not a url', allowed), null);
});

test('returnTo: deep links get a query string, web gets a hash fragment (tokens stay out of server logs)', () => {
  assert.equal(redirectWith('flexfit://google', { google: 'ok', token: 'T' }), 'flexfit://google?google=ok&token=T');
  assert.equal(redirectWith('https://mydailyos.vercel.app/', { google: 'ok', token: 'T' }), 'https://mydailyos.vercel.app/#google=ok&token=T');
});
