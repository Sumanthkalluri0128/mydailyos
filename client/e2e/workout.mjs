// Workout & Body smoke test: ONE plan runs Today / My plan / Body / live workout, no exercise twice, a finished smart workout is sent once.
//   npm run build && npm run e2e:workout        (DIST=/path to use another build, PLAN=/path/to/api-response.json for the faked /api/body-plan)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const DIST = path.resolve(process.env.DIST || "dist"); const API = "http://api.test";
const PLAN = JSON.parse(fs.readFileSync(process.env.PLAN, "utf8"));
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, "http://x").pathname); let f = path.join(DIST, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html"); res.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, "127.0.0.1", r)); const BASE = `http://127.0.0.1:${server.address().port}`;
let failed = 0; const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "  " + x}`); if (!ok) failed++; };
const browser = await chromium.launch(); const user = { id: "u1", email: "wk@flexfit.test", name: "W" };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const sessions = [], exLogs = [];
await ctx.route(`${API}/**`, async (route) => {
  const req = route.request(); const p = new URL(req.url()).pathname; const m = req.method();
  const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: JSON.stringify(b) });
  if (m === "OPTIONS") return json({});
  if (p === "/api/body-plan" && m === "GET") return json(PLAN);
  if (p === "/api/body-plan/session" && m === "POST") { const b = JSON.parse(req.postData() || "{}"); sessions.push(b); return json({ success: true, session: { _id: "s1" }, highlights: [{ name: "Test lift", text: "First time logged. This is your starting point." }], plan: PLAN.plan }, 201); }
  if (p === "/api/activities/logs" && m === "POST") { exLogs.push(1); return json({ success: true }, 201); }
  if (p === "/api/account/me") return json({ success: true, user });
  if (p === "/api/flags") return json({ success: true, flags: {} });
  if (p === "/api/telemetry") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  if (p === "/api/profile") return json({ success: true, profile: { currentWeightKg: 78, goals: {}, notify: {} } });
  return json({ success: true, logs: [], items: [], data: [], activities: [], tasks: [], habits: [], streaks: {} });
});
await ctx.addInitScript((u) => { localStorage.setItem("mydailyos_token", "t"); localStorage.setItem("mydailyos_user", JSON.stringify(u)); localStorage.setItem("ff_onboarded", "1"); }, user);
const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const txt = async (sel) => (await page.locator(sel).first().innerText().catch(() => ""));
try {
  await page.goto(BASE); await page.waitForSelector(".nv-bar, .nv-tabs", { timeout: 20000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "workouts" } })));
  await page.waitForSelector(".wp-hero", { timeout: 15000 });
  await page.waitForTimeout(600);
  check("Today shows the smart plan (no classic Lower A)", (await txt(".wp-hero h2")).includes("Upper 1") && !(await page.locator(".wp-hero h2", { hasText: "Lower A" }).count()), await txt(".wp-hero h2"));
  check("header says Smart program", (await txt(".wp-top p")).includes("Smart program"), await txt(".wp-top p"));
  check("no duplicate 'Jump to' card or phase bar on Today", (await page.locator("text=Jump to").count()) === 0 && (await page.locator(".wp-phases").count()) === 0);
  check("Monday (already passed) is not a second 'Upper 1'", (await page.locator(".wp-week button", { hasText: "Mon" }).getAttribute("aria-label")).includes("Not done") || (await page.locator(".wp-week button").first().getAttribute("aria-label")).includes("Before you started"));
  check("gym / home / quick chips", (await page.locator(".wp-ways button").count()) === 3);
  check("This week card from the server", (await page.locator(".wp-adapt").count()) === 1);
  await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/today.png` : "/dev/null" }).catch(() => {});

  // quick way
  await page.locator(".wp-ways button", { hasText: "Quick" }).click();
  check("quick way changes minutes", Number(await txt(".wp-hero-stats li b")) <= 25, await txt(".wp-hero-stats li b"));
  await page.locator(".wp-ways button", { hasText: "Gym" }).click();

  // live workout
  await page.locator(".wp-hero-cta .wp-btn.hot").click();
  await page.waitForSelector(".wp-session");
  let guard = 0;
  while (guard++ < 40 && !(await page.locator(".wp-done").count())) {
    const first = page.locator(".wp-check:not(.on)").first();
    if (await page.locator(".wp-table").count()) { await page.locator(".wp-trow.cur .wp-stepper input").nth(1).fill("9").catch(() => {}); await page.locator(".wp-trow .wp-check").first().click().catch(() => {}); }
    else await page.locator(".wp-list-card .wp-link").first().click().catch(() => {});
    const fin = page.getByRole("button", { name: "Finish workout" });
    if (await fin.count()) { await fin.click(); break; }
    await page.getByRole("button", { name: /Next/ }).click().catch(() => {});
  }
  await page.waitForSelector(".wp-done", { timeout: 5000 });
  check("finish screen asks about pain (smart only)", (await page.locator(".wp-pain button").count()) >= 5);
  await page.locator(".wp-pain button", { hasText: "Knee" }).click();
  await page.getByRole("button", { name: /Save & finish/ }).click();
  await page.waitForTimeout(1500);
  check("history opens after saving", (await page.locator(".wp-hist li").count()) === 1);
  check("session sent to the body plan once", sessions.length === 1, `n=${sessions.length}`);
  check("and NOT logged a second time as a separate exercise", exLogs.length === 0, `n=${exLogs.length}`);
  check("payload has sets, pain and a client id", sessions[0] && sessions[0].exercises.length > 0 && sessions[0].pain.includes("knee") && /^wp-/.test(sessions[0].clientId), JSON.stringify(sessions[0]).slice(0, 200));

  // My plan
  await page.locator(".wp-tabs button", { hasText: "My plan" }).click();
  check("My plan lists each day once", (await page.locator(".wp-sched li").count()) === 7);
  check("plan switch is there", (await page.locator(".wp-source [role=radio]").count()) === 2);
  // Library has no duplicate names
  await page.locator(".wp-tabs button", { hasText: "Library" }).click();
  const names = await page.locator(".wp-lib .wp-item-t b").allInnerTexts();
  check("library: each exercise once", new Set(names.map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ""))).size === names.length, `${names.length} names`);
  // Body tab: no workout list duplicated
  await page.locator(".wp-tabs button", { hasText: "Body" }).click();
  await page.waitForSelector(".bp", { timeout: 8000 });
  const tabs = await page.locator(".bp-mt").allInnerTexts();
  check("Body has only Eating / Me / More", tabs.length === 3, tabs.join("|"));
  // classic
  await page.locator(".wp-tabs button", { hasText: "My plan" }).click();
  await page.locator(".wp-source [role=radio]", { hasText: "Classic" }).click();
  await page.locator(".wp-tabs button", { hasText: "Today" }).click();
  await page.waitForTimeout(300);
  check("Classic plan still works (Day n title)", (await txt(".wp-hero h2")).startsWith("Day "), await txt(".wp-hero h2"));
  check("no script errors", errors.length === 0, errors.join(" | "));
} catch (e) { console.log("FAIL  exception: " + e.message.split("\n")[0]); failed++; await page.screenshot({ path: (process.env.SHOTS || ".") + "/fail.png" }).catch(() => {}); }
finally { await browser.close(); server.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nAll workout checks passed"); process.exit(failed ? 1 : 0);
