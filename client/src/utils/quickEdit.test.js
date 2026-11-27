import test from "node:test";
import assert from "node:assert/strict";
import { isQuick, quickChange, quickEditRequest, quickFormStart, quickSummary, quickUndoBody } from "./quickEdit.js";

// A quick-add entry as GET /api/food-logs returns it.
const entry = (over = {}) => ({
  _id: "log1", quick: true, foodName: "Burger and fries", servings: 1, consumedQuantity: 1, notes: "Estimate 600–900 kcal +10% buffer",
  nutritionPerServing: { calories: 825, protein: 30, carbohydrates: 70.5, fat: 40 },
  nutritionTotal: { calories: 825, protein: 30, carbohydrates: 70.5, fat: 40 },
  ...over,
});
const form = (over = {}) => ({ name: "Burger and fries", calories: "825", protein: "30", carbs: "70.5", fat: "40", ...over });

test("the form opens with what the day list shows: whole calories, macros to one decimal", () => {
  assert.deepEqual(quickFormStart(entry()), form());
  assert.deepEqual(quickFormStart(entry({ nutritionTotal: { calories: 825.4, protein: 29.96, carbohydrates: 70.54, fat: 0 } })), form({ calories: "825", protein: "30", carbs: "70.5", fat: "0" }));
});

test("nothing changed: nothing to send", () => {
  assert.deepEqual(quickEditRequest(entry(), form()), { ok: true, body: {}, changed: false });
});

test("a calories-only correction sends only the calories (not the name, not the macros)", () => {
  const r = quickEditRequest(entry(), form({ calories: "700" }));
  assert.deepEqual(r, { ok: true, body: { calories: 700 }, changed: true });
});

test("a name-only correction sends only the name, trimmed", () => {
  assert.deepEqual(quickEditRequest(entry(), form({ name: "  Veg burger  " })).body, { foodName: "Veg burger" });
});

test("every box can change at once, and macros map to the server's field names", () => {
  const r = quickEditRequest(entry(), form({ name: "Pizza", calories: "900", protein: "35", carbs: "100", fat: "45.5" }));
  assert.deepEqual(r.body, { foodName: "Pizza", calories: 900, protein: 35, carbohydrates: 100, fat: 45.5 });
});

test("a box left as it opened is never sent, even when the stored number had more decimals than the box shows", () => {
  const e = entry({ nutritionTotal: { calories: 825.4, protein: 29.96, carbohydrates: 70.54, fat: 40 } });
  const r = quickEditRequest(e, form({ calories: "825", protein: "30", carbs: "70.5" }));
  assert.deepEqual(r, { ok: true, body: {}, changed: false });
});

test("an empty protein / carbs / fat box means none; an empty calories box is refused", () => {
  assert.deepEqual(quickEditRequest(entry(), form({ protein: "" })).body, { protein: 0 });
  assert.deepEqual(quickEditRequest(entry({ nutritionTotal: { calories: 825, protein: 0, carbohydrates: 0, fat: 0 } }), form({ protein: "", carbs: "", fat: "" })).body, {});
  assert.deepEqual(quickEditRequest(entry(), form({ calories: "" })), { ok: false, error: "Enter the calories (more than 0)." });
  assert.deepEqual(quickEditRequest(entry(), form({ calories: "   " })), { ok: false, error: "Enter the calories (more than 0)." });
});

test("a comma works as the decimal point", () => {
  assert.deepEqual(quickEditRequest(entry(), form({ fat: "41,5" })).body, { fat: 41.5 });
});

test("refusals mirror the server: name, calories above 0, numbers 0 to 10000", () => {
  assert.equal(quickEditRequest(entry(), form({ name: "   " })).error, "Give it a name.");
  assert.equal(quickEditRequest(entry(), form({ name: "x".repeat(81) })).error, "The name can be up to 80 characters.");
  assert.equal(quickEditRequest(entry(), form({ name: "x".repeat(80) })).ok, true);
  assert.equal(quickEditRequest(entry(), form({ calories: "0" })).error, "Enter the calories (more than 0).");
  assert.equal(quickEditRequest(entry(), form({ calories: "-5" })).error, "Calories must be a number from 1 to 10000.");
  assert.equal(quickEditRequest(entry(), form({ calories: "10001" })).error, "Calories must be a number from 1 to 10000.");
  assert.equal(quickEditRequest(entry(), form({ calories: "10000" })).ok, true);
  assert.equal(quickEditRequest(entry(), form({ calories: "abc" })).error, "Calories must be a number from 1 to 10000.");
  assert.equal(quickEditRequest(entry(), form({ protein: "-1" })).error, "Protein must be a number from 0 to 10000.");
  assert.equal(quickEditRequest(entry(), form({ carbs: "x" })).error, "Carbs must be a number from 0 to 10000.");
  assert.equal(quickEditRequest(entry(), form({ fat: "20000" })).error, "Fat must be a number from 0 to 10000.");
});

