// Logic behind the Workout Plans tab. Everything that decides something (which week you are in, what weight to try next,
// whether a set was a personal best, the streak) is a pure function so it can be tested with plain `node --test`.
// Only load/save at the bottom touch localStorage. Data is per person: the key carries the signed-in email.
import { PLAN_ID, SMART_ID, DAYS, dowOf } from "../data/workoutPlan.js";
import { CUSTOM_SOURCE, cleanPlans } from "./customPlans.js";

const round1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------------------------------------------- dates (local, YYYY-MM-DD)
export const toStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromStr = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); }; // noon: safe across DST
export const addDays = (s, n) => { const d = fromStr(s); d.setDate(d.getDate() + n); return toStr(d); };
export const mondayOf = (s) => addDays(s, -(dowOf(fromStr(s)) - 1));
export const daysBetween = (a, b) => Math.round((fromStr(b) - fromStr(a)) / 86400000);

/** Plan week number (1-based). Week 1 starts on the Monday of the week the plan was started. */
export const weekNumber = (startDate, today) => (startDate ? Math.max(1, Math.floor(daysBetween(mondayOf(startDate), today) / 7) + 1) : 1);

/** The plan's three phases (weeks 1-2 learn, 3-4 build, 5+ progress). */
export function phaseFor(week) {
  if (week <= 2) return { id: "learn", label: "Learn the form", tip: "Light weight, same reps. Focus on clean technique." };
  if (week <= 4) return { id: "build", label: "Build up", tip: "Slightly more weight, or add 1–2 reps." };
  return { id: "progress", label: "Progress", tip: "Add one extra set on the main lifts." };
}

/** Sets for today: the plan's sets, +1 on main lifts from week 5 (the plan's "add one extra set"). */
export const setsFor = (ex, week) => (ex.main && week >= 5 && !ex.timed ? ex.sets + 1 : ex.sets);

// ---------------------------------------------------------------------------------------------------------------- history lookups
const sorted = (sessions) => [...(sessions || [])].sort((a, b) => (a.date === b.date ? (a.startedAt || 0) - (b.startedAt || 0) : a.date < b.date ? -1 : 1));

/** Your most recent logged sets for an exercise id (newest session that has done sets). */
export function lastPerformance(sessions, exId) {
  const list = sorted(sessions).reverse();
  for (const s of list) {
    const e = (s.exercises || []).find((x) => x.id === exId && (x.sets || []).some((t) => t.done));
    if (e) return { date: s.date, sets: e.sets.filter((t) => t.done) };
  }
  return null;
}

export const topWeight = (sets) => Math.max(0, ...sets.map((s) => Number(s.w) || 0));

/**
 * What to try today. Rule (matches the plan's progression):
 *  - all sets reached the top of the rep range -> a little heavier (+2 kg upper / +5 kg lower, never above +10 %) and back to the bottom of the range
 *  - otherwise same weight, one more rep than your best last time (capped at the top of the range)
 *  - bodyweight moves have no weight: they just add reps
 *  - nothing logged yet: weeks 1-2 start light (0 kg = pick a light weight), reps at the bottom of the range
 */
export function suggestNext(ex, sessions) {
  // The smart program already worked out today's target from everything you logged (any device): trust it.
  if (ex.next && ex.next.action) {
    const t = ex.next, up = t.action === "addWeight" || t.action === "harder";
    return { w: Number(t.weightKg) || 0, r: t.action === "start" ? ex.repsMin : Number(t.reps) || ex.repsMin, up, first: t.action === "start", note: t.note || "" };
  }
  const last = lastPerformance(sessions, ex.id);
  const lower = (ex.targets || []).some((t) => t === "legs" || t === "glutes");
  if (!last) return { w: 0, r: ex.repsMin, first: true, note: ex.bw ? "Start with clean reps." : "No history yet. Pick a light weight you can control." };
  const w = topWeight(last.sets);
  const bestReps = Math.max(...last.sets.map((s) => Number(s.r) || 0));
  const allTop = last.sets.length >= Math.min(ex.sets, 2) && last.sets.every((s) => (Number(s.r) || 0) >= ex.repsMax);
  if (allTop && !ex.bw && w > 0) {
    const step = Math.min(lower ? 5 : 2, Math.max(1, round1(w * 0.1)));
    return { w: round1(w + step), r: ex.repsMin, up: true, note: `You hit ${ex.repsMax} reps on every set. Go ${step} kg heavier.` };
  }
  if (allTop && ex.bw) return { w: 0, r: ex.repsMax, up: true, note: "Top of the range. Try a harder variation, or slow the tempo." };
  return { w, r: Math.min(ex.repsMax, Math.max(ex.repsMin, bestReps + 1)), note: bestReps >= ex.repsMax ? "Same weight again." : `Last time ${bestReps} reps. Aim for one more.` };
}

