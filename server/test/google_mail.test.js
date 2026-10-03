const test = require('node:test');
const assert = require('node:assert/strict');

const { sendMail, chooseProvider, parseFrom } = require('../lib/mailer');
const gc = require('../lib/googleClient');
const { buildTabs, dailySummary, TAB_NAMES } = require('../lib/sheetData');
const { encrypt, decrypt } = require('../lib/cryptoBox');
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

// ---------------------------------------------------------------- crypto
test('cryptoBox: round-trips and rejects tampering', () => {
  const env = { JWT_SECRET: 'abc' };
  const box = encrypt('1//refresh-token', env);
  assert.notEqual(box, '1//refresh-token');
  assert.equal(decrypt(box, env), '1//refresh-token');
  const parts = box.split('.');
  parts[2] = Buffer.from('tampered-ciphertext').toString('base64');
  assert.throws(() => decrypt(parts.join('.'), env));
  assert.throws(() => decrypt(box, { JWT_SECRET: 'other' }));
});

// ---------------------------------------------------------------- google client
test('google: auth url asks for offline access, consent and only the drive.file scope', () => {
  const u = new URL(gc.buildAuthUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's1', loginHint: 'me@gmail.com' }));
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('login_hint'), 'me@gmail.com');
  const scope = u.searchParams.get('scope');
  assert.match(scope, /auth\/drive\.file/);
  assert.doesNotMatch(scope, /auth\/drive(\s|$)/); // never the full-Drive scope
  assert.doesNotMatch(scope, /spreadsheets/);
});

test('google: invalid_grant is flagged as needing reconnect', async () => {
  await assert.rejects(
    gc.refreshAccessToken({ refreshToken: 'r', clientId: 'c', clientSecret: 's' }, async () => errRes(400, { error: 'invalid_grant', error_description: 'Token revoked' })),
    (e) => e.needsReconnect === true
  );
});

test('google: writeTabs clears then writes RAW values in two calls', async () => {
  const calls = [];
  await gc.writeTabs('tok', 'SHEET', { Water: [['Date', 'Amount ml'], ['2026-10-03', 250]] }, async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return okRes(); });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /values:batchClear$/);
  assert.match(calls[1].url, /values:batchUpdate$/);
  assert.equal(calls[1].body.valueInputOption, 'RAW');
  assert.deepEqual(calls[1].body.data[0].values[1], ['2026-10-03', 250]);
});

test('google: ensureTabs adds only the missing tabs', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return /fields=/.test(url) ? okRes({ sheets: [{ properties: { title: 'Food' } }] }) : okRes();
  };
  const added = await gc.ensureTabs('t', 'ID', ['Food', 'Water'], fetchImpl);
  assert.deepEqual(added, ['Water']);
  assert.equal(JSON.parse(calls[1].init.body).requests[0].addSheet.properties.title, 'Water');
});

// ---------------------------------------------------------------- sheet data
const sample = {
  user: { name: 'Sumanth', email: 's@gmail.com' },
  profile: { currentWeightKg: 70, goals: { calorieTarget: 1800 } },
  foodLogs: [
    { date: '2026-10-02', mealType: 'lunch', foodName: 'Dal', consumedQuantity: 200, servingUnit: 'g', servings: 1, nutritionTotal: { calories: 250, protein: 12, carbohydrates: 30, fat: 8 } },
    { date: '2026-10-02', mealType: 'dinner', foodName: 'Roti', consumedQuantity: 2, servingUnit: 'piece', servings: 2, nutritionTotal: { calories: 200, protein: 6, carbohydrates: 40, fat: 2 } },
  ],
  waterLogs: [{ date: '2026-10-02', amountMl: 250 }, { date: '2026-10-02', amountMl: 500 }],
  weightLogs: [{ date: '2026-10-01', weightKg: 71 }, { date: '2026-10-02', weightKg: 70.4 }],
  activityLogs: [{ date: '2026-10-02', activityName: 'Run', category: 'cardio', durationMinutes: 30, caloriesBurned: 300, sets: [{ reps: 10, weightKg: 20 }] }],
  tasks: [{ date: '2026-10-02', title: '=HYPERLINK("evil")', priority: 'high', category: 'General', completed: true }],
  healthLogs: [{ date: '2026-10-02', type: 'steps', value: 4000 }, { date: '2026-10-02', type: 'steps', value: 8000 }],
  habitLogs: [], fasts: [], now: Date.UTC(2026, 9, 3),
};

test('sheetData: every tab exists and has a header row', () => {
  const tabs = buildTabs(sample);
  assert.deepEqual(Object.keys(tabs).sort(), [...TAB_NAMES].sort());
  for (const rows of Object.values(tabs)) assert.ok(rows.length >= 1 && Array.isArray(rows[0]));
});

test('sheetData: daily summary adds up food, water, burn, best steps and latest weight', () => {
  const rows = dailySummary(sample);
  const day = rows.find((r) => r[0] === '2026-10-02');
  assert.equal(day[1], 450);   // calories
  assert.equal(day[5], 750);   // water
  assert.equal(day[6], 300);   // burned
  assert.equal(day[8], 8000);  // steps = max reading, not the sum of cumulative readings
  assert.equal(day[9], 70.4);  // weight
  assert.equal(day[10], 1);    // tasks done
});

test('sheetData: numbers stay numbers; formula-looking text is kept as text for RAW writes', () => {
  const tabs = buildTabs(sample);
  assert.equal(typeof tabs.Water[1][1], 'number');
  assert.equal(tabs.Tasks[1][2], '=HYPERLINK("evil")'); // written with valueInputOption RAW => stored as plain text
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
