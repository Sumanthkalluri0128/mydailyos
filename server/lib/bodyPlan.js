// Body plan: the person picks the body they are aiming for (lean, athletic, muscular, balanced); this turns that choice plus their
// measurements into a plan: a target weight and waist, a safe pace, calories, macros, training, the vitamins and minerals that matter
// while eating less, and the safety checks. Pure (no database), so it is unit-tested and the phone can show the same numbers.
//
// Honest limits: body fat from a tape or from height/weight/age is an ESTIMATE (a few points either way), and every target here is a
// starting point to adjust from the real trend, not a promise. Adults only.
const { expectedEnergy, resolveTargets, BODY_TYPES, waterTargetMl, KCAL_PER_KG } = require('./energy');
const { trainingPlan } = require('./trainingPlan');
const { navyBodyFat } = require('./bodyFat');
const { maxSafeWeeklyLossKg } = require('./trendWeight');

const r1 = (x) => Math.round(x * 10) / 10;
const r05 = (x) => Math.round(x * 2) / 2;
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

// Healthy-athletic body-fat bands (% of body weight) per goal and sex. 'other' uses the mid-point of the two.
const TYPES = {
  lean: {
    label: 'Lean & toned', blurb: 'Slim waist, visible shape, strong but not bulky.',
    bf: { male: [12, 16], female: [20, 25] }, waistToHeight: 0.47, maxLossPctPerWeek: 0.0075, strengthDays: 3, steps: 9000,
  },
  athletic: {
    label: 'Athletic', blurb: 'Broad shoulders, small waist, strong and fast.',
    bf: { male: [10, 14], female: [18, 23] }, waistToHeight: 0.47, maxLossPctPerWeek: 0.0075, strengthDays: 4, steps: 9000,
  },
  muscular: {
    label: 'Strong & muscular', blurb: 'More muscle first. Fat comes down slowly so strength is kept.',
    bf: { male: [12, 18], female: [20, 26] }, waistToHeight: 0.47, maxLossPctPerWeek: 0.005, strengthDays: 4, steps: 8000,
  },
  balanced: {
    label: 'Healthy & balanced', blurb: 'Fit, comfortable, easy to keep. No extreme leanness.',
    bf: { male: [16, 21], female: [24, 30] }, waistToHeight: 0.5, maxLossPctPerWeek: 0.0075, strengthDays: 2, steps: 8000,
  },
};
const TYPE_IDS = Object.keys(TYPES);

// Vitamins and minerals that run short when calories go down. Reference intakes do not drop on a diet; the risk is eating too little of them.
const DEFICIT_MICROS = [
  { id: 'iron', label: 'Iron', why: 'Low iron brings tiredness and breathlessness, and is common when eating less', foods: 'lentils, chickpeas, spinach, jaggery, eggs, lean meat. Add lemon or amla for absorption', sexes: ['female', 'other'] },
  { id: 'calcium', label: 'Calcium', why: 'Needed for bones, which are at risk when intake is low and weight falls', foods: 'milk, curd, paneer, ragi, sesame, tofu, fortified drinks' },
  { id: 'vitaminD', label: 'Vitamin D', why: 'Helps bones and muscles. Hard to get from food alone', foods: 'sun in the morning, eggs, fish, fortified milk. A blood test tells if you need a supplement' },
  { id: 'vitaminB12', label: 'Vitamin B12', why: 'Energy and nerves. Short in vegetarian and low-meat diets', foods: 'milk, curd, eggs, fish, fortified foods. A supplement may be needed if vegetarian' },
  { id: 'magnesium', label: 'Magnesium', why: 'Muscle recovery, sleep and cramps', foods: 'nuts, seeds, oats, whole grains, beans, leafy greens' },
  { id: 'potassium', label: 'Potassium', why: 'Fluid balance and muscle work; falls fast when fresh food is cut', foods: 'banana, coconut water, potato, beans, tomato, leafy greens' },
  { id: 'zinc', label: 'Zinc', why: 'Recovery and immunity', foods: 'pumpkin seeds, chickpeas, nuts, eggs, meat, whole grains' },
];

