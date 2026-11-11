// Optional menstrual-cycle awareness, used for ONE thing: not mistaking the monthly water shift for a stalled diet.
// Off by default; the person turns it on, logs the day each period starts, and can erase it all. Pure; nothing here is medical advice,
// the app only says what the usual pattern is and that it compares the same phase week to week.
const { addDays, diffDays } = require('./dates');

const CYCLE = { defaultLen: 28, minLen: 21, maxLen: 45, keep: 18, periodDays: 5, waterBefore: 7, waterAfter: 3, staleFactor: 1.6, historyDays: 400 };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Clean list of period start dates: valid, not in the future, unique, oldest first, capped. */
function cleanStarts(list, today) {
  const ok = [...new Set((Array.isArray(list) ? list : []).filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today && diffDays(d, today) <= CYCLE.historyDays))].sort();
  return ok.slice(-CYCLE.keep);
}

/** The person's own cycle length: the median of their recent gaps (when they look like real cycles), else what they said, else 28. */
function cycleLength(starts, declared) {
  const gaps = [];
  for (let i = 1; i < starts.length; i += 1) { const g = diffDays(starts[i - 1], starts[i]); if (g >= CYCLE.minLen && g <= CYCLE.maxLen) gaps.push(g); }
  if (gaps.length >= 2) return Math.round(median(gaps.slice(-6)));
  const d = Number(declared);
  return d >= CYCLE.minLen && d <= CYCLE.maxLen ? Math.round(d) : CYCLE.defaultLen;
}

/**
 * @param o.starts period start dates   o.length typical length the person entered (optional)   o.today
 * @returns {known, day, length, phase:'period'|'follicular'|'luteal'|null, waterWindow:boolean, nextStart, daysToNext, stale}
 */
function cycleView({ starts = [], length = null, today, personal = null } = {}) {
  const list = cleanStarts(starts, today);
  if (!list.length) return { known: false, day: null, length: cycleLength(list, length), phase: null, waterWindow: false, nextStart: null, daysToNext: null, stale: false };
  const len = cycleLength(list, length);
  const last = list[list.length - 1];
  const day = diffDays(last, today) + 1;
  const stale = day > Math.round(len * CYCLE.staleFactor);           // the next period was probably not logged: do not guess a phase
  if (stale) return { known: true, day, length: len, phase: null, waterWindow: false, nextStart: null, daysToNext: null, stale: true };
  const phase = day <= CYCLE.periodDays ? 'period' : day <= len - 14 ? 'follicular' : 'luteal';
  // The person's OWN pattern (learned from their weigh-ins over several cycles) replaces the textbook window once there is enough of it.
  const waterWindow = personal && personal.ready ? day >= personal.fromDay && day <= personal.toDay : day <= CYCLE.waterAfter || day >= len - CYCLE.waterBefore + 1;
  const nextStart = addDays(last, len);
  return { known: true, day, length: len, phase, waterWindow, nextStart, daysToNext: diffDays(today, nextStart), stale: false };
}

/** Was the body in the water window at any point of the last `days` days (including today)? Then a flat scale is not evidence of a stall. */
function recentWaterWindow({ starts = [], length = null, today, days = 5, personal = null } = {}) {
  for (let i = 0; i < days; i += 1) { const v = cycleView({ starts, length, today: addDays(today, -i), personal }); if (v.known && v.waterWindow) return { yes: true, daysAgo: i, view: v }; }
  return { yes: false, daysAgo: null, view: cycleView({ starts, length, today, personal }) };
}

/** For the weekly decision: pause stall detection once per cycle while the water window explains a flat week. */
function cycleWait({ enabled = false, starts = [], length = null, today, waitedOn = '', personal = null } = {}) {
  if (!enabled) return { likely: false };
  const w = recentWaterWindow({ starts, length, today, personal });
  if (!w.yes) return { likely: false };
  const len = w.view.length;
  if (waitedOn && diffDays(waitedOn, today) < Math.round(len * 0.75)) return { likely: false };     // one pause per cycle, never a permanent excuse
  return { likely: true, day: w.view.day, length: len, nextStart: w.view.nextStart, daysAgo: w.daysAgo };
}

/**
 * Learn WHEN water shows up for this person. Each weigh-in is compared with the straight-line trend through all of them; the leftover is averaged by
 * day of the cycle (3-day buckets) over every logged cycle. A run of buckets that sit clearly above the trend is the person's own water window.
 * Needs 2+ completed cycles and enough weigh-ins, otherwise it says "not ready" and the textbook window is used.
 */
function waterPattern({ weights = [], starts = [], length = null, today } = {}) {
  const list = cleanStarts(starts, today);
  const pts = (weights || []).filter((w) => Number(w.weightKg) > 0 && w.date <= today).map((w) => ({ x: diffDays(list[0] || today, w.date), date: w.date, y: Number(w.weightKg) }));
  const len = cycleLength(list, length);
  const done = list.length - 1;                                           // completed cycles = gaps between logged starts
  if (done < 2 || pts.length < 18) return { ready: false, cycles: Math.max(0, done), samples: pts.length };
  const n = pts.length, mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0), slope = sxx ? pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx : 0;
  const buckets = new Map();
  for (const p of pts) {
    let start = null; for (const d of list) if (d <= p.date) start = d;
    if (!start) continue;
    const day = diffDays(start, p.date) + 1;
    if (day > len + 3) continue;
    const resid = p.y - (my + slope * (p.x - mx));
    const b = Math.floor((day - 1) / 3);
    (buckets.get(b) || buckets.set(b, []).get(b)).push(resid);
  }
  const rows = [...buckets.entries()].filter(([, v]) => v.length >= 2).map(([b, v]) => ({ b, mean: v.reduce((s, x) => s + x, 0) / v.length })).sort((a, b) => a.b - b.b);
  if (rows.length < 4) return { ready: false, cycles: done, samples: pts.length };
  const lo = Math.min(...rows.map((r) => r.mean)), hi = Math.max(...rows.map((r) => r.mean));
  if (hi - lo < 0.4) return { ready: false, cycles: done, samples: pts.length, flat: true };      // no clear monthly swing: do not invent one
  const cut = lo + (hi - lo) * 0.6;
  const high = rows.filter((r) => r.mean >= cut).map((r) => r.b);
  const fromB = Math.min(...high), toB = Math.max(...high);
  return { ready: true, cycles: done, samples: pts.length, fromDay: fromB * 3 + 1, toDay: toB * 3 + 3, riseKg: Math.round((hi - lo) * 10) / 10 };
}

/** For the weight-trend text: {day, length} when the last week touched the water window and the person uses the cycle log, else null. */
function cycleHint({ enabled = false, starts = [], length = null, today, personal = null } = {}) {
  if (!enabled) return null;
  const w = recentWaterWindow({ starts, length, today, days: 7, personal });
  return w.yes ? { day: w.view.day, length: w.view.length } : null;
}

module.exports = { waterPattern, cycleHint, CYCLE, cleanStarts, cycleLength, cycleView, recentWaterWindow, cycleWait };
