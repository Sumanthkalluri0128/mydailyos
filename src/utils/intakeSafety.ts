// Safe intake: tells the person, in plain words, what happens in the body when they eat too little or too much, and what to do about it.
// Pure (no network), so it works offline and is unit-tested. Honest limits: these are general effects, not a diagnosis. Wording is
// calm and never shames (the app has a tone check for that). Floors match lib/energy.js (1500 kcal men, 1200 everyone else).

export type SafetyLevel = 'ok' | 'notice' | 'alert';
export type SafetyKind = 'low-day' | 'low-streak' | 'heavy-day' | 'target-low' | 'deficit-deep' | 'pace-fast';
export type IntakeAdvice = {
  kind: SafetyKind; level: SafetyLevel; title: string; summary: string;
  effects: string[]; doNow: string[]; next?: string[]; seeDoctor?: string;
};

export const FLOOR = (sex?: string) => (sex === 'male' ? 1500 : 1200);
const r10 = (x: number) => Math.round(x / 10) * 10;
const r50 = (x: number) => Math.round(x / 50) * 50;
const MEDICAL = 'If you feel faint, have chest pain, or find that eating enough feels very hard or frightening, please talk to a doctor or dietitian. You deserve support with that.';

export type IntakeInput = {
  eaten: number; budget: number; target: number; sex?: string; hour: number;
  loggedToday?: boolean; recentDays?: { calories: number }[]; // last logged days BEFORE today (newest last)
  losing?: boolean;
};

