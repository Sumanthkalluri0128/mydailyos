// Readiness and effort: the two "how did it feel" signals the gym coach was missing.
//   * Daily readiness check (10 seconds): sleep hours, energy, soreness, stress -> a 0-100 score and a green / amber / red band.
//   * Set effort (RPE 1-10): how hard the top sets really were -> decides how big the next weight jump is.
// Pure and conservative. These signals only make training EASIER when the body asks for it, or nudge a jump a little bigger/smaller;
// they never push past the plan's own rep range, and never replace pain / dizziness rules.
const { diffDays } = require('./dates');

const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : null; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const W = { sleep: 0.35, energy: 0.25, soreness: 0.25, stress: 0.15 };
const BANDS = { green: 70, amber: 45 };

/** Clean one check-in: numbers in range or null. */
function cleanEntry(raw) {
  const e = raw || {};
  const sleep = num(e.sleepHours), en = num(e.energy), so = num(e.soreness), st = num(e.stress);
  return {
    date: e.date,
    sleepHours: sleep !== null && sleep >= 0 && sleep <= 16 ? Math.round(sleep * 10) / 10 : null,
    energy: en !== null && en >= 1 && en <= 5 ? Math.round(en) : null,
    soreness: so !== null && so >= 1 && so <= 5 ? Math.round(so) : null,
    stress: st !== null && st >= 1 && st <= 5 ? Math.round(st) : null,
  };
}

const sleepPart = (h) => (h >= 7 && h <= 9 ? 1 : h < 7 ? clamp(h / 7, 0, 1) : clamp(1 - (h - 9) / 4, 0.5, 1));

/** 0-100, or null when fewer than two of the four answers are there (never a score from one number). */
function readinessScore(entry) {
  const e = cleanEntry(entry);
  const parts = [];
  if (e.sleepHours !== null) parts.push(['sleep', sleepPart(e.sleepHours)]);
  if (e.energy !== null) parts.push(['energy', (e.energy - 1) / 4]);
  if (e.soreness !== null) parts.push(['soreness', (5 - e.soreness) / 4]);
  if (e.stress !== null) parts.push(['stress', (5 - e.stress) / 4]);
  if (parts.length < 2) return null;
  const wsum = parts.reduce((s, [k]) => s + W[k], 0);
  return Math.round((parts.reduce((s, [k, v]) => s + W[k] * v, 0) / wsum) * 100);
}
const bandOf = (score) => (score === null ? null : score >= BANDS.green ? 'green' : score >= BANDS.amber ? 'amber' : 'red');

/** What today's session should look like. Applies to TODAY only; the weekly progression is not rewritten by one bad night. */
function sessionAdjust(entry) {
  const score = readinessScore(entry);
  const band = bandOf(score);
  if (band === null) return { band: null, score: null, loadFactor: 1, setDelta: 0, rirAdd: 0, note: '' };
  if (band === 'green') return { band, score, loadFactor: 1, setDelta: 0, rirAdd: 0, note: 'You are well recovered. Train as planned.' };
  if (band === 'amber') return { band, score, loadFactor: 0.95, setDelta: 0, rirAdd: 1, note: 'A little tired. Same session, about 5% lighter, and stop with one more rep in reserve.' };
  return { band, score, loadFactor: 0.9, setDelta: -1, rirAdd: 1, note: 'Low recovery today. Do the Quick 20, or one set fewer at about 10% lighter. A light session keeps the habit without digging a deeper hole.' };
}

/** The last 7 days together. `low` = a pattern (not one bad day) that should stop calorie cuts and trigger an easier training week. */
function recoverySummary(entries = [], today) {
  const recent = (entries || []).filter((e) => e && e.date && diffDays(e.date, today) >= 0 && diffDays(e.date, today) < 7)
    .map((e) => ({ date: e.date, score: readinessScore(e), sleep: num(e.sleepHours) })).filter((e) => e.score !== null);
  if (recent.length < 3) return { count: recent.length, avg: null, redDays: 0, avgSleep: null, low: false, note: '' };
  const avg = Math.round(recent.reduce((s, e) => s + e.score, 0) / recent.length);
  const redDays = recent.filter((e) => e.score < BANDS.amber).length;
  const sleeps = recent.filter((e) => e.sleep !== null);
  const avgSleep = sleeps.length ? Math.round((sleeps.reduce((s, e) => s + e.sleep, 0) / sleeps.length) * 10) / 10 : null;
  const low = (recent.length >= 4 && avg < 50) || redDays >= 3;
  const note = low ? `Recovery has been low this week (average ${avg}/100${avgSleep !== null ? `, about ${avgSleep} h sleep` : ''}). Sleep and food come before any new cut or heavier load.` : '';
  return { count: recent.length, avg, redDays, avgSleep, low, note };
}

/** Average RPE of the heaviest sets in a session's sets [{reps, weightKg, rpe}]. null when none were rated. */
function topSetRpe(sets = []) {
  const rated = (sets || []).filter((s) => num(s.rpe) !== null && num(s.rpe) >= 1 && num(s.rpe) <= 10 && num(s.weightKg) >= 0);
  if (!rated.length) return null;
  const top = Math.max(...rated.map((s) => num(s.weightKg)));
  const atTop = rated.filter((s) => num(s.weightKg) === top);
  return Math.round((atTop.reduce((s, x) => s + num(x.rpe), 0) / atTop.length) * 10) / 10;
}

/**
 * How big the next jump should be, given how hard the last top sets felt.
 *   rpe <= 7   : it was easy, the jump may be 1.5x (still capped by the caller at +10%).
 *   rpe 7.5-9  : as planned.
 *   rpe >= 9.5 : grinding. Hold the weight and add reps instead.
 */
function effortAdvice(rpe) {
  if (rpe === null || rpe === undefined) return { jump: 1, hold: false, note: '' };
  if (rpe <= 7) return { jump: 1.5, hold: false, note: `That felt easy (RPE ${rpe}), so the jump is a bit bigger.` };
  if (rpe >= 9.5) return { jump: 0, hold: true, note: `That was close to your limit (RPE ${rpe}). Keep the weight and add reps before adding load.` };
  return { jump: 1, hold: false, note: '' };
}

module.exports = { cleanEntry, readinessScore, bandOf, sessionAdjust, recoverySummary, topSetRpe, effortAdvice, BANDS };
