// The weekly decision for goals that are NOT "lose weight": lean gain (build) and maintain / recomp.
// Same rule as the fat-loss ladder in weeklyDecision.js: change ONE thing at a time, wait for its effect, never chase noise, and
// fix behaviour (eating the plan, training) before touching the numbers. Pure. weeklyDecision supplies the context and wraps the result.
//
//   GAIN      target rate = what the plan implies; the safe cap is 0.5 % of body weight a week (more than that is mostly fat).
//             Order: too fast > not eating the plan > not training > on track > weight up but strength not > slow ladder
//             (wait a week, +150 kcal, wait, +150 kcal, reassess). Calories never go above maintenance + 600.
//   MAINTAIN  hold within +/- 0.25 % a week. Drift is corrected by 100 kcal; a stable weight with a shrinking waist or rising lifts is
//             "recomposition working: change nothing"; stable on every measure = steps first, never a surprise cut.
const E = require('./energy');
const { diffDays } = require('./dates');

const G = { capPctPerWeek: 0.5, ladderKcal: 150, trimKcal: 100, maxSurplus: 600, minSurplus: 50, driftPct: 0.25, adherenceMin: 0.75, stepsStep: 1500, stepsCap: 12000, trainingShare: 0.8, waistWeeks: 5 };
const r2 = (x) => Math.round(x * 100) / 100;

/** A calorie change for a gain/maintain plan, in the form the apply route understands. null when it would leave the safe band. */
function calorieChangeGain(e, target, floor, delta) {
  const want = Math.round((target + delta) / 10) * 10;
  if (want < floor) return null;
  if (e.direction === 'gain' && (want > e.tdee + G.maxSurplus || want < e.tdee + G.minSurplus)) return null;
  if (e.direction === 'maintain' && Math.abs(want - e.tdee) > 250) return null;
  if (e.mode === 'manual' || e.direction === 'maintain') return { type: 'calorie', calorieTarget: want, from: target };
  const pace = Math.round((((want - e.tdee) * 7) / E.KCAL_PER_KG) * 20) / 20;
  if (pace < 0.1 || pace > 1) return null;
  return { type: 'pace', weeklyPaceKg: pace, from: e.pace, calorieTarget: want };
}

/**
 * @param c.direction 'gain' | 'maintain'     c.e expectedEnergy(profile)     c.target, c.floor
 * @param c.rate      trend kg/week (+ = gaining)     c.wNow     c.weighIns14, c.foodDays14, c.adherence (0-1 | null)
 * @param c.avg7      average kcal of the last 7 logged days (or null)     c.sessions / c.plannedDays   training done vs planned a week
 * @param c.strength  strengthTrend() result | null     c.waistChangeCm (negative = smaller) over ~5 weeks | null
 * @param c.st        ladder state {slowWeeks, level, lastChange}     c.today, c.coolingDown, c.stepsAvg, c.stepsTarget
 * @returns {action, headline, messages, apply, patch}  (patch is merged into the ladder state; onApply when apply is set)
 */
