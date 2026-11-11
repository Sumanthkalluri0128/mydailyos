// The DAILY coach: what kind of day was yesterday, which maintenance to use today, what to do after heavy food / a missed
// workout / a no-activity day, feedback while you log, and "what am I?" (no activity / moderate) from your own data.
// Pure and deterministic (no database, no clock), same spirit as overEngine.js. Port of adaptive_coach.py's daily layer, built on
// the app's own energy model (lib/energy.js) so every number agrees with Home, the planner and the over-day banner.
//
// Rules (strict, from the plan PDF):
//   * Food and activity events change how the scale is READ and what the next days look like. They never trigger a fast,
//     a punishment workout, or a cut below the safe floor.
//   * Maintenance comes from YESTERDAY's steps + exercise (auto), unless the person chose a level (manual).
//   * ONE inactive day changes nothing in the calorie target. The target level only moves after STREAK days that agree (hysteresis).
//   * Slow progress after missed sessions is an activity problem, not a food problem.
const E = require('./energy');
const { adaptiveMaintenance } = require('./adaptiveTdee');
const { addDays } = require('./dates');

const CFG = {
  heavyOver: 500,            // a day this far over THAT day's budget = heavy
  cheatOver: 1000,           // ... this far = cheat day (e.g. 3,000 kcal on a 1,750 plan)
  overOver: 250,             // over by 250-499 = "over": trim the next meal a little, protein untouched
  lowUnder: 200,             // under by 200+ = low
  unloggedBelow: 0.35,       // under 35 % of target = not really logged: unknown, never judged
  noActivitySteps: 5000,     // under this AND no training = a no-activity day (same line as the PDF's Plan B)
  trainedMinutes: 30,        // logged exercise of this length (or any logged sets) counts as a training day
  streakForTarget: 2,        // days in a row that agree before the calorie target level moves
  noActivityMaxPal: 1.27, activeMinPal: 1.5, gymDayPal: 0.21,
  floorTrained: 1700, floorNoActivity: 1600,   // the PDF's floors: used for warnings and the recovery guarantee
  recoverySteps: 2000, closeOfDayHour: 21, gapDays: 4,
};
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r10 = (x) => Math.round(x / 10) * 10;
const LEVEL_OF_LABEL = { no_activity: 'sedentary', moderate: 'moderate', active: 'moderate' };
const weekdayMon0 = (date) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

// ------------------------------------------------------------------------------------------------ one day
/** PAL of one day. Weekly formula 1.2 + 0.012 x (k-steps - 3) + 0.03 x gym days; per day a session adds 0.03 x 7. */
const dayPal = (steps, trained) => 1.2 + 0.012 * Math.max(0, n0(steps) / 1000 - 3) + (trained ? CFG.gymDayPal : 0);

const isTrained = (row, strengthDates) => !!(strengthDates && strengthDates.has && strengthDates.has(row.date)) || n0(row.exerciseMinutes) >= CFG.trainedMinutes;

/** no_activity | moderate | active, or null when the day has nothing to judge by (steps not synced and nothing trained). */
function activityLabel(row, trained) {
  const steps = n0(row?.steps);
  if (trained) return dayPal(steps, true) >= CFG.activeMinPal ? 'active' : 'moderate';
  if (steps <= 0) return null;
  return steps < CFG.noActivitySteps ? 'no_activity' : 'moderate';
}

/** The app's own activity level that fits a day: sedentary for no activity, light for 5-7.5k steps without training, else moderate. */
function appLevelFor(label, row, trained) {
  if (!label) return null;
  if (label === 'no_activity') return 'sedentary';
  return trained || n0(row?.steps) >= 7500 ? 'moderate' : 'light';
}

/** cheat_day | heavy | over | on_plan | low | under | unknown, against THAT day's budget (target + earned activity). */
function dayKind(calories, budget, floor = 0, target = budget) {
  const c = n0(calories);
  if (c < CFG.unloggedBelow * n0(target)) return 'unknown';
  const over = c - n0(budget);
  if (over >= CFG.cheatOver) return 'cheat_day';
  if (over >= CFG.heavyOver) return 'heavy';
  if (floor && c < floor - 150) return 'under';
  if (over > CFG.overOver) return 'over';
  if (over < -CFG.lowUnder) return 'low';
  return 'on_plan';
}

function budgetOf(profile, row) { return E.dayBalance(profile, { eaten: n0(row?.calories), workout: n0(row?.caloriesBurned) }).budget; }

