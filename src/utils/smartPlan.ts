// The phone side of the web's "one workout plan" (web: utils/unifiedPlan.js). The server builds a Smart program from your body, goal and logged
// sessions (GET /api/body-plan). This turns it into the phone's own plan-day shape (data/workoutPlan.ts) so Today, the day overview, the live
// workout and History all run on ONE plan. Pure: no React, no network. Tested in __tests__/smartPlan.test.ts.
import { Cat, DayWay, Exercise, Gear, PlanDay, PlanItem, getEx, registerExercise } from '../data/workoutPlan';
import { addDays } from './dates';
import { Session, mondayOf } from './workoutEngine';

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CAT: Record<string, Cat> = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', glutes: 'Glutes', core: 'Core', cardio: 'Cardio' };
const LABEL: Record<string, string> = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', glutes: 'Glutes', core: 'Core', cardio: 'Cardio' };
const cap = (s: any) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const num = (x: any, d = 0) => { const v = Number(x); return Number.isFinite(v) ? v : d; };
const gearOf = (kind: string): Gear => (/machine/.test(kind) ? 'Machine' : /cable/.test(kind) ? 'Cable' : /free|dumbbell/.test(kind) ? 'Dumbbell' : /band/.test(kind) ? 'Band' : /kettle/.test(kind) ? 'Kettlebell' : /body/.test(kind) ? 'Bodyweight' : 'Other');

/** True when the plan can drive the app: the server says it is ready and it was worked out for THIS week (an old saved copy is not used). */
export function smartUsable(data: any, today: string): boolean {
  const plan = data && data.plan;
  if (!plan || !plan.ready || !plan.training || !plan.training.program || !(plan.training.program.week || []).length) return false;
  const asOf = plan.adapt && plan.adapt.today;
  return !asOf || mondayOf(asOf) === mondayOf(today);
}

const repsText = (e: any) => { const lo = num(e.repsLo, 8), hi = num(e.repsHi, lo); return lo === hi ? String(lo) : `${lo}-${hi}`; };

/** A server exercise (or swap) as a phone library exercise. */
export function toExercise(e: any): Exercise {
  const f = e.form || {};
  const targets: string[] = (e.targets || []).filter((t: string) => CAT[t]);
  const cat = CAT[targets[0]] || 'Core';
  return {
    id: e.id, name: cap(e.name), cat, gear: gearOf(String(e.kind || '')),
    muscles: targets.map((t) => LABEL[t]).concat((e.helpers || []).filter((t: string) => LABEL[t]).map((t: string) => LABEL[t])),
    targets, tip: e.cue || '',
    steps: [e.cue, f.setup && `Set up: ${f.setup}`, f.move && `Move: ${f.move}`, f.breathe && `Breathe: ${f.breathe}`, f.avoid && `Avoid: ${f.avoid}`].filter(Boolean) as string[],
    fig: e.id, slot: e.slot || '', unit: e.unit === 'seconds' ? 'sec' : 'reps', perSide: !!e.perSide,
  };
}

/** Every swap the server offers for an exercise, each once, never the exercise itself. */
export function altsOf(e: any): any[] {
  const sw = e.swaps || {};
  const raw = [...(sw.busy || []), ...(sw.dumbbellOnly ? [sw.dumbbellOnly] : []), ...(sw.home ? [sw.home] : []), ...(sw.easier ? [sw.easier] : []), ...(sw.harder ? [sw.harder] : [])];
  const seen = new Set([e.id]); const out: any[] = [];
  for (const x of raw) { if (!x || !x.id || seen.has(x.id)) continue; seen.add(x.id); out.push(x); }
  return out;
}

/** Puts every exercise and swap of the program into the phone's library (never replacing one it already has), so pictures and the live workout find them. */
export function registerProgram(program: any) {
  for (const s of program.sessions || []) {
    for (const list of [s.exercises, s.homeBackup && s.homeBackup.exercises, s.quick && s.quick.exercises]) {
      for (const e of list || []) { registerExercise(toExercise(e)); for (const a of altsOf(e)) registerExercise(toExercise({ ...a, targets: a.targets || e.targets, unit: a.unit || e.unit })); }
    }
  }
}

