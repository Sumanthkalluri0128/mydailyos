// Feature flags: switch a new feature on for a few people (a list or a percentage) before everyone gets it.
// Pure rules (no database), so they are tested on their own. Evaluation is deterministic: the same person always gets the same answer
// for the same flag, and raising the percentage only ever ADDS people (nobody who had it loses it).
const KEY_RE = /^[a-z][a-z0-9_.-]{1,40}$/;

/** FNV-1a 32-bit hash, so the percentage bucket needs no library. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** The person's bucket for this flag: 0..99. */
const bucket = (key, userId) => hash32(`${key}:${userId}`) % 100;

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Is the flag on for this person? `who` = { id, email } (or null when signed out).
 *  - enabled false is the master off switch.   - deny list always wins.   - allow list (ids or emails) is always on.
 *  - percent 100 = everyone (even signed out); otherwise the person's bucket must be below the percentage.
 */
function evaluate(flag, who) {
  if (!flag || flag.enabled !== true) return false;
  const id = who && who.id ? String(who.id) : '';
  const email = norm(who && who.email);
  const deny = (flag.deny || []).map(norm);
  if ((id && deny.includes(norm(id))) || (email && deny.includes(email))) return false;
  const allow = (flag.allow || []).map(norm);
  if ((id && allow.includes(norm(id))) || (email && allow.includes(email))) return true;
  const pct = Math.max(0, Math.min(100, Number(flag.percent) || 0));
  if (pct >= 100) return true;
  if (pct <= 0 || !id) return false;
  return bucket(flag.key, id) < pct;
}

/** { key: boolean } for every flag. */
const evaluateAll = (flags, who) => Object.fromEntries((flags || []).map((f) => [f.key, evaluate(f, who)]));

/** Checks an admin's flag edit and returns the clean flag, or throws an Error with a plain message. */
function cleanFlag(key, body = {}) {
  if (!KEY_RE.test(String(key || ''))) throw new Error('Flag keys use lowercase letters, numbers, dots, dashes and underscores (2 to 41 characters, starting with a letter).');
  const list = (v) => { const a = Array.isArray(v) ? v : String(v || '').split(/[\s,]+/); return [...new Set(a.map(norm).filter(Boolean))].slice(0, 200); };
  const pct = body.percent === undefined || body.percent === '' ? 0 : Number(body.percent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Percent must be between 0 and 100.');
  return { key, enabled: body.enabled === true, percent: Math.round(pct), allow: list(body.allow), deny: list(body.deny), description: String(body.description || '').slice(0, 200) };
}

module.exports = { KEY_RE, hash32, bucket, evaluate, evaluateAll, cleanFlag };
