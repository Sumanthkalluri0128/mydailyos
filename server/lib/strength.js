// Strength maths and progression rules. Pure functions, no database.
// Everything here is a guide from the person's own logged sets. No medical claims, and the person can always override.
const { muscleGroupsFor, GROUPS } = require('./muscles');

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// ---- Estimated 1RM -------------------------------------------------------------------------------------------------
const FORMULAS = {
  epley: 'weight × (1 + reps ÷ 30)',
  brzycki: 'weight × 36 ÷ (37 − reps)',
};

/** Epley: valid for any reps >= 1 (1 rep returns the weight itself). */
function epley(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !(r >= 1)) return null;
  return r === 1 ? round1(w) : round1(w * (1 + r / 30));
}
/** Brzycki: only trusted up to 10 reps; above that the formula runs away, so we return null instead of a made-up number. */
function brzycki(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !(r >= 1) || r > 10) return null;
  return r === 1 ? round1(w) : round1(w * 36 / (37 - r));
}
function estimate1RM(weight, reps) {
  return { epley: epley(weight, reps), brzycki: brzycki(weight, reps), formulas: FORMULAS };
}

/** The 1RM we rank sets by (Epley, as in the existing records). */
const score = (s) => epley(s.weightKg, s.reps) || 0;

// ---- History per exercise ------------------------------------------------------------------------------------------
/** logs: ActivityLog-like {activityName,date,sets:[{reps,weightKg}]}. Returns one row per session, oldest first. */
function exerciseHistory(logs, activityName) {
  const byDate = new Map();
  for (const log of logs) {
    if (log.activityName !== activityName) continue;
    for (const s of log.sets || []) {
      const reps = Number(s.reps) || 0, w = Number(s.weightKg) || 0;
      if (!reps) continue;
      const row = byDate.get(log.date) || { date: log.date, bestWeightKg: 0, bestReps: 0, best1RM: 0, volumeKg: 0, sets: 0 };
      const e = score({ weightKg: w, reps });
      if (e > row.best1RM || (e === row.best1RM && w > row.bestWeightKg)) { row.best1RM = e; row.bestWeightKg = w; row.bestReps = reps; }
      row.volumeKg += w * reps; row.sets += 1;
      byDate.set(log.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, volumeKg: Math.round(r.volumeKg) }));
}

// ---- Safe progression ----------------------------------------------------------------------------------------------
const MAX_JUMP_PCT = 10;     // more than +10% on the heaviest recent weight needs a deliberate "yes"
const BIG_REPS = 12;         // at this many reps on every set, add weight instead of reps

function smallestStep(weight) { return weight >= 40 ? 2.5 : weight >= 10 ? 1.25 : 0.5; }

/**
 * "Beat last time" hint from last session's sets. Always small: one more rep, or the smallest weight step once reps are high.
 * lastSets: [{reps, weightKg}]. Returns null with no history.
 */
function beatLastTime(lastSets, { targetReps } = {}) {
  const sets = (lastSets || []).filter((s) => Number(s.reps) > 0);
  if (!sets.length) return null;
  const top = sets.reduce((a, b) => (score(b) > score(a) ? b : a));
  const w = Number(top.weightKg) || 0;
  if (w === 0) {
    return { kind: 'reps', weightKg: 0, reps: top.reps + 1, text: `Last time ${top.reps} reps. Try ${top.reps + 1} if it feels good.` };
  }
  const cap = targetReps || BIG_REPS;
  const allHigh = sets.every((s) => Number(s.reps) >= cap && Number(s.weightKg) >= w);
  if (allHigh) {
    const next = round2(w + smallestStep(w));
    return { kind: 'weight', weightKg: next, reps: Math.max(1, cap - 4), text: `Last time ${top.reps} × ${w} kg on every set. Try ${next} kg for fewer reps.` };
  }
  return { kind: 'reps', weightKg: w, reps: top.reps + 1, text: `Last time ${top.reps} × ${w} kg. Try ${top.reps + 1} reps at ${w} kg.` };
}

