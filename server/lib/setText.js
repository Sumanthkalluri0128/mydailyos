// Turns typed gym notes into structured sets and matches each exercise to the closest known exercise. Pure (no database), unit-tested.
//   "bench press 3x10 @ 60kg, squats 4 sets of 8 at 80, pull ups 3x8, plank 60s"
//   -> [{ name:'bench press', sets:[{reps:10,weightKg:60} x3], match:{...}, alternatives:[...], confidence }, ...]
// Candidates are { id, name, source, ... } from the Body plan library and the Activity list; anything we cannot match is returned
// unmatched so the screen can ask instead of guessing.
const LB = 0.45359237;
const r1 = (n) => Math.round(n * 10) / 10;

// Gym shorthand and spelling variants -> the words the library uses.
const SYN = [
  [/\bpush[\s-]?ups?\b/g, 'pushup'], [/\bpull[\s-]?ups?\b/g, 'pullup'], [/\bchin[\s-]?ups?\b/g, 'chinup'], [/\bsit[\s-]?ups?\b/g, 'situp'],
  [/\bstep[\s-]?ups?\b/g, 'stepup'], [/\bdips?\b/g, 'dip'], [/\bdb\b/g, 'dumbbell'], [/\bbb\b/g, 'barbell'], [/\bkb\b/g, 'kettlebell'],
  [/\brdls?\b/g, 'romanian deadlift'], [/\bohp\b/g, 'overhead press'], [/\bshoulder press\b/g, 'overhead press'], [/\bmilitary press\b/g, 'overhead press'],
  [/\bbench\b(?! press)/g, 'bench press'], [/\bsquats\b/g, 'squat'], [/\blunges\b/g, 'lunge'], [/\bcurls\b/g, 'curl'], [/\braises\b/g, 'raise'],
  [/\bpulldowns?\b/g, 'pulldown'], [/\bpull[\s-]?downs?\b/g, 'pulldown'], [/\blat pull ?down\b/g, 'lat pulldown'], [/\bdeads\b/g, 'deadlift'],
  [/\bcrunches\b/g, 'crunch'], [/\bplanks\b/g, 'plank'], [/\brows\b/g, 'row'], [/\bpresses\b/g, 'press'], [/\bextensions\b/g, 'extension'],
  [/\bglute bridges\b/g, 'glute bridge'], [/\bhip thrusts\b/g, 'hip thrust'], [/\bcalf raises?\b/g, 'calf raise'], [/\bsmith\b/g, 'smith machine'],
  [/\btriceps?\b/g, 'tricep'], [/\bbiceps?\b/g, 'bicep'], [/\bdumbells?\b/g, 'dumbbell'], [/\btreadmill\b/g, 'treadmill'], [/\bjogging\b/g, 'run'],
];
const STOP = new Set(['a', 'an', 'the', 'of', 'on', 'to', 'with', 'and', 'machine', 'exercise', 'my', 'did', 'done', 'today', 'then', 'for', 'in']);

function norm(s) {
  let t = ` ${String(s || '').toLowerCase().replace(/[()]/g, ' ').replace(/[^a-z0-9\s-]/g, ' ')} `.replace(/\s+/g, ' ');
  for (const [re, to] of SYN) t = t.replace(re, to);
  return t.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}
const tokens = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

/** How well a typed name fits a candidate (0..1). Token overlap, an exact-phrase bonus, and a small penalty for extra words in the candidate. */
function similarity(typed, candidate) {
  const a = tokens(typed), b = tokens(candidate);
  if (!a.length || !b.length) return 0;
  const bs = new Set(b);
  const hit = a.filter((w) => bs.has(w)).length;
  if (!hit) return 0;
  const recall = hit / a.length, precision = hit / b.length;
  let s = 0.7 * recall + 0.3 * precision;
  const nt = norm(typed), nc = norm(candidate);
  if (nc === nt) s = 1; else if (nc.startsWith(nt) || nc.includes(` ${nt}`)) s = Math.min(1, s + 0.15);
  return s;
}

/** Best matches for one typed name. `exact` = confident enough to pre-select; otherwise the screen should show the options. */
function matchExercise(name, candidates = [], limit = 3) {
  const ranked = candidates.map((c) => ({ c, s: similarity(name, c.name) })).filter((x) => x.s >= 0.34).sort((x, y) => y.s - x.s || x.c.name.length - y.c.name.length).slice(0, limit);
  if (!ranked.length) return { match: null, alternatives: [], confidence: 0 };
  const [top, second] = ranked;
  const clear = top.s >= 0.85 || (top.s >= 0.6 && (!second || top.s - second.s >= 0.12));
  return { match: { ...top.c, score: Math.round(top.s * 100) / 100 }, alternatives: ranked.slice(1).map((x) => ({ ...x.c, score: Math.round(x.s * 100) / 100 })), confidence: clear ? 'high' : 'low' };
}

const NUM = '(\\d+(?:\\.\\d+)?)';
const toKg = (v, unit) => (/^(lb|lbs|pound|pounds)$/.test(unit || '') ? r1(Number(v) * LB) : Number(v));

