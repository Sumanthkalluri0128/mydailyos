import test from "node:test";
import assert from "node:assert/strict";
import { applyFoodLog, overlayWebQueue, recomputeDay } from "./mealView.js";
import { waterTargetMl } from "./energy.js";
import { movingAverage } from "./trend.js";
import { decoy, a11yText, hasNumber } from "./weightReveal.js";
import { parseGoogleHash, loginNoticeFor, sessionDecision, gateView } from "../auth/gateLogic.js";

// ---- food logger: a food logged offline shows in the totals once, even if the same queued request is applied twice
const T = "2026-10-20";
const z = { calories: 0, protein: 0, fiber: 0, carbohydrates: 0, fat: 0 };
const meal = () => ({ items: [], logged: z, planned: z, total: z, suggestions: [], more: [], hint: null });
const emptyDay = () => recomputeDay({ date: T, kind: "today", readOnly: false, logged: z, planned: z, total: z, complete: false, hasBudget: true,
  budget: { budget: 2000, homeBudget: 2000, trim: 0, eaten: 0, planned: 0, remaining: 2000, remainingAfterPlan: 2000 },
  meals: { breakfast: meal(), lunch: meal(), dinner: meal(), snacks: meal() } });
const op = (clientId, kcal) => ({ method: "POST", url: "/api/food-logs", body: JSON.stringify({ clientId, date: T, mealType: "lunch", foodId: "f1" }), meta: { foodName: "Dal", nutritionTotal: { calories: kcal, protein: 9, fiber: 3, carbohydrates: 30, fat: 4 } } });

test("food logger: offline food adds to eaten and lowers remaining; the same request twice counts once", () => {
  const v = { today: T, days: [emptyDay()] };
  const once = overlayWebQueue(v, [op("c1", 300)]);
  assert.deepEqual([once.days[0].budget.eaten, once.days[0].budget.remaining], [300, 1700]);
  const twice = overlayWebQueue(once, [op("c1", 300)]);
  assert.equal(twice.days[0].budget.eaten, 300);
  assert.equal(overlayWebQueue(v, [op("c1", 300), op("c2", 200)]).days[0].budget.eaten, 500);
  assert.equal(overlayWebQueue(v, [{ ...op("c3", 100), method: "GET" }, { method: "POST", url: "/api/food-logs", body: "{not json" }]).days[0].budget.eaten, 0);
});
test("food logger: a food with unknown (missing) nutrition adds zero rather than NaN", () => {
  const out = applyFoodLog({ today: T, days: [emptyDay()] }, { clientId: "c9", date: T, mealType: "snacks", foodId: null, foodName: "Mystery", nutritionTotal: { calories: undefined } });
  assert.equal(out.days[0].budget.eaten, 0); assert.ok(Number.isFinite(out.days[0].budget.remaining));
});

// ---- water
test("water: daily target follows body weight, within 1.5 to 5 L, steps of 50 ml; unknown weight gives no target", () => {
  assert.equal(waterTargetMl(70), 2450); assert.equal(waterTargetMl(30), 1500); assert.equal(waterTargetMl(200), 5000);
  assert.equal(waterTargetMl(0), null); assert.equal(waterTargetMl(null), null); assert.equal(waterTargetMl("abc"), null);
  assert.equal(waterTargetMl(79.1) % 50, 0);
});

// ---- weight
test("weight: moving average uses calendar days, averages duplicates, ignores bad rows", () => {
  const pts = [{ date: "2026-10-01", value: 80 }, { date: "2026-10-01", value: 82 }, { date: "2026-10-02", value: 79 }, { date: "2026-10-20", value: 78 }, { date: "bad", value: "x" }, { date: "2026-10-03", value: NaN }];
  const out = movingAverage(pts, 7);
  assert.equal(out.length, 3);
  assert.equal(out[0].value, 81); assert.equal(out[1].avg, 80);   // (81 + 79) / 2
  assert.equal(out[2].avg, 78);                                    // a gap of days does not drag old values in
  assert.deepEqual(movingAverage([], 7), []);
});
test("weight: hidden numbers are decoys and screen readers are told it is hidden", () => {
  assert.equal(decoy("79.1 kg"), "88.8 kg"); assert.equal(hasNumber("kg"), false);
  assert.equal(a11yText("79.1 kg", false), "Weight hidden"); assert.equal(a11yText("79.1 kg", true), "79.1 kg");
});

// ---- auth gate
test("auth gate: Google redirect is read and a bad one explains itself", () => {
  assert.deepEqual(parseGoogleHash("#google=ok&token=abc"), { status: "ok", token: "abc", reason: "" });
  assert.equal(parseGoogleHash("#admin"), null); assert.equal(parseGoogleHash(""), null);
  assert.equal(loginNoticeFor(parseGoogleHash("#google=cancelled")), "Google sign-in was cancelled.");
  assert.equal(loginNoticeFor(parseGoogleHash("#google=error&reason=Not%20allowed")), "Not allowed");
  assert.match(loginNoticeFor(parseGoogleHash("#google=error")), /failed/);
  assert.equal(loginNoticeFor(parseGoogleHash("#google=ok&token=t")), ""); assert.equal(loginNoticeFor(null), "");
});
test("auth gate: a sleeping or offline server never signs anyone out; a real 401 does", () => {
  const stored = { email: "a@x.com" };
  assert.equal(sessionDecision({ ok: true, status: 200, stored: null }), "ok");
  for (const status of [500, 502, 503, 504, 429]) assert.equal(sessionDecision({ ok: false, status, stored }), "keep-stored");
  assert.equal(sessionDecision({ ok: false, status: 401, stored }), "sign-out");
  assert.equal(sessionDecision({ ok: false, status: 404, stored }), "sign-out");
  assert.equal(sessionDecision({ ok: false, status: 503, stored: null }), "sign-out");
  assert.equal(sessionDecision({ ok: false, status: 503, stored: {} }), "sign-out");
});
test("auth gate: shows loading, then login, then the app", () => {
  assert.equal(gateView({ ready: false, user: { id: 1 } }), "loading");
  assert.equal(gateView({ ready: true, user: null }), "login");
  assert.equal(gateView({ ready: true, user: { id: 1 } }), "app");
});
