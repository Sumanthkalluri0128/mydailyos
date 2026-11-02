// Training plan for the Body plan: a body ANALYSIS (what your size, shape, age and goal mean for training) and a full weekly PROGRAM
// (sessions, exercises, sets, reps, rest, how to progress) with an alternative for every situation:
//   - the machine is busy or your gym does not have it     -> swaps.busy (different kinds of equipment)
//   - you only have dumbbells, or nothing at all             -> swaps.dumbbellOnly / swaps.home
//   - you cannot go to the gym today                         -> homeBackup (same day, at home) and quick (20 minutes)
//   - you cannot train today but want to stay active         -> active menu (walks, cycling, swimming, yoga, sport) with calories
// Pure (no database), so it is unit-tested. Honest limits: this is a sound starting program from established strength-training
// practice (progressive overload, 10 to 20 hard sets per muscle a week, reps in reserve), not a diagnosis or a medical plan.
const { FORM, LIB, BY_ID, SLOTS, LEVELS, PLACES, LIMITS, HOME_EQUIP, FOCUS, rank, swapsFor, kindOf, homeTwin } = require('./exerciseLibrary');

const r1 = (x) => Math.round(x * 10) / 10;
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MINUTES = [30, 45, 60, 75, 90];

const TRAINING_OPTIONS = {
  places: [
    { id: 'gym', label: 'At the gym', blurb: 'Machines, cables, dumbbells. Every gym exercise also has a matching home exercise.' },
    { id: 'home', label: 'At home', blurb: 'Bodyweight, a backpack, bands or dumbbells if you have them.' },
    { id: 'both', label: 'Both', blurb: 'Gym when you can, home when you cannot. Same days, same muscles, a matching exercise for each.' },
  ],
  levels: [
    { id: 'beginner', label: 'New to lifting', blurb: 'Under 6 months of regular training.' },
    { id: 'intermediate', label: 'Some experience', blurb: '6 months to 2 years. You know the main lifts.' },
    { id: 'advanced', label: 'Experienced', blurb: 'Over 2 years of steady, progressing training.' },
  ],
  minutes: MINUTES,
  days: [2, 3, 4, 5, 6, 7],
  equipment: [
    { id: 'dumbbells', label: 'Dumbbells' }, { id: 'bands', label: 'Resistance bands' }, { id: 'bench', label: 'Bench' },
    { id: 'pullupbar', label: 'Pull-up bar' }, { id: 'kettlebell', label: 'Kettlebell' },
  ],
  limits: [
    { id: 'knee', label: 'Knee pain' }, { id: 'back', label: 'Lower back pain' }, { id: 'shoulder', label: 'Shoulder pain' },
    { id: 'wrist', label: 'Wrist pain' }, { id: 'elbow', label: 'Elbow pain' }, { id: 'heart', label: 'Heart or blood pressure condition' },
  ],
  focus: [
    { id: 'glutes', label: 'Glutes' }, { id: 'shoulders', label: 'Shoulders' }, { id: 'arms', label: 'Arms' }, { id: 'chest', label: 'Chest' },
    { id: 'back', label: 'Back' }, { id: 'legs', label: 'Legs' }, { id: 'core', label: 'Core' },
  ],
};

/** Clean what the person chose. Unknown values are dropped, never an error: the plan simply falls back to its defaults. */
function sanitizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const list = (v, allowed) => [...new Set((Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((s) => String(s).trim()).filter((s) => allowed.includes(s)))];
  const days = Math.round(num(p.days));
  const minutes = Math.round(num(p.minutes));
  return {
    place: PLACES.includes(p.place) ? p.place : '',
    level: LEVELS.includes(p.level) ? p.level : '',
    days: days >= 2 && days <= 7 ? days : null,
    minutes: minutes >= 20 && minutes <= 120 ? minutes : null,
    equipment: list(p.equipment, HOME_EQUIP),
    limits: list(p.limits, LIMITS),
    focus: list(p.focus, FOCUS).slice(0, 3),
    // The weekdays the person goes to the gym (0 = Monday ... 6 = Sunday). When given, they decide the number of days too.
    weekdays: [...new Set((Array.isArray(p.weekdays) ? p.weekdays : typeof p.weekdays === 'string' ? p.weekdays.split(',') : []).map((v) => (String(v).trim() === '' ? NaN : Number(v))).filter((v) => Number.isInteger(v) && v >= 0 && v <= 6))].sort((a, b) => a - b),
  };
}

// ------------------------------------------------------------------------------------------------------------------ body flags
function bodyFlags({ sex, age, heightCm, weightKg, bmi, bfPct, bandHi, mode }) {
  const mid = sex === 'male' ? [165, 180] : sex === 'female' ? [153, 168] : [159, 174]; // short / tall cut-offs (cm)
  return {
    sex, age, heightCm, weightKg, bmi, bfPct, mode,
    tall: heightCm >= mid[1], short: heightCm <= mid[0],
    heavy: bmi >= 30 || bfPct > bandHi + 10, veryHeavy: bmi >= 35,
    light: bmi < 20, older: age >= 45, senior: age >= 60,
    cut: mode === 'lose', build: mode === 'build', recomp: mode === 'recomp', female: sex === 'female',
  };
}

function recommendedDays(type, level, f) {
  const table = { lean: [3, 3, 4], athletic: [3, 4, 5], muscular: [3, 4, 5], balanced: [2, 3, 3] };
  let d = table[type][LEVELS.indexOf(level)];
  if (f.age >= 55) d = Math.min(d, 3);
  return d;
}
// The number of days is the person's call: they know their week. Only lifters over 55 are held to 5, and a long week gets lighter sessions (see trimFor).
const maxDays = (level, f) => (f.age >= 55 ? 5 : 7);
// Sets taken off every exercise when many days are chosen, so the week's total work stays sensible and each day still has a full list.
const trimFor = (days, level) => (days === 7 || (level === 'beginner' && days >= 5) ? 1 : 0);
const defaultMinutes = (type) => (type === 'balanced' ? 40 : type === 'lean' ? 50 : 60);

function resolvePrefs(raw, f, type) {
  const c = sanitizePrefs(raw);
  const level = c.level || 'beginner';
  const rec = recommendedDays(type, level, f), max = maxDays(level, f);
  const notes = [];
  let weekdays = c.weekdays.length >= 2 ? c.weekdays.slice() : [];
  if (weekdays.length > max) { notes.push(`You picked ${weekdays.length} days, but after 55 the plan uses ${max}: the first ${max} are kept.`); weekdays = weekdays.slice(0, max); }
  if (weekdays.length) c.days = weekdays.length; // the days picked on the calendar are the days the plan builds
  let days = c.days || rec;
  if (days > max) { notes.push(`${days} days is more than is wise after 55, so the plan uses ${max}. Recovery is slower, and extra sessions only add tiredness.`); days = max; }
  if (c.days && days > rec + 1) notes.push(`You chose ${days} gym days, so every one of them has its own exercises. ${rec} days is the best fit for your goal, so each session carries a little less work to keep the whole week recoverable${f.cut ? ' while eating less' : ''}. Sleep 7 to 9 hours and keep 2 or 3 days lighter.`);
  if (days === 7) notes.push('Seven days leaves no full rest day. Day 7 is a light session; swap it for a rest day any week you feel run down.');
  if (c.days && c.days < rec) notes.push(`${days} days works. ${rec} days would give faster results if your week allows it.`);
  return {
    place: c.place || 'gym', level, days, minutes: c.minutes || defaultMinutes(type),
    equipment: c.equipment, limits: c.limits, focus: c.focus,
    recommendedDays: rec, maxDays: max,
    weekdays, chosen: { place: !!c.place, level: !!c.level, days: !!c.days, minutes: !!c.minutes },
    setupDone: !!(c.place && c.level), notes,
  };
}

