// Sending finished workouts to the server (so their calories count in the day's totals): which to send, what each answer means, and what to do about a
// workout the server will not accept. Pure (no network, storage or React), shared by the web app and the phone
// (generated copies: edit packages/shared/src/syncRun.js, then run tools/syncShared.mjs).
//
// What went wrong before: a refused Smart workout was marked "sent" (silently lost); a refused classic one was retried for ever; the phone stopped at the first
// failure (one stuck workout blocked every later one) and only looked at the last five; and nothing ever told the person.
// Now: three outcomes. ok = sent. offline = no connection / server asleep or busy / signed out: stop here and try again later (the rest would fail the same way).
// rejected = the server will never accept THIS workout: remember why, show it to the person with a Retry button, and carry on with the others.

export const SYNC_WINDOW_DAYS = 60;      // unsent workouts newer than this are tried again (was 14 on the web, "the last five" on the phone)
export const FAILED_MAX = 100;

/** What an HTTP answer means for sending one workout. status 0 / undefined = the request never got an answer. */
export function outcomeOf(status) {
  const s = Number(status);
  if (s >= 200 && s < 300) return "ok";
  if (!s || s === 401 || s === 408 || s === 425 || s === 429 || s >= 500) return "offline";
  return "rejected";
}

/** A short plain sentence for the person. `message` is what the server said, if anything. */
export function reasonFor(status, message = "") {
  const m = String(message || "").trim().replace(/\s+/g, " ");
  if (m && m.length <= 140) return m;
  const s = Number(status);
  if (s === 400 || s === 422) return "The server could not accept this workout.";
  if (s === 403) return "This workout is not allowed on your account.";
  if (s === 404) return "The server could not find where to put this workout.";
  if (s === 413) return "This workout is too large to send.";
  return s ? `The server refused this workout (${s}).` : "The server refused this workout.";
}

const dayMs = 86400000;
const addDaysStr = (date, n) => { const t = Date.parse(`${date}T00:00:00Z`); return Number.isNaN(t) ? "" : new Date(t + n * dayMs).toISOString().slice(0, 10); };

/**
 * The workouts to send, oldest first. `skip(s)` says which to leave out (already sent, refused and waiting for a Retry, rest days).
 * Anything older than the window stays on the device only.
 */
export function pickToSync(sessions, opts = {}) {
  const { today, skip, windowDays = SYNC_WINDOW_DAYS } = opts;
  const oldest = addDaysStr(today, -windowDays);
  const out = (Array.isArray(sessions) ? sessions : []).map((s, i) => [s, i]).filter(([s]) => s && s.id && (!skip || !skip(s)) && (!oldest || String(s.date) >= oldest));
  out.sort((a, b) => (String(a[0].date) < String(b[0].date) ? -1 : String(a[0].date) > String(b[0].date) ? 1 : a[1] - b[1]));
  return out.map(([s]) => s);
}

/**
 * Send them one after another. `send(s)` answers { outcome: "ok" | "offline" | "rejected", reason?, ...anything else (plan, highlights) } or throws (= offline).
 * `stillWanted(s)` is asked just before each send (a workout deleted since the run began must not be sent).
 * Returns { done: [id], failed: { id: { reason, at } }, extras: { id: answer }, stopped }.
 */
export async function runSync(list, send, opts = {}) {
  const { stillWanted, now = Date.now() } = opts;
  const done = [], failed = {}, extras = {};
  let stopped = false;
  for (const s of Array.isArray(list) ? list : []) {
    if (stillWanted && !stillWanted(s)) continue;
    let res;
    try { res = await send(s); } catch { stopped = true; break; }
    if (res && res.outcome === "ok") { done.push(s.id); extras[s.id] = res; }
    else if (res && res.outcome === "rejected") failed[s.id] = { reason: String(res.reason || reasonFor(0)).slice(0, 200), at: now };
    else { stopped = true; break; }
  }
  return { done, failed, extras, stopped };
}

/** A map of refused workouts read back from storage: well-formed entries only, newest kept. */
export function cleanFailed(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const rows = Object.entries(map).filter(([id, v]) => id && v && typeof v.reason === "string" && v.reason).map(([id, v]) => [id, { reason: v.reason.slice(0, 200), at: Number(v.at) || 0 }]);
  rows.sort((a, b) => a[1].at - b[1].at);
  return Object.fromEntries(rows.slice(-FAILED_MAX));
}
