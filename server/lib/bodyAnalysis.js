// Body analysis: what is ACTUALLY changing, how accurate the calorie target is, how fast is sensible, how to finish, and how to stay there.
// Pure functions (no database, no clock): every one takes plain numbers and returns plain data, with `null` / `ready:false` when there is too little
// data. It never guesses, and it returns ids + numbers: the apps turn them into words in the person's language (utils/coachText.js, coach.body.*).
const { diffDays, addDays } = require('./dates');
const { KCAL_PER_KG, stepCalories } = require('./energy');
const { maxSafeWeeklyLossKg } = require('./trendWeight');

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const bmiOf = (kg, cm) => (kg > 0 && cm > 0 ? kg / ((cm / 100) ** 2) : null);

// ---------------------------------------------------------------- 1-2. fat vs lean, recomposition
/** @param comp compositionChange() result  @param strengthStatus 'up'|'flat'|'down'|null  @param rateKgWk weight trend kg/week (negative = losing) */
function fatLeanEstimate({ comp, strengthStatus = null, rateKgWk = null } = {}) {
  if (!comp || !comp.hasData) return { ready: false };
  const tapeOnly = comp.fatMassChangeKg === null;
  const m = tapeOnly ? null : r1(0.6 + 0.25 * Math.abs(comp.fatMassChangeKg));          // a tape-based fat estimate is good for CHANGE, but never exact: say so as a range
  const fat = comp.fatMassChangeKg, lean = comp.leanChangeKg;
  let verdict = 'unclear';
  if (tapeOnly) verdict = comp.waistChangeCm <= -1 ? 'fat-loss' : comp.waistChangeCm >= 1.5 ? 'fat-gain' : 'unclear';
  else if (lean < -0.7) verdict = 'muscle-loss';
  else if (fat <= -0.5 && lean >= 0.3) verdict = 'recomp';
  else if (fat <= -0.5) verdict = 'fat-loss';
  else if (fat >= 0.5) verdict = 'fat-gain';
  if (verdict === 'fat-loss' && strengthStatus === 'down' && !tapeOnly && lean < -0.3) verdict = 'muscle-loss';
  return { ready: true, verdict, tapeOnly, waistChangeCm: comp.waistChangeCm, fat, lean, fatRange: tapeOnly ? null : [r1(fat - m), r1(fat + m)], leanRange: tapeOnly ? null : [r1(lean - m), r1(lean + m)],
    bfStart: comp.bfStart, bfEnd: comp.bfEnd, confidence: tapeOnly ? 'low' : 'medium', rateKgWk };
}

/** A flat scale with a shrinking waist and steady or rising lifts is progress, not a stall: do not cut. */
function recompVerdict({ rateKgWk, comp, strengthStatus }) {
  if (rateKgWk === null || rateKgWk === undefined || !comp || !comp.hasData) return null;
  const flat = Math.abs(rateKgWk) <= 0.15;
  const bodyBetter = comp.waistChangeCm <= -1 || (comp.fatMassChangeKg !== null && comp.fatMassChangeKg <= -0.5);
  return flat && bodyBetter && strengthStatus !== 'down' ? { recomp: true, waistChangeCm: comp.waistChangeCm, strengthStatus } : null;
}

// ---------------------------------------------------------------- 3. ratios
function bodyRatios({ heightCm, waistCm, hipCm = null, sex = '' } = {}) {
  const h = Number(heightCm), w = Number(waistCm);
  if (!(h > 0 && w > 0)) return null;
  const whtr = r2(w / h);
  const band = whtr < 0.4 ? 'low' : whtr < 0.5 ? 'healthy' : whtr < 0.6 ? 'raised' : 'high';
  const out = { whtr, band, cmToHalfHeight: Math.max(0, r1(w - 0.5 * h)), whr: null, whrBand: null };
  if (Number(hipCm) > 0) { out.whr = r2(w / Number(hipCm)); out.whrBand = out.whr >= (sex === 'female' ? 0.85 : 0.9) ? 'raised' : 'healthy'; }
  return out;
}

