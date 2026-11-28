// Run BEFORE publishing the phone app: is the deployed server new enough?
//   node tools/checkServerReady.mjs https://your-server.example.com [60]
// Exit 0 = ready (deploy the phone app), exit 1 = deploy the server first.
const base = (process.argv[2] || process.env.API_URL || '').replace(/\/+$/, '');
const need = Number(process.argv[3] || 60);
if (!base) { console.error('Usage: node tools/checkServerReady.mjs <server url> [required apiLevel]'); process.exit(2); }
try {
  const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(60000) });   // a free host can take a minute to wake up
  const j = await r.json().catch(() => ({}));
  const have = Number(j.apiLevel || 0);
  console.log(`server ${base}: version ${j.version || '?'}, apiLevel ${have || 'missing (older than v60)'}, needs ${need}`);
  if (have >= need) { console.log('READY: safe to deploy the phone app.'); process.exit(0); }
  console.log('NOT READY: deploy the server first (the new protein range, progress numbers, arrival chart, plan start prompt come from it).');
  process.exit(1);
} catch (e) { console.error(`Could not reach ${base}: ${e.message}`); process.exit(2); }