test("an entry an older app stretched to 2 servings: the typed TOTAL is divided back to per serving, so the day shows exactly what was typed", () => {
  const e = entry({ servings: 2, nutritionPerServing: { calories: 350, protein: 15, carbohydrates: 35, fat: 20 }, nutritionTotal: { calories: 700, protein: 30, carbohydrates: 70, fat: 40 } });
  assert.deepEqual(quickFormStart(e), form({ calories: "700", carbs: "70" }));
  assert.deepEqual(quickEditRequest(e, form({ calories: "800", carbs: "70" })).body, { calories: 400 });
  assert.deepEqual(quickEditRequest(e, form({ calories: "700", carbs: "70" })).body, {});
});

test("undo: the old value of exactly what changed, and the old note when the calories changed", () => {
  const e = entry();
  assert.deepEqual(quickUndoBody(e, { calories: 700 }), { calories: 825, notes: "Estimate 600–900 kcal +10% buffer" });
  assert.deepEqual(quickUndoBody(e, { foodName: "Pizza" }), { foodName: "Burger and fries" });
  assert.deepEqual(quickUndoBody(e, { protein: 35, fat: 10 }), { protein: 30, fat: 40 });
  assert.deepEqual(quickUndoBody(e, { foodName: "Pizza", calories: 900, protein: 35, carbohydrates: 100, fat: 45 }), { foodName: "Burger and fries", calories: 825, protein: 30, carbohydrates: 70.5, fat: 40, notes: "Estimate 600–900 kcal +10% buffer" });
});

test("undo without a stored note (a copy made offline) does not invent one; without per-serving numbers it divides the total", () => {
  const e = entry({ notes: undefined, nutritionPerServing: undefined, servings: 2, nutritionTotal: { calories: 700, protein: 30, carbohydrates: 70, fat: 40 } });
  assert.deepEqual(quickUndoBody(e, { calories: 400 }), { calories: 350 });
});

test("a person's own note is handed back as it was", () => {
  assert.deepEqual(quickUndoBody(entry({ notes: "dinner with friends" }), { calories: 700 }), { calories: 825, notes: "dinner with friends" });
});

test("the Undo toast line", () => {
  assert.equal(quickSummary(entry(), { calories: 700 }), "Burger and fries is now 700 kcal");
  assert.equal(quickSummary(entry(), { foodName: "Pizza", calories: 900 }), "Pizza is now 900 kcal");
  assert.equal(quickSummary(entry(), { foodName: "Pizza" }), "Renamed to Pizza");
  assert.equal(quickSummary(entry(), { protein: 35 }), "Burger and fries corrected");
  assert.equal(quickSummary(entry({ servings: 2 }), { calories: 400 }), "Burger and fries is now 800 kcal");
});

test("only entries the server marked quick are quick", () => {
  assert.equal(isQuick(entry()), true);
  assert.equal(isQuick({ foodName: "Rice" }), false);
  assert.equal(isQuick({ quick: "yes" }), false);
  assert.equal(isQuick(null), false);
});

test("what the offline cache needs: new per-serving numbers and how much each total moves", () => {
  assert.deepEqual(quickChange(entry(), { calories: 700, fat: 30 }), { per: { calories: 700, fat: 30 }, delta: { calories: -125, fat: -10 } });
  assert.deepEqual(quickChange(entry(), { foodName: "Pizza" }), { per: {}, delta: {} });
  const two = entry({ servings: 2, nutritionTotal: { calories: 700, protein: 30, carbohydrates: 70, fat: 40 } });
  assert.deepEqual(quickChange(two, { calories: 400 }), { per: { calories: 400 }, delta: { calories: 100 } });   // 400 per serving x 2 = 800, from 700
});
