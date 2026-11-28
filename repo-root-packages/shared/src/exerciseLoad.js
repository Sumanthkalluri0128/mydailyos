// What KIND of weight an exercise asks for, and how much it really moves. Pure (no React, no storage, no network): one source for the web app,
// the phone and the tests (packages/shared/src, copied by tools/syncShared.mjs).
//
//   each    a pair of dumbbells (or one in a single-arm move): you type the weight of ONE dumbbell. Two hands move 2 x that.
//   total   a barbell, a machine stack, a cable, one dumbbell held in both hands (goblet squat): you type the whole weight together.
//   bw      your own body (push-up, pull-up, plank): nothing to type. Type extra weight only if you wear or hold some (vest, belt, plate).
//   assist  an assisted pull-up / dip machine: you type how much the machine HELPS. Less help = stronger.
//   none    cardio, stretching, mobility: no weight.
//
// A set keeps what was typed (`w`, which every progression rule keeps reading) plus `m` (the mode), `h` (dumbbells moved) and `tk`
// (total kg moved per rep, worked out here), so the history can always say what a number meant.

export const MODES = {
  each: { id: 'each', label: 'Each hand', head: 'Each (kg)', short: 'each', hint: 'Type the weight of ONE dumbbell.', step: 2 },
  total: { id: 'total', label: 'Total', head: 'Total (kg)', short: 'total', hint: 'Type everything together: bar and plates, or the machine stack.', step: 2.5 },
  bw: { id: 'bw', label: 'Body weight', head: 'Extra (kg)', short: 'BW', hint: 'Your body weight counts by itself. Add extra weight only if you wear or hold some.', step: 2.5 },
  assist: { id: 'assist', label: 'Assisted', head: 'Assist (kg)', short: 'assist', hint: 'Type how much the machine helps you. Less help means you got stronger.', step: 5 },
  none: { id: 'none', label: 'No weight', head: '', short: '', hint: '', step: 0 },
};
export const MODE_LIST = ['each', 'total', 'bw', 'assist'];   // the ones a person can switch between

const low = (s) => String(s == null ? '' : s).toLowerCase();
const has = (re, s) => re.test(s);

const NO_WEIGHT = /treadmill|elliptical|stationary bike|assault bike|cycling|rowing machine|jump rope|stair climber|stretch|yoga|swimming|hiit|boxing|battle rope|\bjog\b|outdoor (run|walk)|brisk walk|walk or cycle|cat-cow|easy cardio/;
const ONE_DB_BOTH_HANDS = /goblet|pullover|sumo squat|overhead (dumbbell |db )?triceps extension|overhead triceps extension|kettlebell swing|\bswing\b|svend/;
const ONE_ARM = /one-arm|single-arm|one arm|single arm|concentration|turkish|snatch|renegade/;
const BAR_OR_MACHINE = /barbell|\bbar\b|ez-bar|smith|trap[- ]bar|t-bar|landmine|machine|cable|pulldown|pushdown|leg press|hack squat|pec deck|crossover|rack pull|deadlift|hip thrust|good morning|power clean|push press|thruster|row\b/;
const BODYWEIGHT = /push-?up|press-?up|pull-?up|chin-?up|\bdips?\b|plank|crunch|sit-?up|v-up|leg raise|knee raise|flutter|climber|bird dog|dead bug|superman|burpee|bridge|frog pump|donkey|fire hydrant|bodyweight|body weight|calf raise|\blunge|step-?up|wall sit|hollow|l-sit|rollout|toe touch|russian twist|nordic|sissy|jump|box jump|inverted row|reverse crunch|scapular|squat$/;

