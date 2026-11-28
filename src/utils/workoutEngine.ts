// Pure logic for the Workout tab (no React, no storage), so it can be unit-tested and shared by every screen.
// Weights are ALWAYS stored in kg; the screens convert to the person's unit at the edges (utils/units.ts).
import { DAYS, EXERCISES, PlanDay, activeDays, PlanItem, Exercise, Unit, dayByNumber, weekdayOf } from '../data/workoutPlan';
import { addDays } from './dates';
import { estimateBurn, sessionMet } from './energy';
// @ts-ignore - training.js is plain JS (shared with the web app)
import { epley } from './training';

export type SetRow = { kg: number; reps: number; done: boolean; rpe?: number };   // rpe 6-10: how hard the set felt (optional; the coach sizes the next jump from it)
export type SessionExercise = {
  baseId: string;           // the exercise written in the plan
  exId: string;             // what was actually done (the plan one, or a chosen alternative)
  sets: SetRow[];
  restSec: number;
  targetReps: string;       // "10-12"
  unit: Unit;
  hint: string;             // "Last time 12 x 40 kg. Try 13."
  skipped?: boolean;
};
export type ActiveSession = {
  id: string; date: string; dayN: number; startedAt: number; pausedMs: number; pausedAt: number | null;
  exercises: SessionExercise[]; idx: number;
  phase: 'warmup' | 'main' | 'cooldown';
  warmDone: string[]; coolDone: string[];
  /** The day as it was when the workout started. The week can slide while you train, so finishing must not look the day up again. */
  snap?: { title: string; short: string; kind: string; met: number; smart?: boolean; sessionId?: string; way?: 'gym' | 'home' | 'quick'; warmup?: string[]; cooldown?: string[] };
};
export type Feel = 'easy' | 'good' | 'challenging' | 'hard';
export type Session = {
  id: string; date: string; dayN: number; title: string; short: string; kind: string;
  startedAt: number; endedAt: number; durationSec: number; kcal: number; volumeKg: number; setsDone: number;
  exercises: SessionExercise[]; feel: Feel; note: string; warmDone: number; coolDone: number; synced: boolean;
  prs?: PR[];
  /** Smart-program workouts go to POST /api/body-plan/session (the server counts the calories), classic ones to the exercise log. */
  plan?: 'smart'; smartSessionId?: string;
  /** Smart workouts: how it was done (gym / home / quick) and any pain chips ticked on the finish screen. */
  way?: 'gym' | 'home' | 'quick'; pain?: string[];
  /** The server refused this workout (and why): it is not retried by itself, it is shown with a Try again button. */
  syncFailed?: { reason: string; at: number };
};
export type PR = { exId: string; name: string; kind: 'weight' | 'reps'; value: number; prev: number };

