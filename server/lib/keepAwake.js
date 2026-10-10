// Free hosting (Render) puts a service to sleep after ~15 minutes without traffic, and the next request then waits ~30-60 s.
// While the server is awake it pings its own PUBLIC url every few minutes, which counts as traffic and stops it from going to
// sleep. (An external monitor / the GitHub keep-alive workflow still matters: nothing running inside a sleeping server can wake it.)
// Only active when the host tells us its public url (Render sets RENDER_EXTERNAL_URL) or KEEP_AWAKE_URL is set. Turn off with KEEP_AWAKE=false.
const https = require('https');
const http = require('http');

const INTERVAL_MS = 4 * 60 * 1000;

function startKeepAwake({ url = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL, every = INTERVAL_MS, log = console } = {}) {
  if (process.env.KEEP_AWAKE === 'false' || !url) return null;
  const target = `${String(url).replace(/\/+$/, '')}/api/health`;
  const lib = target.startsWith('https') ? https : http;
  const ping = () => {
    const req = lib.get(target, { timeout: 20000 }, (res) => res.resume());
    req.on('timeout', () => req.destroy());
    req.on('error', (e) => log.warn && log.warn('keep-awake ping failed:', e.message));
  };
  const timer = setInterval(ping, every);
  timer.unref();
  log.log && log.log(`Keep-awake: pinging ${target} every ${Math.round(every / 60000)} min`);
  return timer;
}

module.exports = { startKeepAwake, INTERVAL_MS };