// ---------------------------------------------------------------- 4-5. calibrated maintenance and the logging gap
/** Like adaptiveTdee, plus a range from how noisy the weight really was. @param days ascending [{date, calories, weightKg}] */
function calibratedMaintenance(days, expected = null) {
  if (!days || !days.length) return { ready: false, need: { weighIns: 8, spanDays: 21, loggedDays: 14 } };
  const first = days[0].date;
  const pts = days.filter((d) => Number(d.weightKg) > 0).map((d) => ({ x: diffDays(first, d.date), y: Number(d.weightKg) }));
  const logged = days.filter((d) => d.calories > 0);
  const span = pts.length ? pts[pts.length - 1].x - pts[0].x : 0;
  if (pts.length < 6 || span < 14 || logged.length < 10) return { ready: false, need: { weighIns: Math.max(0, 6 - pts.length), spanDays: Math.max(0, 14 - span), loggedDays: Math.max(0, 10 - logged.length) } };
  const n = pts.length, mx = avg(pts.map((p) => p.x)), my = avg(pts.map((p) => p.y));
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const slope = sxx ? sxy / sxx : 0;
  const rss = pts.reduce((s, p) => s + (p.y - (my + slope * (p.x - mx))) ** 2, 0);
  const se = n > 2 && sxx ? Math.sqrt(rss / (n - 2) / sxx) : 0.05;                         // kg per day
  const intake = avg(logged.map((d) => d.calories));
  const estimate = Math.round((intake - slope * KCAL_PER_KG) / 10) * 10;
  const half = Math.max(100, Math.round((1.64 * se * KCAL_PER_KG + 0.05 * intake) / 10) * 10);   // weight noise + ~5% food-logging error
  const share = logged.length / days.length;
  const confidence = share >= 0.8 && n >= 10 && span >= 28 && half <= 250 ? 'high' : share >= 0.6 && span >= 21 ? 'medium' : 'low';
  return { ready: true, estimate, low: estimate - half, high: estimate + half, expected: expected ? Math.round(expected) : null,
    diff: expected ? Math.round((estimate - expected) / 10) * 10 : null, avgIntake: Math.round(intake), kgPerWeek: r2(slope * 7), loggedShare: r2(share), confidence };
}

/** Weight moves slower than the logged food predicts: the usual cause is food that never got logged. Says how big the gap is and where it usually hides. */
function loggingGap({ avgIntake, expectedTdee, kgPerWeek, loggedShare = 1 } = {}) {
  if (!(avgIntake > 0 && expectedTdee > 0) || kgPerWeek === null || kgPerWeek === undefined || loggedShare < 0.7) return null;
  const predicted = ((avgIntake - expectedTdee) * 7) / KCAL_PER_KG;                       // kg/week the logs alone would give
  const gap = Math.round((((kgPerWeek - predicted) * KCAL_PER_KG) / 7) / 10) * 10;      // kcal/day that "disappeared" (positive = weight is higher than logged food allows)
  if (gap < 250) return null;
  return { likely: true, kcalPerDay: gap, predictedKgPerWeek: r2(predicted), actualKgPerWeek: r2(kgPerWeek), fixes: ['weigh-food', 'oil', 'drinks', 'weekends'] };
}

// ---------------------------------------------------------------- 7. a quiet fall in daily movement
function activityDrop({ days = [], today } = {}) {
  const steps = (from, to) => days.filter((d) => d.date >= from && d.date <= to && Number(d.steps) > 0).map((d) => Number(d.steps));
  const now = steps(addDays(today, -13), today), before = steps(addDays(today, -27), addDays(today, -14));
  if (now.length < 8 || before.length < 8) return null;
  const a = avg(now), b = avg(before);
  const dropPct = Math.round(((b - a) / b) * 100);
  if (dropPct < 15 || b - a < 1000) return null;
  return { dropPct, now: Math.round(a), before: Math.round(b), floor: Math.round((b * 0.9) / 500) * 500 };
}

