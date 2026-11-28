// @ts-nocheck
// Record sync between a person's devices: what to send, how to merge what comes back. Pure (no storage, no network), shared by the web app
// and the phone (generated copies: edit packages/shared/src/recordSync.js, then run tools/syncShared.mjs).
//
//   current : { "kind:rid": { kind, rid, data, updatedAt? } }   what this device holds now
//   memory  : { v, cursor, known: { "kind:rid": { h, u, d } } } what the server is known to hold: h = hash of the data, u = its edit time, d = deleted
//
// A sync round is: PUSH what changed here (the server keeps the newest edit per record), then PULL what changed elsewhere.
// The safety rails, each one tested:
//   * the first sync only ever ADDS: nothing is known yet, so nothing counts as deleted;
//   * a device whose log suddenly looks empty (cleared browser data, a failed restore) does NOT delete the server copy: it is brought back;
//   * an edit made here after the last sync is never overwritten by a pull; it is pushed and the newest edit wins on the server;
//   * a record the server already has in this exact form is not sent again.
export const OVERLAP = 50;                    // pull from a little before the last answer: a record can appear a moment after a later one
export const BULK_MIN = 20;                   // deleting more than this many at once, and more than half of what is known, needs the person to have asked
export const EMPTY_MEMORY = { v: 1, cursor: 0, known: {} };

export const keyOf = (kind, rid) => `${kind}:${rid}`;
const split = (key) => { const i = key.indexOf(':'); return { kind: key.slice(0, i), rid: key.slice(i + 1) }; };

function canon(x) {
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`;
  return JSON.stringify(x === undefined ? null : x);
}
/** A short fingerprint of a record's data (key order and undefined fields do not matter). */
export function hashOf(data) {
  const s = canon(data);
  let a = 5381, b = 0;
  for (let i = 0; i < s.length; i += 1) { const c = s.charCodeAt(i); a = (((a << 5) + a) + c) | 0; b = (Math.imul(b, 31) + c) | 0; }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}:${s.length}`;
}

/** What to send. `allowBulkDelete` is true only when the person cleared or restored the whole log on purpose. */
export function planPush(current, memory, now, opts = {}) {
  const known = (memory && memory.known) || {};
  const records = [];
  for (const [key, rec] of Object.entries(current || {})) {
    const m = known[key];
    if (m && !m.d && m.h === hashOf(rec.data)) continue;                                   // the server already has exactly this
    // Never sent before: keep its own time (a record made last spring stays "last spring"). Changed since: now.
    const own = Number(rec.updatedAt);
    records.push({ kind: rec.kind, rid: rec.rid, data: rec.data, updatedAt: m ? now : (own > 0 ? Math.min(own, now) : now), deleted: false });
  }
  const gone = Object.keys(known).filter((k) => !known[k].d && !(current && current[k]));
  const live = Object.values(known).filter((m) => !m.d).length;
  const suspicious = !opts.allowBulkDelete && gone.length > BULK_MIN && gone.length > live / 2;
  if (!suspicious) for (const k of gone) records.push({ ...split(k), data: null, updatedAt: now, deleted: true });
  // `lost`: records that vanished here but must not be deleted there; the caller forgets them so the next pull restores them.
  return { records, heldBack: suspicious ? gone.length : 0, lost: suspicious ? gone : [] };
}

/** After a push: everything that was sent is now "known" in the form it was sent. Where the server held a newer copy, that copy arrives through applyPulled. */
export function applyPushed(memory, sent) {
  const known = { ...((memory && memory.known) || {}) };
  for (const r of sent) known[keyOf(r.kind, r.rid)] = r.deleted ? { h: '', u: r.updatedAt, d: true } : { h: hashOf(r.data), u: r.updatedAt, d: false };
  return { ...memory, v: 1, known };
}

/** Forget some records (the held-back deletions) so a pull puts them back. */
export function forget(memory, keys) {
  const known = { ...((memory && memory.known) || {}) };
  for (const k of keys) delete known[k];
  return { ...memory, known };
}

