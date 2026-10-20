import test from "node:test";
import assert from "node:assert/strict";
import { applyFoodLog, applyPlanLog, applyPlanAdd, chefLine, chefDayLine, dayBarText, itemsToLog, overlayWebQueue, recomputeDay } from "./mealView.js";

const T = "2026-10-20";
const z = { calories: 0, protein: 0, fiber: 0, carbohydrates: 0, fat: 0 };
const item = (id, status, mealType, foodName, calories, protein, extra = {}) => ({ id, status, mealType, date: T, foodId: extra.foodId ?? `f-${id}`, foodName, quantity: 1, servingUnit: "bowl", calories, protein, fiber: 2, ...extra });
const meal = (items, hint = null) => ({ items, logged: z, planned: z, total: z, suggestions: [], more: [], hint });
const day = (m, hints = {}) => recomputeDay({ date: T, kind: "today", readOnly: false, logged: z, planned: z, total: z, complete: false, hasBudget: true,
  budget: { budget: 1800, homeBudget: 1800, trim: 0, eaten: 0, planned: 0, remaining: 1800, remainingAfterPlan: 1800 },
  meals: { breakfast: meal(m.breakfast || [], hints.breakfast), lunch: meal(m.lunch || [], hints.lunch), dinner: meal(m.dinner || [], hints.dinner), snacks: meal(m.snacks || [], hints.snacks) } });
const view = (d) => ({ today: T, days: [d] });

test("day bar: eaten is logged only, planned is separate, remaining = budget - eaten", () => {
  const d = day({ breakfast: [item("a", "logged", "breakfast", "Poha", 300, 8)], lunch: [item("b", "planned", "lunch", "Dal", 250, 14)] });
  assert.deepEqual([d.budget.eaten, d.budget.planned, d.budget.remaining, d.budget.remainingAfterPlan], [300, 250, 1500, 1250]);
  assert.equal(dayBarText(d.budget).remaining, "1500 left");
});

test("logging a planned item counts it once, as logged", () => {
  const d = day({ dinner: [item("p1", "planned", "dinner", "Khichdi", 350, 12)] });
  const once = applyPlanLog(view(d), { planId: "p1", clientId: "c1" });
  const twice = applyPlanLog(once, { planId: "p1", clientId: "c2" });
  assert.equal(twice.days[0].meals.dinner.items.length, 1);
  assert.equal(twice.days[0].budget.eaten, 350);
  assert.equal(twice.days[0].budget.planned, 0);
});

test("a food logged directly completes the matching planned item", () => {
  const d = day({ lunch: [item("p1", "planned", "lunch", "Dal", 180, 9, { foodId: "F" })] });
  const o = applyFoodLog(view(d), { clientId: "x", date: T, mealType: "lunch", foodId: "F", foodName: "Dal", nutritionTotal: { calories: 180, protein: 9 } }).days[0];
  assert.equal(o.meals.lunch.items.length, 1);
  assert.equal(o.budget.eaten, 180);
});

test("Log day skips what is logged or already waiting to sync, and does nothing on past days", () => {
  const d = day({ breakfast: [item("l", "logged", "breakfast", "Poha", 300, 8)], lunch: [item("p1", "planned", "lunch", "Dal", 180, 9), item("p2", "planned", "lunch", "Roti", 120, 4, { pending: true })] });
  assert.deepEqual(itemsToLog(d).map((i) => i.id), ["p1"]);
  assert.deepEqual(itemsToLog({ ...d, readOnly: true }), []);
});

test("offline queue overlay: queued log, direct log and add-to-plan show up, nothing is doubled", () => {
  const d = day({ dinner: [item("p1", "planned", "dinner", "Khichdi", 350, 12, { foodId: "K" })] });
  const ops = [
    { method: "POST", url: "http://x/api/meal-plans/p1/log", body: JSON.stringify({ date: T, clientId: "pl-p1" }) },
    { method: "POST", url: "http://x/api/food-logs", body: JSON.stringify({ foodId: "C", date: T, mealType: "snacks", quantity: 1, clientId: "s1" }), meta: { foodName: "Curd", nutritionTotal: { calories: 90, protein: 8 } } },
    { method: "POST", url: "http://x/api/meal-plans", body: JSON.stringify({ date: T, mealType: "lunch", foodId: "P", quantity: 100, clientId: "a1" }), meta: { foodName: "Paneer", nutrition: { calories: 160, protein: 20 } } },
  ];
  const o = overlayWebQueue(view(d), ops).days[0];
  assert.equal(o.budget.eaten, 440);
  assert.equal(o.budget.planned, 160);
  assert.equal(overlayWebQueue(overlayWebQueue(view(d), ops), ops).days[0].budget.eaten, 440);
});

test("past days cannot take a new plan", () => {
  const past = { ...day({}), readOnly: true, kind: "past" };
  assert.equal(applyPlanAdd(view(past), { clientId: "q", date: T, mealType: "lunch", foodName: "Curd", quantity: 1, servingUnit: "g", nutrition: { calories: 90 } }).days[0].meals.lunch.items.length, 0);
});

test("chef: exact facts for an open meal, a hungry day line, and the victory line when the day is complete", () => {
  const open = { kind: "open", mealType: "dinner", kcal: 420, protein: 25 };
  assert.match(chefLine(open), /^Dinner is open: 420 kcal and 25 g protein to go\./);
  assert.match(chefLine(open, "luffy"), /^Dinner is open: 420 kcal and 25 g protein to go\. \S/);
  const d = day({ breakfast: [item("a", "logged", "breakfast", "Poha", 300, 8)] }, { dinner: open });
  assert.match(chefDayLine(d), /^Dinner is open/);
  const full = applyPlanLog(view(day({ breakfast: [item("a", "logged", "breakfast", "P", 300, 8)], lunch: [item("b", "logged", "lunch", "D", 500, 20)], dinner: [item("c", "planned", "dinner", "K", 350, 12)] })), { planId: "c", clientId: "z" }).days[0];
  assert.equal(full.complete, true);
  assert.match(chefDayLine(full), /^Day complete/);
});