/** Pull sets out of the part of a line that is not the exercise name. */
function parseSets(rest, bodyweight = false) {
  let t = ` ${rest.toLowerCase().replace(/[×✕*]/g, 'x').replace(/\bsets?\b/g, 'set').replace(/\breps?\b/g, 'rep')} `;
  const out = { sets: [], seconds: 0, note: '' };
  const unitW = '(kg|kgs|lb|lbs|pound|pounds)?';
  // seconds / minutes (planks, holds, cardio)
  let m = t.match(new RegExp(`\\s${NUM}\\s*(s|sec|secs|seconds|min|mins|minutes)\\b`));
  if (m) { out.seconds = /^m/.test(m[2]) ? Math.round(Number(m[1]) * 60) : Math.round(Number(m[1])); t = t.replace(m[0], ' '); }
  // "60kg x 10, 65kg x 8" or "60x10 65x8": a list of weight x reps pairs
  const pairs = [...t.matchAll(new RegExp(`${NUM}\\s*(kg|kgs|lb|lbs)\\s*x\\s*(\\d+)`, 'g'))];
  if (pairs.length) return { ...out, sets: pairs.map((p) => ({ reps: Number(p[3]), weightKg: toKg(p[1], p[2]), seconds: 0 })) };
  // a single weight: "@ 60kg", "at 60", "with 20 kg", "60 kg"
  let weight = null;
  m = t.match(new RegExp(`(?:@|\\bat\\b|\\bwith\\b|\\bweight\\b)\\s*${NUM}\\s*${unitW}`)) || t.match(new RegExp(`\\s${NUM}\\s*(kg|kgs|lb|lbs|pound|pounds)\\b`));
  if (m) { weight = toKg(m[1], m[2]); t = t.replace(m[0], ' '); }
  // "3 set of 10", "3 set x 10", "10 rep x 3 set"
  m = t.match(/\s(\d+)\s*set\s*(?:of|x)?\s*(\d+)(?:\s*rep)?\b/) || null;
  let n = null, reps = null;
  if (m) { n = Number(m[1]); reps = Number(m[2]); }
  else if ((m = t.match(/\s(\d+)\s*rep\s*(?:x|for)?\s*(\d+)\s*set\b/))) { reps = Number(m[1]); n = Number(m[2]); }
  else if ((m = t.match(/\s(\d+)\s*x\s*(\d+)\b/))) {
    const a = Number(m[1]), b = Number(m[2]);
    // "60x10" with no unit and a big first number is weight x reps, once; "3x10" is sets x reps
    if (a > 20 && b <= 30 && weight === null) { out.sets = [{ reps: b, weightKg: a, seconds: 0 }]; return out; }
    n = a; reps = b;
  }
  if (n && reps) { const base = { reps, weightKg: weight ?? 0, seconds: out.seconds }; out.sets = Array.from({ length: Math.min(n, 20) }, () => ({ ...base })); return out; }
  // "20, 15, 10" or "20 15 10": one set per number (bodyweight lists)
  const list = [...t.matchAll(/\s(\d+)(?=[\s,]|$)/g)].map((x) => Number(x[1])).filter((x) => x > 0 && x <= 1000);
  if (list.length && !out.seconds) return { ...out, sets: list.slice(0, 20).map((r) => ({ reps: r, weightKg: weight ?? 0, seconds: 0 })) };
  if (out.seconds) return { ...out, sets: [{ reps: 0, weightKg: weight ?? 0, seconds: out.seconds }] };
  return out;
}

/** Split typed notes into one line per exercise: newlines, semicolons, "then", and commas that start a new exercise name. */
function splitLines(text) {
  return String(text || '').replace(/\r/g, '\n').split(/\n|;|\bthen\b|\band then\b/i).flatMap((l) => {
    const parts = l.split(/,(?=\s*[a-z][a-z\s-]*\d)/i); // "bench 3x10, squat 4x8" splits; "60x10, 65x8" does not
    return parts;
  }).map((l) => l.trim()).filter(Boolean);
}

/** The exercise name is the words before the first number or "@" in the line. */
function parseLine(line) {
  const clean = line.replace(/^[\-•\d.)\s]+(?=[a-z])/i, ''); // drop bullets and "1." numbering
  const idx = clean.search(/(\d|@)/);
  const name = (idx === -1 ? clean : clean.slice(0, idx)).replace(/\b(x|for|at|of)\s*$/i, '').trim();
  const rest = idx === -1 ? '' : clean.slice(idx);
  return { name, rest };
}

function parseWorkoutText(text, candidates = []) {
  const entries = [];
  for (const line of splitLines(text)) {
    const { name, rest } = parseLine(line);
    if (!name) continue;
    const parsed = parseSets(rest);
    const m = matchExercise(name, candidates);
    entries.push({ raw: line, name, sets: parsed.sets, seconds: parsed.seconds, ...m, needsSets: parsed.sets.length === 0 });
  }
  return entries;
}

module.exports = { parseWorkoutText, matchExercise, similarity, parseSets, parseLine, splitLines, norm };