// ------------------------------------------------------------------------------------------------ maintenance
function tdeeAt(profile, level) {
  const e = E.expectedEnergy({ ...profile, activityMode: 'manual', activityLevel: level });
  return e ? e.tdee : null;
}

/** The level the calorie target should use. Mirrored in lib/energy.js (and the web + mobile copies): manual = the person's level. */
function effectiveLevel(profile) { return E.activityLevelOf(profile) || 'moderate'; }

/** Today's maintenance. auto: from yesterday's activity. manual: the level you chose. */
function selectMaintenance(profile, yRow, yTrained) {
  const manual = profile?.activityMode !== 'auto';
  if (manual) {
    const level = profile?.activityLevel || 'moderate';
    return { mode: 'manual', source: 'manual', level, label: level === 'sedentary' ? 'no_activity' : 'moderate', tdee: tdeeAt(profile, level), basis: `you chose "${level.replace('_', ' ')}"` };
  }
  const label = yRow ? activityLabel(yRow, yTrained) : null;
  if (!label) {
    const level = effectiveLevel(profile);
    return { mode: 'auto', source: 'fallback', level, label: level === 'sedentary' ? 'no_activity' : 'moderate', tdee: tdeeAt(profile, level), basis: 'yesterday has no steps or training logged, so your usual level is used' };
  }
  const level = appLevelFor(label, yRow, yTrained);
  const what = `${n0(yRow.steps) ? `${Math.round(n0(yRow.steps)).toLocaleString('en-US')} steps` : 'no steps synced'}, ${yTrained ? 'trained' : 'no training'}`;
  return { mode: 'auto', source: 'yesterday', level, label, tdee: tdeeAt(profile, level), basis: `yesterday (${yRow.date}): ${what}` };
}

/**
 * The stored auto state, refreshed each day. The TARGET level only moves when the last STREAK days agree, so one lazy day
 * (or one big day) never changes what you eat. y1 = yesterday, y2 = the day before: [{date, row, trained}].
 */
function nextAutoActivity(prev, profile, y1, y2, today) {
  const keep = (prev && prev.targetLevel) || profile?.activityLevel || 'moderate';
  const l1 = y1 ? appLevelFor(activityLabel(y1.row, y1.trained), y1.row, y1.trained) : null;
  const l2 = y2 ? appLevelFor(activityLabel(y2.row, y2.trained), y2.row, y2.trained) : null;
  const streak = l1 && l1 === l2 ? CFG.streakForTarget : l1 ? 1 : 0;
  const targetLevel = streak >= CFG.streakForTarget ? l1 : keep;
  return { asOf: today, yesterday: y1 ? { date: y1.row.date, label: activityLabel(y1.row, y1.trained), level: l1 } : null, streak, targetLevel };
}

// ------------------------------------------------------------------------------------------------ what am I?
/**
 * Two witnesses over the last 14-35 days: behaviour (logged steps + training days) and the scale (what your weight and food log
 * say you burn, via adaptiveMaintenance). Both agree = high confidence. They disagree = behaviour wins, with a warning to check logging.
 * @param days ascending history rows (buildHistory); strengthDates Set of dates with logged sets
 */
