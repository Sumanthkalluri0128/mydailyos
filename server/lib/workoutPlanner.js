// Workout planner rules (pure, no database): what a planned workout is, how a repeating week is laid out on dates, and how a planned
// workout is matched against what the person actually logged (so "done" needs no extra bookkeeping).
const { addDays } = require('./dates');
const { HttpError } = require('./http');

const KINDS = ['strength', 'cardio', 'conditioning', 'recovery', 'rest', 'custom'];
// Which logged activity categories (lower case) count towards a planned workout of each kind. A rest day matches nothing.
const KIND_CATEGORIES = {
  strength: ['strength'],
  cardio: ['cardio', 'walking', 'cycling', 'swimming', 'running', 'outdoor', 'dance', 'sports', 'hiit'],
  conditioning: ['hiit', 'general', 'cardio', 'strength'],
  recovery: ['walking', 'general', 'daily activity', 'outdoor'],
  custom: ['strength', 'cardio', 'walking', 'cycling', 'swimming', 'running', 'outdoor', 'dance', 'sports', 'hiit', 'general'],
  rest: [],
};
const COVER = 0.4;              // what was logged must cover this share of the planned minutes (the Gym log counts only set time, not the whole visit)
const MIN_UNPLANNED = 10;       // a workout planned without minutes counts as done once this many minutes of that kind were logged
const MAX_ITEMS_PER_REPEAT = 200;
const MAX_ITEMS_PER_PERSON = 3000;
const MAX_WEEKS = 12;
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LABEL = { strength: 'Strength', cardio: 'Cardio', conditioning: 'Conditioning', recovery: 'Recovery', rest: 'Rest day', custom: 'Workout' };

const bad = (m) => { throw new HttpError(400, m); };
const str = (x, max) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, max);
const num = (x, lo, hi, dflt = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

/** One planned exercise inside a workout. Names only is fine: sets/reps/weight are optional. */
function cleanExercise(raw) {
  const name = str(raw && raw.name, 60);
  if (!name) return null;
  return { name, sets: Math.round(num(raw.sets, 0, 20)), reps: Math.round(num(raw.reps, 0, 200)), kg: Math.round(num(raw.kg, 0, 1000) * 10) / 10 };
}

/** A workout from a request body. `partial` (edits): only the fields that were sent. */
function cleanItem(body, { partial = false } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  if (!partial || b.kind !== undefined) { const kind = String(b.kind || (partial ? '' : 'custom')); if (!KINDS.includes(kind)) bad(`kind must be one of ${KINDS.join(', ')}`); out.kind = kind; }
  if (!partial || b.title !== undefined) { out.title = str(b.title, 80); }
  if (!partial || b.minutes !== undefined) out.minutes = Math.round(num(b.minutes, 0, 300));
  if (!partial || b.note !== undefined) out.note = str(b.note, 300);
  if (!partial || b.exercises !== undefined) {
    if (b.exercises !== undefined && !Array.isArray(b.exercises)) bad('exercises must be a list');
    out.exercises = (b.exercises || []).slice(0, 30).map(cleanExercise).filter(Boolean);
  }
  if (!partial && !out.title) out.title = LABEL[out.kind];
  if (partial && 'title' in out && !out.title) bad('title cannot be empty');
  return out;
}

/** Monday of the week a date falls in. */
function mondayOf(date) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;     // Monday = 0
  return addDays(date, -dow);
}

/**
 * Lays a repeating week out on real dates. pattern: [{dow 1..7 (Monday = 1), kind, title, minutes, exercises}]. Starts the week of `from`;
 * days before `from` and before `today` are left out. Each item gets a stable `slot` (its position in the pattern) so the same request
 * always produces the same items (safe to repeat).
 */
function expandPattern({ pattern, from, weeks, today }) {
  if (!Array.isArray(pattern) || !pattern.length) bad('Add at least one day to repeat');
  if (pattern.length > 21) bad('At most 21 workouts per week');
  const w = Math.round(num(weeks, 1, MAX_WEEKS, 1));
  const floor = today && today > from ? today : from;
  const clean = pattern.map((p, slot) => {
    const dow = Math.round(Number(p && p.dow));
    if (!(dow >= 1 && dow <= 7)) bad('Each day needs a weekday from 1 (Monday) to 7 (Sunday)');
    return { dow, slot, ...cleanItem(p) };
  });
  const base = mondayOf(from), out = [];
  for (let i = 0; i < w; i += 1) {
    for (const p of clean) {
      const date = addDays(base, i * 7 + p.dow - 1);
      if (date < floor) continue;
      const { dow, ...rest } = p;
      out.push({ ...rest, date });
    }
  }
  if (out.length > MAX_ITEMS_PER_REPEAT) bad(`That is more than ${MAX_ITEMS_PER_REPEAT} workouts at once`);
  return out;
}

/**
 * Which planned workouts the person's own log already covers. items: [{id, date, kind, minutes, status}], logs: [{date, category, durationMinutes}].
 * Returns the set of item ids that are matched. Minutes are shared out per day and kind (30 logged minutes cover one 60-minute plan once),
 * biggest plan first. Only 'planned' items are matched; a rest day is never matched.
 */
function matchItems(items, logs) {
  const left = new Map();               // date -> [{category, minutes}]
  for (const l of logs || []) {
    const mins = Math.max(0, Number(l.durationMinutes) || 0);
    if (!mins) continue;
    if (!left.has(l.date)) left.set(l.date, []);
    left.get(l.date).push({ category: String(l.category || '').toLowerCase(), minutes: mins });
  }
  const matched = new Set();
  const byDay = new Map();
  for (const it of items || []) { if (it.status !== 'planned' || it.kind === 'rest') continue; if (!byDay.has(it.date)) byDay.set(it.date, []); byDay.get(it.date).push(it); }
  for (const [date, list] of byDay) {
    const pool = left.get(date) || [];
    for (const it of list.sort((a, b) => (b.minutes - a.minutes) || String(a.id).localeCompare(String(b.id)))) {
      const cats = KIND_CATEGORIES[it.kind] || [];
      const mine = pool.filter((p) => cats.includes(p.category));
      const have = mine.reduce((n, p) => n + p.minutes, 0);
      const need = it.minutes > 0 ? COVER * it.minutes : MIN_UNPLANNED;
      if (have < need) continue;
      matched.add(String(it.id));
      let use = it.minutes > 0 ? it.minutes : have;                 // use up the minutes that were matched
      for (const p of mine) { const t = Math.min(p.minutes, use); p.minutes -= t; use -= t; if (use <= 0) break; }
    }
  }
  return matched;
}

module.exports = { KINDS, KIND_CATEGORIES, COVER, MIN_UNPLANNED, MAX_ITEMS_PER_PERSON, MAX_WEEKS, DAY_NAMES, LABEL, cleanItem, cleanExercise, mondayOf, expandPattern, matchItems };
