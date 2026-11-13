// The WEEKLY decision: reads the last two weeks (food, steps, training, weigh-ins), works out what is really happening and changes only
// what the data justifies. Pure and deterministic (no database, no clock). Port of adaptive_coach.py's weekly_review for the app.
// (lib/weeklyCoach.js is the separate "tips + boss fight" screen; this file decides CHANGES to the plan.)
//
// One rule drives everything: change ONE thing at a time, wait for its effect, never chase noise.
// Fixed order (first match wins): under-eating > not a weight-loss goal > too little data > too fast > adherence > on track >
// heavy days > training > steps > the slow-progress ladder (wait, steps, walk, small cut, diet break, reassess).
// Food and training EVENTS (heavy days, missed sessions) are explained, never "fixed" with a cut. The safe floor is never crossed.
const E = require('./energy');
const { smoothTrend, trendRate } = require('./trendWeight');
const { addDays, diffDays } = require('./dates');
const D = require('./dailyCoach');
const { dropOutliers } = require('./robustWeights');
const { goalForecast } = require('./goalForecast');
const { nonLoseDecision } = require('./coachGain');
const { mayWait } = require('./retention');

const W = {
  coolDownDays: 10, coolDownLightDays: 7, severeStallShare: 0.25, severeStallWeighIns: 8, severeStallAdherence: 0.85, minWeighIns: 6, minFoodDays: 8, adherenceMin: 0.75, tooFastPct: 0.01, stepsHitShare: 0.85,
  stepsStep: 1500, stepsCap: 12000, cutKcal: 100, trainingShare: 0.8, dietBreakAfterDays: 56, dietBreakDays: 7, underFloorMargin: 150,
};
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r2 = (x) => Math.round(x * 100) / 100;
const FRESH = { slowWeeks: 0, level: 0, lastChange: null, lastReview: null, deficitSince: null, decision: null };

/** A calorie change as the app can apply it: manual mode changes the number, auto mode changes the pace. null = the floor blocks it. */
function calorieChange(e, target, floor, delta) {
  const want = Math.round((target + delta) / 10) * 10;
  if (want < floor || (delta < 0 && want > e.tdee - 150)) return null;
  if (e.mode === 'manual') return { type: 'calorie', calorieTarget: want, from: target };
  const pace = Math.round((((e.tdee - want) * 7) / E.KCAL_PER_KG) * 20) / 20;
  if (pace < 0.1 || pace > E.maxSafeWeeklyLossKg(e.weightKg) + 1e-9) return null; // never a pace above the safe limit (1 % of body weight a week)
  return { type: 'pace', weeklyPaceKg: pace, from: e.pace, calorieTarget: want };
}

/**
 * @param o.days ascending history (35 days) [{date, calories, steps, exerciseMinutes, caloriesBurned, weightKg, weighIn}]
 * @param o.state previous weekly state (or null)  @returns {action, headline, messages, apply, metrics, state}
 */