// ---------------------------------------------------------------------------------------------------------------- week view
export const sessionsOnWeek = (sessions, monday) => sessions.filter((s) => s.date >= monday && s.date <= addDays(monday, 6) && s.dayId);

/** done | today | missed | upcoming | rest for each of the 7 days of the week that contains `today`. */
export function weekStrip(sessions, today, days = DAYS) {
  const monday = mondayOf(today);
  const doneIds = new Set(sessionsOnWeek(sessions, monday).map((s) => s.dayId));
  return days.map((d, i) => {
    const date = addDays(monday, i);
    let status = date > today ? "upcoming" : date === today ? "today" : "missed";
    if (doneIds.has(d.id)) status = "done";
    if (d.kind === "rest" && status !== "done") status = date < today ? "rest-past" : status === "today" ? "today" : "upcoming";
    return { day: d, date, status, isToday: date === today };
  });
}

/** Training days in a row (rest day and recovery day do not break it). Today not done yet does not break it either.
 *  `days` is the active plan's week and `soft` the day kinds that never break the chain (the fixed plan only forgives Sunday). */
export function streak(sessions, today, days = DAYS, soft = ["rest"]) {
  const doneDates = new Set(sessions.map((s) => s.date));
  let n = 0, cursor = today;
  if (!doneDates.has(cursor)) cursor = addDays(cursor, -1); // today is still open
  for (let guard = 0; guard < 400; guard++) {
    if (doneDates.has(cursor)) { n++; cursor = addDays(cursor, -1); continue; }
    const dow = dowOf(fromStr(cursor));
    const d = days.find((x) => x.dow === dow) || days[0];
    if (soft.includes(d.kind)) { cursor = addDays(cursor, -1); continue; }  // rest days never break the chain
    break;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------------------------- numbers
export const volumeOf = (session) => Math.round((session.exercises || []).reduce((t, e) => t + (e.sets || []).reduce((s, x) => s + (x.done ? (Number(x.w) || 0) * (Number(x.r) || 0) : 0), 0), 0));
export const setsDone = (session) => (session.exercises || []).reduce((t, e) => t + (e.sets || []).filter((x) => x.done).length, 0);

/** Rough burn: ~5 MET for lifting, 3 for recovery, 6 for conditioning (Compendium values), from minutes and body weight. */
export function estimateKcal(day, minutes, weightKg) {
  const met = day && day.kind === "conditioning" ? 6 : day && (day.kind === "recovery" || day.kind === "rest") ? 3 : 5;
  return Math.max(0, Math.round(met * 3.5 * (Number(weightKg) || 70) / 200 * Math.max(0, minutes)));
}

export function summarize(sessions) {
  const list = sessions || [];
  return {
    workouts: list.length,
    minutes: list.reduce((t, s) => t + (Number(s.minutes) || 0), 0),
    kcal: list.reduce((t, s) => t + (Number(s.kcal) || 0), 0),
    volume: list.reduce((t, s) => t + volumeOf(s), 0),
  };
}

/** Sessions in a range: week (Mon-Sun of `anchor`), month (calendar month of `anchor`) or all. */
export function inRange(sessions, range, anchor) {
  if (range === "all") return sessions;
  if (range === "month") { const p = anchor.slice(0, 7); return sessions.filter((s) => s.date.slice(0, 7) === p); }
  const m = mondayOf(anchor); return sessions.filter((s) => s.date >= m && s.date <= addDays(m, 6));
}

const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);
/** Personal bests this session beat: heaviest set by estimated 1RM, only for lifts with a history. */
export function personalBests(session, history) {
  const prs = [];
  for (const e of session.exercises || []) {
    const mine = (e.sets || []).filter((s) => s.done && Number(s.w) > 0);
    if (!mine.length) continue;
    const best = Math.max(...mine.map((s) => e1rm(Number(s.w), Number(s.r))));
    const before = history.filter((h) => h.id !== session.id).flatMap((h) => (h.exercises || []).filter((x) => x.id === e.id).flatMap((x) => (x.sets || []).filter((s) => s.done)));
    if (!before.length) continue; // the first time you do a lift is a baseline, not a record
    const prev = Math.max(...before.map((s) => e1rm(Number(s.w) || 0, Number(s.r) || 0)));
    if (best > prev + 0.01) prs.push({ id: e.id, name: e.name, w: Math.max(...mine.map((s) => Number(s.w))) });
  }
  return prs;
}

// ---------------------------------------------------------------------------------------------------------------- the in-progress session
/** Build the empty log for a day: sets prefilled from the progression rule, nothing ticked. */
export function newActive(day, { week, sessions, swaps, today, now = Date.now() }) {
  const sets = {}, checks = {}, choices = {};
  for (const b of day.blocks) {
    if (b.type !== "sets") continue;
    for (const base of b.items) {
      const ex = swaps && swaps[base.id] ? (base.alts.find((a) => a.id === swaps[base.id]) ? { ...base, ...base.alts.find((a) => a.id === swaps[base.id]), sets: base.sets, reps: base.reps, repsMin: base.repsMin, repsMax: base.repsMax, from: base.id } : base) : base;
      const n = setsFor(base, week), s = suggestNext(ex, sessions);
      sets[base.id] = Array.from({ length: n }, () => ({ w: s.w, r: base.timed ? base.repsMin : s.r, done: false }));
    }
  }
  // A smart day can change under you (the week slides) and a personal plan can be edited or deleted mid-workout, so the session keeps its own copy of the day it started from.
  return { id: `ws-${now.toString(36)}`, dayId: day.id, date: today, startedAt: now, pausedMs: 0, pausedAt: 0, sets, checks, choices, skipped: {}, step: 0, pain: [], ...(day.source === SMART_ID || day.source === CUSTOM_SOURCE ? { day } : {}) };
}

/** Seconds on the clock, excluding paused time. */
export const elapsedSec = (a, now = Date.now()) => Math.max(0, Math.floor((((a.pausedAt || now) - a.startedAt) - (a.pausedMs || 0)) / 1000));

/** Turn the active session into a saved record (only ticked sets are kept). */
export function finishActive(active, day, { swaps, weightKg, feel, notes, now = Date.now() }) {
  const exercises = [];
  for (const b of day.blocks) {
    if (b.type !== "sets") continue;
    for (const base of b.items) {
      if (active.skipped[base.id]) continue;
      const alt = swaps && swaps[base.id] ? base.alts.find((x) => x.id === swaps[base.id]) : null;
      const sets = (active.sets[base.id] || []).filter((s) => s.done).map((s) => ({ w: Number(s.w) || 0, r: Number(s.r) || 0, done: true, ...(Number(s.rpe) >= 1 && Number(s.rpe) <= 10 ? { rpe: Number(s.rpe) } : {}) }));
      if (sets.length) exercises.push({ id: alt ? alt.id : base.id, name: alt ? alt.name : base.name, from: alt ? base.name : "", sets, ...(base.timed ? { timed: true } : {}), ...(base.slot ? { slot: base.slot } : {}) });
    }
  }
  const minutes = Math.max(1, Math.round(elapsedSec(active, now) / 60));
  const items = day.blocks.flatMap((b) => (b.type === "check" ? b.items : b.type === "options" ? b.options.flatMap((o) => o.items) : []));
  return {
    id: active.id, planId: day.source === SMART_ID ? SMART_ID : day.source === CUSTOM_SOURCE && day.planId ? day.planId : PLAN_ID, date: active.date, dayId: day.id, title: `Day ${day.n}: ${day.title}`, startedAt: active.startedAt,
    ...(day.source === SMART_ID ? { sessionId: day.sessionId || "", way: day.way || "gym", pain: active.pain || [] } : {}),
    minutes, kcal: estimateKcal(day, minutes, weightKg), feel: feel || "", notes: String(notes || "").slice(0, 300),
    exercises, checks: Object.values(active.checks).filter(Boolean).length, checksTotal: items.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------- storage
const KEY = (owner) => `ff-wp-v1:${owner || "guest"}`;
export const emptyState = () => ({ startDate: "", swaps: {}, favs: [], sessions: [], active: null, weightKg: 78, unit: "kg", synced: {}, source: "auto", way: {}, plans: [] });

export function loadState(owner) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(owner)) || "null");
    if (raw && typeof raw === "object") return { ...emptyState(), ...raw, swaps: raw.swaps || {}, favs: raw.favs || [], sessions: Array.isArray(raw.sessions) ? raw.sessions : [], synced: raw.synced || {}, plans: cleanPlans(raw.plans) };
  } catch { /* corrupt or private mode: start fresh */ }
  return emptyState();
}
export function saveState(owner, state) {
  try { localStorage.setItem(KEY(owner), JSON.stringify(state)); return true; } catch { return false; }
}