const toItem = (e: any): PlanItem => ({ ex: e.id, sets: Math.max(1, num(e.setsToday || e.sets, 3)), reps: repsText(e), restSec: num(e.restSec, 75), alts: altsOf(e).map((a) => a.id), note: e.effortToday || e.effort || '' });

/** Gym / Home match / Quick 20: the same day done another way (web: `wayList`). Only the ways the day really has are offered. */
export type Way = 'gym' | 'home' | 'quick';
export function wayList(day: PlanDay | null | undefined, homeOnly = false): { k: Way; label: string }[] {
  if (!day || !day.smart || day.kind !== 'strength') return [];
  const out: { k: Way; label: string }[] = [{ k: 'gym', label: homeOnly ? '🏠 Home' : '🏋️ Gym' }];
  if (day.ways?.home && !homeOnly) out.push({ k: 'home', label: '🏠 Home match' });
  if (day.ways?.quick) out.push({ k: 'quick', label: '⏱️ Quick 20' });
  return out.length > 1 ? out : [];
}

/** The day as it is done in the chosen way. A way the day does not have falls back to the gym list. */
export function variantDay(day: PlanDay, way: Way): PlanDay {
  const w = way !== 'gym' ? day.ways?.[way] : undefined;
  if (!w) return day;
  return { ...day, items: w.items, minutes: [w.minutes, w.minutes] };
}

const quickItem = (e: any, rounds: number): PlanItem => ({ ex: e.id, sets: Math.max(1, rounds), reps: String(e.reps || '10').replace(/\s*to\s*/i, '-').replace(/\s*reps?\s*$/i, ''), restSec: 30, alts: [], note: e.cue || '' });
function buildWays(s: any): PlanDay['ways'] | undefined {
  const ways: NonNullable<PlanDay['ways']> = {};
  if (s.homeBackup && (s.homeBackup.exercises || []).length) ways.home = { items: s.homeBackup.exercises.map(toItem), minutes: num(s.homeBackup.minutes, num(s.minutes, 45)), note: s.homeBackup.note || '' } as DayWay;
  if (s.quick && (s.quick.exercises || []).length) ways.quick = { items: s.quick.exercises.map((e: any) => quickItem(e, num(s.quick.rounds, 2))), minutes: num(s.quick.minutes, 20), note: s.quick.format || '' } as DayWay;
  return Object.keys(ways).length ? ways : undefined;
}

/**
 * The 7 days of this week in the phone's plan shape (n = weekday, Mon = 1). A slot that already passed (missed, skipped, before you started)
 * is shown as a rest-style slot: its session has slid to a later day, and listing it again made every lift appear twice (web v57 fix).
 */
export function programToPhoneDays(program: any, adapt: any = null): PlanDay[] {
  const sessions = new Map<string, any>((program.sessions || []).map((s: any) => [s.id, s]));
  const used = new Set<string>();
  return (program.week || []).slice(0, 7).map((w: any, i: number): PlanDay => {
    const base = { n: i + 1, key: `sm-${SHORT[i].toLowerCase()}`, smart: true, date: w.date || '', shifted: !!w.shifted, note: w.statusNote || '' };
    if (w.kind === 'train' && ['notdone', 'past', 'skipped'].includes(w.status)) {
      const why = w.status === 'skipped' ? 'Skipped' : w.status === 'notdone' ? 'Not done' : 'Before you started';
      return { ...base, short: SHORT[i], title: why, focus: w.statusNote || `${w.label} slides to your next free day, so nothing is lost.`, kind: 'rest', items: [], targets: [], minutes: [0, 0], met: 1.5, intro: `${w.label} is not listed here again: it moves to your next free day.`, missed: true };
    }
    const s = w.kind === 'train' ? sessions.get(w.sessionId) : null;
    if (s) {
      const sid = used.has(s.id) ? `${s.id}${SHORT[i]}` : s.id; used.add(s.id);
      const muscles = (s.focus || []).filter((m: string) => LABEL[m]);
      const m = num(s.minutes, 45);
      const todayNote = adapt && adapt.todayPlan && adapt.todayPlan.sessionId === w.sessionId && w.date && adapt.today === w.date ? adapt.todayPlan.text : '';
      return {
        ...base, short: SHORT[i], title: s.title + (s.light ? ' (light)' : ''), focus: muscles.map((x: string) => LABEL[x]).join(', '), kind: 'strength', sessionId: sid,
        items: (s.exercises || []).map(toItem), minutes: [m, m], met: 4.0, intro: todayNote || w.statusNote || 'Built for you from your body, goal and logged sessions.',
        targets: muscles.map((x: string) => ({ label: LABEL[x], note: '', fig: [x] })),
        ways: buildWays(s), warmup: (s.warmup || []).map(String), cooldown: (s.cooldown || []).map(String),
      };
    }
    if (w.kind === 'active') {
      const mins = num(w.minutes, 30);
      return { ...base, short: SHORT[i], title: 'Easy cardio', focus: 'Easy cardio, mobility', kind: 'active', items: [], targets: [{ label: 'Cardio', note: '', fig: ['cardio'] }], minutes: [mins, mins], met: 3.5, intro: w.note || `${mins} minutes of something you enjoy.` };
    }
    return { ...base, short: SHORT[i], title: 'Rest & reset', focus: 'Recovery, sleep, food', kind: 'rest', items: [], targets: [], minutes: [10, 20], met: 1.5, intro: (program.active && program.active.restDay) || 'Rest well today. Stretch, eat, sleep.' };
  });
}

