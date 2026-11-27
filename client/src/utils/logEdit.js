// Fixing a logged workout (minutes, calories, day, note): what to send to PATCH /api/activities/logs/:id. Pure, shared by the web app and the phone
// (generated copies: edit packages/shared/src/logEdit.js, then run tools/syncShared.mjs).
//
// Only what CHANGED is sent. The server recalculates calories whenever minutes are sent without calories, so sending unchanged minutes with a
// note-only edit would quietly replace calories the person typed by hand with the estimate.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * original: { durationMinutes, caloriesBurned, notes, date }  (the entry as the server has it)
 * form:     { minutes, kcal, kcalTouched, notes, date }       (the text boxes, as typed)
 * maxDate:  the latest day allowed (tomorrow, for a person ahead of the server clock); a later day is refused by the server too.
 * Returns { ok: true, body, changed } or { ok: false, error }.  `changed` false = nothing to send.
 */
export function editRequest(original, form, maxDate = "") {
  const o = original || {}, f = form || {};
  const body = {};

  const minutes = Number(String(f.minutes ?? "").replace(",", "."));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return { ok: false, error: "Enter how many minutes (1 to 1440)." };
  if (minutes !== Number(o.durationMinutes)) body.durationMinutes = minutes;

  // Calories: only a number the person typed. Left alone, they follow new minutes (and stay as they were when the minutes are unchanged).
  const kcalText = String(f.kcal ?? "").trim().replace(",", ".");
  if (f.kcalTouched && kcalText !== "") {
    const kcal = Number(kcalText);
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 20000) return { ok: false, error: "Calories must be a number from 0 to 20000." };
    body.caloriesBurned = kcal;
  }

  const date = String(f.date ?? "");
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { ok: false, error: "Choose a valid day." };
  if (maxDate && date > maxDate) return { ok: false, error: "A workout cannot be logged for a day that has not happened." };
  if (date !== o.date) body.date = date;

  const notes = String(f.notes ?? "");
  if (notes.length > 300) return { ok: false, error: "The note can be up to 300 characters." };
  if (notes !== String(o.notes ?? "")) body.notes = notes;

  return { ok: true, body, changed: Object.keys(body).length > 0 };
}
