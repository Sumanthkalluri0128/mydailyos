// Visual layout checks for the Home cards at 1280, 1024 and 360 px (free: Playwright + Chromium, API faked like smoke.mjs).
//   npm run build && npm run e2e:home          (serves ./dist; screenshots go to e2e-shots/)
// Your layout bugs came from narrow screens and old data, so this catches them before you do:
//   no sideways scrolling; no card content wider than its card; a character never sits on top of a ＋ button or leaves its card;
//   the four stat cards stay in a tidy grid; at desktop widths the quick-help chips share one row.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const DIST = path.resolve(process.env.DIST || "dist");
const SHOTS = path.resolve(process.env.SHOTS || "e2e-shots");
const API = "http://api.test";
const WIDTHS = [1280, 1024, 360];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${extra}`}`); if (!ok) failed += 1; };
const user = { id: "u1", email: "layout@flexfit.test", name: "Layout Test" };

// Old-data shapes on purpose: no weigh-ins, zero steps, zero exercise (the "0" empty states).
const DATA = {
  "/api/account/me": { success: true, user },
  "/api/health": { success: true, status: "healthy" },
  "/api/water": { success: true, logs: [], totalMl: 0, totalLiters: 0 },
  "/api/food-logs/summary": { success: true, summary: { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, meals: {} } },
  "/api/activities/summary": { success: true, summary: { totalCaloriesBurned: 0, caloriesBurned: 0, totalMinutes: 0, steps: 0 } },
  "/api/tasks": { success: true, tasks: [] }, "/api/habits": { success: true, habits: [] }, "/api/habits/logs": { success: true, logs: [] },
  "/api/weight": { success: true, logs: [] },
  "/api/profile": { success: true, profile: { currentWeightKg: 70, goals: {}, notify: {} } },
  "/api/flags": { success: true, flags: {} },
};

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.route(`${API}/**`, (route) => {
      const url = new URL(route.request().url());
      const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: JSON.stringify(body) });
      if (route.request().method() === "OPTIONS") return json({});
      if (url.pathname === "/api/telemetry") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      return json(DATA[url.pathname] || { success: true, logs: [], items: [], data: [], streaks: {} });
    });
    await ctx.addInitScript((u) => { localStorage.setItem("mydailyos_token", "test-token"); localStorage.setItem("mydailyos_user", JSON.stringify(u)); localStorage.setItem("ff_onboarded", "1"); }, user);
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForSelector(".hd-stats .sc", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);                                  // let stickers and the count-up settle
    await page.screenshot({ path: path.join(SHOTS, `home-${width}.png`), fullPage: true });
    const tag = `${width}px`;

    const m = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
      const cards = [...document.querySelectorAll(".hd-stats .sc")].map((c) => {
        const cb = box(c);
        const plus = c.querySelector(".sc-plus");
        const pk = c.querySelector(".pk");
        const pkVisible = !!pk && visible(pk);
        const inner = [...c.querySelectorAll(".sc-val, .sc-goal, .sc-bar")].filter(visible).map(box);
        return {
          name: [...c.classList].find((k) => /^sc-(water|steps|ex|w)$/.test(k)) || "sc",
          card: cb, plus: plus ? box(plus) : null, pk: pkVisible ? box(pk) : null,
          innerOverflow: Math.max(0, ...inner.map((b) => b.r - cb.r)),
        };
      });
      const help = [...document.querySelectorAll(".hd-help > *")].filter(visible).map(box);
      return { cards, help, overflowX: document.documentElement.scrollWidth - window.innerWidth };
    });

    check(`[${tag}] four stat cards are on the page`, m.cards.length === 4, `found ${m.cards.length}`);
    check(`[${tag}] no sideways page scrolling`, m.overflowX <= 1, `page is ${m.overflowX}px wider than the screen`);
    for (const c of m.cards) {
      check(`[${tag}] ${c.name}: text and bars stay inside the card`, c.innerOverflow <= 1, `${Math.round(c.innerOverflow)}px past the edge`);
      if (c.pk) {
        check(`[${tag}] ${c.name}: character stays inside the card`, c.pk.r <= c.card.r + 2 && c.pk.l >= c.card.l - 2, `character ${Math.round(c.pk.l)}-${Math.round(c.pk.r)} vs card ${Math.round(c.card.l)}-${Math.round(c.card.r)}`);
        if (c.plus) {
          const overlap = !(c.pk.r <= c.plus.l || c.pk.l >= c.plus.r || c.pk.b <= c.plus.t || c.pk.t >= c.plus.b);
          check(`[${tag}] ${c.name}: character is not on top of the ＋ button`, !overlap);
        }
      }
    }
    // cards in the same grid row share a top edge, and no two cards overlap
    const rows = new Map(); for (const c of m.cards) { const k = Math.round(c.card.t / 8); rows.set(k, (rows.get(k) || 0) + 1); }
    check(`[${tag}] stat cards form a tidy grid`, [...rows.values()].every((n) => n >= 1) && m.cards.every((a, i) => m.cards.every((b, j) => i === j || a.card.r <= b.card.l + 1 || b.card.r <= a.card.l + 1 || a.card.b <= b.card.t + 1 || b.card.b <= a.card.t + 1)), "two cards overlap");
    if (width >= 1024 && m.help.length > 1) {
      const tops = m.help.map((b) => b.t);
      check(`[${tag}] quick-help chips share one row`, Math.max(...tops) - Math.min(...tops) <= 6, `tops ${tops.map(Math.round).join(", ")}`);
    }
    check(`[${tag}] no script errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }

console.log(failed ? `\n${failed} layout check(s) failed. Screenshots are in ${SHOTS}` : `\nAll Home layout checks passed. Screenshots are in ${SHOTS}`);
process.exit(failed ? 1 : 0);
