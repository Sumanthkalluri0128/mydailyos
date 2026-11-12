// Renders the REAL Home screen (server-side, through esbuild + react-dom/server) so a crash like "Cannot access 'T' before initialization"
// fails here instead of showing a blank page in production. Also checks the Home macro gauges use today's budget-sized targets, the same
// numbers the Macros card and the quests use. Skipped only where esbuild / react-dom are not installed (CI installs both via vite / react).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dayBalance, resolveTargets } from "./utils/energy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let esbuild = null;
try { esbuild = await import("esbuild"); } catch { /* skipped below */ }

function shimBrowser() {
  const store = {}; const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, clear() {} };
  const g = globalThis, saved = {};
  const set = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(g, k); Object.defineProperty(g, k, { value: v, configurable: true, writable: true }); };
  set("localStorage", ls); set("sessionStorage", ls); set("window", g);
  set("addEventListener", () => {}); set("removeEventListener", () => {});
  set("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  set("document", { documentElement: { style: {}, setAttribute() {}, classList: { add() {}, remove() {} } }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, removeEventListener() {}, body: { appendChild() {}, style: {} }, getElementById: () => null, querySelector: () => null, head: { appendChild() {} } });
  set("navigator", { userAgent: "node", language: "en-US", languages: ["en"], onLine: true });
  set("requestAnimationFrame", (f) => setTimeout(f, 0)); set("cancelAnimationFrame", clearTimeout);
  set("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} }); set("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  set("location", { href: "http://localhost/", origin: "http://localhost", hash: "", pathname: "/", search: "", protocol: "http:", host: "localhost", hostname: "localhost" });
  set("history", { pushState() {}, replaceState() {} });
  set("fetch", async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }));
  return () => { for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } };
}

test("Home renders without throwing, and its macro gauges use today's budget-sized targets", { skip: !esbuild && "esbuild not installed" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "home-render-"));
  const out = path.join(dir, "out.mjs");
  const contents = `import React from "react"; import { renderToString } from "react-dom/server"; import Home from ${JSON.stringify(path.join(here, "components/home/HomeDashboard.jsx"))};
export const render = (props) => renderToString(React.createElement(Home, props));`;
  await esbuild.build({ stdin: { contents, resolveDir: here, loader: "jsx", sourcefile: "entry.jsx" }, bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", logLevel: "silent", define: { "import.meta.env": "{}" }, // Vite fills import.meta.env in; an empty one is enough here
    loader: { ".css": "empty", ".png": "dataurl", ".webp": "dataurl", ".jpg": "dataurl", ".svg": "dataurl" }, banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const restore = shimBrowser();
  try {
    const { render } = await import(pathToFileURL(out).href);
    const profile = { name: "Test", age: 30, sex: "male", heightCm: 175, currentWeightKg: 78, activityLevel: "light", goals: { targetWeightKg: 70, weeklyPaceKg: 0.75, calorieMode: "auto", proteinTarget: 140 } };
    const summary = { calories: 1770, protein: 146, carbohydrates: 202, fat: 41, fiber: 34, sugar: 38, sodium: 358, meals: {}, eventExtra: 0 };
    const activity = { workoutCalories: 500, stepCalories: 255, steps: 5875, exerciseMinutes: 68 };
    const noop = () => {};
    const html = render({ profile, summary, activity, water: { totalMl: 3000 }, waterTarget: 2700, latestWeight: 77, weightHistory: [], tasks: [], setTasks: noop, habits: [], habitLogs: [], setHabitLogs: noop, goTo: noop, onAsk: noop, syncTick: 0, onChanged: noop });
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.match(text, /Macros Today/);
    const base = resolveTargets(profile);
    const bal = dayBalance(profile, { eaten: summary.calories, workout: activity.workoutCalories, steps: activity.stepCalories, extra: 0 });
    assert.ok(bal.budget > base.calories, "this scenario is a training day with a bigger budget");
    const day = resolveTargets(profile, { budget: bal.budget });
    assert.ok(text.includes(`/ ${day.macros.carbs} g`) && !text.includes(`/ ${base.macros.carbs} g`), "carbs gauge shows the budget-sized target, not the base one");
    assert.ok(text.includes(`/ ${day.macros.protein} g`), "protein goal stays the plan's");
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});