/** Body fat %: tape (US Navy) when waist + neck (+ hips for women) are known, otherwise an estimate from BMI, age and sex. */
function bodyFatNow({ sex, age, heightCm, weightKg, measures = {} }) {
  const navy = navyBodyFat({ sex: sex === 'female' ? 'female' : 'male', heightCm, waistCm: measures.waist, neckCm: measures.neck, hipCm: measures.hips });
  if (navy !== null) return { pct: navy, source: 'tape' };
  const bmi = weightKg / ((heightCm / 100) ** 2);
  const male = sex === 'male' ? 1 : sex === 'female' ? 0 : 0.5;
  const est = 1.2 * bmi + 0.23 * age - 10.8 * male - 5.4; // Deurenberg: a population estimate, can be several points off for muscular or very small frames
  return { pct: r1(Math.min(55, Math.max(5, est))), source: 'estimate' };
}

const bandFor = (type, sex) => {
  const b = TYPES[type].bf;
  if (sex === 'male') return b.male;
  if (sex === 'female') return b.female;
  return [Math.round((b.male[0] + b.female[0]) / 2), Math.round((b.male[1] + b.female[1]) / 2)];
};

/**
 * @param o.profile   Profile-like: sex, age, heightCm, currentWeightKg, activityLevel, goals
 * @param o.type      'lean' | 'athletic' | 'muscular' | 'balanced'
 * @param o.measures  latest tape readings in cm: { waist, neck, hips, chest, arm, thigh } (any may be missing)
 * @param o.prefs     training setup (place, level, days, minutes, equipment, limits, focus): see lib/trainingPlan sanitizePrefs
 */
