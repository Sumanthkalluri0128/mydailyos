import test from "node:test";
import assert from "node:assert/strict";
import { buildCard, toSvg, fit, monthLabel, W, H } from "./wrappedCard.js";

const data = { month: "2026-10", daysLogged: 22, longestStreak: 9, bestWeek: { start: "2026-10-12", days: 7 }, favouriteFoods: [{ name: "Dal & rice" }, { name: "Idli" }, { name: "Curd <rice>" }], character: { who: "zoro", stickers: 4 }, charactersUnlocked: 3, stickersTotal: 11, showHealth: false, workoutDays: 12, avgCalories: 1850, weightChangeKg: -0.8 };
const texts = (c) => c.ops.filter((o) => o.t === "text").map((o) => o.text).join("\n");

test("card has streak, best week, foods, characters and stays inside the image", () => {
  const c = buildCard(data, { accent: "#2f9e44", characterName: "Zoro" });
  const t = texts(c);
  for (const s of ["SEASON RECAP", "October 2026", "Zoro", "Best week: 12 Oct · 7 days", "Dal & rice", "Characters unlocked: 3", "Stickers: 11"]) assert.ok(t.includes(s), s);
  for (const o of c.ops) { assert.ok(o.x >= 0 && o.y >= 0, JSON.stringify(o)); if (o.t === "rect") assert.ok(o.x + o.w <= W && o.y + o.h <= H); else assert.ok(o.y <= H); }
});
test("health numbers are NOT drawn unless switched on", () => {
  const off = texts(buildCard(data));
  assert.ok(!/kcal|workout|kg/.test(off));
  const on = texts(buildCard({ ...data, showHealth: true }));
  assert.ok(on.includes("12 workout days") && on.includes("1850 kcal a day") && on.includes("-0.8 kg"));
});
test("long text is cut with an ellipsis; svg escapes markup", () => {
  assert.ok(fit("x".repeat(200), 40, 300).endsWith("…")); assert.equal(fit("short", 40, 900), "short");
  const svg = toSvg(buildCard({ ...data, favouriteFoods: [{ name: 'A "b" <i>' }] }));
  assert.ok(svg.startsWith("<svg") && !svg.includes("<i>") && svg.includes("&lt;i&gt;"));
});
test("empty month still makes a valid card; month labels", () => {
  const c = buildCard({ month: "2026-02", daysLogged: 0, longestStreak: 0, bestWeek: null, favouriteFoods: [], character: null, charactersUnlocked: 0, stickersTotal: 0 });
  assert.ok(c.ops.length > 8 && texts(c).includes("Your season")); assert.equal(monthLabel("2026-02"), "February 2026");
});
