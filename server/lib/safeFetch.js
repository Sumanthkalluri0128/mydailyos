// Fetches a recipe web page for the importer, safely. The server must never be tricked into reading its own network
// ("server-side request forgery"), so: http(s) only, no private / loopback / link-local addresses (checked on EVERY redirect),
// at most 3 redirects, 8 seconds, 1.5 MB, HTML or text only.
const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_BYTES = 1.5 * 1024 * 1024;
const TIMEOUT_MS = 8000;

function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return isBlockedIp(mapped[1]);
    return /^(fc|fd)/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
  }
  return true;
}

/** Throws a plain Error('...') with a message that is safe to show the person. */
async function assertPublicUrl(raw, lookup = dns.lookup) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { throw new Error('That does not look like a web link.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links can be imported.');
  if (u.username || u.password) throw new Error('Links with a username or password are not allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Error('That address is not allowed.');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error('Could not find that website.'); });
  if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) throw new Error('That address is not allowed.');
  return u;
}

async function fetchPage(raw, { lookup = dns.lookup, fetchImpl = fetch } = {}) {
  let url = await assertPublicUrl(raw, lookup);
  for (let hop = 0; hop <= 3; hop += 1) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try { res = await fetchImpl(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyDailyOSRecipeImport/1.0)', Accept: 'text/html,application/xhtml+xml' } }); }
    catch { throw new Error('Could not open that page.'); } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString(), lookup); continue; }
    if (!res.ok) throw new Error(`That page answered with an error (${res.status}).`);
    const type = String(res.headers.get('content-type') || '');
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) throw new Error('That link is not a web page.');
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) return await res.text();
    const chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { try { await reader.cancel(); } catch { /* ignore */ } throw new Error('That page is too large to import.'); } chunks.push(value); }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('That link redirects too many times.');
}

module.exports = { isBlockedIp, assertPublicUrl, fetchPage, MAX_BYTES };