function suggestActivityLevel({ profile, days = [], strengthDates = null, today }) {
  const win = days.filter((d) => d.date <= today && d.date > addDays(today, -14));
  const stepDays = win.filter((d) => n0(d.steps) > 0);
  const out = { currentMode: profile?.activityMode === 'auto' ? 'auto' : 'manual', currentLevel: profile?.activityLevel || 'moderate',
    behaviourLevel: null, stepsAvg: 0, sessionsPerWeek: 0, scaleLevel: null, scalePal: null, suggested: null, suggestedAppLevel: null, confidence: 'none', switch: false, message: '' };
  if (win.filter((d) => n0(d.steps) > 0 || isTrained(d, strengthDates)).length < 7) { out.message = 'Log steps and training for a week and I can tell you which level you really are.'; return out; }
  const stepsAvg = stepDays.length ? stepDays.reduce((s, d) => s + d.steps, 0) / stepDays.length : 0;
  const sessions = (win.filter((d) => isTrained(d, strengthDates)).length / Math.max(1, win.length)) * 7;
  const bLevel = sessions < 1 && stepsAvg < CFG.noActivitySteps ? 'no_activity' : 'moderate';
  const bPal = 1.2 + 0.012 * Math.max(0, stepsAvg / 1000 - 3) + 0.03 * Math.min(sessions, 6);
  Object.assign(out, { behaviourLevel: bLevel, stepsAvg: Math.round(stepsAvg), sessionsPerWeek: Math.round(sessions * 10) / 10 });

  const hist = days.filter((d) => d.date <= today).slice(-35);
  const e = E.expectedEnergy(profile);
  const ad = e ? adaptiveMaintenance(hist.map((d) => ({ date: d.date, calories: d.calories, weightKg: d.weighIn ? d.weightKg : null })), e.tdee) : null;
  let sLevel = null;
  if (ad && e) {
    const pal = ad.estimate / e.bmr;
    const margin = { high: 0.05, medium: 0.09, low: 0.14 }[ad.confidence] || 0.14;
    out.scalePal = Math.round(pal * 100) / 100;
    if (pal + margin < CFG.noActivityMaxPal) sLevel = 'no_activity';
    else if (pal - margin >= CFG.activeMinPal) sLevel = 'active';
    else if (pal - margin >= CFG.noActivityMaxPal && pal + margin < CFG.activeMinPal) sLevel = 'moderate';
    out.scaleLevel = sLevel;
  }
  const norm = (x) => (x === 'no_activity' ? 'no_activity' : 'moderate');
  const suggested = norm(bLevel);
  const conf = sLevel && norm(sLevel) === suggested ? 'high' : sLevel ? 'medium' : win.length >= 10 ? 'medium' : 'low';
  const nm = { no_activity: 'No activity', moderate: 'Moderate', active: 'Active' };
  let msg = `Last 14 days: ${Math.round(stepsAvg).toLocaleString('en-US')} steps a day and ${out.sessionsPerWeek} training days a week = ${nm[bLevel]} (activity factor ${bPal.toFixed(2)}).`;
  if (sLevel && norm(sLevel) === suggested) msg += ` Your weight trend agrees (it implies ${out.scalePal}).`;
  else if (sLevel) msg += ` But your weight trend implies ${out.scalePal} (${nm[sLevel]}): either food is under-logged or your body burns less than the formula. Weigh food for a week.`;
  const chosen = norm(out.currentLevel === 'sedentary' ? 'no_activity' : 'moderate');
  if (out.currentMode === 'manual' && conf !== 'low' && chosen !== suggested) { out.switch = true; msg += ` You chose ${nm[chosen]}; your data says ${nm[suggested]}. Switch the level (or use automatic).`; }
  else if (out.currentMode === 'auto') msg += " Automatic mode follows yesterday's activity.";
  Object.assign(out, { suggested, suggestedAppLevel: suggested === 'no_activity' ? 'sedentary' : (stepsAvg >= 7500 || sessions >= 3 ? 'moderate' : 'light'), confidence: conf, message: msg });
  return out;
}

// ------------------------------------------------------------------------------------------------ recovery + protein fixes
const PROTEIN_FIX = [  // per 100 g: protein, carbs, fat, step g, max g, who can eat it
  { key: 'whey', name: 'Whey protein', p: 80, c: 6.7, f: 5, step: 10, max: 60, ok: (d) => d.dairy },
  { key: 'yogurt', name: 'Greek yogurt (non-fat)', p: 10, c: 3.5, f: 0.5, step: 50, max: 400, ok: (d) => d.dairy },
  { key: 'soya', name: 'Soya chunks (dry)', p: 52, c: 33, f: 0.5, step: 5, max: 60, ok: () => true },
  { key: 'white', name: 'Egg whites', p: 10.9, c: 0.7, f: 0.2, step: 50, max: 300, ok: (d) => d.egg },
  { key: 'chicken', name: 'Chicken breast (raw)', p: 22.8, c: 0, f: 1.9, step: 25, max: 250, ok: (d) => d.meat },
];
const dietFlags = (diet = '') => ({ dairy: diet !== 'vegan', egg: diet === 'egg' || diet === 'nonveg', meat: diet === 'nonveg' });

function proteinFixes(diet, gapG, roomKcal) {
  const f = dietFlags(diet);
  return PROTEIN_FIX.filter((x) => x.ok(f)).map((x) => {
    const g = Math.min(x.max, Math.max(x.step, Math.ceil(gapG / (x.p / 100) / x.step) * x.step));
    const kcal = Math.round(4 * (x.p * g) / 100 + 4 * (x.c * g) / 100 + 9 * (x.f * g) / 100);
    return { key: x.key, food: x.name, grams: g, protein: Math.round((x.p * g) / 100), kcal, fits: kcal <= roomKcal };
  }).sort((a, b) => (a.fits === b.fits ? a.kcal / Math.max(a.protein, 1) - b.kcal / Math.max(b.protein, 1) : a.fits ? -1 : 1)).slice(0, 3);
}

