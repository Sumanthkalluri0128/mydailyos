// End-to-end smoke test (free: Playwright + Chromium). Runs the BUILT app in a real browser with the API faked, so it needs no server or database.
//   npm run build && npm run e2e            (serves ./dist)
//   DIST=/path/to/build npm run e2e         (any folder with the built app)
// It checks: signed-out visitors see the sign-in page; a signed-in person reaches the app; a water entry is sent with a client id;
// with the connection off the entry is kept and the "offline" strip appears; when the connection returns it is sent exactly once.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const DIST = path.resolve(process.env.DIST || "dist");
const API = "http://api.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html"); // single-page app
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${extra}`}`); if (!ok) failed += 1; };

const browser = await chromium.launch();
const user = { id: "u1", email: "smoke@flexfit.test", name: "Smoke Test" };

async function newPage({ signedIn }) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const waterPosts = [];
  const net = { down: false }; // the faked API answers nothing while this is true (route() can bypass setOffline)
  await ctx.route(`${API}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
    if (net.down) return route.abort("internetdisconnected");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: JSON.stringify(body) });
    if (m === "OPTIONS") return json({});
    if (p === "/api/health") return json({ success: true, status: "healthy" });
    if (p === "/api/account/me") return json({ success: true, user });
    if (p === "/api/water" && m === "POST") { waterPosts.push(JSON.parse(req.postData() || "{}")); return json({ success: true, entry: { _id: `w${waterPosts.length}`, ...waterPosts.at(-1) } }, 201); }
    if (p === "/api/water") return json({ success: true, logs: [], totalMl: 0, totalLiters: 0 });
    if (p === "/api/food-logs/summary") return json({ success: true, summary: { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, meals: {} } });
    if (p === "/api/activities/summary") return json({ success: true, summary: { totalCaloriesBurned: 0, caloriesBurned: 0, totalMinutes: 0, steps: 0 } });
    if (p === "/api/tasks") return json({ success: true, tasks: [] });
    if (p === "/api/habits") return json({ success: true, habits: [] });
    if (p === "/api/habits/logs") return json({ success: true, logs: [] });
    if (p === "/api/weight") return json({ success: true, logs: [] });
    if (p === "/api/profile") return json({ success: true, profile: { currentWeightKg: 70, goals: {}, notify: {} } });
    if (p === "/api/assistant/chips") return json({ success: true, chips: ["How am I doing today?"], greeting: "Hi there" });
    if (p === "/api/flags") return json({ success: true, flags: {} });
    if (p === "/api/telemetry") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    return json({ success: true, logs: [], items: [], data: [], streaks: {} });
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => { errors.push(e.message); if (process.env.DEBUG_E2E) console.log("  pageerror:", e.message); });
  if (process.env.DEBUG_E2E) { page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 200))); page.on("request", (r) => r.url().startsWith(API) && console.log("  api:", r.method(), r.url().replace(API, ""))); }
  if (signedIn) await ctx.addInitScript((u) => { localStorage.setItem("mydailyos_token", "test-token"); localStorage.setItem("mydailyos_user", JSON.stringify(u)); localStorage.setItem("ff_onboarded", "1"); }, user);
  return { ctx, page, waterPosts, errors, net };
}

try {
  // 1. signed out: the sign-in page
  { const { ctx, page, errors } = await newPage({ signedIn: false });
    await page.goto(BASE); await page.waitForSelector(".auth-card", { timeout: 15000 }).catch(() => {});
    check("signed-out visitor sees the sign-in page", (await page.locator(".auth-card").count()) === 1);
    check("sign-in page has an email field", (await page.locator('input[type="email"]').count()) >= 1);
    check("no script errors on the sign-in page", errors.length === 0, errors.join(" | "));
    await ctx.close(); }

  // 2. signed in: reaches the app, adds water, goes offline, comes back
  { const { ctx, page, waterPosts, errors, net } = await newPage({ signedIn: true });
    await page.goto(BASE);
    await page.waitForSelector(".nv-bar, .nv-tabs", { timeout: 20000 }).catch(() => {});
    if (process.env.DEBUG_E2E) await page.screenshot({ path: "e2e-signed-in.png" });
    check("signed-in person reaches the app (navigation shown)", (await page.locator(".nv-bar, .nv-tabs").count()) > 0);
    check("the sign-in page is not shown", (await page.locator(".auth-card").count()) === 0);

    // the assistant loads late; asking for it right away must still open it (the request is replayed once its code arrives)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("flexfit:ask", { detail: {} })));
    await page.waitForSelector(".as-panel", { timeout: 10000 }).catch(() => {});
    if (process.env.DEBUG_E2E) { console.log("  dialogs:", await page.locator("[role=dialog]").count(), "body:", (await page.locator("body").innerText()).slice(0, 300).replace(/\n/g, " | ")); await page.screenshot({ path: "e2e-assistant.png" }); }
    check("Ask FlexFit opens even when asked for straight away", (await page.locator(".as-panel").count()) > 0, `count=${await page.locator(".as-panel").count()}`);
    await page.keyboard.press("Escape");
    await page.locator(".nv-pill button[aria-expanded]").click().catch(() => {}); // "More" holds the Water page on desktop
    await page.locator(".nv-pill b", { hasText: /^Water$/ }).first().click().catch(() => {});
    await page.waitForSelector("text=Quick Add", { timeout: 15000 }).catch(() => {});
    check("water page opens", (await page.locator("text=Quick Add").count()) > 0);

    await page.getByRole("button", { name: "+250 ml" }).first().click();
    await page.waitForTimeout(800);
    check("water entry is sent with a client id (safe to retry)", waterPosts.length === 1 && !!waterPosts[0].clientId, JSON.stringify(waterPosts));

    net.down = true; await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByRole("button", { name: "+250 ml" }).first().click();
    await page.waitForTimeout(800);
    check("offline: nothing is sent", waterPosts.length === 1, `posts=${waterPosts.length}`);
    check("offline: the strip says changes are saved", (await page.locator(".offline-banner").innerText().catch(() => "")).toLowerCase().includes("offline"));

    net.down = false; await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(4000);
    check("back online: the saved entry is sent exactly once", waterPosts.length === 2, `posts=${waterPosts.length}`);
    check("no script errors while using the app", errors.length === 0, errors.join(" | "));
    await ctx.close(); }
} finally { await browser.close(); server.close(); }

console.log(failed ? `\n${failed} check(s) failed` : "\nAll smoke checks passed");
process.exit(failed ? 1 : 0);
