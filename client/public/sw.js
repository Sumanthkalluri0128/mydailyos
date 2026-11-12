/* FlexFit service worker: makes the website open and work with no connection.
 *  - The app shell (HTML, JS, CSS, icons) is cached so the site opens offline and starts fast.
 *  - Hashed build files (/assets/…: the built JS and CSS) never change, so they are served from cache first (saved as they load).
 *  - Exercise photos, stickers and scenes are saved at run time (capped at 120) so a workout still shows its pictures offline.
 *  - Page loads go to the network first (always the newest version) and fall back to the saved shell when offline.
 *  - API calls are NOT handled here: the app saves and replays them itself, per signed-in person (see src/offline).
 */
const VERSION = "ff-shell-v3";
const IMG = "ff-img-v1";            // exercise photos, stickers, scenes: kept at run time, capped (see trim)
const IMG_MAX = 120;               // most images kept; the oldest go first
const IMG_PATHS = ["/exercises/", "/stickers/", "/scenes/"];
const SHELL = ["/", "/favicon.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - IMG_MAX; i += 1) await cache.delete(keys[i]);   // keys come oldest first
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== IMG).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // the API lives elsewhere: not our business
  if (url.pathname.startsWith("/api/")) return;

  // Page loads: newest from the network, saved shell when offline.
  if (req.mode === "navigate") {
    if (url.pathname === "/privacy" || url.pathname.endsWith(".html")) return; // static pages: plain browser behaviour
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/", copy)); }
        return res;
      }).catch(() => caches.match("/").then((r) => r || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } })))
    );
    return;
  }

  // Build files: cache first (their names change whenever their content does).
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Photos (exercises, stickers, scenes): saved the first time they are seen, then served from the saved copy.
  // A new file name = a new picture, so a saved copy never goes stale. The store is capped so it cannot grow forever.
  if (IMG_PATHS.some((p) => url.pathname.startsWith(p)) && /\.(webp|avif|png|jpe?g|gif|svg)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(IMG).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { c.put(req, res.clone()).then(() => trim(c)).catch(() => {}); }
        return res;
      }).catch(() => new Response("", { status: 504 }))))
    );
    return;
  }

  // Icons, manifest, fonts: show the saved copy now, refresh it in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || fresh;
    })
  );
});