/** Everything that deserves a heads-up right now, most urgent first. Empty when intake looks fine. */
export function intakeAdvice(i: IntakeInput): IntakeAdvice[] {
  const out: IntakeAdvice[] = [];
  const floor = FLOOR(i.sex);
  const eaten = Math.max(0, i.eaten || 0);

  // ---- too little, today (only judged in the evening and only when food has been logged: no entry may just mean "not logged yet") ----
  if (eaten > 0 && i.loggedToday !== false && i.hour >= 19 && eaten < floor) {
    const gap = r50(floor - eaten);
    const very = eaten < floor * 0.75;
    out.push({
      kind: 'low-day', level: very ? 'alert' : 'notice',
      title: very ? 'You have eaten very little today' : 'Today is below the safe minimum',
      summary: `You have logged ${Math.round(eaten)} kcal. For your body the safe minimum is about ${floor} kcal a day, so about ${gap} kcal more would bring you back.`,
      effects: [
        'Tiredness, poor focus, headache or dizziness are common within hours.',
        'Feeling cold or irritable, and strong cravings that often end in a big late-night meal.',
        'Without enough protein and calories the body uses muscle for fuel, so you lose strength, not only fat.',
        'Doing this day after day slows the weight trend, can disturb sleep, and lowers iron, B12 and calcium.',
      ],
      doNow: [
        `Have a proper small meal now, about ${Math.min(500, Math.max(250, gap))} kcal, with protein and a carb (for example eggs and toast, dal and rice, curd with fruit and nuts).`,
        'Drink water. If you feel dizzy, add a pinch of salt or an oral rehydration drink.',
        'Skip hard exercise tonight: training on very little food costs muscle and recovery.',
      ],
      next: [
        'Tomorrow: eat breakfast within 1 to 2 hours of waking, then 3 meals and 1 or 2 snacks so you are not catching up in one go.',
        `Do not "make up" for today by eating a huge meal. Steady, regular meals around ${Math.max(floor, Math.round(i.target / 10) * 10)} kcal work better.`,
      ],
      seeDoctor: MEDICAL,
    });
  }

  // ---- too little, several days in a row ----
  const rec = (i.recentDays || []).filter((d) => d.calories > 0).slice(-3);
  if (rec.length >= 3 && rec.every((d) => d.calories < floor * 0.9)) {
    const avg = Math.round(rec.reduce((t, d) => t + d.calories, 0) / rec.length);
    out.push({
      kind: 'low-streak', level: 'alert',
      title: 'Three low days in a row',
      summary: `Your last 3 logged days averaged about ${avg} kcal, under the safe minimum of ${floor}. Eating this little for days brings more risk than one low day.`,
      effects: [
        'Muscle loss and a slower metabolism, so weight loss stalls and then comes back faster.',
        'Hair thinning, dry skin, feeling cold, low mood and poor sleep.',
        'Low iron, B12, calcium and vitamin D, which show up as tiredness, dizziness and weak bones.',
        'For women, missed or irregular periods. Quick weight loss can also cause gallstones.',
      ],
      doNow: [
        `Raise tomorrow to at least ${floor} kcal and keep it there for a week before changing anything else.`,
        'Build each meal around protein (eggs, dal, curd, paneer, fish, chicken, tofu) and add a carb.',
        'If you are logging fully and still finding it hard to eat more, tell a doctor or dietitian.',
      ],
      seeDoctor: MEDICAL,
    });
  }

  // ---- too much, today ----
  const over = eaten - (i.budget || 0);
  if (i.budget > 0 && over > i.budget * 0.08) {
    const heavy = over > Math.max(500, i.budget * 0.3);
    const fatMax = Math.round((over / 7700) * 100) / 100;
    const perDay = Math.max(0, Math.min(250, r10(over / 3)));
    const nextTarget = Math.max(floor, Math.round(i.target - perDay));
    out.push({
      kind: 'heavy-day', level: heavy ? 'alert' : 'notice',
      title: heavy ? 'A heavy day, and it is fixable' : 'A little over today',
      summary: `You are about ${Math.round(over)} kcal over today's budget. At most about ${fatMax} kg of that could become fat, and the scale will mostly show water.`,
      effects: [
        'Bloating, sleepiness, reflux or an upset stomach, especially after a large late meal.',
        'A jump on the scale of 0.5 to 2 kg tomorrow. That is salt, carbs and food still in the gut, not new fat.',
        'Blood sugar swings, then cravings. Often the next day brings more of the same unless you reset with a normal meal.',
        'Only a pattern of heavy days stalls progress. One day does not undo your week.',
      ],
      doNow: [
        'Go for a 10 to 20 minute easy walk after the meal. It helps digestion and blood sugar.',
        'Drink water and have a light, protein-and-vegetable dinner if it is not eaten yet. Do not skip it.',
        'Do not fast or go very low tomorrow to balance it out. That raises cravings and the weight bounces back.',
      ],
      next: [
        perDay >= 50
          ? `Spread it out: eat about ${perDay} kcal less than your target for the next 3 days (about ${nextTarget} kcal a day), never below ${floor}.`
          : 'No change needed to the next days: just eat your normal target.',
        'Tomorrow: normal breakfast with protein, plenty of water, and go easy on salty food so the water weight settles in 1 to 3 days.',
      ],
    });
  }

  const rank = { alert: 0, notice: 1, ok: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

export type TargetCheck = { level: SafetyLevel; title: string; detail: string; effects: string[]; fix: string[] } | null;

/** For when a person types their own calorie target or chooses a pace. Returns null when it is fine. */
export function targetSafety({ kcal, tdee, sex, weightKg, weeklyPaceKg }: { kcal?: number; tdee?: number | null; sex?: string; weightKg?: number; weeklyPaceKg?: number }): TargetCheck {
  const floor = FLOOR(sex);
  const k = Number(kcal) || 0;
  if (k > 0 && k < floor) return {
    level: 'alert', title: `${k} kcal is below the safe minimum of ${floor}`,
    detail: 'Eating this little for more than a few days is not recommended without a doctor or dietitian.',
    effects: ['Tiredness, dizziness, headaches and feeling cold.', 'Muscle loss, slower metabolism and weight that comes back.', 'Low iron, B12 and calcium; hair loss; missed periods; gallstones.'],
    fix: [`Set at least ${floor} kcal.`, 'Lose weight more slowly instead: add 1000 steps a day or a short walk after meals.', 'Use "auto" so the app keeps you above the floor.'],
  };
  if (k > 0 && tdee && k < tdee * 0.7) return {
    level: 'notice', title: 'This is a deep deficit (more than 30% under maintenance)',
    detail: `Maintenance is about ${Math.round(tdee)} kcal. A cut this big raises the risk of muscle loss, hunger and rebound eating.`,
    effects: ['Strong hunger and cravings, low energy in workouts.', 'More muscle lost along with fat, even when you lift.', 'Harder to keep up for more than a few weeks.'],
    fix: [`Try about ${Math.round((tdee * 0.8) / 10) * 10} kcal (a 20% deficit) for steadier loss.`, 'Keep protein high and keep lifting.'],
  };
  const w = Number(weightKg) || 0, p = Number(weeklyPaceKg) || 0;
  if (w > 0 && p > w * 0.01) return {
    level: 'notice', title: 'This pace is faster than the usual safe rate',
    detail: `${p} kg a week is more than 1% of your body weight (${Math.round(w * 0.01 * 100) / 100} kg).`,
    effects: ['More muscle and water loss, less fat.', 'Fatigue, hair loss and gallstones are more likely.'],
    fix: [`Choose ${Math.round(w * 0.0075 * 20) / 20} kg a week or slower.`],
  };
  return null;
}