// ------------------------------------------------------------------------------------------------ small helpers
export const DEFAULT_BODY_KG = 70;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "8-12" -> [8, 12]; "10" -> [10, 10]; anything unreadable -> [8, 12]. */
export function repRange(s: string): [number, number] {
  const m = String(s || '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) { const a = Number(m[1]), b = Number(m[2]); return a <= b ? [a, b] : [b, a]; }
  const one = Number(String(s || '').replace(/\D/g, ''));
  return one > 0 ? [one, one] : [8, 12];
}
export const isLoaded = (ex?: Exercise) => !!ex && ex.unit !== 'sec' && ex.unit !== 'min' && ['Machine', 'Cable', 'Dumbbell', 'Kettlebell'].includes(ex.gear);
/** The smallest sensible jump for this kind of equipment. */
export const stepKgFor = (ex?: Exercise) => (ex && (ex.gear === 'Machine' || ex.gear === 'Cable') ? 2.5 : 2);
export const unitLabel = (u?: Unit) => (u === 'sec' ? 'sec' : u === 'min' ? 'min' : 'reps');

/**
 * Which exercise-log activity a finished session is filed under, by session type. The same names the web Workout tab uses, so one workout
 * looks the same on both. A rest day (gentle mobility) is not filed at all, as on the web. Falls back to a strength activity, then null.
 */
export const SESSION_ACTIVITY: Record<string, string> = { strength: 'Strength Training', conditioning: 'Bodyweight circuit', active: 'Walking - Moderate', recovery: 'Walking - Moderate' };
export function pickSessionActivity<T extends { name?: string; category?: string }>(list: T[], kind: string): T | null {
  if (kind === 'rest') return null;
  const wanted = SESSION_ACTIVITY[kind];
  return (wanted && list.find((a) => a.name === wanted))
    || list.find((a) => /strength|weight|resistance/i.test(String(a.name)))
    || list.find((a) => /strength/i.test(String(a.category)))
    || null;
}

/** MET-based estimate: energy.estimateBurn, i.e. (MET - 1) x 3.5 x kg / 200 per minute (only what the exercise burns). Shown as "estimated" everywhere. */
export function estimateKcal(met: number, weightKg: number, minutes: number): number {
  const w = weightKg > 0 ? weightKg : DEFAULT_BODY_KG;
  return Math.max(0, Math.round(estimateBurn(met, w, Math.max(0, minutes))));
}

// ------------------------------------------------------------------------------------------------ the plan, resolved
export type Swaps = Record<string, Record<string, string>>; // dayN -> baseExerciseId -> chosen exerciseId
export const chosenId = (dayN: number, item: PlanItem, swaps: Swaps): string => {
  const pick = swaps?.[String(dayN)]?.[item.ex];
  return pick && EXERCISES[pick] && (pick === item.ex || item.alts.includes(pick)) ? pick : item.ex;
};
export const itemMinutes = (it: PlanItem, ex?: Exercise): number => {
  if (ex?.unit === 'min') { const [, hi] = repRange(it.reps); return hi; }
  const [lo, hi] = repRange(it.reps);
  const perSet = ex?.unit === 'sec' ? (lo + hi) / 2 / 60 + 0.4 : 0.8 + ((lo + hi) / 2) * 0.05; // ~3 s per rep + setup
  return it.sets * (perSet + it.restSec / 60);
};
/** Planned length of a day in minutes, from sets, reps and rest (plus a 6 min warm-up when it is a strength day). */
export function plannedMinutes(day: PlanDay, swaps: Swaps = {}): number {
  if (day.kind === 'rest') return 0;
  const sum = day.items.reduce((s, it) => s + itemMinutes(it, EXERCISES[chosenId(day.n, it, swaps)]), 0);
  const warm = day.kind === 'strength' ? 6 : 0;
  return Math.max(5, Math.round((sum + warm) / 5) * 5);
}
export const plannedKcal = (day: PlanDay, bodyKg = DEFAULT_BODY_KG) => estimateKcal(sessionMet(day.kind), bodyKg, (day.minutes[0] + day.minutes[1]) / 2);

// ------------------------------------------------------------------------------------------------ last time + "beat last time"
export type LastTime = { date: string; sets: { kg: number; reps: number }[] };
/** The most recent finished session that has a completed set for this exercise. */
export function lastTimeFor(history: Session[], exId: string): LastTime | null {
  let best: Session | null = null;
  for (const s of history) {
    if (!s.exercises.some((e) => e.exId === exId && e.sets.some((x) => x.done))) continue;
    if (!best || s.startedAt > best.startedAt) best = s;
  }
  if (!best) return null;
  const e = best.exercises.find((x) => x.exId === exId)!;
  return { date: best.date, sets: e.sets.filter((x) => x.done).map((x) => ({ kg: x.kg, reps: x.reps })) };
}

export type Suggestion = { kg: number; reps: number; hint: string; fromLast: boolean };
/** Small steps only: one more rep, or the smallest weight jump once every set hit the top of the range. Never a guess for a new exercise. */
export function suggestNext(ex: Exercise | undefined, item: PlanItem, last: LastTime | null, fmtKg: (kg: number) => string = (k) => `${k} kg`): Suggestion {
  const [lo, hi] = repRange(item.reps);
  const unit = ex?.unit || 'reps';
  if (!last || !last.sets.length) {
    const first = unit === 'min' ? hi : lo;
    return { kg: 0, reps: first, hint: isLoaded(ex) ? `First time: start light and aim for ${lo}-${hi} clean reps.` : `First time: aim for ${item.reps} ${unitLabel(unit)}.`, fromLast: false };
  }
  const kg = Math.max(...last.sets.map((s) => s.kg));
  const lowest = Math.min(...last.sets.map((s) => s.reps));
  const allTop = last.sets.length >= Math.min(item.sets, 2) && last.sets.every((s) => s.reps >= hi);
  const inc = unit === 'sec' || unit === 'min' ? 5 : 1;
  const lastText = last.sets.map((s) => `${s.reps}${isLoaded(ex) && s.kg > 0 ? ` x ${fmtKg(s.kg)}` : ''}`).join(' · ');
  if (allTop) {
    if (isLoaded(ex)) { const next = round1(kg + stepKgFor(ex)); return { kg: next, reps: lo, hint: `Last time ${lastText}. Top of the range, so try ${fmtKg(next)}.`, fromLast: true }; }
    const next = Math.min(hi + (unit === 'reps' ? 2 : 5), lowest + inc * (unit === 'reps' ? 2 : 1));
    return { kg, reps: next, hint: `Last time ${lastText}. Try ${next} ${unitLabel(unit)}.`, fromLast: true };
  }
  const next = Math.min(hi, lowest + inc);
  return { kg, reps: Math.max(lo, next), hint: `Last time ${lastText}. Try ${Math.max(lo, next)} ${unitLabel(unit)}.`, fromLast: true };
}

// ------------------------------------------------------------------------------------------------ build a session
export function newId(prefix = 'ws'): string { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export function buildSession(day: PlanDay, swaps: Swaps, history: Session[], date: string, now: number, fmtKg?: (kg: number) => string, way: 'gym' | 'home' | 'quick' = 'gym'): ActiveSession {
  const w = day.smart && way !== 'gym' ? day.ways?.[way] : undefined;
  const items = w ? w.items : day.items;
  const usedWay: 'gym' | 'home' | 'quick' = w ? way : 'gym';
  const exercises: SessionExercise[] = items.map((item) => {
    const exId = chosenId(day.n, item, swaps);
    const ex = EXERCISES[exId];
    const sug = suggestNext(ex, item, lastTimeFor(history, exId), fmtKg);
    const unit = ex?.unit || 'reps';
    return {
      baseId: item.ex, exId, restSec: item.restSec, targetReps: item.reps, unit, hint: sug.hint,
      sets: Array.from({ length: Math.max(1, item.sets) }, () => ({ kg: sug.kg, reps: sug.reps, done: false })),
    };
  });
  return {
    id: newId(), date, dayN: day.n, startedAt: now, pausedMs: 0, pausedAt: null, exercises, idx: 0, phase: day.kind === 'strength' ? 'warmup' : 'main', warmDone: [], coolDone: [],
    snap: { title: day.title, short: day.short, kind: day.kind, met: day.met, ...(day.smart ? { smart: true, sessionId: day.sessionId, way: usedWay, warmup: day.warmup, cooldown: day.cooldown } : {}) },
  };
}

/** Swap an exercise in a running session (its sets restart from the new exercise's own history). */
export function swapInSession(a: ActiveSession, index: number, newExId: string, day: PlanDay, history: Session[], fmtKg?: (kg: number) => string): ActiveSession {
  const cur = a.exercises[index];
  const item = day.items.find((i) => i.ex === cur.baseId);
  if (!item || !EXERCISES[newExId]) return a;
  const ex = EXERCISES[newExId];
  const sug = suggestNext(ex, item, lastTimeFor(history, newExId), fmtKg);
  const next: SessionExercise = { ...cur, exId: newExId, unit: ex.unit || 'reps', hint: sug.hint, sets: cur.sets.map((s) => (s.done ? s : { kg: sug.kg, reps: sug.reps, done: false })) };
  return { ...a, exercises: a.exercises.map((e, i) => (i === index ? next : e)) };
}

export const elapsedSec = (a: Pick<ActiveSession, 'startedAt' | 'pausedMs' | 'pausedAt'>, now: number) =>
  Math.max(0, Math.floor(((a.pausedAt ?? now) - a.startedAt - a.pausedMs) / 1000));

export const setsTotal = (ex: SessionExercise[]) => ex.reduce((n, e) => n + (e.skipped ? 0 : e.sets.length), 0);
export const setsDoneCount = (ex: SessionExercise[]) => ex.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
export const exerciseDone = (e: SessionExercise) => !e.skipped && e.sets.length > 0 && e.sets.every((s) => s.done);
export const exercisesTouched = (ex: SessionExercise[]) => ex.filter((e) => e.sets.some((s) => s.done)).length;
export function volumeKg(ex: SessionExercise[]): number {
  return Math.round(ex.reduce((v, e) => v + (isLoaded(EXERCISES[e.exId]) ? e.sets.filter((s) => s.done).reduce((a, s) => a + s.kg * s.reps, 0) : 0), 0));
}

// ------------------------------------------------------------------------------------------------ records
/** A record is only called when there is something to beat: the first time you do a lift is never a "PR". */
export function detectPRs(ex: SessionExercise[], history: Session[]): PR[] {
  const out: PR[] = [];
  for (const e of ex) {
    const done = e.sets.filter((s) => s.done && s.reps >= 1);
    if (!done.length) continue;
    const def = EXERCISES[e.exId];
    const prev = history.flatMap((h) => h.exercises.filter((x) => x.exId === e.exId).flatMap((x) => x.sets.filter((s) => s.done)));
    if (!prev.length) continue;
    if (isLoaded(def)) {
      const was = Math.max(...prev.map((s) => epley(s.kg, s.reps) || 0));
      const now = Math.max(...done.map((s) => epley(s.kg, s.reps) || 0));
      if (now > was && was > 0) out.push({ exId: e.exId, name: def?.name || e.exId, kind: 'weight', value: now, prev: was });
    } else {
      const was = Math.max(...prev.map((s) => s.reps));
      const now = Math.max(...done.map((s) => s.reps));
      if (now > was) out.push({ exId: e.exId, name: def?.name || e.exId, kind: 'reps', value: now, prev: was });
    }
  }
  return out;
}

export function finishSession(a: ActiveSession, opts: { now: number; bodyKg?: number; feel: Feel; note: string; history: Session[]; pain?: string[] }): Session {
  const day = a.snap || dayByNumber(a.dayN);
  const durationSec = Math.max(60, elapsedSec(a, opts.now));
  const keep = a.exercises.filter((e) => e.sets.some((s) => s.done));
  const prs = detectPRs(keep, opts.history);
  return {
    id: a.id, date: a.date, dayN: a.dayN, title: day.title, short: day.short, kind: day.kind,
    startedAt: a.startedAt, endedAt: opts.now, durationSec,
    kcal: estimateKcal(sessionMet(day.kind), opts.bodyKg || DEFAULT_BODY_KG, durationSec / 60),
    volumeKg: volumeKg(keep), setsDone: setsDoneCount(keep),
    exercises: keep.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })),
    feel: opts.feel, note: opts.note.trim(), warmDone: a.warmDone.length, coolDone: a.coolDone.length, synced: false, prs,
    ...(a.snap && a.snap.smart ? { plan: 'smart' as const, smartSessionId: a.snap.sessionId || '', way: a.snap.way || 'gym', pain: opts.pain || [] } : {}),
  };
}

