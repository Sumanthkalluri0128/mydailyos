// Forgiving exercise search for every picker (web + phone share this file byte for byte).
// Finds exercises when the words are only SIMILAR to the name, not exact: typos ("benchpress", "sqaut"), plurals ("squats", "lunges"),
// joined or split words ("pushup" / "push up"), word order ("press bench"), short forms ("db", "bb", "abs") and everyday words
// ("legs", "tummy", "jog") that map to the muscle group or the movement. Pure (no React, no storage): unit-tested in exerciseSearch.test.js.

const SYN_GROUPS = [
  ["dumbbell", "dumbell", "dumbel", "db", "dumbbells"],
  ["barbell", "bb", "bar"],
  ["kettlebell", "kb", "kettle"],
  ["bodyweight", "bw", "calisthenics", "home"],
  ["bicep", "biceps", "arm", "arms"],
  ["tricep", "triceps", "arm", "arms"],
  ["ab", "abs", "core", "abdominal", "abdominals", "stomach", "tummy", "belly"],
  ["quad", "quads", "quadriceps", "thigh", "thighs", "leg", "legs"],
  ["hamstring", "hamstrings", "ham", "leg", "legs"],
  ["glute", "glutes", "butt", "booty", "hip", "hips"],
  ["calf", "calves"],
  ["lat", "lats", "back", "pulldown"],
  ["delt", "delts", "shoulder", "shoulders", "deltoid"],
  ["pec", "pecs", "chest"],
  ["pushup", "push up", "press up"],
  ["pullup", "pull up", "chinup", "chin up"],
  ["situp", "sit up", "crunch"],
  ["cardio", "run", "running", "jog", "jogging", "treadmill", "walk", "walking", "cycle", "cycling", "bike", "row machine", "aerobic"],
  ["stretch", "mobility", "flexibility", "yoga"],
  ["deadlift", "dl", "rdl", "romanian"],
  ["squat", "squats"],
  ["lunge", "lunges", "split squat"],
  ["bench", "chest press", "flat press"],
  ["ohp", "overhead press", "shoulder press", "military press"],
  ["curl", "curls"],
  ["fly", "flye", "flies", "flyes"],
  ["plank", "hold"],
  ["band", "resistance band", "elastic", "tube"],
  ["machine", "cable", "stack"],
];
const SYN = new Map();
for (const g of SYN_GROUPS) for (const w of g) { const k = w.replace(/\s+/g, ""); if (!SYN.has(k)) SYN.set(k, new Set()); for (const o of g) SYN.get(k).add(o.replace(/\s+/g, "")); }

/** lower case, no accents, words split on anything that is not a letter or digit */
export const normalize = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
export const tokens = (s) => normalize(s).split(" ").filter(Boolean);

/** plural / -ing / -ed folded away so "squats", "lunges", "curling" meet "squat", "lunge", "curl" */
export function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ing") && w.length > 5) { const b = w.slice(0, -3); return b.length > 2 && b[b.length - 1] === b[b.length - 2] ? b.slice(0, -1) : b; }
  if (w.endsWith("es") && /(ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

/** Damerau-Levenshtein with an early exit once the distance is certainly above `max` */
export function distance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  let prev2 = null, prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && prev2) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[n];
}

const allowed = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : 2); // typos allowed grow with the word length; very short words must be exact

/** How well query word `q` matches one name/field word `w`: 1 exact .. 0 none */
function wordScore(q, w) {
  if (q === w) return 1;
  const sq = stem(q), sw = stem(w);
  if (sq === sw) return 0.95;
  if (q.length >= 2 && w.startsWith(q)) return 0.9;       // "sq" -> squat, "dumb" -> dumbbell
  if (sq.length >= 3 && sw.startsWith(sq)) return 0.88;
  if (q.length >= 3 && w.includes(q)) return 0.7;
  const syn = SYN.get(q) || SYN.get(sq);
  if (syn && (syn.has(w) || syn.has(sw))) return 0.8;
  const tol = allowed(Math.min(sq.length, sw.length));
  if (tol && distance(sq, sw, tol) <= tol) return 0.65;
  if (tol && sw.length > sq.length && distance(sq, sw.slice(0, sq.length), tol) <= tol && sq.length >= 4) return 0.55; // half typed AND mistyped
  return 0;
}

/** Build the searchable form of an exercise once. Fields: name (full weight), then muscle group / gear / extra words (lower weight). */
export function indexExercise(e) {
  const nameW = tokens(e.name), extra = [...tokens(e.cat), ...tokens(e.gear), ...tokens(e.alias), ...tokens(e.muscles)];
  return { e, nameW, extra, joined: nameW.join("") };
}

/** Score of one indexed exercise for the query words; 0 = no match. `all` = every query word must match (strict), otherwise any one may. */
function scoreOne(ix, qw, qJoined, all) {
  let total = 0, hit = 0;
  for (const q of qw) {
    let best = 0;
    for (const w of ix.nameW) { const s = wordScore(q, w); if (s > best) best = s; }
    if (best < 1) for (const w of ix.extra) { const s = wordScore(q, w) * 0.6; if (s > best) best = s; }
    if (!best && q.length >= 4 && ix.joined.includes(q)) best = 0.6;           // "benchpress" typed as one word
    if (best) hit += 1;
    total += best;
  }
  if (all ? hit < qw.length : !hit) return 0;
  let score = total / qw.length;
  if (qw.length > 1 && !all) score *= hit / qw.length;
  if (qJoined && (ix.joined === qJoined)) score += 0.3;                          // exactly what was typed (ignoring spaces)
  else if (qJoined.length >= 4 && ix.joined.startsWith(qJoined)) score += 0.15;
  const order = qw.length > 1 && qw.every((q, i) => i === 0 || ix.nameW.findIndex((w) => wordScore(q, w) > 0.6) > ix.nameW.findIndex((w) => wordScore(qw[i - 1], w) > 0.6)) ? 0.05 : 0; // same word order: a hair higher
  return score + order - Math.min(0.04, ix.nameW.length * 0.004);               // shorter, simpler names first when equal
}

/**
 * searchExercises(list, query, { limit }) -> { hits, similar }
 *   hits    every word of the query matched (typos, plurals, short forms and synonyms allowed), best first
 *   similar only when `hits` is empty: exercises that match SOME of the words, so "no results" is rare
 * `list` items: { id, name, cat?, gear?, alias?, muscles? }. `index` (optional) is a cache from buildIndex(list).
 */
export const buildIndex = (list) => list.map(indexExercise);
export function searchExercises(list, query, { limit = 200, index } = {}) {
  const qw = tokens(query);
  if (!qw.length) return { hits: list.slice(0, limit), similar: [] };
  const ix = index || buildIndex(list), qJoined = qw.join("");
  const run = (all) => ix.map((x) => ({ e: x.e, s: scoreOne(x, qw, qJoined, all) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s || String(a.e.name).localeCompare(String(b.e.name))).slice(0, limit).map((r) => r.e);
  const hits = run(true);
  return { hits, similar: hits.length || qw.length < 2 ? [] : run(false) };
}