function weeklyDecision({ profile, days = [], today, strengthDates = null, state = null, dietBreakActive = false, strengthTrend = null, recovery = null, waists = [], composition = null, retention = null, cycle = null, fatigue = null }) {
  const st = { ...FRESH, ...(state || {}) };
  const e = E.expectedEnergy(profile);
  if (!e) return { action: 'NEED_PROFILE', headline: 'Finish your profile first', messages: ['Age, height and weight are needed to work out your plan.'], apply: null, metrics: {}, state: st };
  const floor = E.calorieFloorOf(profile);
  const target = e.calorieTarget;
  const direction = e.direction;
  const w14 = days.filter((d) => d.date <= today && d.date > addDays(today, -14));
  const w7 = w14.filter((d) => d.date > addDays(today, -7));
  const logged = (d) => n0(d.calories) >= D.CFG.unloggedBelow * target;
  const loggedDays = w14.filter(logged);
  const rawWeights = days.filter((d) => d.weighIn && d.date <= today).map((d) => ({ date: d.date, weightKg: n0(d.weightKg) }));
  const { kept: weights, dropped: droppedWeighIns } = dropOutliers(rawWeights);       // one salty-dinner reading never moves a decision
  const weighIns14 = weights.filter((p) => p.date > addDays(today, -14)).length;
  const rate = weights.length >= 2 ? trendRate(smoothTrend(weights), today) : null;          // kg/week, negative = losing
  const wNow = n0(profile.currentWeightKg) || (weights.length ? weights[weights.length - 1].weightKg : 0);
  const T = direction === 'lose' ? Math.max(0.1, ((e.tdee - target) * 7) / E.KCAL_PER_KG) : 0;   // the loss the PLAN really implies (floor-aware)
  const tol = Math.max(0.15, 0.25 * T);
  const L = rate === null ? null : -rate;
  const ev = { heavy7: 0, heavy14: 0, missed: 0 };
  const planned = new Set(Array.isArray(profile.training?.weekdays) ? profile.training.weekdays : []);
  let heavyCost = 0;
  for (const d of w14) {
    const b = D.budgetOf(profile, d);
    const k = logged(d) ? D.dayKind(d.calories, b, floor, target) : 'unknown';
    if (k === 'heavy' || k === 'cheat_day') { ev.heavy14 += 1; heavyCost += Math.max(0, d.calories - b); if (d.date > addDays(today, -7)) ev.heavy7 += 1; }
    if (planned.has(D.weekdayMon0(d.date)) && !D.isTrained(d, strengthDates)) ev.missed += 1;
  }
  const sessions = (w14.filter((d) => D.isTrained(d, strengthDates)).length / 14) * 7;
  const stepsDays = w14.filter((d) => n0(d.steps) > 0);
  const stepsAvg = stepsDays.length ? stepsDays.reduce((s, d) => s + d.steps, 0) / stepsDays.length : 0;
  const stepsTarget = n0(profile.goals?.stepsTarget) || 10000;
  const inRange = loggedDays.filter((d) => { const o = d.calories - D.budgetOf(profile, d); return o >= -200 && o <= 250; }).length;
  const adherence = loggedDays.length ? inRange / loggedDays.length : null;
  const l7 = w7.filter(logged);
  const avg7 = l7.length >= 4 ? l7.reduce((s, d) => s + d.calories, 0) / l7.length : null;
  const waistPts = (waists || []).filter((w) => Number(w.value) > 0 && w.date <= today && w.date > addDays(today, -36)).sort((a, b) => a.date.localeCompare(b.date));
  const waistChangeCm = waistPts.length >= 2 && diffDays(waistPts[0].date, waistPts[waistPts.length - 1].date) >= 14 ? r2(waistPts[waistPts.length - 1].value - waistPts[0].value) : null;
  const trendNow = weights.length ? smoothTrend(weights).slice(-1)[0].trendKg : wNow;
  const forecast = goalForecast({ currentKg: trendNow || wNow, targetKg: profile.goals && profile.goals.targetWeightKg, rateKgWk: rate, planKgWk: direction === 'lose' ? T : null, today });
  const metrics = { rateKgWk: rate, targetLossKgWk: r2(T), toleranceKgWk: r2(tol), weighIns14, foodDays14: loggedDays.length, adherence: adherence === null ? null : r2(adherence),
    sessionsPerWeek: r2(sessions), plannedDays: planned.size, stepsTarget, stepsAvg: Math.round(stepsAvg), heavyDays7: ev.heavy7, heavyDays14: ev.heavy14, missedSessions14: ev.missed, floor, target };
  // A suggestion that needs a tap (apply) only moves the ladder when it is APPLIED: `onApply` is merged into the state then (server route),
  // so an ignored suggestion comes back next week instead of being skipped.
  const done = (action, headline, messages, apply = null, patch = {}) => {
    const keep = apply ? { slowWeeks: patch.slowWeeks ?? st.slowWeeks, deficitSince: patch.deficitSince ?? st.deficitSince } : patch;
    return { action, headline, messages, apply, metrics, forecast, droppedWeighIns, onApply: apply ? patch : null, state: { ...st, ...keep, lastReview: today, decision: null } };
  };
  // Walking and steps show up on the scale sooner than a calorie change, so they wait less.
  const coolDays = st.lastChangeKind === 'steps' || st.lastChangeKind === 'walk' ? W.coolDownLightDays : W.coolDownDays;
  const coolingDown = st.lastChange && diffDays(st.lastChange, today) < coolDays;

  // 1. under-eating: fix intake, never touch the plan
  if (avg7 !== null && avg7 < floor - W.underFloorMargin) {
    return done('UNDER_EATING', 'You are eating below your safe minimum', [`Your 7-day average is about ${Math.round(avg7)} kcal, under your floor of ${floor}. Do not change the plan: eat it in full, smaller more frequent meals, protein first, a whey shake. If low appetite continues, tell your doctor.`]);
  }
  if (direction !== 'lose') {
    // Lean gain and maintain / recomp have their own ladder (lib/coachGain.js): same one-change-at-a-time rule.
    const sessionsWk = (w14.filter((d) => D.isTrained(d, strengthDates)).length / 14) * 7;
    const g = nonLoseDecision({ direction, e, target, floor, rate, wNow, weighIns14, foodDays14: loggedDays.length, adherence, avg7, st, today, coolingDown,
      sessions: sessionsWk, plannedDays: planned.size, strength: strengthTrend, waistChangeCm, stepsAvg, stepsTarget });
    return done(g.action, g.headline, g.messages, g.apply, g.patch);
  }
  // 2. not enough data: change nothing
  if (weighIns14 < W.minWeighIns || L === null) return done('NEED_DATA', 'Not enough weigh-ins yet', [`I need at least ${W.minWeighIns} weigh-ins in 14 days (you have ${weighIns14}). Weigh yourself each morning after the toilet and I will read the trend. No changes until then.`]);
  if (loggedDays.length < W.minFoodDays) return done('NEED_FOOD_LOGS', 'Log your food on more days', [`Only ${loggedDays.length} of the last 14 days have food logged. Without it I cannot tell a plan problem from a logging problem, so nothing changes.`]);
  // 3. too fast: the safe limit
  if (wNow > 0 && L > W.tooFastPct * wNow) {
    const apply = calorieChange(e, target, floor, +W.cutKcal);
    return done('TOO_FAST_RAISE', 'Losing faster than is safe', [`Your trend is ${L.toFixed(2)} kg a week, more than ${W.tooFastPct * 100}% of your body weight. Muscle is at risk.${apply ? ` Add about ${W.cutKcal} kcal (25 g more rice).` : ''}`], apply, { lastChange: apply ? today : st.lastChange });
  }
  // 4. adherence: a behaviour problem is never solved with a cut
  if (adherence !== null && adherence < W.adherenceMin && L < T - tol) {
    return done('FIX_ADHERENCE', 'Follow the plan first', [`Only ${Math.round(adherence * 100)}% of days were close to plan. Slow progress here is a behaviour problem, so no cut. Pick ONE fix: prep lunch, a planned flex meal, or an earlier dinner.`]);
  }
  // 4b. strength is falling while the scale says "on plan": the loss is costing muscle. Add a little food instead of waiting for a stall.
  if (strengthTrend && strengthTrend.status === 'down' && L >= T - tol) {
    const apply = calorieChange(e, target, floor, +W.cutKcal);
    return done('PROTECT_MUSCLE', 'Protect your muscle', [`Your weight is moving as planned, but your lifts are down about ${Math.abs(strengthTrend.pct)}%. That is the early sign of muscle loss.${apply ? ` Add about ${W.cutKcal} kcal (25 g more rice) and keep protein on target.` : ' Keep protein on target and sleep 7+ hours.'} If lifts recover, we keep going.`], apply, { slowWeeks: 0 });
  }
  // 5. on track resets the ladder
  if (L >= T - tol) {
    // Worn out (poor sleep and energy, lifts falling, long deficit) earns the break sooner than the calendar would, but never before 4 weeks of deficit.
    const earlyByFatigue = !!(fatigue && fatigue.breakSuggested && st.deficitSince && diffDays(st.deficitSince, today) >= 28);
    const due = st.deficitSince && (diffDays(st.deficitSince, today) >= W.dietBreakAfterDays || earlyByFatigue) && !dietBreakActive;
    const reset = { slowWeeks: 0, level: 0, compWaits: 0 };
    if (due) return done('DIET_BREAK_DUE', 'Time for a planned diet break', [`You have been in a deficit for ${Math.round(diffDays(st.deficitSince, today) / 7)} weeks. A 7-day break at maintenance resets hunger, energy and training. It is part of the plan, not a failure.`], { type: 'dietBreak', days: W.dietBreakDays }, reset);
    return done('ON_TRACK', 'On track', [`Your trend is ${L.toFixed(2)} kg a week against a plan of ${T.toFixed(2)}. Change nothing.`], null, { ...reset, deficitSince: st.deficitSince || today });
  }
  // 6. slow because of food or training EVENTS: explained, never cut
  if (ev.heavy7 >= 2) return done('FIX_HEAVY_DAYS', 'Heavy days are slowing you down', [`${ev.heavy7} heavy days in the last 7. That is the reason, so no cut. Pick ONE fix: a single planned flex meal (700-900 kcal) instead of whole heavy days, or prep and an earlier dinner. Never fast or punish-train after one.`]);
  const heavyWk = heavyCost / E.KCAL_PER_KG / 2;
  if (ev.heavy14 > 0 && L + heavyWk >= T - tol) return done('EXPLAINED_BY_HEAVY_DAY', 'A heavy day explains it', [`You lost ${L.toFixed(2)} kg a week against ${T.toFixed(2)}, but the heavy day(s) took about ${heavyWk.toFixed(2)} kg a week away. Without them you are on track. No change.`]);
  if (planned.size && sessions < W.trainingShare * planned.size) return done('RESTORE_TRAINING', 'Get the training back first', [`You trained ${sessions.toFixed(1)} days a week against ${planned.size} planned. Slow progress here is an activity problem, so food stays as it is. No doubling up and no punishment cardio.`]);
  if (stepsAvg > 0 && stepsAvg < W.stepsHitShare * stepsTarget) return done('HIT_STEPS', 'Hit your steps first', [`You average ${Math.round(stepsAvg).toLocaleString('en-US')} steps against ${stepsTarget.toLocaleString('en-US')}. Do not cut food for an activity problem: reach your steps first.`]);
  // 6b. the scale is slow but the BODY is changing (waist down, fat down, muscle kept): that is progress, not a stall. Never cut for it.
  //     At most 3 weeks in a row, so a real stall is still caught.
  if (composition && composition.improving && (st.compWaits || 0) < 3) {
    return done('COMPOSITION_IMPROVING', 'The scale is slow, but your body is changing', [composition.note, 'The scale is only one signal. Fat is going down and muscle is being kept, so no change this week.'], null, { slowWeeks: 0, compWaits: (st.compWaits || 0) + 1 });
  }
  // 6b2. the monthly cycle (only when the person turned it on and logs it): water can hide a week of real loss, so wait ONE more week once per cycle.
  if (cycle && cycle.likely) {
    metrics.cycleDay = cycle.day; metrics.cycleLen = cycle.length;
    return done('WAIT_CYCLE', 'Your cycle may be hiding progress', [`You are around day ${cycle.day} of a ${cycle.length}-day cycle. Water often rises in the week before a period and the first days of it, then drops, so a flat scale now says little about fat.`, 'I wait one more week before changing anything, so you are not cut for water. Compare the same part of the cycle from month to month.'], null, { cycleWaitedOn: today });
  }
  // 6c. short-term water weight (heavy day, diet break, new training, poor sleep) can hide a week of real loss. Wait ONE more week, at most once every 21 days.
  if (retention && retention.likely && mayWait(st, today)) {
    return done('WAIT_RETENTION', 'Water weight may be hiding progress', [...retention.reasons.map((r) => r.text), 'I wait one more week before changing anything, so you are not cut for water.'], null, { retWaitedOn: today });
  }
  // 7. the slow-progress ladder, one step at a time
  if (coolingDown) return done('WAIT_EFFECT', 'Give the last change time', [`You changed something ${diffDays(st.lastChange, today)} days ago. I wait ${W.coolDownDays} days to see its effect before changing anything else.`]);
  const slow = st.slowWeeks + 1;
  const base = { slowWeeks: slow, deficitSince: st.deficitSince || today };
  const severeStall = L <= W.severeStallShare * T && weighIns14 >= W.severeStallWeighIns && adherence !== null && adherence >= W.severeStallAdherence;
  if (slow < 2 && !severeStall) return done('WAIT_ONE_MORE', 'Slightly slow: one more week', [`Your trend is ${L.toFixed(2)} kg a week against ${T.toFixed(2)}. One slow week is noise: I will look again next week before changing anything.`], null, base);
  if (st.level <= 0 && stepsTarget < W.stepsCap) {
    const to = Math.min(W.stepsCap, stepsTarget + W.stepsStep);
    return done('LADDER_STEPS', `Step 1: raise steps to ${to.toLocaleString('en-US')}`, [`Two slow weeks with good adherence. The cheapest lever is walking: +${to - stepsTarget} steps a day costs no hunger.`], { type: 'steps', stepsTarget: to, from: stepsTarget }, { ...base, level: 1, lastChangeKind: 'steps' });
  }
  if (st.level <= 1) return done('LADDER_WALK', 'Step 2: add one incline walk a week', ['Add one 20-25 minute incline walk (treadmill 10-12%, 5-5.5 km/h) after lifting. Low impact on recovery and still no cut to food.'], null, { ...base, level: 2, lastChange: today, lastChangeKind: 'walk' });
  if (st.level <= 2 && strengthTrend && strengthTrend.status === 'down') return done('HOLD_STRENGTH', 'Strength first, no cut', [`Progress is slow, but your lifts are down about ${Math.abs(strengthTrend.pct)}%. Cutting more now would cost muscle. Check protein, sleep and that every lift is progressing. A 7-day diet break is the better next move if you are tired.`], null, base);
  if (st.level <= 2 && recovery && recovery.low) return done('HOLD_RECOVERY', 'Recovery first, no cut', [recovery.note || 'Recovery has been low this week.', 'I hold the calories until sleep and energy come back, then the ladder continues.'], null, base);
  if (st.level <= 2) {
    const apply = calorieChange(e, target, floor, -W.cutKcal);
    if (apply) return done('LADDER_CUT', `Step 3: cut ${W.cutKcal} kcal (carbs first)`, [`Steps and walks did not move the trend. Take about ${W.cutKcal} kcal from rice or roti, never protein. Target becomes ${apply.calorieTarget} kcal, still above your floor of ${floor}.`], apply, { ...base, level: 3 });
  }
  if (st.level <= 3 && !dietBreakActive) return done('LADDER_BREAK', 'Step 4: a 7-day diet break', ['A week at maintenance resets hunger, fatigue and adherence, then we test again. The plan cannot safely go lower.'], { type: 'dietBreak', days: W.dietBreakDays }, { ...base, level: 4, deficitSince: null });
  return done('REASSESS', 'Time to reassess', ['The plan cannot safely go lower. Check logging accuracy (weigh food, oil by the ml), accept a slower pace, and ask a doctor about thyroid or medication if the trend stays flat.'], null, { ...base, level: 4 });
}

module.exports = { W, FRESH, weeklyDecision, calorieChange };
