// Turns Gym log entries (sets x reps x weight, kept on the device) into ActivityLog rows, so the day's calories burned and exercise
// minutes show up on the Exercise page and the Home dashboard. Pure: no database. The device computes minutes and kcal with the same
// maths it shows in the Gym log (utils/gymMath), so the number on the Gym screen and on Home are the same number.
const MAX_ENTRIES = 100;
const MAX_REMOVE = 300;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CARDIO = /cardio|run|walk|cycl|bike|swim|row|elliptical|stair|hiit|jump rope/i;

/** One stable id per gym entry: syncing the same entry again updates the same row instead of adding another. */
const clientIdFor = (gymId) => `gym-${gymId}`;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

/** Which catalogue activity a gym entry is filed under (its MET is only a fallback; the device sends its own kcal). */
function activityNameFor(e) {
  return e.unit === 'min' || CARDIO.test(String(e.cat || '')) ? 'Other workout' : 'Strength Training';
}

/**
 * raw: one entry from the device {id, date, name, cat, unit, sets:[{kg, reps}], note, minutes, kcal}.
 * Returns the fields to store, or null when the entry is not usable.
 */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '');
  if (!ID_RE.test(id) || !DATE_RE.test(String(raw.date || ''))) return null;
  const unit = raw.unit === 'sec' || raw.unit === 'min' ? raw.unit : 'reps';
  const sets = (Array.isArray(raw.sets) ? raw.sets : []).slice(0, 40)
    .map((s) => ({ reps: Math.round(num(s?.reps) * 10) / 10, weightKg: clamp(num(s?.kg ?? s?.weightKg), 0, 1000), pace: unit === 'min' && num(s?.pace) >= 2 && num(s?.pace) <= 30 ? Math.round(num(s.pace) * 1000) / 1000 : 0 }))
    .filter((s) => s.reps > 0 && s.reps <= 5000);
  if (!sets.length) return null;
  const minutes = clamp(Math.round(num(raw.minutes)) || Math.round((sets.length * 90) / 60), 1, 1440);
  const kcal = clamp(Math.round(num(raw.kcal)), 0, 20000);
  return {
    clientId: clientIdFor(id), date: raw.date, unit,
    activityName: String(raw.name || 'Exercise').trim().slice(0, 120) || 'Exercise',
    category: String(raw.cat || '').trim().slice(0, 60) || 'Strength',
    catalogueName: activityNameFor({ unit, cat: raw.cat }),
    durationMinutes: minutes, caloriesBurned: kcal, weightKg: clamp(num(raw.bodyKg), 0, 700),
    // Rep sets feed personal records and volume. Holds and cardio minutes are not reps x weight, so they stay out of those maths.
    sets: unit === 'reps' ? sets.map((s) => ({ reps: Math.max(1, Math.min(1000, Math.round(s.reps))), weightKg: s.weightKg })) : [],
    notes: [unit === 'reps' ? '' : setsNote(unit, sets), String(raw.note || '').trim().slice(0, 200)].filter(Boolean).join(' · ') || 'Gym log',
  };
}

/** "30 min @ 6:30/km (4.6 km)" for a treadmill set; plain "45 / 60 sec" for holds. */
function fmtPace(p) { let m = Math.floor(p), s = Math.round((p - m) * 60); if (s === 60) { m += 1; s = 0; } return `${m}:${String(s).padStart(2, '0')}`; }
function setsNote(unit, sets) {
  if (unit !== 'min' || !sets.some((s) => s.pace)) return `${sets.map((s) => s.reps).join(' / ')} ${unit}`;
  const km = Math.round(sets.reduce((n, s) => n + (s.pace ? s.reps / s.pace : 0), 0) * 100) / 100;
  return `${sets.map((s) => `${s.reps} min${s.pace ? ` @ ${fmtPace(s.pace)}/km` : ''}`).join(' / ')} (${km} km)`;
}

/** Cleans a whole sync request: which entries to write, which ids to remove. */
function planSync(body) {
  const entries = (Array.isArray(body?.entries) ? body.entries : []).slice(0, MAX_ENTRIES).map(normalizeEntry).filter(Boolean);
  const removeIds = (Array.isArray(body?.removeIds) ? body.removeIds : []).slice(0, MAX_REMOVE).map(String).filter((x) => ID_RE.test(x)).map(clientIdFor);
  return { entries, removeIds };
}

module.exports = { clientIdFor, normalizeEntry, planSync, activityNameFor, MAX_ENTRIES, MAX_REMOVE };