/** Merge what the server sent. Returns what to change on this device and the new memory. */
export function applyPulled(current, memory, pulled) {
  const known = { ...((memory && memory.known) || {}) };
  const upserts = [], removals = [];
  for (const p of pulled || []) {
    if (!p || typeof p.kind !== 'string' || typeof p.rid !== 'string') continue;
    const key = keyOf(p.kind, p.rid), m = known[key], local = current ? current[key] : undefined;
    const pu = Number(p.updatedAt) || 0;
    if (m && Number(m.u) > pu) continue;                                                    // older than what we already know
    if (m && Number(m.u) === pu && (m.d ? !!p.deleted : !p.deleted && m.h === hashOf(p.data))) continue;   // exactly what we have
    if (local && m && !m.d && hashOf(local.data) !== m.h) continue;                         // edited here since the last sync: pushed next, the newest edit wins there
    if (!local && m && !m.d) continue;                                                      // deleted here since the last sync: pushed next
    if (p.deleted) {
      if (local) removals.push({ kind: p.kind, rid: p.rid });
      known[key] = { h: '', u: pu, d: true };
    } else {
      if (!local || hashOf(local.data) !== hashOf(p.data)) upserts.push({ kind: p.kind, rid: p.rid, data: p.data });
      known[key] = { h: hashOf(p.data), u: pu, d: false };
    }
  }
  return { upserts, removals, memory: { ...memory, v: 1, known } };
}

/** Where the next pull starts. */
export const nextSince = (memory) => Math.max(0, Number((memory && memory.cursor) || 0) - OVERLAP);

/** One body record per day: of several for the same day, the newest stays; returns the ids to remove. */
export function dropDuplicateDays(list) {
  const best = new Map(), drop = [];
  for (const b of list || []) {
    const cur = best.get(b.date);
    if (!cur) { best.set(b.date, b); continue; }
    const keep = (Number(b.at) || 0) > (Number(cur.at) || 0) || ((Number(b.at) || 0) === (Number(cur.at) || 0) && String(b.id) > String(cur.id)) ? b : cur;
    drop.push(keep === b ? cur.id : b.id); best.set(b.date, keep);
  }
  return drop;
}

export const chunk = (arr, n = 500) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/**
 * One full round: push what changed here, pull what changed elsewhere, apply it. Both apps run exactly this; each only supplies how to
 * read and write its own storage and how to reach the server.
 *   io.current() -> records now      io.memory() -> memory      io.save(memory)
 *   io.push(records) -> { kept: [records the server holds a newer copy of] }
 *   io.pull(since) -> { records, seq, more }
 *   io.apply(upserts, removals)      applies other devices' changes to this device's log
 * Progress is saved after every step, so a dropped connection loses nothing and the next round carries on.
 */
export async function syncRound(io, opts = {}) {
  const now = opts.now || Date.now();
  let mem = io.memory();
  const plan = planPush(io.current(), mem, now, opts);
  if (plan.lost.length) mem = forget(mem, plan.lost);
  let back = [];
  for (const part of chunk(plan.records)) {
    const r = await io.push(part);
    back = back.concat((r && r.kept) || []);
    mem = applyPushed(mem, part);
    io.save(mem);
  }
  let since = nextSince(mem), cursor = Number(mem.cursor) || 0, got = back;
  for (let pages = 0; pages < 200; pages += 1) {
    const r = await io.pull(since);
    got = got.concat(r.records || []);
    since = Number(r.seq) || since; cursor = Math.max(cursor, since);
    if (!r.more) break;
  }
  const res = applyPulled(io.current(), mem, got);
  if (res.upserts.length || res.removals.length) io.apply(res.upserts, res.removals);
  io.save({ ...res.memory, cursor });
  return { pushed: plan.records.length, heldBack: plan.heldBack, added: res.upserts.length, removed: res.removals.length };
}