/** The mode an exercise normally uses, before the person changes it. Accepts a library item, a catalogue item, a plan item or just { name }. */
export function detectMode(ex = {}) {
  const name = low(ex.name), gear = low(ex.gear), kind = low(ex.kind), cat = low(ex.cat), unit = low(ex.unit);
  let hands = 1;
  if (unit === 'min' || cat === 'cardio' || cat === 'mobility' || has(NO_WEIGHT, name) && !/dumbbell|barbell|cable|machine/.test(name + gear)) return { mode: 'none', hands: 0 };
  if (has(/assist/, name) && !has(/band/, name)) return { mode: 'assist', hands: 0 };
  if (kind === 'band' || gear === 'band' || (has(/\bband(ed)?\b/, name) && !has(/cable|machine|dumbbell|barbell|pulldown/, name))) return { mode: 'none', hands: 0 };   // a resistance band has no kilograms
  if (has(/farmer/, name)) return { mode: 'each', hands: 2 };
  if (gear === 'kettlebell' || has(/kettlebell/, name)) {
    if (has(/turkish/, name)) return { mode: 'each', hands: 1 };
    return { mode: 'total', hands: 1 };
  }
  if (has(/goblet|pullover|sumo squat/, name) && !has(/barbell/, name) && kind !== 'bodyweight') return { mode: 'total', hands: 1 };   // one weight held in both hands
  const dumbbell = gear === 'dumbbell' || has(/\bdb\b|dumbbell/, name) || (kind === 'free weights' && !has(/barbell|\bbar\b|kettlebell|landmine|smith|ez-bar|trap[- ]bar/, name));
  if (dumbbell) {
    if (has(ONE_DB_BOTH_HANDS, name)) return { mode: 'total', hands: 1 };
    hands = has(ONE_ARM, name) ? 1 : 2;
    return { mode: 'each', hands };
  }
  if (gear === 'barbell' || gear === 'machine' || gear === 'cable' || kind === 'cable' || kind === 'machine' || has(BAR_OR_MACHINE, name)) {
    if (gear === 'bodyweight' || (gear === '' && ex.bw && !has(/barbell|machine|cable|smith/, name))) return { mode: 'bw', hands: 0 };
    return { mode: 'total', hands: 1 };
  }
  if (gear === 'bodyweight' || ex.bw || kind === 'bodyweight' || ex.timed || unit === 'sec' || has(BODYWEIGHT, name)) return { mode: 'bw', hands: 0 };
  return { mode: 'total', hands: 1 };   // an exercise nobody has classified (typed by hand): one number, "total", can be switched
}

/**
 * The full description of the weight for one exercise. `override` is a mode the person picked ("each", "total", "bw", "assist"); it wins.
 * @returns {{ mode, hands, label, head, hint, step, asks, extra, perHand, timed }}
 *   asks: a weight box is shown (every mode but none); extra: it is optional extra (bw); perHand: the number is per dumbbell.
 */
export function loadOf(ex = {}, override = '') {
  const base = detectMode(ex);
  let mode = MODE_LIST.includes(override) ? override : base.mode;
  let hands = base.hands;
  if (mode === 'each') hands = base.mode === 'each' && base.hands ? base.hands : 2;
  else if (mode === 'total') hands = 1;
  else hands = 0;
  const m = MODES[mode];
  const total = mode === 'total';
  const barLike = total && (low(ex.gear) === 'barbell' || has(/barbell|\bbar\b|ez-bar|trap bar|t-bar|landmine/, low(ex.name)));
  const hint = barLike ? 'Type the whole weight: the bar plus all the plates.' : mode === 'each' && hands === 1 ? 'Type the weight of the dumbbell you hold (one arm at a time).' : m.hint;
  return { mode, hands, label: m.label, head: m.head, hint, step: m.step, asks: mode !== 'none', extra: mode === 'bw', perHand: mode === 'each', timed: !!(ex.timed || low(ex.unit) === 'sec' || low(ex.unit) === 'seconds'), detected: base.mode };
}

const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const r1 = (x) => Math.round(x * 10) / 10;

/** Total kg moved in ONE rep: each = typed x dumbbells, total = typed, bw = body + extra, assist = body - help (never below 0). */
export function kgPerRep(load, w, bodyKg = 0) {
  const x = Math.max(0, num(w)), body = Math.max(0, num(bodyKg));
  switch (load.mode) {
    case 'each': return r1(x * Math.max(1, load.hands || 2));
    case 'total': return r1(x);
    case 'bw': return r1(body + x);
    case 'assist': return r1(Math.max(0, body - x));
    default: return 0;
  }
}
/** kg x reps (a timed set counts its seconds as reps only when it carries extra weight). */
export const setVolume = (load, w, reps, bodyKg = 0) => Math.round(kgPerRep(load, w, bodyKg) * Math.max(0, num(reps)));