// ---------------------------------------------------------------- 8-9. sensible pace and the finish
function paceByBody({ weightKg, heightCm, sex = '', bodyFatPct = null, chosenPace = null } = {}) {
  const w = Number(weightKg), bmi = bmiOf(w, Number(heightCm));
  if (!(w > 0) || bmi === null) return null;
  let pct = bmi >= 30 ? 1.0 : bmi >= 25 ? 0.75 : bmi >= 22 ? 0.5 : 0.3;                    // % of body weight per week at most: leaner or lighter means slower, to keep muscle
  if (bodyFatPct !== null) { const lean = sex === 'female' ? [22, 28] : [15, 20]; pct = Math.min(pct, bodyFatPct < lean[0] ? 0.35 : bodyFatPct < lean[1] ? 0.5 : 1.0); }
  const maxKg = Math.min(r2((pct / 100) * w), maxSafeWeeklyLossKg(w));
  const level = chosenPace > maxKg * 1.15 ? 'fast' : chosenPace > 0 && chosenPace < maxKg * 0.4 ? 'slow' : 'ok';
  return { bmi: r1(bmi), maxPctPerWeek: pct, maxKgPerWeek: r2(maxKg), chosenPace: chosenPace || null, level };
}

const TAPER = [[1.5, 0.5], [3, 0.65], [5, 0.8]];                                            // [kg still to lose, share of the planned pace]
/** The last few kilos are the hardest to hold: ease the pace so the finish is sustainable. Returns null when no easing is due. */
function taperPlan({ currentKg, targetKg, paceKg, direction = 'lose' } = {}) {
  if (direction !== 'lose' || !(paceKg > 0)) return null;
  const remaining = r1(Number(currentKg) - Number(targetKg));
  if (!(remaining > 0.4)) return null;
  const step = TAPER.find(([kg]) => remaining <= kg);
  if (!step) return null;
  const pace = Math.max(0.2, Math.floor(paceKg * step[1] * 20) / 20);
  if (pace > paceKg - 0.05) return null;
  return { inTaper: true, remainingKg: remaining, fromPace: r2(paceKg), pace: r2(pace), factor: step[1], finishWeeks: Math.ceil(remaining / pace) };
}

// ---------------------------------------------------------------- 10. a plateau checked in the right order
/** Cheapest explanation first. @returns {items:[{id,status,vars}], next} status: ok | fix | maybe */
function plateauChecks({ weighIns14 = 0, minWeighIns = 6, waterLikely = false, loggedShare = null, gap = null, drop = null, maintenance = null } = {}) {
  const items = [];
  items.push({ id: 'data', status: weighIns14 < minWeighIns ? 'fix' : 'ok', vars: { have: weighIns14, need: minWeighIns } });
  items.push({ id: 'water', status: waterLikely ? 'maybe' : 'ok', vars: {} });
  items.push({ id: 'logging', status: loggedShare !== null && loggedShare < 0.7 ? 'fix' : gap ? 'maybe' : 'ok', vars: { pct: loggedShare === null ? 0 : Math.round(loggedShare * 100), kcal: gap ? gap.kcalPerDay : 0 } });
  items.push({ id: 'activity', status: drop ? 'fix' : 'ok', vars: drop ? { pct: drop.dropPct, floor: drop.floor } : {} });
  const adapted = maintenance && maintenance.ready && maintenance.confidence !== 'low' && maintenance.diff !== null && maintenance.expected && maintenance.diff <= -0.08 * maintenance.expected;
  items.push({ id: 'adaptation', status: adapted ? 'maybe' : 'ok', vars: adapted ? { kcal: Math.abs(maintenance.diff) } : {} });
  const next = items.find((i) => i.status !== 'ok');
  return { items, next: next ? next.id : null };
}

