// Turns stored lift entries into what a person wants to see: for each exercise, the last time, the best ever, and the trend.
// Pure (no database): unit-tested in test/liftSummary.unit.test.js.
//
// "Better" depends on what the number means: more is better, except for an assisted machine, where LESS help is better.
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const r1 = (x) => Math.round(x * 10) / 10;

const MODES = ['each', 'total', 'bw', 'assist', 'none'];
const better = (mode, a, b) => (mode === 'assist' ? a < b : a > b);

/** Epley estimate of the one-rep max in total kg (0 when the set is not loaded). */
function est1RM(kg, reps) { const k = num(kg), r = Math.min(30, Math.max(0, num(reps))); return k > 0 && r > 0 ? r1(r === 1 ? k : k * (1 + r / 30)) : 0; }

/** The one number that stands for a day on a chart: the heaviest typed weight (for assist: the least help; for body weight with nothing added: the most reps). */
function dayTop(e) {
  const sets = Array.isArray(e.sets) ? e.sets : [];
  if (!sets.length) return 0;
  if (e.mode === 'assist') return Math.min(...sets.map((s) => num(s.weightKg)));
  const heavy = Math.max(...sets.map((s) => num(s.weightKg)));
  if (e.mode === 'bw' && heavy === 0) return 0;
  return heavy;
}
const dayReps = (e) => (e.sets || []).reduce((n, s) => n + num(s.reps), 0);
const dayBestReps = (e) => Math.max(0, ...(e.sets || []).map((s) => num(s.reps)));

/**
 * @param rows  LiftEntry-like objects { exerciseId, name, mode, hands, date, sets:[{reps, weightKg, totalKg}], volumeKg, muscles, cat }
 * @returns exercises, most recently trained first: { id, name, mode, hands, cat, muscles, sessions, lastDate, last:{ topKg, reps, totalKg },
 *          best:{ topKg, date, est1RM }, change:{ kg, since }|null, series:[{ date, topKg, totalKg, volumeKg, reps, bestReps }] (oldest first, at most 40) }
 */
function summarize(rows, { maxSeries = 40 } = {}) {
  const by = new Map();
  const sorted = [...(rows || [])].filter((e) => e && e.exerciseId && e.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const e of sorted) {
    const mode = MODES.includes(e.mode) ? e.mode : 'total';
    const g = by.get(e.exerciseId) || { id: e.exerciseId, name: e.name || e.exerciseId, mode, hands: num(e.hands), cat: e.cat || '', muscles: e.muscles || [], list: [] };
    g.name = e.name || g.name; g.mode = mode; g.hands = num(e.hands); if (e.muscles && e.muscles.length) g.muscles = e.muscles;   // the newest entry says what the exercise is now
    g.list.push(e);
    by.set(e.exerciseId, g);
  }
  const out = [];
  for (const g of by.values()) {
    const series = g.list.map((e) => ({ date: e.date, topKg: dayTop(e), totalKg: r1(Math.max(0, ...(e.sets || []).map((s) => num(s.totalKg)))), volumeKg: Math.round(num(e.volumeKg)), reps: dayReps(e), bestReps: dayBestReps(e) }));
    const lastE = g.list[g.list.length - 1];
    let best = null;
    for (const e of g.list) {
      const top = dayTop(e);
      const rm = Math.max(0, ...(e.sets || []).map((s) => est1RM(s.totalKg || s.weightKg, s.reps)));
      if (!best || better(g.mode, top, best.topKg) || (top === best.topKg && rm > best.est1RM)) best = { topKg: top, date: e.date, est1RM: rm };
      else if (rm > best.est1RM && top === best.topKg) best = { ...best, est1RM: rm };
    }
    let change = null;
    if (series.length >= 2) {
      const a = series[0], b = series[series.length - 1];
      change = { kg: r1(b.topKg - a.topKg), since: a.date };
    }
    out.push({
      id: g.id, name: g.name, mode: g.mode, hands: g.hands, cat: g.cat, muscles: g.muscles, sessions: g.list.length, lastDate: lastE.date,
      last: { topKg: dayTop(lastE), reps: dayReps(lastE), totalKg: series[series.length - 1].totalKg },
      best, change, series: series.slice(-maxSeries),
    });
  }
  return out.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : b.sessions - a.sessions));
}

module.exports = { summarize, est1RM, dayTop, MODES };