const FEEL: Record<string, string> = { easy: 'easy', good: 'good', challenging: 'hard', hard: 'hard' };

/**
 * The body of POST /api/body-plan/session for a finished phone workout. The server counts it in the day's exercise totals itself, so the
 * workout must NOT also be logged as a separate exercise (calories would be counted twice). clientId makes a replay safe.
 */
export function sessionPayload(s: Session, opts: { today?: string; phase?: string } = {}) {
  const exercises = (s.exercises || []).map((e) => {
    const lib = getEx(e.exId);
    const timed = e.unit === 'sec';
    return {
      id: e.exId, name: lib ? lib.name : e.exId, slot: (lib && lib.slot) || '',
      sets: (e.sets || []).filter((x) => x.done !== false).map((x) => (timed ? { seconds: num(x.reps), reps: 0, weightKg: 0 } : { reps: num(x.reps), weightKg: num(x.kg), seconds: 0, ...((x as any).rpe ? { rpe: Number((x as any).rpe) } : {}) })),
    };
  }).filter((e) => e.sets.length);
  return {
    date: s.date, today: opts.today || s.date, sessionId: s.smartSessionId || '', title: String(s.title || 'Workout').slice(0, 80), way: s.way || 'gym', status: 'done',
    feel: FEEL[s.feel] || '', pain: (s.pain || []) as string[], phase: ['', 'learn', 'build', 'easy', 'back'].includes(opts.phase || '') ? opts.phase : '', minutes: Math.max(1, Math.round((s.durationSec || 0) / 60)),
    notes: s.note || '', exercises, clientId: `wp-${s.id}`,
  };
}

/** Dates of this week, Monday first (same as the server's week). */
export const weekOf = (today: string) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(today), i));

/** "Not today": tells the Smart plan, which slides the session to the next free day instead of leaving a hole. clientId makes a replay safe. */
export const SKIP_REASONS: [string, string][] = [['tired', 'Tired'], ['busy', 'No time'], ['sick', 'Unwell'], ['pain', 'Sore or hurt'], ['travel', 'Travelling']];
export const PAIN_CHIPS: [string, string][] = [['knee', 'Knee'], ['back', 'Back'], ['shoulder', 'Shoulder'], ['wrist', 'Wrist'], ['elbow', 'Elbow'], ['dizzy', 'Dizzy or chest pressure']];
export function skipPayload(day: { title: string; sessionId?: string }, reason: string, today: string, phase = '') {
  return {
    date: today, today, sessionId: day.sessionId || '', title: String(day.title || 'Workout').slice(0, 80), way: 'gym', status: 'skipped', reason,
    phase: ['', 'learn', 'build', 'easy', 'back'].includes(phase) ? phase : '', exercises: [] as any[], clientId: `wp-skip-${today}-${day.sessionId || 'x'}`,
  };
}
