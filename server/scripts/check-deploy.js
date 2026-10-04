#!/usr/bin/env node
// Checks a DEPLOYED FlexFit server and tells you exactly what is missing.
//
//   node scripts/check-deploy.js https://mydailyos.onrender.com https://mydailyos.vercel.app
//
// It is read-only and safe: the password-reset probe uses an address that does not exist, so no email is ever sent.

const MIN_VERSION = '2.7.0';
const cmp = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

async function runChecks(api, web, { fetchImpl = globalThis.fetch } = {}) {
  api = api.replace(/\/+$/, ''); web = web ? web.replace(/\/+$/, '') : '';
  const out = [];
  const add = (ok, name, detail, fix) => out.push({ ok, name, detail, fix });
  const get = async (url, init) => { try { const r = await fetchImpl(url, { redirect: 'manual', ...init }); let j = null; try { j = await r.clone().json(); } catch { /* not json */ } return { r, j }; } catch (e) { return { err: e.message }; } };

  // 1. server up + version
  const t0 = Date.now();
  const h = await get(`${api}/api/health`);
  if (h.err || !h.r.ok) { add(false, 'Server reachable', h.err || `HTTP ${h.r.status}`, 'Open the Render dashboard -> Logs. The service may still be deploying/crashed (look for "MongoDB connection failed").'); return out; }
  add(true, 'Server reachable', `${Date.now() - t0} ms${Date.now() - t0 > 8000 ? ' (it was asleep — free tier wakes slowly)' : ''}`);
  const v = h.j?.version;
  add(!!v && cmp(v, MIN_VERSION) >= 0, 'Latest code deployed', v ? `server v${v}` : 'no version reported — this is an OLD build', `Deploy the latest server code (needs v${MIN_VERSION}+): push the new flexfit-web zip contents to the GitHub branch Render deploys, then Manual Deploy -> Deploy latest commit.`);

  // 2. email
  const mail = h.j?.mail;
  add(!!mail && mail !== 'not-configured', 'Email provider configured', mail ? mail : 'none', 'Render -> Environment: set GMAIL_REFRESH_TOKEN (see SETUP_V5.md section 1) together with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then redeploy.');
  const f = await get(`${api}/api/auth/forgot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'deploy-check@invalid.example' }) });
  add(f.r?.status === 200, 'Forgot-password endpoint', f.err || `HTTP ${f.r.status}${f.j?.message ? ` — ${f.j.message}` : ''}`, f.r?.status === 503 ? 'Email is not configured (see above).' : 'Check Render logs for errors on POST /api/auth/forgot.');

  // 3. google
  const g = h.j?.google;
  add(g === 'configured', 'Google keys present', g || 'unknown', 'Render -> Environment: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (SETUP_V5.md section 2), then redeploy.');
  const gc = await get(`${api}/api/google/config`);
  add(gc.j?.available === true, 'Google sign-in enabled', gc.err || JSON.stringify(gc.j), 'Same fix as above. (If this says 404, the old build is still live.)');
  if (web) {
    const s = await get(`${api}/api/google/start?returnTo=${encodeURIComponent(web + '/')}`);
    const loc = s.r?.headers?.get('location') || '';
    if (loc.startsWith('https://accounts.google.com/')) {
      const ru = new URL(loc).searchParams.get('redirect_uri');
      add(true, 'Google consent redirect', `redirects to Google. Register EXACTLY this Authorized redirect URI in Google Cloud: ${ru}`);
    } else {
      add(false, 'Google consent redirect', loc ? `redirects to ${loc.slice(0, 120)}` : `HTTP ${s.r?.status || s.err}`, 'Google keys missing, or your web address is not in CLIENT_URL on Render (it must include ' + web + ').');
    }
    // 4. CORS for the web app
    const c = await get(`${api}/api/auth/login`, { method: 'OPTIONS', headers: { origin: web, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    const allow = c.r?.headers?.get('access-control-allow-origin');
    add(allow === web || allow === '*', 'Web app allowed by CORS', allow ? `allows ${allow}` : 'not allowed', `Render -> Environment: CLIENT_URL must contain ${web} (comma-separate several). Then redeploy.`);
    // 5. does the website talk to this API?
    const idx = await get(web + '/');
    if (idx.r?.ok) {
      const html = await idx.r.text();
      const js = (html.match(/\/assets\/index-[^"']+\.js/) || [])[0];
      if (js) { const code = await (await fetchImpl(web + js)).text(); add(code.includes(api), 'Website points at this server', code.includes(api) ? api : 'the built website does not mention ' + api, 'Redeploy the website (Vercel) after updating client/src/config.js.'); }
    } else add(false, 'Website reachable', idx.err || `HTTP ${idx.r?.status}`, 'Check the Vercel deployment.');
  }
  return out;
}

module.exports = { runChecks, MIN_VERSION };

if (require.main === module) {
  const [api, web] = process.argv.slice(2);
  if (!api) { console.error('Usage: node scripts/check-deploy.js <api-url> [web-url]'); process.exit(2); }
  runChecks(api, web).then((res) => {
    let bad = 0;
    for (const c of res) { console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`); if (!c.ok) { bad++; console.log(`      -> ${c.fix}`); } }
    console.log(bad ? `\n${bad} problem(s) to fix.` : '\nEverything looks correctly configured.');
    process.exit(bad ? 1 : 0);
  });
}
