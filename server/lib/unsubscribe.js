// One-click unsubscribe for the weekly email (RFC 8058 + a human page). The link carries a signed token, so it needs no login.
const jwt = require('jsonwebtoken');

const PURPOSE = 'unsub-weekly';
const sign = (userId, secret = process.env.JWT_SECRET) => jwt.sign({ sub: String(userId), purpose: PURPOSE }, secret, { expiresIn: '400d' });
function verify(token, secret = process.env.JWT_SECRET) {
  try { const p = jwt.verify(String(token || ''), secret); return p.purpose === PURPOSE ? String(p.sub) : null; } catch { return null; }
}

/** Public base URL of THIS API (Render sets RENDER_EXTERNAL_URL automatically; PUBLIC_API_URL overrides it). */
const apiBase = (env = process.env) => String(env.PUBLIC_API_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
/** The website people open (first non-localhost CLIENT_URL). */
const appUrl = (env = process.env) => String(env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).find((u) => u && !/localhost|127\.0\.0\.1/.test(u)) || '';

function unsubscribeUrl(userId, env = process.env) {
  const base = apiBase(env);
  return base ? `${base}/api/email/unsubscribe?token=${encodeURIComponent(sign(userId, env.JWT_SECRET))}` : '';
}

const page = (title, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f3f4fb;color:#1f2340;margin:0;display:grid;place-items:center;min-height:100vh}
.c{background:#fff;border-radius:18px;padding:32px;max-width:420px;margin:16px;box-shadow:0 10px 30px rgba(31,35,64,.1);text-align:center}
button{background:#5b5bd6;color:#fff;border:0;border-radius:12px;padding:14px 26px;font-size:16px;font-weight:700;cursor:pointer;min-height:48px}
p{color:#6b7090;line-height:1.5}</style></head><body><div class="c"><div style="font-size:34px">✦</div>${body}</div></body></html>`;

module.exports = { sign, verify, unsubscribeUrl, apiBase, appUrl, page, PURPOSE };
