// @ts-nocheck
// Correcting a quick-add estimate (an "eating out" guess, a protein check-in, a chai count): what to send to PATCH /api/food-logs/:id. Pure, shared by the web
// app and the phone (generated copies: edit packages/shared/src/quickEdit.js, then run tools/syncShared.mjs).
//
// Same idea as logEdit.js: ONLY what CHANGED is sent. The server accepts a new name and new numbers for a quick-add entry (never for a real food, whose
// numbers come from the food) and, when the calories change, replaces the "Estimate 600-900 kcal +10% buffer" note, because that range described the old number.
//
// The numbers the person sees and types are the entry's TOTALS (what the day list shows). The server stores them per serving, and a quick-add is normally
// exactly 1 serving. An older app's portion editor could have changed that (servings 2 = double), so what is sent is the typed total divided by `servings`:
// the server multiplies it back and the day shows exactly what was typed.

const KEYS = ["calories", "protein", "carbohydrates", "fat"];
const FIELD = { calories: "calories", protein: "protein", carbohydrates: "carbs", fat: "fat" };   // the form's box names
const LABEL = { calories: "Calories", protein: "Protein", carbohydrates: "Carbs", fat: "Fat" };
const MAX = 10000;                                                                                  // the server's limit for every number
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** A quick-add entry is marked `quick: true` by GET /api/food-logs (or by an edit answer). Real foods never are. */
export const isQuick = (entry) => !!entry && entry.quick === true;

const servingsOf = (entry) => (Number(entry?.servings) > 0 ? Number(entry.servings) : 1);
const totalOf = (entry, k) => Number(entry?.nutritionTotal?.[k]) || 0;

/** The text boxes as the form should open: calories as a whole number, the rest to one decimal (that is how the day list shows them). */
export function quickFormStart(entry) {
  const text = (k) => String(k === "calories" ? Math.round(totalOf(entry, k)) : r1(totalOf(entry, k)));
  return { name: String(entry?.foodName ?? ""), calories: text("calories"), protein: text("protein"), carbs: text("carbohydrates"), fat: text("fat") };
}

/**
 * original: the entry as the day list has it ({ foodName, nutritionTotal, servings, ... })
 * form:     { name, calories, protein, carbs, fat }  (the text boxes, as typed)
 * Returns { ok: true, body, changed } or { ok: false, error }.  `changed` false = nothing to send.
 */
export function quickEditRequest(original, form) {
  const f = form || {};
  const start = quickFormStart(original);
  const servings = servingsOf(original);
  const body = {};

  const name = String(f.name ?? "").trim();
  if (!name) return { ok: false, error: "Give it a name." };
  if (name.length > 80) return { ok: false, error: "The name can be up to 80 characters." };
  if (name !== String(original?.foodName ?? "").trim()) body.foodName = name;

  for (const k of KEYS) {
    const box = FIELD[k];
    const text = String(f[box] ?? "").trim().replace(",", ".");
    if (text === "" && k === "calories") return { ok: false, error: "Enter the calories (more than 0)." };
    const value = text === "" ? 0 : Number(text);                                     // an empty protein / carbs / fat box means none
    if (!Number.isFinite(value) || value < 0 || value > MAX) return { ok: false, error: `${LABEL[k]} must be a number from ${k === "calories" ? "1" : "0"} to ${MAX}.` };
    if (k === "calories" && !(value > 0)) return { ok: false, error: "Enter the calories (more than 0)." };
    const untouched = String(f[box] ?? "").trim() === start[box] || Math.abs(value - totalOf(original, k)) < 1e-9;
    if (!untouched) body[k] = r2(value / servings);
  }
  return { ok: true, body, changed: Object.keys(body).length > 0 };
}

/**
 * What puts the entry back as it was, for the Undo toast: the old values of exactly the fields `body` changed.
 * When the calories changed the old note goes back too (the server rewrote it, and would not rewrite it again on the way back).
 */
export function quickUndoBody(original, body) {
  const out = {};
  if (body.foodName !== undefined) out.foodName = String(original?.foodName ?? "");
  for (const k of KEYS) {
    if (body[k] === undefined) continue;
    const per = original?.nutritionPerServing?.[k];
    out[k] = r2(per !== undefined && per !== null && Number.isFinite(Number(per)) ? Number(per) : totalOf(original, k) / servingsOf(original));
  }
  if (body.calories !== undefined && typeof original?.notes === "string") out.notes = original.notes;
  return out;
}

/**
 * What the phone's offline cache needs to show a correction at once: `per` = the new per-serving numbers (as sent), `delta` = how much each TOTAL moves
 * (new total minus the total the list shows), so the History bars move by exactly that. Pass the Undo body to get the way back (its delta is the opposite).
 */
export function quickChange(original, body) {
  const servings = servingsOf(original);
  const per = {}; const delta = {};
  for (const k of KEYS) {
    if (body[k] === undefined) continue;
    per[k] = body[k];
    delta[k] = r2(body[k] * servings - totalOf(original, k));
  }
  return { per, delta };
}

/** The line for the Undo toast. */
export function quickSummary(original, body) {
  const name = body.foodName ?? String(original?.foodName ?? "");
  if (body.calories !== undefined) return `${name} is now ${Math.round(body.calories * servingsOf(original))} kcal`;
  if (body.foodName !== undefined) return `Renamed to ${name}`;
  return `${name} corrected`;
}