/** The PDF's 3-day recovery after a heavy / cheat day: normal meals, no fasting, steps +2,000, scale ignored. */
function recoveryDays(afterDate, stepsTarget) {
  const note = ['normal 4 meals, water 4 L, low salt, up to 300 g beans+cabbage per meal', '+1 extra 25-min incline walk (to keep activity up, not as punishment)', 'back to normal'];
  return [1, 2, 3].map((i) => ({ date: addDays(afterDate, i), steps: stepsTarget + CFG.recoverySteps, note: note[i - 1], fasting: false }));
}

// ------------------------------------------------------------------------------------------------ today's guide
/**
 * @param o.profile, o.days (ascending, last row = today or earlier), o.today, o.strengthDates, o.target, o.floor, o.diet
 * @returns maintenance (from yesterday or your choice), what yesterday was, recovery plan, notes, and the "what am I?" suggestion.
 */
function dayGuide({ profile, days = [], today, strengthDates = null, target = 0, floor = 0, diet = '' }) {
  const by = new Map(days.map((d) => [d.date, d]));
  const yesterday = addDays(today, -1);
  const y = by.get(yesterday) || null;
  const yTrained = y ? isTrained(y, strengthDates) : false;
  const maint = selectMaintenance(profile, y, yTrained);
  const noAct = maint.label === 'no_activity';
  const safeFloor = Math.max(floor || 0, noAct ? CFG.floorNoActivity : CFG.floorTrained) ;
  const stepsTarget = n0(profile?.goals?.stepsTarget) || 10000;
  const planned = new Set(Array.isArray(profile?.training?.weekdays) ? profile.training.weekdays : []);
  const gymToday = planned.has(weekdayMon0(today));
  const notes = [];

  const yKind = y ? dayKind(y.calories, budgetOf(profile, y), floor, target) : 'unknown';
  const missed = !!(y && planned.has(weekdayMon0(yesterday)) && !yTrained);
  const usual = effectiveLevel(profile);

  if (maint.tdee) notes.push(`Maintenance today is about ${r10(maint.tdee).toLocaleString('en-US')} kcal (${maint.label.replace('_', ' ')}; ${maint.basis}).`);
  if (maint.mode === 'auto' && noAct && usual !== 'sedentary') notes.push(`Yesterday was a no-activity day: that one day changes nothing in your calories (no cut, no punishment). Hit today's steps${gymToday ? ' and training' : ''}. ${CFG.streakForTarget} such days in a row lower the calorie target to match.`);
  if (maint.mode === 'auto' && usual === 'sedentary' && profile?.autoActivity?.streak >= CFG.streakForTarget) notes.push('Two no-activity days in a row: your calorie target now uses the no-activity level (never below your safe floor). 20 minutes of walking is the fastest way back.');
  if (missed) notes.push("You missed yesterday's planned training: no calorie cut, no doubling up, no punishment cardio. Continue the plan.");
  if (yKind === 'under') notes.push(`Yesterday was below your safe floor (${safeFloor} kcal): eat today's plan in full, smaller more frequent meals, protein first.`);
  else if (yKind === 'low') notes.push('Yesterday was under plan: do not bank it. Eat today as planned, protein first.');

  // heavy / cheat day in the last 3 days -> recovery
  let recovery = null;
  for (let k = 1; k <= 3 && !recovery; k += 1) {
    const d = addDays(today, -k); const row = by.get(d);
    if (!row) continue;
    const kind = dayKind(row.calories, budgetOf(profile, row), floor, target);
    if (kind === 'heavy' || kind === 'cheat_day') {
      const b = E.dayBalance(profile, { eaten: row.calories, workout: n0(row.caloriesBurned) });
      recovery = { dayIndex: k, kind, date: d, calories: Math.round(row.calories), overBudget: Math.round(row.calories - b.budget),
        fatKgVsMaintenance: Math.round((Math.max(0, -(b.net ?? 0)) / E.KCAL_PER_KG) * 100) / 100, stepsTarget: stepsTarget + CFG.recoverySteps, floor: safeFloor,
        days: recoveryDays(d, stepsTarget) };
      notes.push(`Recovery day ${k}/3 after ${d} (${Math.round(row.calories).toLocaleString('en-US')} kcal): normal meals at normal amounts, NO fasting, water ${k === 1 ? '4' : '3.5-4'} L, steps ${stepsTarget + CFG.recoverySteps}, protein first. Never below ${safeFloor} kcal.`);
      if (k === 1) notes.push('Scale +1 to +2 kg tomorrow morning is water and salt: it is ignored in your trend and falls back in 2-4 days.');
      if (k === 2) notes.push('One extra 25-min incline walk keeps activity up. It is not a punishment.');
    }
  }

  // days off training
  let off = null;
  for (let k = 1; k <= 30; k += 1) { const r = by.get(addDays(today, -k)); if (r && isTrained(r, strengthDates)) { off = k - 1; break; } }
  let gap = null;
  if (off !== null && off >= CFG.gapDays) {
    gap = off <= 7 ? { loadFactor: 0.95, action: 'first session 5% lighter' } : off <= 14 ? { loadFactor: 0.9, action: 'first week 10% lighter, then resume progression' } : off <= 28 ? { loadFactor: 0.85, action: 'restart at week-1 loads' } : { loadFactor: 0.8, action: 'treat it as a new plan' };
    notes.push(`${off} days since your last session: when you train, ${gap.action} (loads x${gap.loadFactor}). Calories stay as planned.`);
  }

  const suggestion = suggestActivityLevel({ profile, days, strengthDates, today });
  return {
    date: today, maintenance: { ...maint, tdee: maint.tdee ? r10(maint.tdee) : null }, targetLevel: effectiveLevel(profile),
    yesterday: y ? { date: yesterday, label: activityLabel(y, yTrained), kind: yKind, calories: Math.round(n0(y.calories)), steps: Math.round(n0(y.steps)), trained: yTrained, missedWorkout: missed } : null,
    plannedGymToday: gymToday, recovery, daysOffTraining: off, gap, notes, activity: suggestion, floor: safeFloor, stepsTarget: recovery ? recovery.stepsTarget : stepsTarget,
    diet,
  };
}