// ---------------------------------------------------------------- 11. diet fatigue
function fatigueScore({ readiness = [], strengthStatus = null, adherence7 = null, adherencePrev = null, weeksInDeficit = 0 } = {}) {
  const sleep = avg(readiness.map((r) => r.sleepHours).filter((x) => Number(x) > 0)), energy = avg(readiness.map((r) => r.energy).filter((x) => Number(x) > 0));
  const sore = avg(readiness.map((r) => r.soreness).filter((x) => Number(x) > 0)), stress = avg(readiness.map((r) => r.stress).filter((x) => Number(x) > 0));
  const parts = {
    sleep: sleep === null ? 0 : clamp01((7 - sleep) / 2), energy: energy === null ? 0 : clamp01((3.5 - energy) / 2), soreness: sore === null ? 0 : clamp01((sore - 2.5) / 2),
    stress: stress === null ? 0 : clamp01((stress - 2.5) / 2), strength: strengthStatus === 'down' ? 1 : 0,
    adherence: adherence7 !== null && adherencePrev !== null ? clamp01((adherencePrev - adherence7) / 0.3) : 0, deficit: clamp01((weeksInDeficit - 4) / 8),
  };
  const W = { sleep: 15, energy: 20, soreness: 10, stress: 10, strength: 20, adherence: 10, deficit: 15 };
  const score = Math.round(Object.keys(W).reduce((s, k) => s + W[k] * parts[k], 0));
  const band = score >= 60 ? 'high' : score >= 35 ? 'moderate' : 'low';
  return { score, band, reasons: Object.keys(parts).filter((k) => parts[k] >= 0.5), breakSuggested: (score >= 60 && weeksInDeficit >= 6) || (score >= 75 && weeksInDeficit >= 4) };
}

// ---------------------------------------------------------------- 12. is the goal realistic, and the steps on the way
function goalRealism({ heightCm, weightKg, targetKg, paceKg, byDate = '', startDate = '', today, sex = '' } = {}) {
  const w = Number(weightKg), t = Number(targetKg);
  if (!(w > 0 && t > 0) || t >= w) return null;
  const bmiNow = bmiOf(w, Number(heightCm)), bmiGoal = bmiOf(t, Number(heightCm));
  const remaining = r1(w - t), pace = paceKg > 0 ? paceKg : 0.5;
  const needWeeks = Math.ceil(remaining / pace), availWeeks = byDate ? Math.max(0, diffDays(today, byDate) / 7) : null;
  let verdict = 'ok';
  if (bmiGoal !== null && bmiGoal < 18.5) verdict = 'too-low';
  else if (pace > maxSafeWeeklyLossKg(w) * 1.05) verdict = 'too-fast';
  else if (availWeeks !== null && needWeeks > availWeeks * 1.15) verdict = 'ambitious';
  else if (bmiGoal !== null && bmiGoal < 20) verdict = 'lean';
  const step = remaining >= 12 ? 3 : 2;
  const milestones = [];
  for (let kg = step; kg < remaining && milestones.length < 8; kg += step) milestones.push({ kg: r1(w - kg), lostKg: kg, weeks: Math.ceil(kg / pace), date: addDays(today, Math.ceil(kg / pace) * 7) });
  milestones.push({ kg: t, lostKg: remaining, weeks: needWeeks, date: addDays(today, needWeeks * 7), goal: true });
  const since = startDate ? diffDays(startDate, today) : 0;
  return { verdict, bmiNow: r1(bmiNow || 0), bmiGoal: r1(bmiGoal || 0), remainingKg: remaining, needWeeks, availWeeks: availWeeks === null ? null : Math.round(availWeeks), milestones, reviewEveryDays: 28, nextReviewDate: addDays(today, 28 - (since % 28 || 0)) };
}

