// Validates and merges the tour progress a client sends. Only known keys, only short strings, capped lists: nothing else is stored.
const ARR = ['path', 'done', 'skipped', 'events', 'hintsSeen', 'newSeen'];
const clean = (a) => [...new Set((Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && x.length <= 40))].slice(0, 60);
const str = (x, n = 20) => (typeof x === 'string' ? x.slice(0, n) : '');

function sanitizeTour(body = {}) {
  const out = {};
  for (const k of ARR) out[k] = clean(body[k]);
  out.goal = ['lose', 'build', 'stay'].includes(body.goal) ? body.goal : '';
  out.coach = str(body.coach, 20).replace(/[^a-z0-9_-]/gi, '');
  out.status = ['idle', 'active', 'paused', 'done', 'dismissed'].includes(body.status) ? body.status : 'idle';
  out.index = Math.max(0, Math.min(20, Math.floor(Number(body.index) || 0)));
  out.checklistDismissed = body.checklistDismissed === true;
  out.rewardClaimed = body.rewardClaimed === true;
  out.updatedAt = Number(body.updatedAt) > 0 ? Number(body.updatedAt) : Date.now();
  return out;
}
/** Union of the lists (nothing completed is lost); the newer side wins for goal / coach / status. */
function mergeTour(saved = {}, incoming = {}) {
  const a = saved || {}, b = incoming || {};
  const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  const out = { ...newer };
  for (const k of ARR) out[k] = clean([...(a[k] || []), ...(b[k] || [])]);
  out.path = clean(newer.path || a.path || []);
  out.checklistDismissed = !!(a.checklistDismissed || b.checklistDismissed);
  out.rewardClaimed = !!(a.rewardClaimed || b.rewardClaimed);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}
module.exports = { sanitizeTour, mergeTour };