// ------------------------------------------------------------------------------------------------ week, streak, history
export const mondayOf = (date: string): string => addDays(date, -(weekdayOf(date) - 1));
export const weekDates = (date: string): string[] => { const m = mondayOf(date); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); };
export type DayState = 'done' | 'today' | 'missed' | 'upcoming' | 'rest' | 'rest-done';
export function weekStates(sessions: Session[], date: string): { date: string; n: number; state: DayState; today: boolean; day: PlanDay }[] {
  return weekDates(date).map((d, i) => {
    const day = activeDays()[i];
    const done = sessions.some((s) => s.date === d);
    const isToday = d === date;
    let state: DayState;
    if (day.kind === 'rest') state = done ? 'rest-done' : d < date ? 'rest' : isToday ? 'today' : 'rest';
    else if (done) state = 'done';
    else if (isToday) state = 'today';
    else if (d < date) state = 'missed';
    else state = 'upcoming';
    return { date: d, n: i + 1, state, today: isToday, day };
  });
}
/**
 * The workouts finished on `date` that belong to THIS plan day. A catch-up of another day's workout (Day 1 done on Wednesday) does not make Wednesday's own
 * workout "done"; two workouts of the same day both count.
 */
export function doneForDay(sessions: Session[], date: string, dayN: number): Session[] {
  return (sessions || []).filter((s) => s.date === date && s.dayN === dayN);
}
/** Several workouts on one day, added up (what the "Done today" line shows). */
export function dayTotals(list: Session[]): { count: number; minutes: number; kcal: number } {
  return { count: list.length, minutes: Math.round(list.reduce((t, s) => t + (Number(s.durationSec) || 0), 0) / 60), kcal: Math.round(list.reduce((t, s) => t + (Number(s.kcal) || 0), 0)) };
}
/** Days in a row with a finished session. Rest days never break it; a day you have not trained yet today does not either. */
export function streakDays(sessions: Session[], today: string): number {
  const have = new Set(sessions.map((s) => s.date));
  let n = 0;
  let d = have.has(today) ? today : addDays(today, -1);
  for (let guard = 0; guard < 400; guard += 1) {
    if (have.has(d)) n += 1;
    else if (dayByNumber(weekdayOf(d)).kind !== 'rest') break;
    d = addDays(d, -1);
  }
  return n;
}
export type Stats = { workouts: number; minutes: number; kcal: number; sets: number; volumeKg: number };
export function statsOf(list: Session[]): Stats {
  return list.reduce<Stats>((s, x) => ({ workouts: s.workouts + 1, minutes: s.minutes + Math.round(x.durationSec / 60), kcal: s.kcal + x.kcal, sets: s.sets + x.setsDone, volumeKg: s.volumeKg + x.volumeKg }), { workouts: 0, minutes: 0, kcal: 0, sets: 0, volumeKg: 0 });
}
export type RangeMode = 'week' | 'month' | 'all';
export function rangeBounds(mode: RangeMode, anchor: string): { from: string; to: string } | null {
  if (mode === 'all') return null;
  if (mode === 'week') { const m = mondayOf(anchor); return { from: m, to: addDays(m, 6) }; }
  const [y, mo] = anchor.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${p(mo)}-01`, to: `${y}-${p(mo)}-${p(last)}` };
}
export function sessionsIn(sessions: Session[], mode: RangeMode, anchor: string): Session[] {
  const b = rangeBounds(mode, anchor);
  return sessions.filter((s) => !b || (s.date >= b.from && s.date <= b.to)).sort((a, c) => c.startedAt - a.startedAt);
}
/** Move the anchor by one week or one month. */
export function shiftAnchor(mode: RangeMode, anchor: string, dir: 1 | -1): string {
  if (mode === 'week') return addDays(anchor, 7 * dir);
  const [y, mo] = anchor.split('-').map(Number);
  const d = new Date(y, mo - 1 + dir, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Best result so far for one exercise (for the exercise page). */
export function bestFor(history: Session[], exId: string): { kg: number; reps: number; e1rm: number } | null {
  let best: { kg: number; reps: number; e1rm: number } | null = null;
  for (const h of history) for (const e of h.exercises) {
    if (e.exId !== exId) continue;
    for (const s of e.sets) {
      if (!s.done) continue;
      const v = epley(s.kg, s.reps) || 0;
      if (!best || v > best.e1rm || (v === best.e1rm && s.reps > best.reps)) best = { kg: s.kg, reps: s.reps, e1rm: v };
    }
  }
  return best;
}
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;
export const FEEL_LABEL: Record<Feel, string> = { easy: 'Easy', good: 'Good', challenging: 'Challenging', hard: 'Hard' };
export const FEEL_EMOJI: Record<Feel, string> = { easy: '😊', good: '🙂', challenging: '😤', hard: '🥵' };