/** The fields stored with a finished set so its meaning survives (mode, dumbbells, total kg per rep). */
export function setFields(load, w, bodyKg = 0) {
  if (!load.asks) return {};
  return { m: load.mode, ...(load.mode === 'each' ? { h: load.hands } : {}), tk: kgPerRep(load, w, bodyKg) };
}

/** "12 kg each", "40 kg total", "BW", "BW + 5 kg", "assist 20 kg". Short, for lists and the history. */
export function loadText(load, w) {
  const x = Math.max(0, num(w)), n = (v) => String(Math.round(v * 100) / 100);
  switch (load.mode) {
    case 'each': return x ? `${n(x)} kg ${load.hands === 1 ? 'in hand' : 'each'}` : 'no weight';
    case 'total': return x ? `${n(x)} kg` : 'no weight';
    case 'bw': return x ? `BW + ${n(x)} kg` : 'BW';
    case 'assist': return x ? `assist ${n(x)} kg` : 'no assist';
    default: return '';
  }
}
/** What the typed number moves altogether, in words: "24 kg moved (2 x 12)". Empty when it is the same number. */
export function movedText(load, w, bodyKg = 0) {
  const x = num(w);
  if (load.mode === 'each' && x > 0 && load.hands > 1) return `${r1(x * load.hands)} kg in all (${load.hands} x ${x})`;
  if (load.mode === 'bw' && x > 0 && bodyKg > 0) return `${r1(bodyKg + x)} kg with your body`;
  if (load.mode === 'assist' && bodyKg > 0) return `${r1(Math.max(0, bodyKg - x))} kg of you lifted`;
  return '';
}

/** Which weight to compare when tracking a lift over time: the typed one, except an assist, where less help is better (stored negated for charts). */
export const trackValue = (mode, w) => (mode === 'assist' ? -num(w) : num(w));
/** Epley estimate of the one-rep max from a set, in total kg (0 when it is not a loaded set). */
export function est1RM(kg, reps) { const k = num(kg), r = Math.min(30, Math.max(0, num(reps))); return k > 0 && r > 0 ? r1(r === 1 ? k : k * (1 + r / 30)) : 0; }

/** Carry a typed weight from one meaning to another when the person switches (each <-> total only; anything else cannot be converted, so it returns 0). */
export function convertWeight(from, to, w) {
  const x = Math.max(0, num(w));
  if (!x || from.mode === to.mode) return x;
  if (from.mode === 'each' && to.mode === 'total') return r1(x * Math.max(1, from.hands || 2));
  if (from.mode === 'total' && to.mode === 'each') return r1(x / Math.max(1, to.hands || 2));
  return 0;
}

/**
 * The body for POST /api/lifts from a finished workout record (`rec.exercises[].sets[]` as workoutStore.finishActive stores them).
 * Only exercises with a weight meaning (not cardio) and at least one done set are sent. Returns null when there is nothing to track.
 */
export function liftPayload(rec, bodyKg = 0) {
  if (!rec || !rec.id) return null;
  const exercises = [];
  for (const e of rec.exercises || []) {
    const sets = (e.sets || []).filter((x) => x.done !== false).map((x) => ({
      reps: e.timed ? 0 : num(x.r), seconds: e.timed ? num(x.r) : 0, weightKg: num(x.w), totalKg: x.tk != null ? num(x.tk) : num(x.w),
      ...(Number(x.rpe) >= 1 && Number(x.rpe) <= 10 ? { rpe: Number(x.rpe) } : {}),
    })).filter((x) => x.reps > 0 || x.seconds > 0);
    if (!sets.length) continue;
    exercises.push({ id: e.id, name: e.name, muscles: e.muscles || [], mode: e.mode || 'total', ...(e.hands ? { hands: e.hands } : {}), ...(e.timed ? { timed: true } : {}), sets });
  }
  if (!exercises.length) return null;
  return { sessionId: rec.id, date: rec.date, planId: rec.planId || '', title: String(rec.title || '').slice(0, 80), bodyKg: num(bodyKg), exercises };
}
