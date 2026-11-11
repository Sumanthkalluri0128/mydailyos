import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeT, LANGS } from "../i18n/core.js";
import { bodySections } from "./bodyCards.js";
const dicts = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(new URL(`../i18n/${l}.json`, import.meta.url), "utf8"))]));
const en = makeT(dicts, "en"), hi = makeT(dicts, "hi");

const full = {
  success: true,
  fatLean: { ready: true, verdict: "fat-loss", tapeOnly: false, waistChangeCm: -3, fat: -1.8, lean: 0.1, fatRange: [-2.8, -0.8], leanRange: [-0.9, 1.1] },
  recomp: { recomp: true, waistChangeCm: -2 },
  ratios: { whtr: 0.56, band: "raised", cmToHalfHeight: 10 },
  maintenance: { ready: true, estimate: 2300, low: 2150, high: 2450, expected: 2400, confidence: "high" },
  loggingGap: { likely: true, kcalPerDay: 450, fixes: ["weigh-food", "oil", "drinks", "weekends"] },
  activityDrop: { dropPct: 28, now: 6500, before: 9000, floor: 8000 },
  pace: { level: "fast", maxKgPerWeek: 0.45 },
  taper: { remainingKg: 2, fromPace: 0.65, pace: 0.4, kcalMore: 180, finishWeeks: 5, key: "taper:abc12345" },
  plateau: { items: [{ id: "data", status: "ok", vars: {} }, { id: "water", status: "ok", vars: {} }, { id: "logging", status: "maybe", vars: { pct: 90, kcal: 450 } }, { id: "activity", status: "fix", vars: { pct: 28, floor: 8000 } }, { id: "adaptation", status: "ok", vars: {} }], next: "logging" },
  fatigue: { score: 70, band: "high", reasons: ["sleep", "strength"], breakSuggested: true },
  realism: { verdict: "ambitious", needWeeks: 24, availWeeks: 10, remainingKg: 12, milestones: [{ kg: 87, date: "2027-01-01" }, { kg: 78, date: "2027-04-01", goal: true }], nextReviewDate: "2026-12-08" },
  maintenancePhase: { band: { low: 68.5, high: 71.5 }, maintenanceKcal: 2150, guard: { state: "watch", overKg: 0.4 } },
  scenarios: { baseline: { weeks: 20, date: "2027-03-30" }, rows: [{ id: "steps", weeks: 17, date: "2027-03-09", weeksSaved: 3, capped: false }, { id: "both", weeks: 14, date: "2027-02-16", weeksSaved: 6, capped: true }] },
  leaks: [{ id: "weekend", weeklyKcal: 1800, vars: { kcal: 900 } }, { id: "snacks", weeklyKcal: 900, vars: { pct: 31 } }],
  nutrition: [{ id: "protein-spread", vars: { pct: 30 } }, { id: "fibre-low", vars: { avg: 18 } }],
  learned: { best: "steps", rows: [] },
  measure: { missing: ["hips", "arm"], guide: true },
};

test("a full answer becomes ordered, readable sections with real numbers and no leftover placeholders", () => {
  const s = bodySections(en, full);
  assert.deepEqual(s.map((x) => x.id), ["fat", "recomp", "ratio", "maint", "gap", "drop", "plateau", "pace", "taper", "fatigue", "real", "keep", "sc", "leak", "nut", "learned", "measure"]);
  const text = s.flatMap((x) => [x.title, ...x.lines]).join("\n");
  assert.doesNotMatch(text, /\{[a-zA-Z]+\}/, "no unfilled {placeholder}");
  assert.doesNotMatch(text, /coach\.body\./, "no raw translation key shown");
  assert.match(text, /-1\.8 kg fat \(likely -2\.8 to -0\.8\)/);
  assert.match(text, /Start here: Food logging/);
  assert.match(text, /\? Food logging\. About 450 kcal a day may be missing/);
  assert.match(text, /! Daily movement\. Steps fell 28%: get back to about 8,000/);
  assert.equal(s.find((x) => x.id === "taper").action.label, "Ease my pace to 0.4 kg a week");
  assert.equal(s.find((x) => x.id === "measure").lines[0].includes("hips, arm"), true);
});

test("it works in another language without raw keys", () => {
  const text = bodySections(hi, full).flatMap((x) => [x.title, ...x.lines]).join("\n");
  assert.doesNotMatch(text, /coach\.body\.|\{[a-zA-Z]+\}/);
});

test("tape-only, empty and failed answers are handled", () => {
  const tape = bodySections(en, { success: true, fatLean: { ready: true, verdict: "fat-loss", tapeOnly: true, waistChangeCm: -2 } });
  assert.match(tape[0].lines[1], /Add a neck measurement/);
  assert.deepEqual(bodySections(en, { success: true, fatLean: { ready: false }, leaks: [], nutrition: [] }), []);
  assert.deepEqual(bodySections(en, null), []);
  assert.deepEqual(bodySections(en, { success: false }), []);
});

test("a not-yet-ready maintenance card says what is still needed; muscle-loss is a warning, recomp is good news", () => {
  const s = bodySections(en, { success: true, maintenance: { ready: false, need: { weighIns: 3, spanDays: 7, loggedDays: 4 } }, fatLean: { ready: true, verdict: "muscle-loss", tapeOnly: false, waistChangeCm: -1, fat: -0.5, lean: -1.2, fatRange: [-1, 0], leanRange: [-2, -0.4] } });
  assert.match(s.find((x) => x.id === "maint").lines[0], /3 more weigh-ins, 7 more days/);
  assert.equal(s.find((x) => x.id === "fat").level, "warn");
});
