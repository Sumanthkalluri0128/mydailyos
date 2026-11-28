// @ts-nocheck
// Workout planner: the pure view logic shared by the web app and the phone (generated copies: edit packages/shared/src/workoutPlanView.js,
// then run tools/syncShared.mjs). Dates are plain YYYY-MM-DD strings in the person's own day; weeks start on Monday.
export const KINDS = [
  ['strength', '🏋️', 'Strength'], ['cardio', '🏃', 'Cardio'], ['conditioning', '🔥', 'Conditioning'],
  ['recovery', '🧘', 'Recovery'], ['rest', '😴', 'Rest day'], ['custom', '📝', 'Workout'],
];
export const kindMeta = (kind) => { const k = KINDS.find((x) => x[0] === kind) || KINDS[5]; return { kind: k[0], icon: k[1], label: k[2] }; };
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const mondayOf = (s) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000);

/** The weeks of a month for a calendar grid (Monday first), padded with the neighbouring days. `anyDate` is any day in the month. */
export function monthGrid(anyDate) {
  const d = parse(anyDate), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const first = fmt(new Date(Date.UTC(y, m, 1))), last = fmt(new Date(Date.UTC(y, m + 1, 0)));
  const gridStart = mondayOf(first), gridEnd = addDays(mondayOf(last), 6);
  const weeks = [];
  for (let s = gridStart; s <= gridEnd; s = addDays(s, 7)) weeks.push(weekDays(s));
  return { month: first.slice(0, 7), first, last, gridStart, gridEnd, weeks };
}
export const shiftMonth = (anyDate, n) => { const d = parse(anyDate); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))); };

/**
 * "Squat 3x8 @60", "Bench press 4 x 6 80kg", "Plank" -> [{name, sets, reps, kg}] (one exercise per line; sets/reps/weight optional).
 */
export function parseExercises(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    let line = raw.trim(); if (!line) continue;
    let sets = 0, reps = 0, kg = 0;
    line = line.replace(/(\d+)\s*[x×]\s*(\d+)/i, (_, s, r) => { sets = Number(s); reps = Number(r); return ' '; });
    line = line.replace(/@\s*(\d+(?:\.\d+)?)\s*(?:kg)?|(\d+(?:\.\d+)?)\s*kg\b/i, (_, a, b) => { kg = Number(a || b); return ' '; });
    const name = line.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (name) out.push({ name, sets: Math.min(20, sets), reps: Math.min(200, reps), kg: Math.min(1000, kg) });
    if (out.length >= 30) break;
  }
  return out;
}
export function exercisesToText(list) {
  return (list || []).map((e) => [e.name, e.sets && e.reps ? `${e.sets}x${e.reps}` : '', e.kg ? `@${e.kg}` : ''].filter(Boolean).join(' ')).join('\n');
}

/** Rows from the "repeat a week" builder [{dow 1..7, kind ('' = no workout), title, minutes}] -> the pattern the server expects. */
export function patternFromRows(rows) {
  return (rows || []).filter((r) => r && r.kind).map((r) => ({ dow: r.dow, kind: r.kind, title: String(r.title || '').trim(), minutes: Math.max(0, Math.round(Number(r.minutes) || 0)) }));
}

/** What one planned item shows as: done (logged or ticked), skipped, rest or planned. */
export const itemState = (it) => (it.kind === 'rest' ? 'rest' : it.status === 'skipped' ? 'skipped' : it.done ? 'done' : 'planned');

/** The small summary for a day in the month grid: '' (nothing planned), 'rest', 'done', 'part', 'skipped' or 'planned'. */
export function dayState(summary) {
  if (!summary) return '';
  const { planned = 0, done = 0, skipped = 0, rest = 0 } = summary;
  const work = planned + done + skipped;
  if (!work) return rest ? 'rest' : '';
  if (done && !planned && !skipped) return 'done';
  if (done) return 'part';
  if (skipped && !planned) return 'skipped';
  return 'planned';
}

/** Week totals for the header: how many workouts are planned, done, skipped, and the planned minutes. */
export function weekTotals(items) {
  const t = { planned: 0, done: 0, skipped: 0, minutes: 0 };
  for (const it of items || []) {
    const s = itemState(it);
    if (s === 'rest') continue;
    t.planned += 1; t.minutes += Number(it.minutes) || 0;
    if (s === 'done') t.done += 1; else if (s === 'skipped') t.skipped += 1;
  }
  return t;
}

/** Items of one day, in the order shown (rest days last). */
export const itemsOn = (items, date) => (items || []).filter((i) => i.date === date).sort((a, b) => (a.kind === 'rest') - (b.kind === 'rest'));