/** Checks a planned weight against recent heaviest. Large jumps ask for confirmation, never block. */
function checkJump(plannedKg, recentBestKg) {
  const p = Number(plannedKg) || 0, b = Number(recentBestKg) || 0;
  if (!b || !p || p <= b) return { ok: true, pct: 0, needsConfirm: false };
  const pct = round1(((p - b) / b) * 100);
  const needsConfirm = pct > MAX_JUMP_PCT;
  return { ok: !needsConfirm, pct, needsConfirm, note: needsConfirm ? `That is ${pct}% above your recent best. Smaller steps are easier on your body. You can still go ahead if you are sure.` : '' };
}

// ---- Weekly volume per muscle --------------------------------------------------------------------------------------
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Hard sets and volume per muscle group in the 7 days ending on `endDate` (inclusive).
 * Each set counts for every group the exercise trains. `catalogue` is an optional Map name -> {muscles}.
 */
function weeklyMuscleVolume(logs, endDate, catalogue) {
  const from = addDays(endDate, -6);
  const out = Object.fromEntries(GROUPS.map((g) => [g, { sets: 0, volumeKg: 0, lastDate: '' }]));
  for (const log of logs) {
    if (log.date < from || log.date > endDate) continue;
    const groups = muscleGroupsFor(log.activityName, log.category, catalogue?.get?.(log.activityName)?.muscles);
    if (!groups.length) continue;
    const sets = (log.sets || []).filter((s) => Number(s.reps) > 0);
    // a log without sets (e.g. a timed plank) counts as one set so core work is not invisible
    const n = sets.length || 1;
    const vol = sets.reduce((t, s) => t + (Number(s.weightKg) || 0) * Number(s.reps), 0);
    for (const g of groups) {
      out[g].sets += n; out[g].volumeKg += Math.round(vol);
      if (log.date > out[g].lastDate) out[g].lastDate = log.date;
    }
  }
  return out;
}

/** Whole days since each muscle group was last trained (null = no record in the logs given). */
function daysSinceTrained(logs, today, catalogue) {
  const last = {};
  for (const log of logs) {
    if (log.date > today) continue;
    for (const g of muscleGroupsFor(log.activityName, log.category, catalogue?.get?.(log.activityName)?.muscles)) {
      if (!last[g] || log.date > last[g]) last[g] = log.date;
    }
  }
  const diff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
  return Object.fromEntries(GROUPS.map((g) => [g, last[g] ? diff(today, last[g]) : null]));
}

// ---- Deload nudge --------------------------------------------------------------------------------------------------
/**
 * Looks at best estimated 1RM per week (7-day blocks ending today) for one lift.
 * 'ok' = still progressing or not enough data. 'watch' = flat for 2 weeks. 'deload' = flat or slipping for 3 weeks.
 * Needs a session in each of the weeks compared, so a missed week never looks like a stall.
 */
function deloadStatus(history, today) {
  const weeks = [0, 1, 2, 3].map((i) => {
    const to = addDays(today, -7 * i), from = addDays(to, -6);
    const rows = history.filter((h) => h.date >= from && h.date <= to);
    return rows.length ? Math.max(...rows.map((r) => r.best1RM)) : null;
  }); // weeks[0] = this week ... weeks[3] = oldest
  const [w0, w1, w2, w3] = weeks;
  const flat = (newer, older) => newer !== null && older !== null && newer <= older * 1.005;
  if (flat(w0, w1) && flat(w1, w2) && flat(w2, w3)) {
    return { status: 'deload', weeks, text: 'Your best lifts have been level for 3 weeks. A lighter "rest arc" week often helps strength bounce back.' };
  }
  if (flat(w0, w1) && flat(w1, w2)) {
    return { status: 'watch', weeks, text: 'Your best lift has been level for 2 weeks. Sleep, food and a lighter week can all help.' };
  }
  return { status: 'ok', weeks, text: '' };
}

