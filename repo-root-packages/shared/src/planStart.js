// "Start this workout" from the planner: a planned workout (title + exercises with sets / reps / weight, typed as free text) becomes a short
// walk-through in the Gym log, each exercise opened with the planned numbers already filled in. Pure (no storage, network or React), shared by the web app and
// the phone (generated copies: edit packages/shared/src/planStart.js, then run tools/syncShared.mjs).
//
// A planned exercise is only a name, so it is matched to the Gym log's catalogue; a name that matches nothing (or too many things) is kept as the person's
// own custom exercise rather than guessed. What is already logged today counts, so a half-finished workout can be resumed.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const wordOf = (w) => (w.length > 2 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w);   // "squats" ~ "squat", "ups" ~ "up"; "press", "bus", "this" stay

const ABBR = { db: "dumbbell", dbs: "dumbbell", bb: "barbell", kb: "kettlebell", bw: "bodyweight" };
/** "Bench-Press!" -> "bench press"; "Push-ups" -> "push up"; "DB Curl" -> "dumbbell curl". */
export function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map((w) => ABBR[w] || wordOf(w)).join(" ");
}
/** A planned name as the person typed it, without notes: "Face Pull (Cable / Band)" -> "Face Pull"; "Hanging Knee Raise / Knee Raise" -> the first one. */
const plannedName = (s) => String(s || "").replace(/\([^)]*\)/g, " ").split("/")[0].replace(/\s+/g, " ").trim();
// extra words in a catalogue name that do not make it a different exercise ("Flat Barbell Bench Press" is what "Barbell Bench Press" means)
const NEUTRAL = new Set(["flat", "standing", "standard", "regular", "conventional", "back", "free"]);
const compact = (s) => normalize(s).replace(/ /g, "");

/**
 * The catalogue exercise a planned name means, or null. Exact name first (ignoring case, punctuation, plurals, spacing: "pushups" = "Push-up");
 * then a catalogue name that contains every word typed ("bench" -> "Bench Press"), the one with the fewest extra words, but only when that is unique.
 * catalog: [{ id, name, ... }]
 */
export function matchExercise(name, catalog) {
  const base = plannedName(name);
  const n = normalize(base);
  if (!n || !Array.isArray(catalog)) return null;
  const list = catalog.filter((e) => e && e.id && e.name);
  const exact = list.find((e) => normalize(e.name) === n) || list.find((e) => compact(e.name) === compact(base));
  if (exact) return exact;
  const words = n.split(" ");
  const hits = list.map((e) => ({ e, w: normalize(e.name).split(" ") })).filter(({ w }) => words.every((x) => w.some((y) => y.startsWith(x))));
  if (!hits.length) return null;
  // the catalogue name with the fewest words that would make it a different exercise; if even that adds one, or two tie, it is NOT guessed (it stays the person's own exercise)
  const score = ({ w }) => { const extra = w.filter((y) => !words.some((x) => y.startsWith(x))); return [extra.filter((y) => !NEUTRAL.has(y)).length, extra.length]; };
  const best = hits.map((h) => ({ h, sc: score(h) })).sort((a, b) => a.sc[0] - b.sc[0] || a.sc[1] - b.sc[1]);
  if (best[0].sc[0] > 0) return null;   // it adds a real qualifier (seated, rope, outdoor, 45 degrees...): a different exercise, so not guessed
  const tie = best.length > 1 && best[1].sc[0] === best[0].sc[0] && best[1].sc[1] === best[0].sc[1];
  return tie ? null : best[0].h.e;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/**
 * The walk-through for a planned workout.
 * planned: [{ name, sets, reps, kg }]   catalog: the Gym log's exercises   entriesToday: what is already logged on the day [{ exId }]
 * -> [{ key, name, exId, cat, unit, custom, sets, reps, kg, done }]
 */
export function stepsFor(planned, catalog, entriesToday = []) {
  const used = new Set();
  const out = [];
  (Array.isArray(planned) ? planned : []).forEach((p, i) => {
    const name = String((p && p.name) || "").trim().slice(0, 60);
    if (!name) return;
    const hit = matchExercise(name, catalog);
    const unit = hit ? (hit.unit === "sec" || hit.unit === "min" ? hit.unit : "reps") : "reps";
    const defReps = unit === "min" ? 20 : unit === "sec" ? 30 : 10;
    const sets = clamp(Math.round(Number(p.sets)) || 3, 1, 12);
    const reps = clamp(Math.round(Number(p.reps)) || defReps, 1, 5000);
    const kg = Number(p.kg) > 0 ? Math.round(Number(p.kg) * 100) / 100 : 0;
    const exId = hit ? hit.id : `custom:${slug(name)}`;
    const idx = (entriesToday || []).findIndex((e, j) => e && e.exId === exId && !used.has(j));   // each logged entry satisfies one step
    if (idx >= 0) used.add(idx);
    out.push({ key: `${i}:${exId}`, name: hit ? hit.name : name, exId, cat: hit ? hit.cat : "other", unit, custom: !hit, sets, reps, kg: unit === "reps" ? kg : 0, done: idx >= 0 });
  });
  return out;
}

/** The step to open next: the first one not logged and not skipped. null when there is nothing left. */
export function nextStep(steps, skipped = []) {
  const skip = new Set(skipped || []);
  return (Array.isArray(steps) ? steps : []).find((s) => !s.done && !skip.has(s.key)) || null;
}
export const isComplete = (steps, skipped = []) => Array.isArray(steps) && steps.length > 0 && nextStep(steps, skipped) === null;
export const progress = (steps) => ({ done: (steps || []).filter((s) => s.done).length, total: (steps || []).length });

/**
 * Can this planned workout be started now? It must be waiting (not done, skipped or a rest day), be today or a day that already passed
 * (a missed workout can still be done; it is logged on the day it is really done), and have exercises to walk through.
 */
export function canStart(item, today) {
  if (!item || item.kind === "rest" || item.status !== "planned" || item.done) return false;
  if (!item.date || !today || String(item.date) > String(today)) return false;
  return Array.isArray(item.exercises) && item.exercises.some((x) => x && String(x.name || "").trim());
}

/**
 * A started plan as kept between screens (and read back from storage): { item: { id, date, title, kind, exercises }, skipped: [key] } or null.
 * Anything damaged, or without an id, is ignored; text and list lengths are capped.
 */
export function cleanStart(j) {
  if (!j || !j.item || !j.item.id) return null;
  const it = j.item;
  return {
    item: { id: String(it.id), date: String(it.date || ""), title: String(it.title || "").slice(0, 80), kind: String(it.kind || ""),
      exercises: (Array.isArray(it.exercises) ? it.exercises : []).slice(0, 40).map((x) => ({ name: String((x && x.name) || "").slice(0, 60), sets: Number(x && x.sets) || 0, reps: Number(x && x.reps) || 0, kg: Number(x && x.kg) || 0 })) },
    skipped: Array.isArray(j.skipped) ? j.skipped.filter((k) => typeof k === "string").slice(0, 60) : [],
  };
}
