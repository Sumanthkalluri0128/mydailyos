// Which muscles a workout trains, shown on body pictures. Pure data and rules (no React, no storage): the web app and the phone both pick their pictures
// from THIS file, so the two screens can never disagree.
//
//   regionsFor(exercise)        -> { primary: [regionId], secondary: [regionId] }   (a rule per exercise name; the muscle group is the fallback)
//   tallyOf(exercises)          -> { [regionId]: { level, sets, names } }           (what a list of exercises works, level 'primary' | 'secondary')
//   groupsOf(tally)             -> [{ group, label, regions: [{ id, label, level, sets }] }]   (every muscle of each group touched, so you see which of its muscles)
//   dayExercises(day)           -> the strength exercises of a plan day, whatever shape the day has (blocks or items)
//   weekTally(days)             -> { byDay: [tally], week: { [regionId]: { days, level, sets } } }
//   imagesFor(tally, max)       -> [{ key, file, label, regions, covers, level }]   (the pictures from the muscle image library that best show a day: one for a day with one focus, up to `max` otherwise)
//   weekImages(week)            -> [{ key, file, label, days, level }]              (one picture per muscle the week trains, with how many days work it)
//   MUSCLE_PICS                 -> the library: 26 single muscles (+ Full body), 22 pairs, 15 triples. `file` is the picture's name (public/muscles/<file>.webp on web, assets/muscles on the phone)

export const GROUPS = [
  ['chest', 'Chest'], ['shoulders', 'Shoulders'], ['back', 'Back'], ['arms', 'Arms'], ['core', 'Core'], ['legs', 'Legs'], ['glutes', 'Glutes'],
];
export const GROUP_LABEL = Object.fromEntries(GROUPS);

