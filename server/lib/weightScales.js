// Weighing scales ("machines"). Two scales rarely agree, so a weigh-in is stored exactly as the scale showed it (`weightKg`) together
// with the scale it came from (`scaleId`). Every analysis (trend, calorie plan, coach, charts) reads CALIBRATED weights instead:
//
//     calibrated = raw - offset(scale)          offset = how much higher (+) this scale reads than the REFERENCE scale
//
// The reference scale has offset 0, so numbers stay in "your main scale" terms. Offsets are either learned from days you stepped on
// both scales (mode 'auto': median of the same-day differences) or typed in by hand (mode 'manual').
// Pure and dependency-free: no database access here (see weightData.js).
const MAIN_ID = 'main';
const MAX_SCALES = 8;
const r2 = (n) => Math.round(n * 100) / 100;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const cleanName = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40);
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Stored list -> clean list. Always has at least the main scale; always exactly one reference (offset 0). */
function normalizeScales(list, referenceId) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const id = String(s && s.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const mode = s.mode === 'manual' ? 'manual' : 'auto';
    const learned = Number.isFinite(Number(s.learnedKg)) && s.learnedKg !== null ? r2(Number(s.learnedKg)) : null;
    const manual = Number.isFinite(Number(s.offsetKg)) ? r2(Number(s.offsetKg)) : 0;
    out.push({ id, name: cleanName(s.name) || 'Scale', mode, learnedKg: learned, samples: Math.max(0, Math.round(Number(s.samples) || 0)), offsetKg: mode === 'manual' ? manual : (learned == null ? 0 : learned) });
  }
  if (!out.length) out.push({ id: MAIN_ID, name: 'My scale', mode: 'auto', learnedKg: null, samples: 0, offsetKg: 0 });
  let ref = out.find((s) => s.id === referenceId) || out.find((s) => s.id === MAIN_ID) || out[0];
  for (const s of out) if (s === ref) { s.offsetKg = 0; s.learnedKg = null; s.samples = 0; s.mode = 'auto'; }
  return { scales: out, referenceId: ref.id };
}

const scaleIdOf = (log) => (log && log.scaleId ? String(log.scaleId) : MAIN_ID); // an entry from before scales existed came from the main scale

/** Add `rawKg`, `scaleId`, `scaleName` and the CALIBRATED `weightKg` to each log. Never mutates the input. */
function calibrate(logs, scales) { // `scales` = the clean list from normalizeScales().scales
  const byId = new Map(scales.map((s) => [s.id, s]));
  const out = [];
  for (const l of logs || []) {
    const raw = Number(l && l.weightKg);
    if (!l || !(raw > 0)) continue;
    const id = scaleIdOf(l);
    const sc = byId.get(id);
    out.push({ ...l, rawKg: raw, scaleId: id, scaleName: sc ? sc.name : 'Scale', weightKg: r2(raw - (sc ? sc.offsetKg : 0)) });
  }
  return out;
}

/** One point per date: the mean of that day's calibrated readings, ascending by date. [{date, weightKg, readings}] */
function daily(calibrated) {
  const by = new Map();
  for (const p of calibrated || []) {
    if (!p || !p.date || !(Number(p.weightKg) > 0)) continue;
    const e = by.get(p.date) || { date: p.date, sum: 0, n: 0 };
    e.sum += Number(p.weightKg); e.n += 1; by.set(p.date, e);
  }
  return [...by.values()].map((e) => ({ date: e.date, weightKg: r2(e.sum / e.n), readings: e.n })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Same-day differences (scale minus reference) for each non-reference scale: { [scaleId]: number[] } newest first. */
function sameDayDiffs(logs, referenceId) {
  const byDate = new Map();
  for (const l of logs || []) {
    const raw = Number(l && l.weightKg); if (!l || !l.date || !(raw > 0)) continue;
    const d = byDate.get(l.date) || new Map();
    const id = scaleIdOf(l);
    const a = d.get(id) || []; a.push(raw); d.set(id, a); byDate.set(l.date, d);
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const out = {};
  for (const date of [...byDate.keys()].sort().reverse()) {
    const d = byDate.get(date);
    const ref = d.get(referenceId); if (!ref) continue;
    for (const [id, vals] of d) if (id !== referenceId) (out[id] = out[id] || []).push(mean(vals) - mean(ref));
  }
  return out;
}

/** Re-learn the offset of every 'auto' scale from same-day pairs (latest 10). Returns a new list; manual scales are left alone. */
function learnOffsets(scales, logs, referenceId) {
  const diffs = sameDayDiffs(logs, referenceId);
  return scales.map((s) => {
    if (s.id === referenceId) return { ...s, offsetKg: 0, learnedKg: null, samples: 0, mode: 'auto' };
    const d = (diffs[s.id] || []).slice(0, 10);
    const learned = d.length ? r2(median(d)) : null;
    const next = { ...s, learnedKg: learned, samples: d.length };
    if (s.mode !== 'manual') next.offsetKg = learned == null ? 0 : learned;
    return next;
  });
}

/** Make `newRefId` the reference: every offset is re-expressed against it. */
function rebase(scales, newRefId) {
  const ref = scales.find((s) => s.id === newRefId);
  if (!ref) return scales;
  const shift = ref.offsetKg;
  return scales.map((s) => (s.id === newRefId
    ? { ...s, offsetKg: 0, learnedKg: null, samples: 0, mode: 'auto' }
    : { ...s, offsetKg: r2(s.offsetKg - shift), learnedKg: s.learnedKg == null ? null : r2(s.learnedKg - shift) }));
}

/** A raw reading of `scaleId` expressed on the reference scale (what the analysis sees). */
function toReference(rawKg, scaleId, scales) {
  const s = (scales || []).find((x) => x.id === (scaleId || MAIN_ID));
  return r2(Number(rawKg) - (s ? s.offsetKg : 0));
}

/** A reference-scale weight expressed on another scale (what that scale would show). */
function fromReference(kg, scaleId, scales) {
  const s = (scales || []).find((x) => x.id === (scaleId || MAIN_ID));
  return r2(Number(kg) + (s ? s.offsetKg : 0));
}

module.exports = { MAIN_ID, MAX_SCALES, normalizeScales, scaleIdOf, calibrate, daily, sameDayDiffs, learnOffsets, rebase, toReference, fromReference, newId, cleanName };