function bodyPlan({ profile = {}, type, measures = {}, prefs, fresh = false } = {}) {
  if (!TYPES[type]) return { ready: false, reason: 'pick-type', message: 'Choose the body you are aiming for to get a plan.' };
  const w = num(profile.currentWeightKg), h = num(profile.heightCm), age = num(profile.age);
  const sex = profile.sex === 'male' || profile.sex === 'female' ? profile.sex : 'other';
  const missing = [];
  if (!(w > 0)) missing.push('currentWeightKg');
  if (!(h > 0)) missing.push('heightCm');
  if (!(age > 0)) missing.push('age');
  if (!profile.sex) missing.push('sex');
  if (missing.length) return { ready: false, reason: 'missing-profile', missing, message: 'Add your weight, height, age and sex so the plan fits your body.' };
  if (age < 18) return { ready: false, reason: 'adult-only', message: 'Body plans with calorie targets are for adults. Growing bodies need food, not targets. Please talk to a doctor or dietitian.' };

  const t = TYPES[type];
  const m = Object.fromEntries(Object.entries(measures).map(([k, x]) => [k, num(x)]).filter(([, x]) => x > 0));
  const bf = bodyFatNow({ sex, age, heightCm: h, weightKg: w, measures: m });
  const [bfLo, bfHi] = bandFor(type, sex);
  const bfGoal = r1((bfLo + bfHi) / 2);
  const bmi = w / ((h / 100) ** 2);
  const lean = w * (1 - bf.pct / 100);
  const safety = [];

  // Where should the scale end up? Keep the muscle you have, lose only the fat above the band's mid-point.
  let targetKg = w, mode = 'recomp';
  if (bmi < 18.5) {
    mode = 'build';
    safety.push({ id: 'underweight', level: 'alert', title: 'Your weight is already low for your height', detail: 'Losing more is not advised. Focus on eating enough and strength training. Please talk to a doctor or dietitian.' });
  } else if (bf.pct > bfHi + 1) {
    mode = 'lose';
    targetKg = r05(lean / (1 - bfGoal / 100));
    const minKg = r05(18.5 * ((h / 100) ** 2) + 0.5); // never aim below a healthy BMI
    if (targetKg < minKg) { targetKg = minKg; safety.push({ id: 'target-raised', level: 'notice', title: 'Target kept at a healthy weight', detail: `A lower weight than ${minKg} kg would be below the healthy range for your height, so the plan stops there.` }); }
    if (targetKg > w) targetKg = w;
  } else if (bf.pct < bfLo - 1 && sex !== 'other') {
    mode = 'build';
  }

  const lossKg = r1(Math.max(0, w - targetKg));
  const safeCap = maxSafeWeeklyLossKg(w);
  let pace = mode === 'lose' ? Math.min(safeCap, w * t.maxLossPctPerWeek) : 0;
  pace = mode === 'lose' ? Math.max(0.2, Math.round(pace * 20) / 20) : 0;
  // Once this body goal is saved, follow the person's LIVE settings (the pace the coach may have adjusted, a manual calorie number), so this
  // page shows exactly the numbers Home and the phone use. Only a different goal being previewed starts from the fresh calculation.
  const g0 = profile.goals || {};
  const followSaved = !fresh && mode === 'lose' && g0.bodyType === type && !!g0.bodyPlanStartedOn;
  if (followSaved && Number(g0.weeklyPaceKg) > 0) pace = Math.min(1, Math.max(0.1, Number(g0.weeklyPaceKg)));

  // Calories and macros through the same engine the rest of the app uses, so Home shows exactly this.
  const planProfile = { ...profile, goals: { ...(profile.goals || {}), targetWeightKg: mode === 'lose' ? targetKg : null, weeklyPaceKg: pace || 0.5, calorieMode: followSaved || (!fresh && g0.bodyType === type && g0.bodyPlanStartedOn) ? (g0.calorieMode || 'auto') : 'auto', bodyType: type, proteinTarget: null } };
  let e = expectedEnergy(planProfile);
  // When the safety floor limits the calories, the pace we promised cannot be reached. Slow it to what the food allows, so the weeks
  // and checkpoints are honest, and recompute through the same engine so Home still shows exactly these numbers.
  let paceSlowed = false, noRoom = false;
  if (mode === 'lose' && e && e.atFloor) {
    const room = Math.max(0, e.tdee - e.calorieTarget);
    const reachable = (room * 7) / KCAL_PER_KG;
    if (reachable < 0.1) noRoom = true;
    const slower = Math.max(0.1, Math.floor(reachable * 20) / 20);
    if (slower < pace) { pace = slower; paceSlowed = true; planProfile.goals.weeklyPaceKg = pace; e = expectedEnergy(planProfile); }
  }
  const weeks = mode === 'lose' && pace > 0 ? Math.ceil(lossKg / pace) : 0;
  const calories = e ? e.calorieTarget : null;
  const macros = calories ? resolveTargets(planProfile).macros : null;
  if (e && e.atFloor) safety.push({ id: 'at-floor', level: 'notice', title: 'Calories held at a safe minimum', detail: 'Your numbers would need fewer calories than is safe, so the plan stops at the floor and the pace is slower. More walking helps more than eating less.' });
  if (paceSlowed) safety.push({ id: 'pace-slowed', level: 'notice', title: 'Pace slowed to fit a safe calorie floor', detail: `At your size, a faster pace would need fewer calories than is safe. The plan uses ${pace} kg a week, so the time to your target is honest. Walking more and lifting weights move the number without eating less.` });
  if (noRoom) safety.push({ id: 'no-deficit-room', level: 'notice', title: 'Little safe room to cut food', detail: 'Your maintenance calories are already close to the safe minimum. Focus on strength training and walking; weight will move slowly and that is fine.' });

  // Waist: the single most useful tape number. Waist under about half your height is the common health marker.
  const waistGoal = Math.round(h * t.waistToHeight);
  const waistNow = m.waist || null;
  const tape = [];
  if (!m.waist) tape.push({ type: 'waist', how: 'Around the narrowest part of your waist (about at the navel), after breathing out, tape level and snug' });
  if (!m.neck) tape.push({ type: 'neck', how: 'Just below the larynx, tape level, looking straight ahead' });
  if (sex !== 'male' && !m.hips) tape.push({ type: 'hips', how: 'Around the widest part of your hips and bottom, feet together' });
  if (!m.chest) tape.push({ type: 'chest', how: 'Around the fullest part of your chest, arms relaxed' });
  if (!m.arm) tape.push({ type: 'arm', how: 'Relaxed upper arm at its widest point' });
  if (!m.thigh) tape.push({ type: 'thigh', how: 'Upper thigh, just below the hip crease' });

  const shape = [];
  if (waistNow) {
    const ratio = r1((waistNow / h) * 100) / 100;
    shape.push(`Waist ${waistNow} cm is ${Math.round(ratio * 100) / 100} of your height. Your goal is about ${waistGoal} cm (${t.waistToHeight} of height).`);
  } else shape.push(`A waist near ${waistGoal} cm (${t.waistToHeight} of your height) matches this goal. Measure yours to see where you are.`);
  if ((type === 'athletic' || type === 'muscular') && m.chest && m.waist) {
    const taper = r1(m.chest / m.waist);
    shape.push(`Chest to waist is ${taper}. A bigger number means more shoulder and chest next to a smaller waist. ${type === 'athletic' ? 'Athletic builds usually sit near 1.3 or more.' : ''}`.trim());
  }
  if (type === 'lean' && m.hips && m.waist && sex !== 'male') shape.push(`Waist to hips is ${r1(m.waist / m.hips)}. Under about 0.85 is a common healthy marker for women.`);
  shape.push(mode === 'lose'
    ? 'Your arm, thigh and chest tapes should hold steady or grow slowly while your waist goes down. That means fat is leaving, not muscle.'
    : 'Waist steady or lower while arm, thigh and chest hold or grow is the sign it is working.');

  // Checkpoints every 4 weeks: expected weight and what to check.
  const checkpoints = [];
  if (mode === 'lose') {
    for (let wk = 4; wk <= Math.min(weeks, 52); wk += 4) checkpoints.push({ week: wk, weightKg: r1(Math.max(targetKg, w - pace * wk)), check: 'Weigh weekly (same time), measure waist every 2 weeks. If weight is stuck 3 weeks, add 1000 steps a day before cutting food.' });
    if (weeks % 4 !== 0 || !checkpoints.length) checkpoints.push({ week: weeks, weightKg: targetKg, check: 'Goal reached. Move to maintenance calories for 2 to 4 weeks before deciding what is next.' });
  }

  const priority = DEFICIT_MICROS.filter((x) => !x.sexes || x.sexes.includes(sex)).map(({ sexes, ...rest }) => rest);

  const steps = t.steps;
  const body = { weightKg: w, heightCm: h, bmi: r1(bmi), bodyFatPct: bf.pct, bodyFatSource: bf.source, leanMassKg: r1(lean) };
  const goalOut = { bodyFatBand: [bfLo, bfHi], bodyFatMid: bfGoal, targetWeightKg: targetKg, lossKg, weeklyPaceKg: pace, weeks, waistCm: waistGoal };
  const tp = trainingPlan({ profile, type, mode, body, goal: goalOut, steps, protein: macros ? macros.protein : null, calories, measures: m, prefs });
  const plan = {
    ready: true, type, label: t.label, blurb: t.blurb, mode,
    body, goal: goalOut,
    calories, macros, protein: macros ? { gPerKg: r1(macros.protein / w), grams: macros.protein } : null,
    fiberG: macros ? macros.fiber : null,
    waterMl: waterTargetMl(w), steps,
    // `sessions` (plain lines) is kept so older apps still show something useful; `program` is the full plan.
    training: { strengthDays: tp.program.daysPerWeek, steps, sessions: tp.summary, program: tp.program, prefs: tp.prefs },
    analysis: tp.analysis,
    shape, tape, checkpoints, microPriority: priority,
    fatShare: BODY_TYPES[type].fat,
    safety,
    notes: [
      bf.source === 'estimate' ? 'Body fat is estimated from height, weight and age. Add waist and neck (and hips for women) to make it more accurate.' : 'Body fat is estimated from your tape. It can be off by a few points, so follow the trend, not one reading.',
      'These are starting numbers. If your weight trend is faster or slower than planned for 3 weeks, the app adjusts calories in small steps.',
    ],
  };
  if (mode === 'recomp') plan.notes.unshift('You are already near this body-fat range, so the plan keeps your weight steady and builds shape with strength training and enough protein.');
  if (mode === 'build') plan.notes.unshift('The plan focuses on eating at maintenance or slightly above, with strength training, rather than cutting.');
  return plan;
}

module.exports = { bodyPlan, bodyFatNow, TYPES, TYPE_IDS, DEFICIT_MICROS };