// ---------------------------------------------------------------- 13. keeping it
const RAMP_STEP = 125;
/** At the goal: raise food gradually to maintenance (not all at once), and keep a weight band. */
function maintenancePhase({ currentKg, targetKg, calorieTarget, maintenanceKcal, bandKg = 1.5 } = {}) {
  if (!(currentKg > 0 && targetKg > 0 && maintenanceKcal > 0)) return null;
  if (Math.abs(currentKg - targetKg) > 0.8) return null;
  const ramp = [];
  let k = Number(calorieTarget) || maintenanceKcal;
  for (let week = 1; k < maintenanceKcal - 50 && week <= 8; week += 1) { k = Math.min(maintenanceKcal, k + RAMP_STEP); ramp.push({ week, kcal: Math.round(k / 10) * 10 }); }
  return { active: true, band: { low: r1(targetKg - bandKg), high: r1(targetKg + bandKg) }, maintenanceKcal: Math.round(maintenanceKcal), ramp };
}
/** A gain of a kilo or two is easy to undo this week and hard to undo in six months: catch it early, gently. */
function regainGuard({ trendKg, band } = {}) {
  if (!(trendKg > 0) || !band) return null;
  const over = r1(trendKg - band.high);
  if (over <= 0) return { state: 'in-band', overKg: 0 };
  return over < 0.75 ? { state: 'watch', overKg: over } : { state: 'act', overKg: over, action: { kcal: 125, days: 14, stepsPlus: 1000 } };
}

// ---------------------------------------------------------------- 14. what-if, side by side
function scenarios({ currentKg, targetKg, paceKg, today, weightKg } = {}) {
  const remaining = Number(currentKg) - Number(targetKg);
  if (!(remaining > 0.4) || !(paceKg > 0)) return null;
  const cap = maxSafeWeeklyLossKg(Number(currentKg));
  const base = Math.ceil(remaining / paceKg);
  const defs = [['steps', stepCalories(2000, weightKg || currentKg)], ['cut', 150], ['both', stepCalories(2000, weightKg || currentKg) + 150], ['more-cut', 300]];
  const rows = defs.map(([id, kcal]) => {
    const raw = paceKg + (kcal * 7) / KCAL_PER_KG, pace = Math.min(raw, cap), weeks = Math.ceil(remaining / pace);
    return { id, kcalPerDay: Math.round(kcal), pace: r2(pace), capped: raw > cap, weeks, date: addDays(today, weeks * 7), weeksSaved: base - weeks };
  });
  return { baseline: { weeks: base, date: addDays(today, base * 7), pace: r2(paceKg) }, rows };
}

// ---------------------------------------------------------------- 15-16. where the calories leak, and protein / fibre
/** @param rows [{date, mealType, calories, protein, fiber}] food entries (14 days)  @param days [{date, calories}] daily totals */
function topLeaks({ days = [], rows = [], target } = {}) {
  const logged = days.filter((d) => d.calories > 0);
  if (logged.length < 7 || !(target > 0)) return [];
  const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const wkend = logged.filter((d) => [0, 6].includes(dow(d.date))).map((d) => d.calories), wkday = logged.filter((d) => ![0, 6].includes(dow(d.date))).map((d) => d.calories);
  const out = [];
  if (wkend.length >= 2 && wkday.length >= 4) { const extra = Math.round(avg(wkend) - avg(wkday)); if (extra >= 250) out.push({ id: 'weekend', weeklyKcal: extra * 2, vars: { kcal: extra } }); }
  const heavy = logged.filter((d) => d.calories > target * 1.2);
  if (heavy.length >= 3) out.push({ id: 'heavy-days', weeklyKcal: Math.round(heavy.reduce((s, d) => s + d.calories - target, 0) / (logged.length / 7)), vars: { n: heavy.length } });
  const total = rows.reduce((s, r) => s + (Number(r.calories) || 0), 0);
  if (total > 0) {
    const share = (type) => rows.filter((r) => r.mealType === type).reduce((s, r) => s + (Number(r.calories) || 0), 0) / total;
    const daily = avg(logged.map((d) => d.calories));
    if (share('snack') >= 0.25) out.push({ id: 'snacks', weeklyKcal: Math.round((share('snack') - 0.15) * daily * 7), vars: { pct: Math.round(share('snack') * 100) } });
    if (share('dinner') >= 0.45) out.push({ id: 'dinner', weeklyKcal: Math.round((share('dinner') - 0.35) * daily * 7), vars: { pct: Math.round(share('dinner') * 100) } });
  }
  return out.sort((a, b) => b.weeklyKcal - a.weeklyKcal).slice(0, 3);
}

