import { API_URL } from "../config";
import { enqueue, flushQueue, isQueueable, saveGet, savedGet, refreshPending, purgeOthers, wipeAll } from "../offline/offlineApi";

export function clearSession() {
  localStorage.removeItem("mydailyos_token");
  localStorage.removeItem("mydailyos_user");
  // The saved dashboard copy belongs to the person who just left. Their queued offline changes stay (tagged with their
  // email) so they are still sent if the same person signs back in.
  localStorage.removeItem("mydailyos_dash_v1");
}

/** Sign-out on purpose: nothing of this person stays in the browser. */
export async function signOutCompletely() {
  clearSession();
  await wipeAll();
}

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

function buildRequest(input, options) {
  const token = localStorage.getItem("mydailyos_token");
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const url = typeof input === "string" && input.startsWith("/") ? `${API_URL}${input}` : input;
  return { url, init: { ...options, headers }, token };
}

export async function apiFetch(input, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const { url, init, token } = buildRequest(input, options);
  const isApi = typeof url === "string" && url.startsWith(API_URL);

  // New entries get a client id so that a retry (after a lost response or an offline replay) can never create a duplicate.
  if (isApi && isQueueable(method, url) && init.body) {
    try {
      const b = JSON.parse(init.body);
      if (b && typeof b === "object" && !b.clientId) { b.clientId = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; init.body = JSON.stringify(b); }
    } catch { /* not JSON: leave as is */ }
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (networkError) {
    if (!isApi || !token) throw networkError;
    // ---- no connection ----
    if (method === "GET") {
      const saved = await savedGet(url);
      if (saved) return json(saved.data, 200, { "X-FlexFit-Offline": "1", "X-FlexFit-Saved-At": String(saved.at) });
      return json({ success: false, message: "You're offline and this hasn't been opened before, so there is nothing saved to show yet." }, 503, { "X-FlexFit-Offline": "1" });
    }
    if (isQueueable(method, url) && (await enqueue({ method, url, body: init.body }))) {
      window.dispatchEvent(new CustomEvent("mydailyos:toast", { detail: { message: "You're offline — saved on this device and will sync automatically.", type: "info", duration: 4000 } }));
      return json({ success: true, queued: true, offline: true }, 202, { "X-FlexFit-Offline": "1" });
    }
    return json({ success: false, message: "You're offline. This change needs a connection — please try again when you're back online." }, 503, { "X-FlexFit-Offline": "1" });
  }

  if (response.status === 401 && token) {
    clearSession();
    window.dispatchEvent(new Event("mydailyos:unauthorized"));
  }
  if (isApi && method === "GET" && response.ok) {
    response.clone().json().then((data) => saveGet(url, data)).catch(() => {});
  }
  return response;
}

/** Sends one queued change (used by the replay loop). Returns { ok, status }. */
async function sendQueued(op) {
  const token = localStorage.getItem("mydailyos_token");
  const res = await fetch(op.url, { method: op.method, headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: op.body });
  return { ok: res.ok, status: res.status };
}

export const syncNow = () => flushQueue(sendQueued);

/** Call once at startup: replay on reconnect, on tab focus, on a timer while changes wait. */
let syncStarted = false;
export function startOfflineSync() {
  if (syncStarted) return;
  syncStarted = true;
  refreshPending();
  const go = () => { if (navigator.onLine) syncNow(); };
  window.addEventListener("online", go);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") go(); });
  window.setInterval(go, 30000);
  go();
}
