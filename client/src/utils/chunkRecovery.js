// A new deploy renames every built file. A tab (or a saved copy of the page) from BEFORE the deploy then asks for a
// file that no longer exists: "Failed to fetch dynamically imported module ... 404". Left alone, that error blanks the app.
// Here we (1) recognise it, (2) retry once, and (3) if it is still missing, clear the saved copies and reload ONCE
// so the newest version loads. A guard stops a reload loop if the server really is broken.

const KEY = "ff_chunk_reload_at";
const WINDOW_MS = 60_000; // at most one automatic reload a minute

const PATTERNS = [
  /Failed to fetch dynamically imported module/i,   // Chrome, Edge
  /error loading dynamically imported module/i,     // Firefox
  /Importing a module script failed/i,              // Safari
  /Loading chunk [\w-]+ failed/i,                   // webpack-style, just in case
  /Unable to preload CSS/i,                         // Vite
];

export function isChunkError(err) {
  const msg = typeof err === "string" ? err : err && (err.message || String(err));
  return !!msg && PATTERNS.some((p) => p.test(msg));
}

// true = fine to reload now (and records it); false = we already reloaded a moment ago, so do not loop.
export function claimReload(storage, now = Date.now()) {
  try {
    const last = Number(storage.getItem(KEY) || 0);
    if (last && now - last < WINDOW_MS) return false;
    storage.setItem(KEY, String(now));
    return true;
  } catch { return true; } // storage blocked: allow one try (a loop is still stopped by the page reloading fresh)
}

async function clearSavedCopies() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("ff-shell")).map((k) => caches.delete(k)));
    }
  } catch { /* best effort */ }
}

// Returns true when a reload was started.
export function recoverFromChunkError(err) {
  if (typeof window === "undefined" || !isChunkError(err)) return false;
  let store; try { store = window.sessionStorage; } catch { store = null; }
  if (store && !claimReload(store)) return false;
  clearSavedCopies().finally(() => window.location.reload());
  return true;
}

// Like React.lazy's loader, but retries once, then recovers. If recovery is not possible it throws, so an error boundary shows a message.
export function loadWithRetry(load) {
  return () => load().catch(() => new Promise((r) => setTimeout(r, 400)).then(load)).catch((err) => {
    if (recoverFromChunkError(err)) return new Promise(() => {}); // the page is reloading: stay quiet until it does
    throw err;
  });
}

export function installChunkRecovery() {
  if (typeof window === "undefined") return;
  // Vite fires this when a preload of a lazy chunk fails.
  window.addEventListener("vite:preloadError", (e) => { if (recoverFromChunkError(e && e.payload)) e.preventDefault(); });
  window.addEventListener("unhandledrejection", (e) => { if (recoverFromChunkError(e && e.reason)) e.preventDefault(); });
  window.addEventListener("error", (e) => { recoverFromChunkError(e && (e.error || e.message)); });
}