/** A deload week: about 60% of the usual weight, half the sets (rounded up). Pure helper for the UI. */
function deloadTarget(weightKg, sets) {
  const w = Number(weightKg) || 0;
  const step = smallestStep(w);
  return { weightKg: w ? Math.max(step, Math.round((w * 0.6) / step) * step) : 0, sets: Math.max(1, Math.ceil((Number(sets) || 3) / 2)) };
}

// ---- Plate calculator ----------------------------------------------------------------------------------------------
const DEFAULT_PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
const DEFAULT_BAR = { kg: 20, lb: 45 };

/**
 * Plates per side to reach targetWeight with a bar. Greedy from the heaviest plate (optimal for these plate sets).
 * plates = list of plate sizes the person owns (each size available in pairs). Reports what is actually achieved.
 */
function plateCalc(target, { unit = 'kg', barWeight, plates } = {}) {
  const u = unit === 'lb' ? 'lb' : 'kg';
  const bar = Number.isFinite(Number(barWeight)) && barWeight !== '' && barWeight !== null && barWeight !== undefined ? Number(barWeight) : DEFAULT_BAR[u];
  const t = Number(target);
  const sizes = [...new Set((plates && plates.length ? plates : DEFAULT_PLATES[u]).map(Number).filter((p) => p > 0))].sort((a, b) => b - a);
  if (!(t >= 0) || !(bar >= 0)) return { unit: u, error: 'Enter a target weight', perSide: [] };
  if (t < bar) return { unit: u, bar, target: t, perSide: [], achieved: bar, short: round1(bar - t), note: `The bar alone is ${bar} ${u}.` };
  let left = Math.round(((t - bar) / 2) * 1000) / 1000;
  const perSide = [];
  for (const p of sizes) {
    const n = Math.floor(left / p + 1e-9);
    if (n > 0) { perSide.push({ plate: p, count: n }); left = Math.round((left - n * p) * 1000) / 1000; }
  }
  const sideTotal = perSide.reduce((s, x) => s + x.plate * x.count, 0);
  const achieved = round1(bar + 2 * sideTotal);
  const off = round1(t - achieved);
  return { unit: u, bar, target: t, perSide, achieved, remainder: off, note: off > 0 ? `Closest with these plates is ${achieved} ${u} (${off} ${u} short).` : '' };
}

const KG_PER_LB = 0.45359237;
const lbToKg = (lb) => round1(Number(lb) * KG_PER_LB);
const kgToLb = (kg) => round1(Number(kg) / KG_PER_LB);

const SAFETY_NOTE = 'Stop if you feel pain. This is a training guide, not medical advice.';

module.exports = {
  FORMULAS, epley, brzycki, estimate1RM, exerciseHistory, beatLastTime, checkJump, MAX_JUMP_PCT,
  weeklyMuscleVolume, daysSinceTrained, deloadStatus, deloadTarget, plateCalc, DEFAULT_PLATES, DEFAULT_BAR,
  lbToKg, kgToLb, SAFETY_NOTE, addDays,
};

/**
 * Records broken by a finished workout. prior = Map name -> {bestWeightKg, best1RM, bestReps(at best weight)} from earlier logs
 * (missing = first time, which is not announced as a record). results = [{activityName, sets}].
 */
function newRecords(prior, results) {
  const out = [];
  for (const r of results) {
    const before = prior.get(r.activityName);
    if (!before) continue;
    let e1 = 0, w = 0;
    for (const s of r.sets || []) { e1 = Math.max(e1, score(s)); w = Math.max(w, Number(s.weightKg) || 0); }
    if (e1 > before.best1RM && e1 > 0) out.push({ activityName: r.activityName, kind: '1rm', value: e1, previous: before.best1RM });
    else if (w > before.bestWeightKg && w > 0) out.push({ activityName: r.activityName, kind: 'weight', value: w, previous: before.bestWeightKg });
  }
  return out;
}
/** "Power level": the sum of each lift's best estimated 1RM, rounded. Just a fun number made from the person's own sets. */
const powerLevel = (records) => Math.round((records || []).reduce((t, r) => t + (Number(r.best1RM) || 0), 0));
module.exports.newRecords = newRecords;
module.exports.powerLevel = powerLevel;
