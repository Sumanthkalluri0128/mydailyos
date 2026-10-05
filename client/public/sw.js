/* FlexFit service worker: makes the website open and work with no connection.
 *  - The app shell (HTML, JS, CSS, icons) is cached so the site opens offline and starts fast.
 *  - Hashed build files (/assets/…) never change, so they are served from cache first.
 *  - Page loads go to the network first (always the newest version) and fall back to the saved shell when offline.
 *  - API calls are NOT handled here: the app saves and replays them itself, per signed-in person (see src/offline).
 */
const VERSION = "ff-shell-v1";
const SHELL = ["/", "/favicon.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
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

  // Icons, manifest, fonts: show the saved copy now, refresh it in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || fresh;
    })
  );
});