// id, group, plain label, what the muscle is called in a gym
export const REGION_DEFS = [
  ['chest-upper', 'chest', 'Upper chest', 'clavicular pec'], ['chest-mid', 'chest', 'Middle chest', 'sternal pec'], ['chest-lower', 'chest', 'Lower chest', 'costal pec'],
  ['delt-front', 'shoulders', 'Front shoulder', 'front delt'], ['delt-side', 'shoulders', 'Side shoulder', 'side delt'], ['delt-rear', 'shoulders', 'Rear shoulder', 'rear delt'],
  ['traps-upper', 'back', 'Upper traps', 'neck to shoulder'], ['traps-mid', 'back', 'Mid back', 'mid traps and rhomboids'], ['lats', 'back', 'Lats', 'side of the back'], ['lower-back', 'back', 'Lower back', 'spine erectors'],
  ['biceps', 'arms', 'Biceps', 'front of the arm'], ['triceps', 'arms', 'Triceps', 'back of the arm'], ['forearms', 'arms', 'Forearms', 'grip'],
  ['abs-upper', 'core', 'Upper abs', 'upper rectus'], ['abs-lower', 'core', 'Lower abs', 'lower rectus'], ['obliques', 'core', 'Obliques', 'sides of the waist'],
  ['quad-outer', 'legs', 'Outer quads', 'vastus lateralis'], ['quad-mid', 'legs', 'Centre quads', 'rectus femoris'], ['quad-inner', 'legs', 'Inner quads', 'vastus medialis'],
  ['adductors', 'legs', 'Inner thigh', 'adductors'], ['hamstrings', 'legs', 'Hamstrings', 'back of the thigh'], ['calves', 'legs', 'Calves', 'lower leg'],
  ['glute-max', 'glutes', 'Glutes', 'gluteus maximus'], ['glute-med', 'glutes', 'Side glutes', 'gluteus medius'],
];
export const REGIONS = REGION_DEFS.map(([id, group, label, note]) => ({ id, group, label, note }));
export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------------------------------------------- exercise -> muscles
// First rule that matches the lower-cased name wins, so specific names come before general ones.
const r = (re, primary, secondary = []) => ({ re, primary, secondary });
const LEGS_LIGHT = ['quad-outer', 'quad-mid', 'hamstrings', 'calves', 'glute-max'];
const RULES = [
  // core moves that share words with others
  r(/decline sit-?up|sit-?up|crunch machine|ab crunch|cable crunch|^crunch|v-up|toe touch|ab wheel|rollout/, ['abs-upper', 'abs-lower'], ['obliques']),
  r(/bicycle crunch|russian twist|woodchop|pallof|side plank|torso twist/, ['obliques'], ['abs-upper', 'abs-lower']),
  r(/reverse crunch|leg raise|knee raise|flutter|captain|l-sit|hanging/, ['abs-lower'], ['abs-upper', 'obliques']),
  r(/plank|hollow|mountain climber|dead bug/, ['abs-upper', 'abs-lower'], ['obliques', 'delt-front']),
  r(/bird dog|superman|back extension|hyperextension/, ['lower-back'], ['glute-max', 'hamstrings']),
  // lower-body names that contain words used by arm rules (curl, extension, kickback): they must come first
  r(/leg curl|nordic|hamstring curl|hamstring lower/, ['hamstrings'], ['calves']),
  r(/leg extension|sissy/, ['quad-outer', 'quad-mid', 'quad-inner'], []),
  r(/glute kickback|donkey|glute kick/, ['glute-max'], ['hamstrings', 'glute-med']),
  r(/hip abduction|fire hydrant|banded lateral|lateral walk|clam|side-lying hip/, ['glute-med'], ['glute-max']),
  r(/calf/, ['calves'], []),
  // dips and presses that blur chest and triceps
  r(/assisted dip/, ['chest-lower', 'triceps'], ['delt-front']),
  r(/chest dip/, ['chest-lower'], ['triceps', 'delt-front', 'chest-mid']),
  r(/triceps dip|bench dip|chair dip|parallel-bar|\bdip\b/, ['triceps'], ['chest-lower', 'delt-front']),
  r(/close-grip bench|svend|close-grip push-?up|diamond/, ['triceps', 'chest-mid'], ['delt-front', 'chest-lower']),
  // shoulders (before the chest rules: a pike push-up and a rear-delt fly are not chest moves)
  r(/pike push-?up/, ['delt-front', 'delt-side'], ['triceps', 'traps-upper', 'chest-upper']),
  r(/rear delt|rear shoulder|reverse pec|reverse fly|rear fly|face pull|pull-apart|prone y/, ['delt-rear'], ['traps-mid', 'biceps']),
  // chest. Push-ups first: hands raised shifts the work to the lower chest, feet raised to the upper chest. For presses and flies it is the other way round.
  r(/incline.*push-?up|knee push-?up|wall push-?up/, ['chest-lower', 'chest-mid'], ['delt-front', 'triceps']),
  r(/decline.*push-?up|feet on|feet elevated/, ['chest-upper'], ['chest-mid', 'delt-front', 'triceps']),
  r(/incline.*(press|fly)|low[- ]to[- ]high|landmine press/, ['chest-upper'], ['chest-mid', 'delt-front', 'triceps']),
  r(/decline.*(press|fly)|high[- ]to[- ]low/, ['chest-lower'], ['chest-mid', 'triceps', 'delt-front']),
  r(/pec deck|fly|flye|crossover|palm press|chest squeeze/, ['chest-mid'], ['chest-upper', 'chest-lower', 'delt-front']),
  r(/pullover/, ['chest-mid', 'lats'], ['triceps']),
  r(/push-?up|press-?up|bench press|chest press|dumbbell press|cable chest|machine chest|floor press|banded chest/, ['chest-mid'], ['chest-upper', 'chest-lower', 'delt-front', 'triceps']),
  // shoulders
  r(/overhead press|shoulder press|arnold|push press|military|kettlebell press|overhead (?!.*extension)/, ['delt-front', 'delt-side'], ['triceps', 'traps-upper', 'chest-upper']),
  r(/lateral raise|upright row/, ['delt-side'], ['traps-upper', 'delt-front']),
  r(/front raise/, ['delt-front'], ['chest-upper', 'delt-side']),
  r(/shrug/, ['traps-upper'], ['traps-mid', 'forearms']),
  // back
  r(/pull-?up|chin-?up|pulldown|pull-down|straight-arm|assisted pull/, ['lats'], ['biceps', 'traps-mid', 'delt-rear', 'forearms']),
  r(/romanian|stiff-leg|single-leg romanian/, ['hamstrings', 'glute-max'], ['lower-back', 'forearms']),
  r(/deadlift|rack pull|good morning/, ['lower-back', 'glute-max', 'hamstrings'], ['traps-upper', 'traps-mid', 'forearms', 'quad-outer']),
  r(/\brow\b|row$|renegade|door row/, ['traps-mid', 'lats'], ['biceps', 'delt-rear', 'lower-back', 'forearms']),
  // arms
  r(/skull|triceps|pushdown|kickback|extension/, ['triceps'], ['forearms']),
  r(/wrist curl/, ['forearms'], []),
  r(/hammer|reverse barbell curl|zottman|rope hammer/, ['biceps', 'forearms'], []),
  r(/curl/, ['biceps'], ['forearms']),
  // glutes
  r(/hip thrust|glute bridge|frog pump|pull-through|glute/, ['glute-max'], ['hamstrings', 'glute-med']),
  // legs
  r(/hip adduction|sumo squat/, ['adductors'], ['glute-max', 'quad-inner']),
  r(/bulgarian|lunge|step-?up|split squat/, ['quad-outer', 'quad-mid', 'glute-max'], ['hamstrings', 'adductors', 'calves', 'quad-inner']),
  r(/hack squat|front squat|leg press|squat|sit-to-stand|wall sit|box jump|jump squat/, ['quad-outer', 'quad-mid', 'quad-inner', 'glute-max'], ['hamstrings', 'adductors', 'lower-back', 'calves']),
  // whole body
  r(/thruster|clean|snatch/, ['quad-outer', 'quad-mid', 'glute-max', 'delt-front'], ['traps-upper', 'triceps', 'hamstrings', 'lower-back']),
  r(/swing/, ['glute-max', 'hamstrings'], ['lower-back', 'delt-front', 'abs-upper']),
  r(/farmer|carry/, ['forearms', 'traps-upper'], ['abs-upper', 'obliques', 'quad-outer']),
  r(/turkish/, ['obliques', 'delt-front'], ['glute-max', 'abs-upper']),
  r(/slam|wall ball/, ['abs-upper', 'lats'], ['delt-front', 'quad-outer']),
];
// Cardio has no heavy muscle work: a light touch (secondary level only) on what it uses, nothing for the rest.
const CARDIO = [
  r(/treadmill|cycl|bike|elliptical|stair|running|\brun\b|walk|jog|sled|rowing machine/, [], LEGS_LIGHT),
  r(/jump rope|high knees|burpee|hiit/, [], ['quad-outer', 'quad-mid', 'calves', 'glute-max']),
  r(/battle rope/, [], ['delt-front', 'lats', 'abs-upper']),
  r(/swim/, [], ['lats', 'delt-front', 'triceps']),
  r(/boxing|heavy bag/, [], ['delt-front', 'triceps', 'obliques']),
];
// A smart-plan exercise also carries the slot it fills; used only when no name rule matched.
const SLOT_MAP = {
  ipress: [['chest-upper'], ['chest-mid', 'delt-front', 'triceps']], hpress: [['chest-mid'], ['chest-upper', 'chest-lower', 'delt-front', 'triceps']], fly: [['chest-mid'], ['chest-upper', 'chest-lower']],
  vpress: [['delt-front', 'delt-side'], ['triceps']], lateral: [['delt-side'], []], rear: [['delt-rear', 'traps-mid'], []],
  tri: [['triceps'], []], bicep: [['biceps'], ['forearms']], vpull: [['lats'], ['biceps']], hrow: [['traps-mid', 'lats'], ['biceps', 'delt-rear']],
  squat: [['quad-outer', 'quad-mid', 'quad-inner', 'glute-max'], ['hamstrings', 'adductors']], hinge: [['hamstrings', 'glute-max'], ['lower-back']], lunge: [['quad-outer', 'quad-mid', 'glute-max'], ['hamstrings', 'adductors']],
  glute: [['glute-max'], ['hamstrings']], quad: [['quad-outer', 'quad-mid', 'quad-inner'], []], ham: [['hamstrings'], ['glute-max']], calf: [['calves'], []], core: [['abs-upper', 'abs-lower'], ['obliques']],
};