function nonLoseDecision(c) {
  const { direction, e, target, floor, rate, wNow, st, today } = c;
  const out = (action, headline, messages, apply = null, patch = {}) => ({ action, headline, messages, apply, patch });
  if (rate === null || c.weighIns14 < 6) return out('NEED_DATA', 'Not enough weigh-ins yet', [`I need at least 6 weigh-ins in 14 days (you have ${c.weighIns14}). Weigh yourself each morning after the toilet and I will read the trend. Nothing changes until then.`]);
  if (c.foodDays14 < 8) return out('NEED_FOOD_LOGS', 'Log your food on more days', [`Only ${c.foodDays14} of the last 14 days have food logged. Without it I cannot tell a plan problem from a logging problem, so nothing changes.`]);
  const pct = wNow > 0 ? (rate / wNow) * 100 : 0;                  // % of body weight per week, + = gaining

  if (direction === 'gain') {
    const T = Math.max(0.1, ((target - e.tdee) * 7) / E.KCAL_PER_KG);
    const tol = Math.max(0.1, 0.25 * T);
    const cap = Math.max(0.15, (G.capPctPerWeek / 100) * wNow);
    // 1. gaining faster than muscle can be built: the extra is fat
    if (rate > cap * 1.2 && rate > T + tol) {
      const apply = calorieChangeGain(e, target, floor, -G.trimKcal);
      return out('GAIN_TOO_FAST', 'Gaining faster than muscle can grow', [`Your trend is +${r2(rate)} kg a week, above about ${r2(cap)} kg (${G.capPctPerWeek}% of body weight). The extra is mostly fat.${apply ? ` Trim about ${G.trimKcal} kcal (a little less rice or ghee).` : ''}`], apply, { lastChange: apply ? today : st.lastChange });
    }
    // 2. not eating the plan: a behaviour problem, so the numbers stay
    if (c.avg7 !== null && c.avg7 < target * 0.9 && rate < T - tol) {
      return out('EAT_THE_PLAN', 'Eat the plan first', [`You averaged about ${Math.round(c.avg7)} kcal against ${target}. Gaining slowly here is simply not eating enough, so the target stays. Pick ONE fix: a calorie-dense snack (peanut butter on toast, banana shake), a bigger dinner, or a glass of milk with each meal.`]);
    }
    if (c.adherence !== null && c.adherence < G.adherenceMin && rate < T - tol) {
      return out('FIX_ADHERENCE', 'Follow the plan first', [`Only ${Math.round(c.adherence * 100)}% of days were close to plan, so a slow trend is a behaviour problem and the target stays. Pick ONE fix: prep meals ahead, add a fixed bedtime snack, or set a meal reminder.`]);
    }
    // 3. calories only build muscle when training asks for it
    if (c.plannedDays && c.sessions < G.trainingShare * c.plannedDays && rate < T - tol) {
      return out('RESTORE_TRAINING', 'Get the training back first', [`You trained ${r2(c.sessions)} days a week against ${c.plannedDays} planned. More food without the training stimulus becomes fat, so food stays and the sessions come first.`]);
    }
    // 4. on track
    if (rate >= T - tol && rate <= Math.max(T + tol, cap)) {
      // weight is rising but lifts are not: surplus without a muscle signal
      if (c.strength && c.strength.status === 'down') return out('GAIN_NO_STRENGTH', 'Weight is up but strength is not', ['Your trend is on pace, but your lifts are falling. A surplus alone does not build muscle. Check sleep (7+ h), protein, and that every lift is progressing. No calorie change this week.'], null, {});
      return out('ON_TRACK', 'On track', [`Your trend is +${r2(rate)} kg a week against a plan of ${r2(T)}. Change nothing.${c.strength && c.strength.status === 'up' ? ' Your lifts are rising too, which is exactly what a lean gain looks like.' : ''}`], null, { slowWeeks: 0, level: 0 });
    }
    // 5. slower than plan with good behaviour: the ladder, one step at a time
    if (rate > T + tol) return out('ON_TRACK', 'Ahead of plan', [`Your trend is +${r2(rate)} kg a week against ${r2(T)}, still inside the safe range. Change nothing.`], null, { slowWeeks: 0, level: 0 });
    if (c.coolingDown) return out('WAIT_EFFECT', 'Give the last change time', [`You changed something ${diffDays(st.lastChange, today)} days ago. I wait for its effect before changing anything else.`]);
    const slow = (st.slowWeeks || 0) + 1;
    const base = { slowWeeks: slow };
    if (slow < 2) return out('WAIT_ONE_MORE', 'Slightly slow: one more week', [`Your trend is +${r2(rate)} kg a week against ${r2(T)}. One slow week is noise, so I look again next week.`], null, base);
    if ((st.level || 0) <= 1) {
      const apply = calorieChangeGain(e, target, floor, +G.ladderKcal);
      if (apply) return out('LADDER_RAISE', `Step ${(st.level || 0) + 1}: add ${G.ladderKcal} kcal`, [`Two slow weeks with good adherence and training. Add about ${G.ladderKcal} kcal a day, mostly carbs around training (a banana and curd, or an extra roti). Target becomes ${apply.calorieTarget} kcal.`], apply, { ...base, level: (st.level || 0) + 1 });
    }
    return out('REASSESS', 'Time to reassess', ['The surplus is already generous. Check logging accuracy (weigh food, oil by the ml), sleep, and whether stress or illness is eating the surplus. If the trend stays flat, ask a doctor about thyroid or digestion.'], null, { ...base, level: 3 });
  }

  // ---- maintain / recomp
  const drift = G.driftPct;
  const waistDown = c.waistChangeCm !== null && c.waistChangeCm !== undefined && c.waistChangeCm <= -1;
  const strong = c.strength && c.strength.status === 'up';
  if (Math.abs(pct) <= drift) {
    if (waistDown || strong) return out('RECOMP_WORKING', 'Recomposition is working', [`Weight is steady${waistDown ? ` and your waist is down ${Math.abs(c.waistChangeCm)} cm` : ''}${strong ? `${waistDown ? ', and' : ' while'} your lifts are rising` : ''}. That is fat going down and muscle going up. Change nothing.`], null, { slowWeeks: 0, level: 0 });
    if (c.adherence !== null && c.adherence < G.adherenceMin) return out('FIX_ADHERENCE', 'Follow the plan first', [`Only ${Math.round(c.adherence * 100)}% of days were close to plan. Recomposition needs consistency before any change.`]);
    if (c.coolingDown) return out('WAIT_EFFECT', 'Give the last change time', [`You changed something ${diffDays(st.lastChange, today)} days ago. I wait for its effect before changing anything else.`]);
    const slow = (st.slowWeeks || 0) + 1;
    if (slow < 3) return out('WAIT_ONE_MORE', 'Steady on every measure: one more week', ['Weight, waist and lifts are all flat. Recomposition is slow, so I look again before changing anything.'], null, { slowWeeks: slow });
    if (c.stepsAvg > 0 && c.stepsTarget < G.stepsCap) {
      const to = Math.min(G.stepsCap, c.stepsTarget + G.stepsStep);
      return out('LADDER_STEPS', `Raise steps to ${to.toLocaleString('en-US')}`, ['Three flat weeks on weight, waist and lifts. The gentlest lever is walking: it costs no hunger and no recovery.'], { type: 'steps', stepsTarget: to, from: c.stepsTarget }, { slowWeeks: slow, level: 1 });
    }
    return out('REASSESS', 'Time to reassess', ['Everything has been flat for a while. Make sure every lift is progressing, protein is on target and sleep is 7+ hours. If you want to lean out faster, a small planned cut of 150 to 200 kcal for 4 weeks is the next option; say the word.'], null, { slowWeeks: slow });
  }
  // drifting off the maintenance line
  if (c.coolingDown) return out('WAIT_EFFECT', 'Give the last change time', [`You changed something ${diffDays(st.lastChange, today)} days ago. I wait for its effect before changing anything else.`]);
  const apply = calorieChangeGain(e, target, floor, pct > 0 ? -G.trimKcal : +G.trimKcal);
  return out(pct > 0 ? 'DRIFT_UP' : 'DRIFT_DOWN', pct > 0 ? 'Weight is drifting up' : 'Weight is drifting down', [`Your trend is ${pct > 0 ? '+' : ''}${r2(rate)} kg a week. To hold your weight, ${pct > 0 ? 'trim' : 'add'} about ${G.trimKcal} kcal a day.${apply && e.mode === 'auto' ? ' Your calories become a fixed number you can change in Profile.' : ''}`], apply, { lastChange: apply ? today : st.lastChange });
}

module.exports = { G, nonLoseDecision, calorieChangeGain };