// ------------------------------------------------------------------------------------------------ feedback while logging
/**
 * @param o.row   today's totals so far {calories, protein, steps, exerciseMinutes, caloriesBurned}
 * @param o.complete  true = finished eating for the day (or hour >= 21)
 */
function entryCheck({ profile, today, row = {}, target = 0, floor = 0, proteinTarget = 0, diet = '', complete = false, hour = null, trained = false, stepsTarget = 10000, plannedGym = false }) {
  const bal = E.dayBalance(profile, { eaten: n0(row.calories), workout: n0(row.caloriesBurned) });
  const budget = bal.budget;
  const eaten = Math.round(n0(row.calories));
  const closing = !!complete || (hour !== null && hour >= CFG.closeOfDayHour);
  let kind = dayKind(eaten, budget, floor, target);
  if (!closing && (kind === 'low' || kind === 'under')) kind = 'on_plan';      // the day is not over: being under so far is normal
  const out = { date: today, status: 'NO_FOOD_LOGGED', eaten, budget: Math.round(budget), remaining: Math.round(budget - eaten), closing, messages: [], proteinFixes: [], nextDays: [], dayEffect: null };
  const m = out.messages;
  const over = eaten - budget;
  const safeFloor = Math.max(floor || 0, n0(row.steps) > 0 && n0(row.steps) < CFG.noActivitySteps && !trained ? CFG.floorNoActivity : CFG.floorTrained);
  if (kind !== 'unknown' || closing) out.status = kind === 'unknown' ? 'NO_FOOD_LOGGED' : kind.toUpperCase();

  if (kind === 'cheat_day' || kind === 'heavy') {
    const fat = Math.max(0, -(bal.net ?? 0)) / E.KCAL_PER_KG;
    m.push(`${kind === 'cheat_day' ? 'Cheat' : 'Heavy'} day: ${eaten.toLocaleString('en-US')} kcal is ${Math.round(over)} over today's budget. Fat effect at most ~${fat.toFixed(2)} kg. If the other days stay on plan the week still loses fat.`);
    m.push('Scale +1 to +2 kg tomorrow is water and salt: it is ignored in your trend and falls back in 2-4 days.');
    m.push(closing ? 'Walk 15-20 min after the big meal and drink water. No fasting, no punishment workout tomorrow.' : `Do not skip the meals still to come (no fasting). Protein first, eat slowly, stop comfortably full, 3.5 L water, walk 15-20 min after the big meal. If you are full, leave some rice/roti, never the protein. The day will not drop under ${safeFloor} kcal.`);
    out.nextDays = recoveryDays(today, stepsTarget);
  } else if (kind === 'over') {
    const cut = Math.max(0, Math.min(150, Math.round(over)));
    m.push(`${eaten.toLocaleString('en-US')} kcal is ${Math.round(over)} over today's budget.`);
    m.push(closing ? 'Nothing left to trim. Keep tomorrow at the normal plan (no fasting) and add a 15-min walk.' : `Trim about ${cut} kcal from carbs in the next meal (about 45 g raw rice, or 1.5 rotis). Protein foods stay as planned. Do not skip a meal and do not make up for it tomorrow.`);
  } else if (kind === 'on_plan') {
    m.push(closing ? 'On plan. Well done.' : `On plan so far. ${Math.max(0, Math.round(budget - eaten)).toLocaleString('en-US')} kcal left. Protein first at the next meal.`);
  } else if (closing && (kind === 'low' || kind === 'under')) {
    m.push(`Day finished ${Math.round(budget - eaten)} kcal under budget${kind === 'under' ? ` and below your safe floor (${safeFloor})` : ''}. Not a bonus: tomorrow eat the plan in full, smaller meals if appetite is low, protein first, whey shake.`);
  }

  if (closing && n0(proteinTarget) > 0 && n0(row.protein) < 0.85 * proteinTarget && eaten > 0) {
    const gap = proteinTarget - n0(row.protein);
    out.proteinFixes = proteinFixes(diet, Math.max(gap, 8), Math.max(0, budget - eaten));
    const b = out.proteinFixes[0];
    if (b) m.push(`Protein is ${Math.round(gap)} g short of ${Math.round(proteinTarget)} g. Easiest fix: ${b.grams} g ${b.food} (+${b.protein} g protein, ${b.kcal} kcal)${b.fits ? '' : ' and swap out about that many kcal of rice/roti'}. Calories stay as planned.`);
  }
  else if (!closing && hour !== null && hour >= 18 && n0(proteinTarget) > 0 && eaten > 0 && n0(row.protein) < 0.6 * proteinTarget) {
    // evening nudge: protein is the priority, and there is still time to fix it with one small thing
    const gap = proteinTarget - n0(row.protein);
    out.proteinFixes = proteinFixes(diet, Math.min(gap, 40), Math.max(0, budget - eaten));
    const b = out.proteinFixes[0];
    if (b) m.push(`Protein is only ${Math.round(n0(row.protein))} g of ${Math.round(proteinTarget)} g and it is evening. Easiest fix before bed: ${b.grams} g ${b.food} (+${b.protein} g protein, ${b.kcal} kcal). Protein matters more than the exact time.`);
  }
  const steps = n0(row.steps);
  if (closing && steps > 0 && steps < 0.85 * stepsTarget) m.push(`Steps ${Math.round(steps).toLocaleString('en-US')} vs target ${stepsTarget.toLocaleString('en-US')}: about ${Math.round((stepsTarget - steps) / 100)} more minutes of walking closes the gap.`);
  if (closing && plannedGym && !trained) m.push('Planned training not done: no penalty, calories stay as planned, do not double up. Carry on with the plan; 4+ days off lowers loads (5% / 10% / 15%).');
  else if (trained && !plannedGym) m.push('Extra session on a rest day: fine, but calories stay as planned (no extra food, no cut).');
  if (closing && steps > 0 && steps < CFG.noActivitySteps && !trained) {
    const noActTdee = tdeeAt(profile, 'sedentary');
    const mc = tdeeAt(profile, effectiveLevel(profile));
    if (noActTdee && mc) m.push(`No-activity day: your maintenance today is only about ${r10(noActTdee).toLocaleString('en-US')} kcal (not ${r10(mc).toLocaleString('en-US')}), so today's deficit was about ${Math.max(0, Math.round(noActTdee - eaten))} kcal. One day changes nothing in the plan; a second in a row lowers the target level.`);
  }
  if (closing && bal.net !== null) out.dayEffect = { net: Math.round(bal.net), fatKg: Math.round((-bal.net / E.KCAL_PER_KG) * 100) / 100 };
  if (!out.nextDays.length && closing) out.nextDays = [{ date: addDays(today, 1), steps: stepsTarget, note: 'normal plan, normal amounts', fasting: false }];
  return out;
}

module.exports = { CFG, dayPal, isTrained, activityLabel, appLevelFor, dayKind, budgetOf, tdeeAt, effectiveLevel, selectMaintenance, nextAutoActivity, suggestActivityLevel, proteinFixes, recoveryDays, dayGuide, entryCheck, weekdayMon0 };