function proteinFibre({ rows = [], days = [] } = {}) {
  const meals = new Map();
  for (const r of rows) { if (!['breakfast', 'lunch', 'dinner'].includes(r.mealType)) continue; const k = `${r.date}|${r.mealType}`; meals.set(k, (meals.get(k) || 0) + (Number(r.protein) || 0)); }
  const out = [];
  if (meals.size >= 8) {
    const good = [...meals.values()].filter((p) => p >= 20).length;
    if (good / meals.size < 0.5) out.push({ id: 'protein-spread', vars: { pct: Math.round((good / meals.size) * 100) } });
  }
  const byDay = new Map(); for (const r of rows) byDay.set(r.date, (byDay.get(r.date) || 0) + (Number(r.fiber) || 0));
  const fib = [...byDay.values()];
  if (fib.length >= 5) { const a = Math.round(avg(fib)); if (a < 22) out.push({ id: 'fibre-low', vars: { avg: a } }); }
  return out;
}

// ---------------------------------------------------------------- 17. what worked for THIS person
const KIND = { LADDER_STEPS: 'steps', LADDER_WALK: 'walk', LADDER_CUT: 'cut', LADDER_BREAK: 'break', RAISE_PACE: 'pace' };
/** @param changelog changelogView() entries (after.verdict once a change is old enough to judge) */
function learnedEffects(changelog = []) {
  const by = {};
  for (const e of changelog) {
    const kind = KIND[e.action]; if (!kind || !e.after || e.undone) continue;
    const toward = e.after.rateNow - e.after.rateBefore;
    (by[kind] = by[kind] || { kind, n: 0, better: 0, worse: 0, sum: 0 });
    by[kind].n += 1; by[kind].sum += Math.abs(toward) * (e.after.verdict === 'worse' ? -1 : e.after.verdict === 'better' ? 1 : 0);
    if (e.after.verdict === 'better') by[kind].better += 1; if (e.after.verdict === 'worse') by[kind].worse += 1;
  }
  const rows = Object.values(by).map((r) => ({ kind: r.kind, n: r.n, better: r.better, worse: r.worse, avgDelta: r2(r.sum / r.n) }));
  if (rows.reduce((s, r) => s + r.n, 0) < 2) return null;
  const best = rows.filter((r) => r.n >= 2 && r.avgDelta >= 0.05).sort((a, b) => b.avgDelta - a.avgDelta)[0] || null;
  return { rows, best: best ? best.kind : null };
}

// ---------------------------------------------------------------- 19. a pattern that deserves a kind word, never a diagnosis
/** Very low days alternating with very large ones, or most days far below the floor. Used only for a supportive notice. */
function restrictionPattern({ days = [], target, floor } = {}) {
  const logged = days.filter((d) => d.calories > 0).slice(-14);
  if (logged.length < 7 || !(target > 0) || !(floor > 0)) return { flagged: false };
  const lowDays = logged.filter((d) => d.calories < floor * 0.8).length;
  let swings = 0;
  for (let i = 1; i < logged.length; i += 1) if (logged[i - 1].calories < target * 0.5 && logged[i].calories > target * 1.4) swings += 1;
  return { flagged: lowDays >= 5 || (lowDays >= 3 && swings >= 2), lowDays, swings };
}

module.exports = { fatLeanEstimate, recompVerdict, bodyRatios, calibratedMaintenance, loggingGap, activityDrop, paceByBody, taperPlan, plateauChecks, fatigueScore, goalRealism, maintenancePhase, regainGuard, scenarios, topLeaks, proteinFibre, learnedEffects, restrictionPattern, TAPER };
