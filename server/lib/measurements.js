// Body measurement trends next to weight. Pure. `null` means "not enough data" and is never replaced by a guess.
const TYPES = ['waist', 'hips', 'chest', 'arm', 'thigh'];
const r1 = (x) => Math.round(x * 10) / 10;

function series(rows) {                                  // one point per day (the latest entry of that day), oldest first
  const by = new Map();
  for (const x of rows) { const cur = by.get(x.date); if (!cur || String(x.at || '') >= String(cur.at || '')) by.set(x.date, x); }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ date: x.date, value: Number(x.value) }));
}
function summary(points) {
  if (points.length < 2) return { points, first: points[0]?.value ?? null, last: points.at(-1)?.value ?? null, change: null };
  const first = points[0].value, last = points.at(-1).value;
  return { points, first, last, change: r1(last - first) };
}
function measureTrends({ weights = [], logs = [] } = {}) {
  const out = {};
  for (const t of TYPES) {
    const s = summary(series(logs.filter((l) => l.type === t && Number.isFinite(Number(l.value)))));
    if (s.points.length) out[t] = { unit: 'cm', ...s };
  }
  const w = summary(series(weights.filter((x) => Number.isFinite(Number(x.weightKg))).map((x) => ({ date: x.date, value: x.weightKg }))));
  const note = trendNote(out, w);
  return { types: out, weight: { unit: 'kg', ...w }, note };
}
// One plain sentence, only when the numbers support it.
function trendNote(types, w) {
  const waist = types.waist;
  if (waist && waist.change !== null && w.change !== null) {
    if (waist.change <= -1 && Math.abs(w.change) < 1) return `Your waist is down ${Math.abs(waist.change)} cm while the scale barely moved. Your shape is changing even when weight is slow.`;
    if (waist.change <= -1 && w.change <= -1) return `Waist down ${Math.abs(waist.change)} cm and weight down ${Math.abs(w.change)} kg. Both are going the same way.`;
    if (waist.change >= 1) return `Your waist is up ${waist.change} cm. Tape readings move with time of day and how tight you pull it, so measure the same way each time.`;
  }
  return null;
}
module.exports = { TYPES, measureTrends, series };