// When no rule knows the name: the exercise's own muscle group.
const GROUP_FALLBACK = {
  chest: [['chest-mid'], ['chest-upper', 'chest-lower', 'delt-front', 'triceps']],
  back: [['lats', 'traps-mid'], ['biceps', 'delt-rear']],
  shoulders: [['delt-front', 'delt-side'], ['triceps']],
  arms: [['biceps', 'triceps'], ['forearms']],
  legs: [['quad-outer', 'quad-mid', 'hamstrings'], ['calves', 'glute-max']],
  glutes: [['glute-max'], ['glute-med', 'hamstrings']],
  core: [['abs-upper', 'abs-lower'], ['obliques']],
  'full body': [['quad-outer', 'glute-max', 'lats'], ['delt-front', 'abs-upper']],
};
// Other names a muscle group goes by.
const GROUP_ALIAS = { pecs: 'chest', lats: 'back', traps: 'back', 'upper back': 'back', 'lower back': 'back', delts: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms', quads: 'legs', hamstrings: 'legs', calves: 'legs', abs: 'core', obliques: 'core' };
const groupKey = (x) => { const k = String(x == null ? '' : x).toLowerCase(); return GROUP_FALLBACK[k] ? k : GROUP_ALIAS[k] || ''; };

const low = (s) => String(s == null ? '' : s).toLowerCase();
const uniq = (l) => [...new Set(l)];

/** The regions one exercise works: { primary, secondary } (both may be empty: mobility, stretches, unknown). */
export function regionsFor(ex = {}) {
  const name = low(ex.name);
  const cat = low(ex.cat);
  const out = (rule) => ({ primary: rule.primary.slice(), secondary: rule.secondary.slice() });
  if (/stretch|mobility|circles|cat-cow|opener|yoga|foam roll/.test(name)) return { primary: [], secondary: [] };
  if (cat === 'cardio' || cat === 'mobility') { const hit = CARDIO.find((x) => x.re.test(name)); return hit ? out(hit) : { primary: [], secondary: [] }; }
  for (const rule of RULES) if (rule.re.test(name)) return out(rule);
  const hit = CARDIO.find((x) => x.re.test(name));
  if (hit) return out(hit);
  const slot = SLOT_MAP[low(ex.slot)];
  if (slot) return { primary: slot[0].slice(), secondary: slot[1].slice() };
  const own = GROUP_FALLBACK[groupKey(cat)];
  if (own) return { primary: own[0].slice(), secondary: own[1].slice() };
  const t = (ex.targets || []).map(groupKey).filter(Boolean);   // library and smart-plan items list their groups ("chest", "arms")
  if (t.length) {
    const first = GROUP_FALLBACK[t[0]];
    return { primary: first[0].slice(), secondary: uniq([...first[1], ...t.slice(1).flatMap((g) => GROUP_FALLBACK[g][0])]).filter((x) => !first[0].includes(x)) };
  }
  return { primary: [], secondary: [] };
}

/** What a list of exercises works. Each entry: { name, cat?, targets?, sets? } (sets default 1). A region is 'primary' if any exercise works it as a main muscle. */
export function tallyOf(exercises) {
  const out = {};
  for (const ex of exercises || []) {
    if (!ex) continue;
    const { primary, secondary } = regionsFor(ex);
    const sets = Math.max(1, Math.round(Number(ex.sets) || 1));
    const put = (id, level) => {
      const t = out[id] || (out[id] = { level: 'secondary', sets: 0, names: [] });
      if (level === 'primary') t.level = 'primary';
      t.sets += level === 'primary' ? sets : Math.ceil(sets / 2);
      if (ex.name && !t.names.includes(ex.name)) t.names.push(ex.name);
    };
    primary.forEach((id) => put(id, 'primary'));
    secondary.forEach((id) => { if (!primary.includes(id)) put(id, 'secondary'); });
  }
  return out;
}

/** The tally grouped by muscle group, listing EVERY muscle of a group that is touched (so "chest: upper, middle, lower" shows which one you hit). */
export function groupsOf(tally) {
  const out = [];
  for (const [group, label] of GROUPS) {
    const all = REGIONS.filter((x) => x.group === group);
    if (!all.some((x) => tally[x.id])) continue;
    out.push({
      group, label,
      regions: all.map((x) => ({ id: x.id, label: x.label, note: x.note, level: tally[x.id] ? tally[x.id].level : '', sets: tally[x.id] ? tally[x.id].sets : 0 })),
    });
  }
  return out;
}

/** The strength exercises of a plan day as { id, name, cat, targets, sets }, from either shape: unified days (blocks of type "sets") or custom-plan days (items). */
export function dayExercises(day) {
  if (!day) return [];
  const pick = (e) => ({ id: e.id, name: e.name, cat: e.cat || '', slot: e.slot || '', targets: e.targets || [], sets: Number(e.sets) || 1 });
  if (Array.isArray(day.items)) return day.items.map(pick);
  const out = [];
  for (const b of day.blocks || []) if (b.type === 'sets') for (const e of b.items || []) out.push(pick(e));
  return out;
}

/** Every day of a week: one tally per day, plus how many days of the week work each region. */
export function weekTally(days) {
  const byDay = (days || []).map((d) => tallyOf(dayExercises(d)));
  const week = {};
  byDay.forEach((t) => {
    for (const [id, x] of Object.entries(t)) {
      const w = week[id] || (week[id] = { days: 0, level: 'secondary', sets: 0 });
      w.days += 1; w.sets += x.sets;
      if (x.level === 'primary') w.level = 'primary';
    }
  });
  return { byDay, week };
}

/** "Chest (upper, middle), Triceps": a short line for a day. */
export function summaryLine(tally, max = 4) {
  const parts = [];
  for (const g of groupsOf(tally)) {
    const hit = g.regions.filter((x) => x.level === 'primary');
    if (!hit.length) continue;
    parts.push(hit.length === g.regions.length || g.regions.length === 1 ? g.label : `${g.label} (${hit.map((x) => x.label.replace(/ (chest|shoulder|abs|quads|glutes)$/i, '').toLowerCase()).join(', ')})`);
  }
  return parts.slice(0, max).join(', ');
}

// ---------------------------------------------------------------------------------------------------------------- the picture library
// Real body pictures (front and back, main muscle red, helper muscle orange, the rest grey). Each one lists the regions it lights up, so a day can be matched to the picture that shows it best.
const CHEST3 = ['chest-upper', 'chest-mid', 'chest-lower'], DELT3 = ['delt-front', 'delt-side', 'delt-rear'];
const BACK2 = ['lats', 'traps-mid'], ARMS3 = ['biceps', 'triceps', 'forearms'], ABS2 = ['abs-upper', 'abs-lower'];
const QUADS3 = ['quad-outer', 'quad-mid', 'quad-inner'], GLUTES2 = ['glute-max', 'glute-med'];
// [key, label, regions it lights up]. A "+" in the key = a combination picture; the file name swaps "+" for "_".
const SINGLES = [
  ['chest', 'Chest', CHEST3], ['upper-chest', 'Upper chest', ['chest-upper']], ['middle-chest', 'Middle chest', ['chest-mid']], ['lower-chest', 'Lower chest', ['chest-lower']],
  ['shoulders', 'Shoulders', DELT3], ['front-delts', 'Front shoulders', ['delt-front']], ['side-delts', 'Side shoulders', ['delt-side']], ['rear-delts', 'Rear shoulders', ['delt-rear']],
  ['biceps', 'Biceps', ['biceps']], ['triceps', 'Triceps', ['triceps']], ['forearms', 'Forearms', ['forearms']],
  ['traps', 'Traps', ['traps-upper']], ['lats', 'Lats', ['lats']], ['mid-back', 'Mid back', ['traps-mid']], ['lower-back', 'Lower back', ['lower-back']],
  ['abs', 'Abs', ABS2], ['obliques', 'Obliques', ['obliques']],
  ['glutes', 'Glutes', GLUTES2], ['quads', 'Quads', QUADS3], ['hamstrings', 'Hamstrings', ['hamstrings']], ['calves', 'Calves', ['calves']],
  ['inner-thighs', 'Inner thighs', ['adductors']], ['back', 'Back', [...BACK2, 'traps-upper']],
  ['legs', 'Legs', [...QUADS3, 'adductors', 'hamstrings', ...GLUTES2, 'calves']],
  ['upper-body', 'Upper body', [...CHEST3, ...DELT3, ...BACK2, 'traps-upper', 'biceps', 'triceps', 'forearms']],
  ['full-body', 'Full body', REGION_DEFS.map((d) => d[0])],
];
const COMBOS = [
  ['chest+shoulders', 'Chest + Shoulders', [...CHEST3, ...DELT3]], ['chest+triceps', 'Chest + Triceps', [...CHEST3, 'triceps']], ['shoulders+triceps', 'Shoulders + Triceps', [...DELT3, 'triceps']],
  ['back+biceps', 'Back + Biceps', [...BACK2, 'biceps']], ['back+traps', 'Back + Traps', [...BACK2, 'traps-upper']],
  ['quads+hamstrings', 'Quads + Hamstrings', [...QUADS3, 'hamstrings']], ['glutes+hamstrings', 'Glutes + Hamstrings', [...GLUTES2, 'hamstrings']],
  ['chest+shoulders+triceps', 'Chest + Shoulders + Triceps', [...CHEST3, ...DELT3, 'triceps']], ['back+biceps+traps', 'Back + Biceps + Traps', [...BACK2, 'biceps', 'traps-upper']],
  ['quads+hamstrings+glutes', 'Quads + Hamstrings + Glutes', [...QUADS3, 'hamstrings', ...GLUTES2]], ['chest+back+arms', 'Chest + Back + Arms', [...CHEST3, ...BACK2, ...ARMS3]],
  ['shoulders+biceps+triceps', 'Shoulders + Biceps + Triceps', [...DELT3, 'biceps', 'triceps']], ['abs+obliques+lowerback', 'Abs + Obliques + Lower back', [...ABS2, 'obliques', 'lower-back']],
  // second batch (grey body set)
  ['biceps+triceps', 'Biceps + Triceps', ['biceps', 'triceps']], ['chest+back', 'Chest + Back', [...CHEST3, ...BACK2]], ['back+shoulders', 'Back + Shoulders', [...BACK2, ...DELT3]],
  ['lats+biceps', 'Lats + Biceps', ['lats', 'biceps']], ['biceps+forearms', 'Biceps + Forearms', ['biceps', 'forearms']], ['quads+calves', 'Quads + Calves', [...QUADS3, 'calves']],
  ['hamstrings+calves', 'Hamstrings + Calves', ['hamstrings', 'calves']], ['glutes+quads', 'Glutes + Quads', [...GLUTES2, ...QUADS3]], ['glutes+calves', 'Glutes + Calves', [...GLUTES2, 'calves']],
  ['abs+obliques', 'Abs + Obliques', [...ABS2, 'obliques']], ['abs+quads', 'Abs + Quads', [...ABS2, ...QUADS3]], ['abs+shoulders', 'Abs + Shoulders', [...ABS2, ...DELT3]],
  ['chest+biceps', 'Chest + Biceps', [...CHEST3, 'biceps']], ['back+triceps', 'Back + Triceps', [...BACK2, 'triceps']], ['shoulders+traps', 'Shoulders + Traps', [...DELT3, 'traps-upper']],
  ['quads+glutes+calves', 'Quads + Glutes + Calves', [...QUADS3, ...GLUTES2, 'calves']], ['hamstrings+glutes+calves', 'Hamstrings + Glutes + Calves', ['hamstrings', ...GLUTES2, 'calves']],
  ['abs+quads+calves', 'Abs + Quads + Calves', [...ABS2, ...QUADS3, 'calves']], ['chest+back+shoulders', 'Chest + Back + Shoulders', [...CHEST3, ...BACK2, ...DELT3]],
  ['chest+biceps+triceps', 'Chest + Biceps + Triceps', [...CHEST3, 'biceps', 'triceps']], ['back+biceps+forearms', 'Back + Biceps + Forearms', [...BACK2, 'biceps', 'forearms']],
  ['back+shoulders+biceps', 'Back + Shoulders + Biceps', [...BACK2, ...DELT3, 'biceps']], ['biceps+triceps+forearms', 'Biceps + Triceps + Forearms', ['biceps', 'triceps', 'forearms']],
  ['lats+biceps+rear-delts', 'Lats + Biceps + Rear shoulders', ['lats', 'biceps', 'delt-rear']],
];
// Every picture is shown in a box this wide / tall (the old sheet's wide crops and the newer full-body ones both fit it, on black).
export const PIC_RATIO = 1.3;
export const MUSCLE_PICS = [...SINGLES, ...COMBOS].map(([key, label, regions]) => ({ key, file: key.replace(/\+/g, '_'), label, regions }));
export const MUSCLE_PIC = Object.fromEntries(MUSCLE_PICS.map((x) => [x.key, x]));

/**
 * The pictures that show what a day trains. Looks at the MAIN muscles (or the helpers when a day has no main one, e.g. cardio), then repeatedly takes
 * the picture that lights up the most of what is still missing without lighting up much else, so a chest + back + arms day gets the one
 * "Chest + Back + Arms" picture first and then a picture for each leftover (abs, shoulders). At most `max` pictures; the muscle list under them names every one.
 * Each entry: { key, file, label, regions, covers (the needed regions this picture shows), level: 'primary' | 'secondary' }.
 */
export function imagesFor(tally, max = 4) {
  const entries = Object.entries(tally || {});
  const main = entries.filter(([, x]) => x.level === 'primary').map(([id]) => id);
  const level = main.length ? 'primary' : 'secondary';
  const need = new Set(main.length ? main : entries.map(([id]) => id));
  const out = [];
  while (need.size && out.length < max) {
    let best = null, top = 0;
    for (const p of MUSCLE_PICS) {
      const hit = p.regions.filter((id) => need.has(id)).length;
      if (!hit) continue;
      const score = hit - 0.5 * (p.regions.length - hit);    // lighting up muscles that are not trained costs half a point each
      if (score > top || (score === top && best && p.regions.length < best.regions.length)) { best = p; top = score; }
    }
    if (!best) break;
    out.push({ ...best, covers: best.regions.filter((id) => need.has(id)), level });
    best.regions.forEach((id) => need.delete(id));
  }
  return out;
}

const WEEK_KEYS = ['chest', 'shoulders', 'lats', 'mid-back', 'traps', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'lower-back', 'glutes', 'quads', 'hamstrings', 'calves'];
/** One picture per muscle the week trains: { key, file, label, days (most days any part of it is worked), level }. Main-muscle pictures first, then by days. */
export function weekImages(week) {
  const out = [];
  for (const key of WEEK_KEYS) {
    const p = MUSCLE_PIC[key];
    const hit = p.regions.map((id) => (week || {})[id]).filter(Boolean);
    if (!hit.length) continue;
    out.push({ key, file: p.file, label: p.label, days: Math.max(...hit.map((x) => x.days)), level: hit.some((x) => x.level === 'primary') ? 'primary' : 'secondary' });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'primary' ? -1 : 1) || b.days - a.days);
}
