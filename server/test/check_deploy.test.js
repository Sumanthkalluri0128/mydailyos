const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { runChecks } = require('../scripts/check-deploy');
const { createApp } = require('../app');
const User = require('../models/User');

User.findOne = () => { const p = Promise.resolve(null); p.select = () => p; return p; };

async function withServer(env, fn) {
  const saved = {}; for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  const app = createApp({ allowedOrigins: ['https://web.example'] });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
const base = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GMAIL_REFRESH_TOKEN: undefined, BREVO_API_KEY: undefined, RESEND_API_KEY: undefined, SMTP_URL: undefined };

test('checker: an unconfigured server fails on mail and Google, with fixes that name the exact variables', async () => {
  await withServer(base, async (api) => {
    const res = await runChecks(api, '');
    const by = (n) => res.find((c) => c.name === n);
    assert.equal(by('Server reachable').ok, true);
    assert.equal(by('Latest code deployed').ok, true);
    assert.equal(by('Email provider configured').ok, false);
    assert.match(by('Email provider configured').fix, /GMAIL_REFRESH_TOKEN/);
    assert.equal(by('Forgot-password endpoint').ok, false);
    assert.match(by('Forgot-password endpoint').detail, /503/);
    assert.equal(by('Google keys present').ok, false);
    assert.match(by('Google keys present').fix, /GOOGLE_CLIENT_ID/);
  });
});

test('checker: a configured server passes mail + Google, prints the exact redirect URI and verifies CORS', async () => {
  await withServer({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'rt' }, async (api) => {
    const res = await runChecks(api, 'https://web.example');
    for (const c of res.filter((x) => x.name !== 'Website reachable' && x.name !== 'Website points at this server')) assert.equal(c.ok, true, `${c.name}: ${c.detail}`);
    const redirect = res.find((c) => c.name === 'Google consent redirect');
    assert.match(redirect.detail, new RegExp(`${api.replace(/[.]/g, '\\.')}/api/google/callback`));
    assert.equal(res.find((c) => c.name === 'Web app allowed by CORS').ok, true);
  });
});

test('checker: a web origin missing from CLIENT_URL is reported', async () => {
  await withServer({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GMAIL_REFRESH_TOKEN: 'rt' }, async (api) => {
    const res = await runChecks(api, 'https://not-allowed.example');
    const cors = res.find((c) => c.name === 'Web app allowed by CORS');
    assert.equal(cors.ok, false);
    assert.match(cors.fix, /CLIENT_URL/);
  });
});

test('checker: an old build (no version in /api/health) is flagged as not the latest code', async () => {
  const fake = async (url) => (String(url).endsWith('/api/health')
    ? new Response(JSON.stringify({ success: true, status: 'healthy' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }));
  const res = await runChecks('https://old.example', '', { fetchImpl: fake });
  const c = res.find((x) => x.name === 'Latest code deployed');
  assert.equal(c.ok, false);
  assert.match(c.detail, /OLD build/);
});