// ------------------------------------------------------------------------------------------------------------------ split design
const SPLITS = {
  2: { name: 'Full body, 2 days', titles: ['Full body A', 'Full body B'], days: [['squat', 'hpress', 'hrow', 'hinge', 'lateral', 'core'], ['lunge', 'vpress', 'vpull', 'glute', 'rear', 'core']] },
  3: { name: 'Full body, 3 days', titles: ['Full body A', 'Full body B', 'Full body C'], days: [['squat', 'hpress', 'hrow', 'lateral', 'bicep', 'core'], ['hinge', 'vpress', 'vpull', 'lunge', 'tri', 'core'], ['glute', 'ipress', 'hrow', 'ham', 'rear', 'calf']] },
  4: { name: 'Upper / lower, 4 days', titles: ['Upper 1', 'Lower 1', 'Upper 2', 'Lower 2'], days: [['hpress', 'hrow', 'vpress', 'vpull', 'tri', 'bicep'], ['squat', 'hinge', 'ham', 'calf', 'core'], ['ipress', 'vpull', 'hrow', 'lateral', 'rear', 'tri'], ['squat', 'glute', 'lunge', 'quad', 'core']] },
  5: { name: 'Upper / lower / push / pull / legs, 5 days', titles: ['Upper', 'Lower', 'Push', 'Pull', 'Legs and glutes'], days: [['hpress', 'hrow', 'vpress', 'vpull', 'bicep', 'tri'], ['squat', 'hinge', 'ham', 'calf', 'core'], ['ipress', 'vpress', 'fly', 'lateral', 'tri'], ['vpull', 'hrow', 'rear', 'bicep', 'core'], ['squat', 'glute', 'lunge', 'quad', 'calf']] },
  6: { name: 'Push / pull / legs twice, 6 days', titles: ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'], days: [['hpress', 'vpress', 'fly', 'lateral', 'tri'], ['vpull', 'hrow', 'rear', 'bicep', 'core'], ['squat', 'hinge', 'ham', 'calf', 'core'], ['ipress', 'vpress', 'lateral', 'fly', 'tri'], ['hrow', 'vpull', 'rear', 'bicep', 'core'], ['squat', 'glute', 'lunge', 'quad', 'calf']] },
  7: { name: 'Push / pull / legs twice and a light shape day, 7 days', titles: ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2', 'Shape and core (light)'], days: [['hpress', 'vpress', 'fly', 'lateral', 'tri'], ['vpull', 'hrow', 'rear', 'bicep', 'core'], ['squat', 'hinge', 'ham', 'calf', 'core'], ['ipress', 'vpress', 'lateral', 'fly', 'tri'], ['hrow', 'vpull', 'rear', 'bicep', 'core'], ['squat', 'glute', 'lunge', 'quad', 'calf'], ['glute', 'lateral', 'rear', 'bicep', 'tri', 'core']] },
};
const WEEK_DAYS = { 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
const UPPER = ['hpress', 'ipress', 'vpress', 'vpull', 'hrow'], LOWER = ['squat', 'hinge', 'lunge'];
const DROP_ORDER = ['calf', 'fly', 'bicep', 'tri', 'quad', 'ham', 'core', 'rear', 'lateral', 'glute'];
const FOCUS_SLOTS = { glutes: ['glute'], shoulders: ['lateral', 'rear'], arms: ['bicep', 'tri'], chest: ['fly', 'ipress'], back: ['vpull', 'hrow', 'rear'], legs: ['quad', 'ham', 'calf'], core: ['core'] };

const slotCount = (days, slot) => days.reduce((n, d) => n + d.filter((s) => s === slot).length, 0);
function insertAfterCompounds(day, slot) {
  let at = 0;
  day.forEach((s, i) => { if (SLOTS[s].role === 'compound') at = i + 1; });
  day.splice(at, 0, slot);
}

/** Add the slots this person's body, goal and focus ask for, then trim each day to the time they have. */
function designDays(days, f, type, prefs) {
  const out = SPLITS[days].days.map((d) => d.slice());
  const required = {}; // how many times a week each priority slot must keep, however short the session
  const want = (slot, total, pred) => {
    for (let i = 0; i < out.length && slotCount(out, slot) < total; i += 1) if (pred(out[i]) && !out[i].includes(slot)) insertAfterCompounds(out[i], slot);
    required[slot] = Math.max(required[slot] || 0, Math.min(total, slotCount(out, slot)));
  };
  const isUpper = (d) => d.some((s) => UPPER.includes(s)), isLower = (d) => d.some((s) => LOWER.includes(s)), any = () => true;
  const f2 = new Set(prefs.focus);
  if (f.female || f2.has('glutes')) want('glute', f2.has('glutes') && days >= 4 ? 3 : 2, isLower);
  if (type === 'athletic' || (f.sex !== 'female' && type === 'lean') || f2.has('shoulders')) { want('lateral', days >= 5 ? 3 : 2, isUpper); want('rear', 2, isUpper); }
  if (type === 'muscular') { want('fly', 1, isUpper); if (days >= 4) { want('bicep', 2, isUpper); want('tri', 2, isUpper); } }
  if (f2.has('arms')) { want('bicep', 2, isUpper); want('tri', 2, isUpper); }
  if (f2.has('chest')) { want('fly', 1, isUpper); want('ipress', 1, isUpper); }
  if (f2.has('back')) { want('vpull', 2, isUpper); want('hrow', 2, isUpper); want('rear', 2, isUpper); }
  if (f2.has('legs')) { want('quad', 1, isLower); want('ham', 1, isLower); want('calf', 1, isLower); }
  if (f2.has('core') || f.older) want('core', Math.min(3, days), any);
  want('rear', 1, isUpper); // posture: everyone gets some rear shoulder and upper-back work

  // Trim to the time available. Compounds are never dropped; the rest go in DROP_ORDER. A slot the person asked to focus on is never
  // dropped, and a slot is never removed from the last place it appears (core and rear shoulders keep two a week when there are 3+ days).
  const focusSlots = new Set([...f2].flatMap((k) => FOCUS_SLOTS[k] || []));
  const budget = prefs.minutes - 12;
  const slotMin = (s) => { const c = SLOTS[s].role === 'compound'; return (c ? 3 * (40 + 105) : 2.5 * (40 + 65)) / 60 + 0.7; };
  const minLeft = (slot) => Math.max(slot === 'core' || slot === 'rear' ? (days >= 3 ? 2 : 1) : 1, required[slot] || 0);
  const canDrop = (s) => !focusSlots.has(s) && slotCount(out, s) > minLeft(s);
  out.forEach((d) => {
    const total = () => d.reduce((m, s) => m + slotMin(s), 0);
    while (total() > budget && d.length > 4) {
      const victim = DROP_ORDER.find((s) => d.includes(s) && canDrop(s));
      if (!victim) break;
      d.splice(d.lastIndexOf(victim), 1);
    }
  });
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ sets, reps, rest
const COMPOUND_REPS = {
  beginner: { lean: [8, 12], athletic: [8, 12], muscular: [8, 12], balanced: [10, 15] },
  intermediate: { lean: [8, 12], athletic: [6, 10], muscular: [6, 10], balanced: [8, 12] },
  advanced: { lean: [6, 10], athletic: [5, 8], muscular: [5, 8], balanced: [8, 12] },
};
const ISO_WIDE = ['lateral', 'rear', 'calf', 'core', 'glute'];

function scheme(ex, slotId, ctx, firstCompound) {
  const { level, flags: f, type } = ctx;
  const compound = SLOTS[slotId].role === 'compound';
  const hold = ex.tags.includes('hold');
  const unloaded = ex.tags.includes('bw') && !ex.eq.length;
  let sets, lo, hi, rir, rest, unit = 'reps';
  if (hold) {
    unit = 'seconds'; sets = level === 'beginner' ? 2 : 3; lo = 20; hi = level === 'advanced' ? 60 : 45; rir = 2; rest = 45;
  } else if (compound) {
    sets = level === 'advanced' && !f.cut ? 4 : 3;
    [lo, hi] = COMPOUND_REPS[level][type];
    if (firstCompound && type === 'muscular' && level !== 'beginner') [lo, hi] = [5, 8];
    rir = level === 'beginner' ? 3 : 2;
    rest = level === 'beginner' ? 90 : level === 'intermediate' ? 120 : 150;
    if (unloaded) { [lo, hi] = ex.diff === 1 ? [10, 20] : ex.diff === 2 ? [8, 15] : [5, 10]; rest = 75; }
  } else {
    sets = level === 'beginner' ? 2 : (level === 'advanced' && f.cut ? 2 : 3);
    [lo, hi] = ISO_WIDE.includes(slotId) ? [12, 20] : [10, 15];
    rir = level === 'beginner' ? 2 : 1;
    rest = 60;
    if (unloaded) [lo, hi] = [12, 20];
  }
  if (!hold && ctx.setTrim) sets = Math.max(2, sets - ctx.setTrim);
  if (!hold && !unloaded && compound) {
    if (f.senior) { lo = Math.max(lo, 10); hi = Math.max(hi, 15); } else if (f.older) { lo = Math.max(lo, 8); hi = Math.max(hi, lo + 4); }
  }
  if (f.older) { rest += 30; rir = Math.min(4, rir + 1); }
  if (f.senior) rest += 15;
  if (f.veryHeavy) rest += 15;
  if (ctx.limits.has('heart')) { rir = Math.max(rir, 3); rest = Math.max(rest, 90); }
  return { sets, repsLo: lo, repsHi: hi, unit, perSide: ex.tags.includes('uni'), rir, restSec: rest };
}

const effortText = (rir) => (rir >= 4 ? 'Easy and smooth: stop with 4 reps left' : rir === 3 ? 'Stop with about 3 reps left' : rir === 2 ? 'Stop with about 2 reps left' : 'Last set hard: stop with 1 rep left');
const repsText = (e) => (e.unit === 'seconds' ? `${e.repsLo} to ${e.repsHi} seconds` : `${e.repsLo} to ${e.repsHi} reps`) + (e.perSide ? ' each side' : '');

function toExercise(ex, slotId, ctx, first, withSwaps) {
  const s = scheme(ex, slotId, ctx, first);
  const unloaded = ex.tags.includes('bw') && !ex.eq.length;
  const out = {
    id: ex.id, name: ex.name, slot: slotId, slotLabel: SLOTS[slotId].label, targets: SLOTS[slotId].main, kind: kindOf(ex),
    sets: s.sets, reps: repsText(s), repsLo: s.repsLo, repsHi: s.repsHi, unit: s.unit, perSide: s.perSide, rir: s.rir, effort: effortText(s.rir), restSec: s.restSec,
    cue: ex.cue, form: FORM[slotId] || null, helpers: SLOTS[slotId].aux,
    progress: unloaded
      ? `When every set reaches ${s.repsHi}${s.unit === 'seconds' ? ' seconds' : ' reps'} with the same effort: slow the tempo (3 seconds down), then move to a harder version${ctx.where === 'home' ? ' or add a loaded backpack' : ''}.`
      : s.unit === 'seconds'
        ? `When every set reaches ${s.repsHi} seconds with good posture, use heavier weights and start again at ${s.repsLo} seconds.`
        : `When every set reaches ${s.repsHi} reps with ${s.rir} left, add the smallest weight step and start again at ${s.repsLo}.`,
    weightHint: unloaded ? 'No weight needed. Make it harder with a slower tempo, a pause at the bottom or a loaded backpack.' : `Find a weight where the last rep of the last set still leaves ${s.rir} in the tank. Warm up with one lighter set first.`,
  };
  if (withSwaps) out.swaps = swapsFor(ex, slotId, ctx);
  return out;
}

const exMinutes = (e) => (e.sets * ((e.unit === 'seconds' ? 35 : e.perSide ? 70 : 40) + e.restSec)) / 60 + 0.7;
const sessionMinutes = (exs) => Math.round(8 + 4 + exs.reduce((m, e) => m + exMinutes(e), 0));

/** Choose an exercise per slot (a repeated slot rotates to the next-best option), then shave sets until the session fits the time. */
function buildExercises(slots, ctx, withSwaps, limitMinutes, weekUsed = new Set()) {
  const used = new Set();
  const exs = [];
  let firstCompound = true;
  for (const slot of slots) {
    const cands = rank(slot, ctx).filter((e) => !used.has(e.id));
    if (!cands.length) continue;
    // Prefer an exercise not already used elsewhere this week, so the same slot on another day gets the next-best option.
    const fresh = cands.filter((e) => !weekUsed.has(e.id));
    const pick = (fresh.length ? fresh : cands)[0];
    used.add(pick.id); weekUsed.add(pick.id);
    const isCompound = SLOTS[slot].role === 'compound';
    exs.push(toExercise(pick, slot, ctx, isCompound && firstCompound, withSwaps));
    if (isCompound) firstCompound = false;
  }
  let guard = 0;
  while (limitMinutes && sessionMinutes(exs) > limitMinutes && guard < 40) {
    guard += 1;
    const iso = exs.filter((e) => SLOTS[e.slot].role === 'isolation' && e.sets > 2).sort((a, b) => b.sets - a.sets)[0];
    const comp = exs.filter((e) => SLOTS[e.slot].role === 'compound' && e.sets > 2).sort((a, b) => b.sets - a.sets)[0];
    const t = iso || comp;
    if (!t) break;
    t.sets -= 1;
  }
  return exs;
}

/**
 * The home version of a gym session, exercise by exercise: each gym move gets its natural twin (same slot, same muscle, same pattern),
 * with the same number of sets, in the same order. If an injury limit rules every home option out, that move is dropped, never replaced
 * by a risky one. `replaces` says which gym exercise each home exercise stands in for.
 */
function buildHomeTwins(gymExercises, ctxHome) {
  const taken = new Set();
  const out = [];
  gymExercises.forEach((g, i) => {
    const t = homeTwin(BY_ID[g.id], g.slot, ctxHome, taken);
    if (!t) return;
    taken.add(t.ex.id);
    const e = toExercise(t.ex, g.slot, ctxHome, false, false);
    e.sets = g.sets; // same work, different tools
    e.replaces = { id: g.id, name: g.name, position: i + 1 };
    e.match = t.how === 'same' ? 'same' : 'twin';
    e.matchNote = t.how === 'same' ? `Same exercise as the gym. ${t.tip}` : `Takes the place of ${g.name}: same muscles, same movement. ${t.tip}`;
    out.push(e);
  });
  return out;
}

const WARMUP = {
  lower: ['5 minutes of easy walking, cycling or rowing, just enough to feel warm', 'Hip circles and leg swings, 10 each side', '10 slow bodyweight squats and 10 glute bridges', 'Before your first lift: one light set of 10, then one of 5 at about 70 percent of your working weight'],
  upper: ['5 minutes of easy walking, cycling or rowing, just enough to feel warm', 'Arm circles and shoulder rolls, 10 each way', '10 band pull-aparts or wall slides, and 10 slow push-ups on a wall or bench', 'Before your first lift: one light set of 10, then one of 5 at about 70 percent of your working weight'],
  full: ['5 minutes of easy walking, cycling or rowing, just enough to feel warm', 'Arm circles, hip circles and leg swings, 10 each', '10 slow bodyweight squats and 10 wall push-ups', 'Before your first lift: one light set of 10, then one of 5 at about 70 percent of your working weight'],
};
const COOLDOWN = ['3 to 5 minutes of easy walking until your breathing settles', 'Stretch what feels tight, 30 seconds each: calves, front of the hips, chest, upper back', 'Drink water and have a protein-rich meal within a couple of hours'];

function sessionKind(slots) {
  const u = slots.some((s) => UPPER.includes(s)), l = slots.some((s) => LOWER.includes(s) || ['glute', 'quad', 'ham', 'calf'].includes(s));
  return u && l ? 'full' : l ? 'lower' : 'upper';
}

/** A circuit that fits 20 minutes with almost no equipment: for the day the full session is not possible. */
function quickSession(slots, ctxHome, level) {
  const picks = [];
  const have = new Set();
  const take = (slot) => { const e = rank(slot, ctxHome).find((c) => !have.has(c.id)); if (e) { have.add(e.id); picks.push({ slot, ex: e }); } };
  const comp = slots.filter((s) => SLOTS[s].role === 'compound');
  const wantFirst = [comp.find((s) => LOWER.includes(s)), comp.find((s) => ['hpress', 'ipress', 'vpress'].includes(s)), comp.find((s) => ['hrow', 'vpull'].includes(s))].filter(Boolean);
  wantFirst.forEach(take);
  comp.forEach((s) => { if (picks.length < 3) take(s); });
  slots.filter((s) => SLOTS[s].role === 'isolation').forEach((s) => { if (picks.length < 3) take(s); });
  take('core');
  const rounds = level === 'beginner' ? 2 : 3;
  const list = picks.slice(0, 4).map(({ slot, ex }) => {
    const s = scheme(ex, slot, ctxHome, false);
    return { id: ex.id, name: ex.name, slot, reps: repsText(s), cue: ex.cue };
  });
  return {
    title: 'Quick session: no gym needed', rounds, exercises: list, minutes: Math.round(3 + rounds * (list.length * 1.2 + 1)),
    format: `${rounds} rounds. Do each move for the reps shown (or about 40 seconds), rest 20 seconds between moves and 1 minute between rounds. Stop each move with 2 reps left.`,
  };
}

// ------------------------------------------------------------------------------------------------------------------ cardio and active days
// Walking is NOT in this menu: the app tracks walks and steps as their own activity, so the plan never offers a walk as a substitute for a workout.
// MET values follow the Compendium of Physical Activities and the app's own exercise catalogue. kcal = MET x kg x hours: a guide, not a promise.
const ACTIVE_ALL = [
  { id: 'cycle-easy', name: 'Easy cycling', met: 5.8, impact: 'low', where: 'both', intensity: 'moderate', use: ['fat-loss', 'rest-day', 'recovery'], tip: 'Light resistance, 70 to 90 turns a minute. Easy on the knees and back.' },
  { id: 'swim', name: 'Swimming', met: 6.0, impact: 'low', where: 'outdoor', intensity: 'moderate', use: ['fat-loss', 'recovery'], tip: 'Any stroke at a steady pace. Best choice for sore joints or a higher body weight.' },
  { id: 'row-machine', name: 'Rowing machine', met: 7.0, impact: 'low', where: 'gym', intensity: 'hard', use: ['fat-loss'], tip: 'Push with your legs first, then lean back, then pull with your arms. Keep it steady.' },
  { id: 'elliptical', name: 'Elliptical', met: 5.0, impact: 'low', where: 'gym', intensity: 'moderate', use: ['fat-loss', 'rest-day'], tip: 'Upright posture, light hands on the handles.' },
  { id: 'stairs', name: 'Stair climbing (building stairs)', met: 6.0, impact: 'low', where: 'home', intensity: 'hard', use: ['busy-day', 'fat-loss'], tip: 'Climb at a steady pace and walk down slowly. Five rounds is already a solid session.' },
  { id: 'surya', name: 'Surya Namaskar (sun salutations)', met: 3.3, impact: 'low', where: 'home', intensity: 'easy', use: ['rest-day', 'recovery', 'busy-day'], tip: '6 to 12 rounds at a smooth pace. Skip any step that hurts your wrists or back.' },
  { id: 'yoga', name: 'Yoga or mobility flow', met: 2.5, impact: 'low', where: 'home', intensity: 'easy', use: ['recovery', 'rest-day'], tip: 'Slow stretches and breathing. Good the day after hard legs.' },
  { id: 'dance', name: 'Dance workout', met: 5.0, impact: 'low', where: 'home', intensity: 'moderate', use: ['fun', 'fat-loss', 'busy-day'], tip: 'Put on music you love and keep moving for 25 to 30 minutes.' },
  { id: 'home-circuit', name: 'Home bodyweight circuit', met: 4.5, impact: 'low', where: 'home', intensity: 'moderate', use: ['busy-day', 'fat-loss'], tip: 'Use the Quick 20 session from your plan.' },
  { id: 'sport', name: 'Badminton, football or cricket with friends', met: 5.5, impact: 'high', where: 'outdoor', intensity: 'moderate', use: ['fun', 'fat-loss'], tip: 'Counts as real training and keeps you coming back.' },
  { id: 'jog-easy', name: 'Easy jog', met: 7.0, impact: 'high', where: 'outdoor', intensity: 'hard', use: ['fat-loss'], tip: 'Slow enough to hold a conversation. Build up with walk and jog intervals.' },
  { id: 'skipping', name: 'Skipping rope', met: 8.8, impact: 'high', where: 'home', intensity: 'hard', use: ['busy-day', 'fat-loss'], tip: 'Start with 30 seconds on, 60 seconds off. Land softly on the balls of your feet.' },
];

function activeMenu(f, limits, place) {
  const lowOnly = f.heavy || limits.has('knee') || limits.has('back') || f.older;
  const noHard = limits.has('heart');
  return ACTIVE_ALL
    .filter((a) => !(lowOnly && a.impact === 'high') && !(noHard && a.intensity === 'hard'))
    .filter((a) => place === 'home' ? a.where !== 'gym' : true)
    .map((a) => ({ ...a, kcal30: Math.round(a.met * f.weightKg * 0.5) }));
}

function cardioPlan(f, type, prefs, active) {
  const limits = new Set(prefs.limits);
  const hrMax = Math.round(208 - 0.7 * f.age); // Tanaka formula: more accurate than 220 minus age
  const zone2 = [Math.round(hrMax * 0.6), Math.round(hrMax * 0.7)];
  let weekly = f.cut ? 150 : f.recomp ? 100 : 60;
  if (type === 'muscular') weekly = Math.min(weekly, f.cut ? 100 : 60);
  if (type === 'balanced') weekly = Math.max(weekly, 120);
  if (f.light) weekly = Math.min(weekly, 60);
  const start = f.heavy || prefs.level === 'beginner' ? Math.min(weekly, 90) : weekly;
  const lowImpact = f.heavy || limits.has('knee') || limits.has('back') || f.older;
  const perSession = f.heavy ? 25 : 30;
  const sessions = Math.max(1, Math.round(weekly / perSession));
  const intervalsOk = !(f.heavy || limits.has('heart') || limits.has('knee') || f.age >= 50 || prefs.level === 'beginner' || f.build || f.light) && (type === 'athletic' || type === 'lean');
  const names = active.filter((a) => a.use.includes('fat-loss') && a.intensity !== 'hard').slice(0, 5).map((a) => a.name);
  const notes = [];
  if (f.heavy) notes.push(`Start at ${start} minutes a week and add about 10 minutes every week until you reach ${weekly}. Choose low-impact options so your knees, hips and back get time to adapt.`);
  if (f.cut) notes.push('Do cardio on your non-lifting days, or after lifting. Never before heavy leg work. If your weight stalls for 3 weeks, add 1,000 steps a day before cutting food.');
  if (f.build || f.light) notes.push('Keep cardio light so your food goes to building muscle. Keep your daily steps going (tracked separately) and add easy cycling or a yoga flow if you want more.');
  if (limits.has('heart')) notes.push('Keep every session at a pace where you can talk comfortably, and agree your upper heart-rate limit with your doctor first.');
  return {
    weeklyEasyMinutes: weekly, startMinutes: start, rampMinutesPerWeek: start < weekly ? 10 : 0,
    easy: { minutes: perSession, perWeek: sessions, zoneBpm: zone2, talkTest: 'You can speak in full sentences but not sing. About 60 to 70 percent of your maximum heart rate.' },
    maxHeartRateBpm: hrMax,
    intervals: intervalsOk
      ? { perWeek: type === 'athletic' && prefs.level !== 'beginner' ? 2 : 1, format: 'Bike, rower or elliptical: 6 rounds of 30 seconds hard and 90 seconds easy, after a 5-minute warm-up. Hard means about 8 out of 10 effort.', hardBpm: [Math.round(hrMax * 0.8), Math.round(hrMax * 0.9)] }
      : null,
    intervalsNote: intervalsOk ? null : (limits.has('heart') ? 'No hard intervals with a heart or blood-pressure condition unless your doctor agrees.' : f.heavy || limits.has('knee') || f.age >= 50 ? 'Hard intervals are skipped for now to protect your joints and heart. Steady cardio and walking give most of the benefit.' : prefs.level === 'beginner' ? 'Add one interval session after 6 to 8 weeks of steady training.' : 'Not needed for this goal.'),
    lowImpactOnly: lowImpact, options: names, steps: f.steps, notes,
  };
}

// ------------------------------------------------------------------------------------------------------------------ volume check
function volumeReport(sessions, level, f) {
  const tally = Object.fromEntries(['chest', 'back', 'shoulders', 'arms', 'core', 'legs', 'glutes'].map((g) => [g, 0]));
  sessions.forEach((s) => s.exercises.forEach((e) => {
    SLOTS[e.slot].main.forEach((g) => { tally[g] += e.sets; });
    SLOTS[e.slot].aux.forEach((g) => { tally[g] += e.sets * 0.5; });
  }));
  const base = { beginner: [6, 12], intermediate: [10, 16], advanced: [12, 20] }[level];
  // Helper muscles get half credit (rows and pulldowns count half toward arms, presses toward shoulders), so arms and shoulders
  // targets are higher than their direct sets alone would suggest.
  const scale = { core: [0.5, 0.8], legs: [1, 1.7], glutes: [0.8, 1.4], arms: [1, 1.7], chest: [0.8, 1.1], back: [1, 1.4], shoulders: [0.9, 1.3] };
  const cutAdj = f.cut && level !== 'beginner' ? 0.85 : 1;
  return Object.entries(tally).map(([group, sets]) => {
    const [a, b] = scale[group];
    const target = [Math.round(base[0] * a * cutAdj), Math.round(base[1] * b * cutAdj)];
    const sw = Math.round(sets * 2) / 2;
    return { group, weeklySets: sw, target, status: sw < target[0] ? 'low' : sw > target[1] ? 'high' : 'ok' };
  });
}

// ------------------------------------------------------------------------------------------------------------------ text pieces
const DELOAD_EVERY = (f) => (f.older || f.cut ? 5 : 6);
function progressionPlan(f, level, place) {
  const every = DELOAD_EVERY(f);
  return {
    method: 'Double progression: add reps first, then weight.',
    rules: [
      'Pick a weight where your last rep of your last set still leaves the reps in reserve shown on the exercise.',
      'Each week try to add one rep to each set until every set reaches the top of the range.',
      'Then add the smallest weight step and start again at the bottom of the range. A small step is about 2 kg for upper body and 5 kg for lower body.',
      'If you are 2 or more reps below last time in two sessions in a row, you are tired, not weak. Keep the weight and cut one set for a week.',
      'Write down weight and reps every session. What you can see improving keeps you going.',
    ],
    phases: [
      { weeks: '1 to 2', name: 'Learn the moves', rir: 4, note: level === 'beginner' ? 'Light and smooth. Learn the machines, the seat settings and the movement. Soreness is normal; sharp pain is not.' : 'Re-learn the exercises and find your starting weights.' },
      { weeks: `3 to ${every - 1}`, name: 'Build', rir: 2, note: 'Add a rep or a little weight each week. This is where the progress happens.' },
      { weeks: `${every}`, name: 'Easy week', rir: 4, note: 'Same exercises, weights about 10 percent lighter, one set fewer. Then start the next block a little stronger.' },
    ],
    deloadEveryWeeks: every,
    homeLadder: ['Slow the tempo: 3 seconds down, 1 second pause at the bottom', 'Pause at the hardest point for 2 seconds', 'Move to one side at a time (single-leg or one-arm)', 'Load a backpack with books or water bottles', 'Choose the "Harder" version shown on the exercise'],
    whenStuck: [
      'Weight on the bar has not moved for 3 weeks: check sleep (7 to 9 hours), protein and total calories first.',
      f.cut ? 'In a calorie deficit, holding your strength is a win. Do not chase new records every week.' : 'If you are eating at or above maintenance, a stall usually means more food or more rest, not more sets.',
      'If one exercise stalls, swap it for a variation from its alternatives for 4 to 6 weeks, then come back.',
    ],
    track: place === 'home' ? 'Take a short video from the side every 4 weeks to check your form and see progress.' : 'Take progress photos in the same light every 4 weeks, and measure your waist every 2 weeks.',
  };
}

const BUSY_GYM = [
  'Do not wait more than 2 minutes for a machine. Take the swap listed under "Machine busy?" on that exercise, or ask "how many sets do you have left?" and work in between their sets.',
  'Keep the same muscle, the same reps and the same effort. Only the equipment changes. Find the weight in two warm-up sets, starting lighter than you think.',
  'Pair two moves that use different muscles (a push with a pull, or upper with lower) and alternate them while the other station is busy. This also saves time.',
  'At peak hours (evenings, Mondays) do the exercises with free stations first and the crowded ones last. The order of the isolation moves does not matter much.',
  'If your gym does not have a machine at all, the swap list gives the dumbbell and bodyweight versions of it. They work the same muscles.',
  'Wipe the seat, return the weights, and keep your phone off the machine between sets. A good gym is a shared place.',
];

function safetyList(f, prefs, program) {
  const out = [];
  const lim = new Set(prefs.limits);
  if (lim.has('heart') || f.bmi >= 35 || (f.age >= 45 && prefs.level === 'beginner' && f.bmi >= 30)) {
    out.push({ id: 'clearance', level: 'notice', title: 'Check with your doctor before hard training', detail: lim.has('heart') ? 'You said you have a heart or blood-pressure condition. The plan uses machines, light loads and easy effort, but please agree it with your doctor before you start.' : 'At your weight and experience, a quick check with your doctor before you start is a good idea. The plan begins gently and builds slowly.' });
  }
  out.push({ id: 'stop', level: 'info', title: 'Stop and rest if you feel any of these', detail: 'Sharp or sudden pain, chest pain or pressure, dizziness, unusual breathlessness, numbness or tingling. Muscle burn and soreness 1 to 2 days later are normal. Joint pain is not.' });
  out.push({ id: 'form', level: 'info', title: 'Form before weight', detail: 'Use a lighter weight and full control. If you are new, ask the gym trainer to check your squat, hinge and press once. Breathe out on the effort and never hold your breath on heavy reps.' });
  if (f.older) out.push({ id: 'age', level: 'info', title: 'Warm up a little longer', detail: 'After 45, muscles and tendons need a longer warm-up and more recovery. The plan adds rest time and keeps your effort 3 reps from the limit.' });
  if (f.cut) out.push({ id: 'cut', level: 'info', title: 'Eating less means recovering slower', detail: 'Keep your protein high, sleep 7 to 9 hours, and take your easy week. If you feel weak for several days in a row, eat at maintenance for a week.' });
  if (prefs.place !== 'gym' && !prefs.equipment.includes('pullupbar')) out.push({ id: 'pull', level: 'info', title: 'Home pulling is the hard part', detail: 'Without a bar or bands, back training is limited. A resistance band set or a doorway pull-up bar is the best first purchase, then adjustable dumbbells.' });
  out.push({ id: 'medical', level: 'info', title: 'Not medical advice', detail: 'This is a general program. If you are pregnant, recovering from injury or surgery, or have a health condition, check with your doctor or a physiotherapist first.' });
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ analysis
const GROUP_NAME = { chest: 'chest', back: 'back', shoulders: 'shoulders', arms: 'arms', core: 'core', legs: 'legs', glutes: 'glutes' };
const ffmiBand = (sex, v) => {
  if (sex === 'other') return '';
  const cuts = sex === 'male' ? [18, 20, 22, 25] : [14.5, 16.5, 18.5, 20.5];
  return v < cuts[0] ? 'below average' : v < cuts[1] ? 'average' : v < cuts[2] ? 'good' : v < cuts[3] ? 'high' : 'very high';
};

function focusList(f, type, prefs, taper) {
  const out = [];
  const add = (group, why) => { if (!out.find((o) => o.group === group)) out.push({ group, why }); };
  const nameOf = { glutes: 'glutes', shoulders: 'shoulders', arms: 'arms', chest: 'chest', back: 'back', legs: 'legs', core: 'core' };
  prefs.focus.forEach((g) => add(nameOf[g], 'You chose this as a focus, so it gets extra sets and a second weekly session.'));
  if (f.sex !== 'female') {
    if (type === 'athletic') { add('shoulders', 'Wider shoulders make the waist look smaller. Side shoulders get 2 to 3 sessions a week.'); add('back', 'A wide upper back (lats) creates the V-shape. Pulldowns and rows come first in every upper day.'); add('chest', 'Upper chest sits high and fills the shoulder line.'); }
    else if (type === 'muscular') { add('chest', 'Pressing power and size come from heavy presses.'); add('back', 'Thick, strong back balances the chest and protects the shoulders.'); add('legs', 'Legs are the biggest muscles. Training them hard supports growth everywhere.'); }
    else if (type === 'lean') { add('shoulders', 'Shoulders give shape without bulk.'); add('back', 'Upper back improves posture and makes the waist look smaller.'); add('core', 'A strong trunk supports every lift.'); }
    else { add('back', 'Upper-back strength fixes the desk-posture rounding most people have.'); add('legs', 'Strong legs keep you moving well for decades.'); add('core', 'A strong trunk protects the lower back.'); }
    if (taper !== null && taper < 1.25 && type !== 'balanced') add('shoulders', `Chest to waist is ${taper}, so extra shoulder and back width helps most.`);
  } else {
    if (type === 'muscular') { add('glutes', 'Glutes are the strongest muscle group and respond very well to heavy loading.'); add('back', 'A strong back balances the lower body and improves posture.'); add('shoulders', 'Shoulders balance your hips and add shape.'); }
    else if (type === 'balanced') { add('back', 'Upper-back strength fixes the desk-posture rounding most people have.'); add('glutes', 'Strong glutes protect your knees and lower back.'); add('core', 'A strong trunk protects the lower back.'); }
    else { add('glutes', 'Glutes get two or three sessions a week for lift and shape.'); add('shoulders', 'Rounded shoulders balance your hips and make the waist look smaller.'); add('back', 'Upper-back work improves posture and the line of your back.'); add('legs', 'Strong legs burn the most energy and shape the whole lower body.'); }
  }
  return out.slice(0, 4);
}

function buildAnalysis({ f, type, prefs, goal, body, measures, protein, calories, program, cardio }) {
  const m = measures || {};
  const heightClass = f.tall ? 'taller than average' : f.short ? 'shorter than average' : 'average height';
  const buildClass = f.veryHeavy ? 'higher body weight' : f.heavy ? 'extra body fat' : f.light ? 'lighter build' : 'medium build';
  const hM = f.heightCm / 100;
  const leanKg = body.leanMassKg;
  const ffmi = r1(leanKg / (hM * hM) + 6.1 * (1.8 - hM));
  let band = ffmiBand(f.sex, ffmi);
  let ffmiNote = 'Fat-free mass index: your lean mass compared with your height. An estimate, only as good as the body-fat number.';
  if (band === 'very high') { band = ''; ffmiNote = 'This number is higher than is realistic for most people, so your body-fat estimate is probably too low. Add accurate waist and neck (and hips) measurements.'; }
  const fatKg = r1(f.weightKg - leanKg);

  const proportions = [];
  const whtr = m.waist ? Math.round((m.waist / f.heightCm) * 100) / 100 : null;
  if (whtr !== null) proportions.push({ id: 'whtr', label: 'Waist compared with height', value: whtr, goal: goal.waistCm ? Math.round((goal.waistCm / f.heightCm) * 100) / 100 : null, read: whtr < 0.4 ? 'Very slim waist. Make sure you eat enough.' : whtr < 0.5 ? 'In the healthy range (under 0.5).' : whtr < 0.6 ? 'Above the 0.5 marker. Bringing the waist down is the biggest health win.' : 'High. Start with walking and talk to your doctor about a check-up.' });
  const taper = m.chest && m.waist ? r1(m.chest / m.waist) : null;
  if (taper !== null && f.sex !== 'female') proportions.push({ id: 'taper', label: 'Chest compared with waist', value: taper, goal: type === 'athletic' ? 1.3 : type === 'muscular' ? 1.25 : null, read: taper < 1.1 ? 'Little difference between chest and waist. Shoulder, back and waist work will change this fastest.' : taper < 1.25 ? 'Average. A wider back and smaller waist will improve it.' : taper < 1.35 ? 'Good taper.' : 'Strong taper.' });
  const whr = m.waist && m.hips ? r1(m.waist / m.hips) : null;
  if (whr !== null && f.sex !== 'male') proportions.push({ id: 'whr', label: 'Waist compared with hips', value: whr, goal: 0.85, read: whr < 0.8 ? 'Low, a healthy marker.' : whr < 0.86 ? 'Near the common healthy line (about 0.85).' : 'Above about 0.85. Waist loss and walking help most.' });
  if (!proportions.length) proportions.push({ id: 'none', label: 'Add a waist measurement', value: null, goal: null, read: 'A tape around your waist (and chest) lets the plan read your shape and adjust shoulder, back and waist work.' });

  const adjustments = [];
  const adj = (area, change, why) => adjustments.push({ area, change, why });
  adj('Goal', f.cut ? 'Lift to keep your muscle while fat comes down; volume is capped, strength is the scoreboard.' : f.build ? 'Lift to add muscle; more recovery, less cardio.' : 'Steady weight, getting stronger each week so shape improves.', f.cut ? 'In a calorie deficit, muscle is protected by lifting hard enough, not by lifting more.' + (protein ? ` Protein at about ${protein} g a day does the rest.` : ' Keep your protein high.') : f.build ? 'Muscle grows when you train hard, eat enough protein and recover. Cardio competes for the same energy.' : 'Near your target range, adding muscle at the same weight changes your shape the most.');
  adj('Experience', prefs.level === 'beginner' ? 'Machines and simple free weights first. 3 sets of 8 to 12 reps, stopping with about 3 reps left.' : prefs.level === 'intermediate' ? 'Mix of free weights and machines. 6 to 10 reps on the big lifts, stopping with about 2 reps left.' : 'Heavier main lifts (5 to 8 reps) and more weekly sets. Stopping with about 2 reps left.', prefs.level === 'beginner' ? 'Your first months are about learning the movement and building the habit. Almost any sensible program works, and your strength will rise quickly.' : 'Progress slows with experience, so the plan uses heavier loading and more total work, with an easy week built in.');
  adj('Your week', `${prefs.days} training days of about ${prefs.minutes} minutes (${program.split.toLowerCase()}), with at least one full rest day.`, prefs.days === prefs.recommendedDays ? `${prefs.days} days is the best fit for your goal and experience: enough work to progress, enough rest to recover${f.cut ? ' while eating less' : ''}.` : `${prefs.recommendedDays} days would be the best fit for your goal and experience. Your ${prefs.days} days still works; the plan spreads the work so each muscle gets two good sessions a week where possible.`);
  if (f.tall) adj('Tall frame', 'Leg press, hack squat, box squat and trap-bar lifts come before barbell back squats. Cable and machine rows and pulldowns are preferred. Pull-ups are built up with assisted versions.', 'Long thigh bones push your hips back in a squat, which loads the lower back. Long arms travel further on presses and pull-ups, so they feel harder. Machines fix the path and protect you while you learn.');
  if (f.short) adj('Shorter frame', 'Barbell and goblet squat patterns, floor presses and push-ups are favoured. Machine seats and cable heights are adjusted so handles line up with your chest.', 'Shorter limbs give good leverage on squats, deadlifts and presses, so heavy basic lifts suit you. Add a foot block or seat cushion when handles or platforms are too far away.');
  if (f.veryHeavy) adj('Higher body weight', 'No jumping or running for now. Guided machines first, push-ups start on a bench or wall, cardio is cycling, swimming or the elliptical. Rest between sets is 15 seconds longer.', 'Your joints carry your body weight with every step. Low-impact work builds fitness without overloading knees, hips and back, and you can add impact later as you get lighter. Check that benches and chairs are rated for your weight.');
  else if (f.heavy) adj('Extra body fat', 'Low-impact cardio, stable exercises (machines, supported rows) and an easy cycling or swimming base before any intervals.', 'Extra body fat raises joint load, so the plan builds your capacity first and adds intensity later.');
  if (f.light) adj('Lighter build', 'Heavier compound lifts (leg press, presses, rows), 3 to 4 days, light cardio, and a firm reminder to eat enough.', 'Lighter frames gain muscle fastest from heavy, simple lifts plus a calorie surplus. Cardio and too many exercises burn the energy you need to grow.');
  if (f.female) adj('Women\'s training', 'Glutes get 2 to 3 sessions a week, with hip thrusts and single-leg work. Upper back and shoulders get regular volume. Reps stay in the same ranges as for men.', 'Women build muscle in the same way as men and can lift just as heavy relative to their strength. Lifting does not make you bulky. It firms the hips, legs and arms, and it protects bones.');
  if (f.older) adj(f.senior ? 'Age 60 and over' : 'Age 45 and over', f.senior ? 'Longer warm-up, 3 to 4 days, joint-friendly moves, higher reps (10 to 15), carries and sit-to-stands for daily strength.' : 'Longer warm-up, extra rest, joint-friendly variations first, and effort kept 3 reps from the limit.', 'Muscle and tendon recovery slows with age but responds just as well to lifting. Strength training is the best protection against losing muscle and bone.');
  if (type === 'muscular') adj('Muscle-first goal', 'Heavy compound lifts first (5 to 8 reps), 4 or more days, and a lower weekly cardio load.', 'Muscle size follows how much hard work you can recover from. Cardio is kept light so your food and energy go to the weights.');
  if (type === 'athletic') adj('Athletic goal', 'Shoulder and back width gets extra weekly sets, single-leg work builds balance, and one or two interval sessions are added if your joints and heart allow.', 'The athletic look is a small waist with wide shoulders and a strong back. Single-leg work and intervals build power and speed.');
  if (type === 'lean') adj('Lean and toned goal', '3 full-body sessions, moderate reps (8 to 12 on most lifts) and regular easy cardio.', 'Frequent whole-body training keeps your muscle while you get lean, and the moderate rep range builds the shape you want without much size.');
  if (type === 'balanced') adj('Healthy and balanced goal', 'Shorter sessions, fewer days, and an enjoyable activity every week.', 'Consistency beats intensity. The plan you can keep doing for 6 months beats a perfect plan you drop in 3 weeks.');
  prefs.limits.forEach((l) => adj({ knee: 'Knee pain', back: 'Lower back pain', shoulder: 'Shoulder pain', wrist: 'Wrist pain', elbow: 'Elbow pain', heart: 'Heart or blood pressure' }[l], { knee: 'No deep loaded knee bends, lunges, hack squats or leg extensions. Leg press, step-ups, glute bridges and hip thrusts are used instead.', back: 'No barbell deadlifts or bent-over rows. Supported rows, pulldowns, hip thrusts and cable pull-throughs are used.', shoulder: 'No heavy overhead barbell press, dips or upright rows. Machine and landmine presses, and neutral grips, are used.', wrist: 'Push-ups are done on fists or handles, planks on the forearms, and barbell curls are avoided.', elbow: 'Skull crushers, close-grip push-ups and heavy curls are left out. Cable and light moves are used.', heart: 'Machines, cables and light loads only. Effort stays at 3 reps from the limit, rest is longer, and holds like planks are avoided.' }[l], 'The plan removed anything that commonly aggravates this and kept the muscle work the same. If pain continues, see a physiotherapist.'));
  if (prefs.place === 'home') adj('Training at home', 'Slow tempo, pauses, single-leg and one-arm moves, and loaded backpacks replace heavy weights.', 'Muscle does not care if the load is a barbell or a backpack. It cares about hard sets close to the limit.');
  if (prefs.place === 'both') adj('Gym plus home', 'Every gym exercise has a matching home exercise: same muscles, same movement, same sets, same order. Where your equipment allows it, it is the very same exercise.', 'If you cannot get to the gym, you still train the same muscles with the same effort, so the week stays on track.');

  const focus = focusList(f, type, prefs, taper);

  // How much muscle to expect. Rule-of-thumb ranges from the training literature; people vary a lot.
  const monthly = { beginner: [0.5, 1.0], intermediate: [0.25, 0.5], advanced: [0.1, 0.25] }[prefs.level].map((v) => (f.sex === 'female' ? v / 2 : v));
  const gain = f.build ? monthly : f.recomp ? monthly.map((v) => v / 2) : prefs.level === 'beginner' ? [0, monthly[1] / 3] : [0, 0];
  const expectation = {
    muscleKgPerMonth: [r1(gain[0]), r1(gain[1])],
    fatKgPerWeek: f.cut ? goal.weeklyPaceKg : 0,
    strength: f.cut ? 'Aim to hold your lifts. If they stay level while your waist falls, you are keeping muscle.' : 'Expect your main lifts to rise every 1 to 2 weeks for the first few months.',
    timeline: f.cut ? `About ${goal.weeks} weeks to your target weight. Visible changes in the mirror usually come in weeks 4 to 8.` : 'Strength gains come in weeks 2 to 4. Visible muscle changes usually show in 8 to 12 weeks.',
    caution: 'These are rule-of-thumb ranges. Sleep, food, genes and consistency change them a lot.',
  };

  const recovery = {
    sleepHours: '7 to 9', fullRestDaysPerWeek: f.older ? 2 : 1,
    note: f.cut ? 'Eating less means slower recovery. Sleep is the cheapest recovery tool you have.' : 'Muscles grow while you rest, not while you lift.',
  };

  const warnings = [];
  if (f.build || (f.light && (type === 'muscular' || type === 'athletic'))) warnings.push('Your calorie number is at maintenance. To gain muscle faster, set a target weight a little above your current weight in Goals; the app then adds a small surplus. Without extra food, a lighter frame cannot grow much.');
  if (body.bodyFatSource === 'estimate') warnings.push('Body fat is estimated from height, weight and age and can be off by several points, especially if you are muscular or very small. Add a waist and neck measurement to improve it.');

  const approach = f.cut ? 'The plan protects your muscle while fat comes down: lift to keep your strength, keep your steps up, keep protein high.' : f.build ? 'The plan is built to add muscle: heavy compound lifts, little cardio, enough food.' : 'You are already near your target range, so the plan builds shape with progressive lifting at steady weight.';
  const headline = `${heightClass[0].toUpperCase()}${heightClass.slice(1)}, ${buildClass} (BMI ${body.bmi}, about ${body.bodyFatPct}% body fat). ${approach}`;

  return {
    headline,
    frame: { heightClass, buildClass, bmi: body.bmi, bodyFatPct: body.bodyFatPct, bodyFatSource: body.bodyFatSource, leanMassKg: leanKg, fatMassKg: fatKg, ffmi, ffmiBand: band, ffmiNote },
    proportions, focus, adjustments, expectation, recovery, warnings,
  };
}

// ------------------------------------------------------------------------------------------------------------------ main
/**
 * @param o.profile  sex, age, heightCm
 * @param o.type     'lean' | 'athletic' | 'muscular' | 'balanced'
 * @param o.mode     'lose' | 'recomp' | 'build'
 * @param o.body     { weightKg, heightCm, bmi, bodyFatPct, bodyFatSource, leanMassKg }
 * @param o.goal     { bodyFatBand, targetWeightKg, weeklyPaceKg, weeks, waistCm }
 * @param o.steps    daily step goal
 * @param o.protein  protein grams a day
 * @param o.measures latest tape readings (cm)
 * @param o.prefs    the person's setup (see sanitizePrefs); missing values use defaults and are reported as such
 */
function trainingPlan({ profile = {}, type, mode, body, goal, steps, protein, calories, measures = {}, prefs: rawPrefs } = {}) {
  const sex = profile.sex === 'male' || profile.sex === 'female' ? profile.sex : 'other';
  const f = { ...bodyFlags({ sex, age: num(profile.age), heightCm: body.heightCm, weightKg: body.weightKg, bmi: body.bmi, bfPct: body.bodyFatPct, bandHi: goal.bodyFatBand[1], mode }), steps };
  const prefs = resolvePrefs(rawPrefs, f, type);
  const limits = new Set(prefs.limits);
  const bodyCtx = { tall: f.tall, short: f.short, heavy: f.heavy, older: f.older, female: f.female, light: f.light, type };
  const homeEquip = new Set(prefs.equipment);
  const primaryWhere = prefs.place === 'home' ? 'home' : 'gym';
  const mk = (where) => ({ where, equip: homeEquip, level: prefs.level, limits, body: bodyCtx, flags: f, type, setTrim: trimFor(prefs.days, prefs.level) });
  const ctxPrimary = mk(primaryWhere), ctxHome = mk('home');

  const split = SPLITS[prefs.days];
  const days = designDays(prefs.days, f, type, prefs);
  const seenPrimary = new Set(); // exercises already used this week, so a slot that comes up twice gets a different one
  const sessions = days.map((slots, i) => {
    const kind = sessionKind(slots);
    const exercises = buildExercises(slots, ctxPrimary, true, prefs.minutes, seenPrimary);
    const light = prefs.days === 7 && i === 6; // the seventh day is a short pump-and-core day, so a 7-day week still recovers
    if (light) exercises.forEach((e) => { e.sets = Math.min(e.sets, 2); });
    const session = {
      id: String.fromCharCode(65 + i), title: split.titles[i], where: primaryWhere,
      focus: [...new Set(exercises.flatMap((e) => e.targets))],
      light, minutes: sessionMinutes(exercises), warmup: WARMUP[kind], exercises, cooldown: COOLDOWN, homeBackup: null,
      quick: quickSession(slots, ctxHome, prefs.level),
    };
    if (primaryWhere === 'gym') {
      const hb = buildHomeTwins(exercises, ctxHome);
      session.homeBackup = { title: `${split.titles[i]} at home`, minutes: sessionMinutes(hb), exercises: hb, note: `Same muscles, same sets, same order as the gym version: every exercise has a matching one at home. ` + (prefs.equipment.length ? `Uses what you have: ${prefs.equipment.join(', ')}.` : 'Uses bodyweight, a chair or step, and a backpack or water bottles. Tell the app what equipment you own to get a stronger home version.') };
    }
    return session;
  });

  const active = activeMenu(f, limits, prefs.place);
  const cardio = cardioPlan(f, type, prefs, active);
  const volume = volumeReport(sessions, prefs.level, f);

  // The week: training days, easy-cardio days, and a full rest day.
  const trainDays = prefs.weekdays.length === prefs.days ? prefs.weekdays : WEEK_DAYS[prefs.days];
  let easyLeft = Math.min(cardio.easy.perWeek, 7 - prefs.days - 1);
  const week = DAY.map((d, i) => {
    const t = trainDays.indexOf(i);
    if (t >= 0) return { day: d, kind: 'train', sessionId: sessions[t].id, label: sessions[t].title, minutes: sessions[t].minutes, focus: sessions[t].focus, exerciseCount: sessions[t].exercises.length };
    if (i !== 6 && easyLeft > 0) { easyLeft -= 1; return { day: d, kind: 'active', label: 'Easy cardio or an active day', minutes: cardio.easy.minutes, note: `${cardio.easy.minutes} minutes: ${cardio.options.slice(0, 3).join(', ')}. Pick from the active menu.` }; }
    return { day: d, kind: 'rest', label: i === 6 ? 'Full rest' : 'Rest day', note: 'Stretch or do a light mobility flow if you like. Your steps are tracked separately.' };
  });

  const program = {
    split: split.name, daysPerWeek: prefs.days, minutesPerSession: prefs.minutes, place: prefs.place, level: prefs.level,
    week, sessions, volume, cardio,
    active: { menu: active, minimumDay: { title: 'The 10-minute floor', detail: 'Short on time or energy? Do one round of: 10 squats, 8 push-ups (any version), a 20-second plank, 10 glute bridges. Then 5 minutes of easy stretching. Doing this keeps the habit alive, and a habit is worth more than any single session.' }, restDay: 'On rest days stretch or do a yoga flow. Light movement helps you recover faster than lying still.' },
    progression: progressionPlan(f, prefs.level, prefs.place),
    busyGym: BUSY_GYM,
    equipmentUpgrades: ['A set of resistance bands (cheapest and most useful)', 'Adjustable or fixed dumbbells (filled water cans work in the meantime)', 'A doorway pull-up bar', 'A sturdy bench or chair for step-ups and supported rows'],
    safety: [],
  };
  program.safety = safetyList(f, prefs, program);
  const analysis = buildAnalysis({ f, type, prefs, goal, body, measures, protein, calories, program, cardio });

  const lines = [
    `${split.name}: ${prefs.days} sessions a week of about ${Math.round(sessions.reduce((m, s) => m + s.minutes, 0) / sessions.length)} minutes${prefs.place === 'home' ? ' at home' : prefs.place === 'both' ? ' (gym, with a home version of every day)' : ' at the gym (with a home version of every day)'}.`,
    `Every training day has its own exercise list (${sessions.map((s) => s.title).join(', ')}). Sets, reps, rest and swaps are listed per exercise.`,
    `Cardio: about ${cardio.weeklyEasyMinutes} easy minutes a week${cardio.lowImpactOnly ? ' (low impact)' : ''}, plus ${steps ? steps.toLocaleString() : 'daily'} steps.`,
    'Can not train? Use the Quick 20 or an active day: you still move forward.',
  ];

  return { prefs, program, analysis, summary: lines };
}

const maxDaysFor = (level, age) => maxDays(level || 'beginner', { age: num(age) });
module.exports = { maxDaysFor, trainingPlan, sanitizePrefs, resolvePrefs, bodyFlags, TRAINING_OPTIONS, SPLITS, WEEK_DAYS, scheme, sessionMinutes, ACTIVE_ALL, designDays };
