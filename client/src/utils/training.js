// Small pure helpers for the training screens (same maths as the server's lib/strength.js and lib/guided.js, covered by parity tests).
// Kept on the client so the plate calculator, 1RM maths and breathing animation work with no network.
const round1 = (n) => Math.round(n * 10) / 10;

export const FORMULAS = { epley: 'weight × (1 + reps ÷ 30)', brzycki: 'weight × 36 ÷ (37 − reps)' };
export const SAFETY_NOTE = 'Stop if you feel pain. This is a training guide, not medical advice.';

export function epley(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !(r >= 1)) return null;
  return r === 1 ? round1(w) : round1(w * (1 + r / 30));
}
export function brzycki(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !(r >= 1) || r > 10) return null;
  return r === 1 ? round1(w) : round1((w * 36) / (37 - r));
}

export const MAX_JUMP_PCT = 10;
/** Over +10% on the recent best asks "are you sure?"; it never blocks. */
export function checkJump(plannedKg, recentBestKg) {
  const p = Number(plannedKg) || 0, b = Number(recentBestKg) || 0;
  if (!b || !p || p <= b) return { needsConfirm: false, pct: 0, note: '' };
  const pct = round1(((p - b) / b) * 100);
  const needsConfirm = pct > MAX_JUMP_PCT;
  return { needsConfirm, pct, note: needsConfirm ? `That is ${pct}% above your recent best. Smaller steps are easier on your body. You can still go ahead if you are sure.` : '' };
}

export const DEFAULT_PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
export const DEFAULT_BAR = { kg: 20, lb: 45 };
export function plateCalc(target, { unit = 'kg', barWeight, plates } = {}) {
  const u = unit === 'lb' ? 'lb' : 'kg';
  const hasBar = barWeight !== '' && barWeight !== null && barWeight !== undefined && Number.isFinite(Number(barWeight));
  const bar = hasBar ? Number(barWeight) : DEFAULT_BAR[u];
  const t = Number(target);
  const sizes = [...new Set((plates && plates.length ? plates : DEFAULT_PLATES[u]).map(Number).filter((p) => p > 0))].sort((a, b) => b - a);
  if (!(t >= 0) || !(bar >= 0)) return { unit: u, error: 'Enter a target weight', perSide: [] };
  if (t < bar) return { unit: u, bar, target: t, perSide: [], achieved: bar, note: `The bar alone is ${bar} ${u}.` };
  let left = Math.round(((t - bar) / 2) * 1000) / 1000;
  const perSide = [];
  for (const p of sizes) {
    const n = Math.floor(left / p + 1e-9);
    if (n > 0) { perSide.push({ plate: p, count: n }); left = Math.round((left - n * p) * 1000) / 1000; }
  }
  const achieved = round1(bar + 2 * perSide.reduce((s, x) => s + x.plate * x.count, 0));
  const off = round1(t - achieved);
  return { unit: u, bar, target: t, perSide, achieved, remainder: off, note: off > 0 ? `Closest with these plates is ${achieved} ${u} (${off} ${u} short).` : '' };
}
export const lbToKg = (lb) => round1(Number(lb) * 0.45359237);
export const kgToLb = (kg) => round1(Number(kg) / 0.45359237);

export const BREATH = { inhale: 4, hold: 2, exhale: 6, rest: 0 };
export function breathPhase(sec, b = BREATH) {
  const cycle = b.inhale + b.hold + b.exhale + b.rest;
  const t = ((Math.floor(sec) % cycle) + cycle) % cycle;
  if (t < b.inhale) return { phase: 'inhale', left: b.inhale - t, progress: t / b.inhale };
  if (t < b.inhale + b.hold) return { phase: 'hold', left: b.inhale + b.hold - t, progress: 1 };
  const e = t - b.inhale - b.hold;
  if (e < b.exhale) return { phase: 'exhale', left: b.exhale - e, progress: 1 - e / b.exhale };
  return { phase: 'rest', left: cycle - t, progress: 0 };
}
export const cueAt = (cues, sec) => (cues || []).reduce((cur, c) => (c.atSec <= sec ? c : cur), (cues || [])[0]);
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

/** Sets for workout mode: the exercise's plan, prefilled from last time when known. Strings so inputs can be edited freely. */
export function planSets(item, last) {
  const n = Math.max(1, Number(item.sets || item.targetSets) || 3);
  const lastSets = last?.sets || [];
  return Array.from({ length: n }, (_, i) => {
    const ls = lastSets[Math.min(i, lastSets.length - 1)];
    const reps = ls ? ls.reps : (item.reps ?? item.targetReps ?? '');
    const kg = ls ? ls.weightKg : (item.weightKg ?? item.targetWeightKg ?? 0);
    return { reps: String(reps ?? ''), kg: String(kg ?? 0), done: false };
  });
}
/** Results for the server from workout-mode state: only sets marked done with reps. */
export function toResults(exercises) {
  return exercises.map((e, index) => ({
    index, activityName: e.name,
    sets: e.sets.filter((s) => s.done && Number(s.reps) >= 1).map((s) => ({ reps: Math.round(Number(s.reps)), weightKg: Number(s.kg) || 0 })),
  })).filter((r) => r.sets.length);
}
