// The glue between the diet coach and the gym coach. Until now each looked only at its own data; this module lets them react to each other.
//   * dayPlan()    - what to eat TODAY given whether it is a lifting day: protein fixed, carbs moved to the training day, fat on rest days,
//                    plus a pre- and post-workout bite. Calories come from the day budget the app already uses (so nothing is counted twice).
//   * crossCheck() - advisories that need BOTH coaches: strength falling during a fast cut, a working deficit protected by rising lifts,
//                    protein too low for the training load, diet break lined up with the easy week, low recovery before any cut.
// Pure and deterministic; every message is plain and kind, nothing here ever lowers a target.
const r5 = (x) => Math.round(x / 5) * 5;
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const PRE = 'A banana with a few almonds, or a small bowl of poha, 60 to 90 minutes before. Light and mostly carbs.';
const POST_LIGHT = 'Curd, paneer, eggs or a whey shake with rice or roti within 2 hours of finishing.';

/**
 * @param o.kcal          today's calorie budget (the day budget the app shows)   o.weightKg   o.direction 'lose'|'gain'|'maintain'
 * @param o.proteinTarget grams a day (the person's own or the automatic one)    o.training  true on a lifting day
 * @param o.readiness     sessionAdjust() result for today | null
 */
function dayPlan({ kcal, weightKg, direction = 'maintain', proteinTarget = null, training = false, readiness = null }) {
  const kg = n0(weightKg), cal = n0(kcal);
  if (!(kg > 0) || !(cal > 0)) return null;
  const protein = r5(n0(proteinTarget) > 0 ? n0(proteinTarget) : kg * (direction === 'gain' ? 2.0 : 1.6));
  const fatG = r5(clamp(kg * (training ? 0.8 : 1.0), kg * 0.6, kg * 1.2));    // lower on lifting days so the carbs can rise
  const carbsG = Math.max(0, r5((cal - protein * 4 - fatG * 9) / 4));
  const lowCarbs = carbsG < kg * 1.5;
  const post = clamp(Math.round(kg * 0.3), 20, 40);
  const out = {
    kind: training ? 'training' : 'rest', kcal: Math.round(cal), proteinG: protein, carbsG, fatG,
    note: training ? 'Lifting day: carbs are higher and fat is lower, so you have fuel for the session and the calories stay the same.' : 'Rest day: protein stays the same, a little more fat and a little less rice or roti.',
  };
  if (training) {
    out.pre = PRE;
    out.post = `About ${post} g of protein after training. ${POST_LIGHT}`;
    if (lowCarbs) out.warn = 'Carbs are on the low side today. Keep the rice or roti around the workout, and trim elsewhere in the day.';
  }
  if (readiness && readiness.band === 'red') out.recovery = 'Recovery is low today: keep protein and sleep first, and do not skip meals.';
  return out;
}

/**
 * @param o.direction 'lose'|'gain'|'maintain'   o.rateKgWk trend (negative = losing)   o.planKgWk planned loss pace (+)
 * @param o.strength  strengthTrend() | null       o.protein7Avg / o.proteinTarget (g)
 * @param o.phaseKey  gym phase key ('easy'|'build'|'back'|'learn')   o.deficitWeeks weeks in a deficit   o.dietBreakActive
 * @param o.recovery  recoverySummary() | null
 * @returns [{id, level:'info'|'tip'|'warn', title, detail}] most important first
 */
function crossCheck({ direction, rateKgWk = null, planKgWk = null, strength = null, protein7Avg = null, proteinTarget = null, phaseKey = '', deficitWeeks = 0, dietBreakActive = false, recovery = null } = {}) {
  const out = [];
  const add = (id, level, title, detail, vars) => out.push(vars ? { id, level, title, detail, vars } : { id, level, title, detail });
  const losing = direction === 'lose';
  const fast = losing && rateKgWk !== null && planKgWk > 0 && -rateKgWk > planKgWk * 1.15;
  const down = strength && strength.status === 'down', up = strength && strength.status === 'up';
  if (losing && down) add('strength-down', 'warn', 'Strength is falling while you diet', `${strength.note} ${fast ? 'You are also losing faster than planned, so a little more food will help. ' : ''}Keep protein on target, sleep 7+ hours and hold the calories until your lifts recover.`);
  if (losing && up && rateKgWk !== null && -rateKgWk >= (planKgWk || 0.3) * 0.7) add('deficit-protected', 'info', 'Your deficit is working and muscle is safe', 'Weight is falling at a good pace and your lifts are rising. Do not cut further: this is the best case.');
  if ((losing || direction === 'gain') && protein7Avg !== null && proteinTarget > 0 && protein7Avg < proteinTarget * 0.85) {
    add('protein-low', down ? 'warn' : 'tip', 'Protein is under target', `You averaged about ${Math.round(protein7Avg)} g against ${Math.round(proteinTarget)} g. Training only builds or keeps muscle when protein is there: add a serving of dal, curd, egg or paneer to the meal that is lowest.`, { avg: Math.round(protein7Avg), target: Math.round(proteinTarget) });
  }
  if (losing && phaseKey === 'easy' && deficitWeeks >= 6 && !dietBreakActive) add('break-with-deload', 'tip', 'Good week for a diet break', `You have been in a deficit for about ${deficitWeeks} weeks and your training is in its easy week. Doing the 7-day diet break now lets food and training recover together.`, { weeks: deficitWeeks });
  if (dietBreakActive && phaseKey === 'build') add('break-keep-lifting', 'info', 'Diet break: keep lifting normally', 'Food is at maintenance this week. Keep the same weights; you will probably feel stronger.');
  if (recovery && recovery.low) add('low-recovery', 'warn', 'Recovery is low this week', recovery.note);
  const order = { warn: 0, tip: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * ONE next action for today, so the Coach screen never shows a wall of cards. First match wins:
 * a plan change waiting for a tap > the 10-second check-in > today's lift > the first meal > keep going.
 * @param o.decision weekly decision view (or null)   o.checkedIn bool   o.gym adapt().todayPlan | null   o.loggedFood bool   o.hour 0-23
 */
function nextAction({ decision = null, checkedIn = false, gym = null, loggedFood = false, readiness = null } = {}) {
  if (decision && decision.apply && !decision.applied) return { kind: 'decision', title: decision.headline, detail: 'Your coach has one change for this week. Review it and tap to apply, or leave it.' };
  if (!checkedIn) return { kind: 'checkin', title: 'Do your 10-second check-in', detail: 'Sleep, energy and soreness. It makes today\'s workout and this week\'s plan fit how you actually feel.' };
  if (gym && gym.kind === 'train') {
    const adj = readiness && readiness.band && readiness.band !== 'green' ? ` ${readiness.note}` : '';
    return { kind: 'train', title: 'Today: your workout', detail: `${gym.text || ''}${adj}`.trim() };
  }
  if (!loggedFood) return { kind: 'log', title: 'Log your first meal', detail: 'The plan only adapts to what it can see. One meal logged is a good start.' };
  return { kind: 'steady', title: 'You are on track today', detail: gym && gym.kind === 'rest' ? gym.text : 'Keep logging and keep moving. The coach will tell you if anything needs to change.' };
}

module.exports = { dayPlan, crossCheck, nextAction };
