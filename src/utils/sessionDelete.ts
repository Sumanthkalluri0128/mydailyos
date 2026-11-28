// @ts-nocheck
// Deleting a finished workout from the Workout tab: what the server has to be told, and the small retry list that makes the delete survive
// a lost connection. Pure (no storage, no network, no React), shared by the web app and the phone
// (generated copies: edit packages/shared/src/sessionDelete.js, then run tools/syncShared.mjs).
//
// Why a list: deleting a session only on the device left its calorie entry on the server, so the day's burn stayed inflated. The delete must reach
// the server, but the offline queue only holds CREATES (a replayed delete could remove something newer), so a delete waits here instead.
//   entry = { clientId, kind: "smart" | "activity", at, after? }   (after: do not send before this time, e.g. the phone's "Undo" window)
//   smart    -> DELETE /api/body-plan/session?clientId=...   (the session AND its calorie entry, and the plan is rebuilt)
//   activity -> DELETE /api/activities/logs?clientId=...     (the calorie entry made for a classic / custom plan workout)

export const PENDING_MAX = 200;
export const PENDING_MAX_AGE_MS = 60 * 24 * 3600 * 1000;   // a delete that could not be sent in two months is given up on (the entry is long gone or never existed)

/** The id the apps give the server for a finished session: `wp-<id>` for a Smart session on both, and for classic / custom ones `wp-<id>` on the web but `ws-<id>` on the phone. */
export const clientIdFor = (sessionId, prefix = "wp") => `${prefix}-${sessionId}`;

/**
 * What to send for one finished session. `smart` = it was saved by the Smart program (a body-plan session) rather than as a plain exercise entry.
 * `classicPrefix` = the id prefix the app uses for the plain exercise entry ("wp" on the web, "ws" on the phone); a Smart session is always `wp-`.
 */
export function deleteRequest(sessionId, { smart = false, classicPrefix = "wp" } = {}) {
  const id = String(sessionId || "");
  if (!id) return null;
  const clientId = clientIdFor(id, smart ? "wp" : classicPrefix);
  if (clientId.length > 80 || !/^[\w.:-]+$/.test(clientId)) return null;  // the server would refuse it with 400
  return { clientId, kind: smart ? "smart" : "activity" };
}

/** URL path (with the person's own `today`, so a rebuilt Smart plan lines up with their day) for one entry. */
export function deletePath(entry, today = "") {
  const q = `clientId=${encodeURIComponent(entry.clientId)}`;
  if (entry.kind === "smart") return `/api/body-plan/session?${q}${/^\d{4}-\d{2}-\d{2}$/.test(String(today)) ? `&date=${today}` : ""}`;
  return `/api/activities/logs?${q}`;
}

/**
 * Add a delete to the list. Asking twice for the same session keeps one entry. Returns a new list (the old one is not changed).
 * `delayMs` holds the send back (the phone shows an "Undo" for a few seconds; the entry is on the list from the start so an app kill in that window loses nothing).
 */
export function addPending(list, request, now = Date.now(), { delayMs = 0 } = {}) {
  const cur = Array.isArray(list) ? list : [];
  if (!request || !request.clientId) return cur;
  if (cur.some((x) => x.clientId === request.clientId)) return cur;
  const entry = { clientId: request.clientId, kind: request.kind === "smart" ? "smart" : "activity", at: now };
  if (delayMs > 0) entry.after = now + delayMs;
  const next = [...cur, entry];
  return next.length > PENDING_MAX ? next.slice(next.length - PENDING_MAX) : next;
}

/** Take one delete off the list (the person pressed Undo). Returns a new list. */
export function removePending(list, clientId) {
  return (Array.isArray(list) ? list : []).filter((x) => x && x.clientId !== clientId);
}

/** A list read back from storage: only well-formed entries, once each, and nothing older than the age limit. */
export function cleanPending(list, now = Date.now()) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x.clientId !== "string" || !x.clientId || seen.has(x.clientId)) continue;
    const at = Number(x.at) || now;
    if (now - at > PENDING_MAX_AGE_MS) continue;
    seen.add(x.clientId);
    const entry = { clientId: x.clientId, kind: x.kind === "smart" ? "smart" : "activity", at };
    if (Number(x.after) > 0) entry.after = Number(x.after);
    out.push(entry);
  }
  return out.slice(-PENDING_MAX);
}

/**
 * What an answer means for one delete.
 *   done  : the entry is gone (or was never there): take it off the list
 *   keep  : try again later (no connection, server asleep or busy, signed out)
 *   drop  : the server will never accept this request, so retrying would loop for ever
 */
export function classify(status) {
  const s = Number(status);
  if (s >= 200 && s < 300) return "done";
  if (s === 404) return "done";
  if (!s || s === 401 || s === 408 || s === 425 || s === 429 || s >= 500) return "keep";
  return "drop";
}

/**
 * Send every waiting delete, oldest first. `send(entry)` answers { ok, status, plan? } or throws when there is no connection.
 * Stops at the first answer that means "offline / server not ready" (the rest would fail the same way), keeps those, drops the hopeless ones.
 * Returns { remaining, done: [clientId], dropped: [clientId], plan } where `plan` is the newest rebuilt Smart plan the server sent back.
 */
export async function runPending(list, send, now = Date.now()) {
  const todo = cleanPending(list, now);
  const remaining = [], done = [], dropped = [];
  let plan = null, stop = false;
  for (const entry of todo) {
    if (stop || (entry.after && entry.after > now)) { remaining.push(entry); continue; }   // not due yet (still in its Undo window): leave it, and carry on with the others
    let res;
    try { res = await send(entry); } catch { stop = true; remaining.push(entry); continue; }
    const verdict = classify(res && res.status);
    if (verdict === "done") { done.push(entry.clientId); if (res.plan) plan = res.plan; }
    else if (verdict === "drop") dropped.push(entry.clientId);
    else { remaining.push(entry); if (!res || !res.status || res.status === 503 || res.status === 401 || res.status === 429 || res.status >= 500) stop = true; }
  }
  return { remaining, done, dropped, plan };
}

/**
 * Is this queued offline write the creation of a session that is being deleted? (Such a create must be cancelled, or it would replay later and bring
 * the deleted workout back.) `op` is an offline-queue entry { method, url, body }.
 */
export function queuedCreateOf(op, clientIds) {
  if (!op || String(op.method || "").toUpperCase() !== "POST") return false;
  const path = String(op.url || "").split("?")[0];
  if (!/\/api\/(body-plan\/session|activities\/logs)$/.test(path)) return false;
  let id = "";
  try { id = JSON.parse(op.body || "{}").clientId || ""; } catch { return false; }
  const set = clientIds instanceof Set ? clientIds : new Set(clientIds || []);
  return set.has(id);
}
