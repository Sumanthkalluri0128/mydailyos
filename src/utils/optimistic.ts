// Optimistic overlay: makes writes that are still waiting in the offline queue VISIBLE everywhere.
//
// Screens read through `read()` (utils/offline.ts), which fetches (or falls back to the saved copy) and then
// runs the response through `applyPending()` below. So an entry added offline shows up immediately on its own
// screen, in the Home dashboard totals, in History, in the Progress charts — exactly as if it had synced.
//
// Pure (no React Native / network) so it is fully unit-tested.

import { applyFoodLog, applyPlanAdd, applyPlanEdit, applyPlanLog, applyPlanRemove, applyRemoveLogged, type MealId } from './mealView';
import { patchRow } from './logEditLocal';

export const LOCAL_PREFIX = 'local:';
export const localId = (clientId: string) => `${LOCAL_PREFIX}${clientId}`;
export const isLocalId = (id: unknown): id is string => typeof id === 'string' && id.startsWith(LOCAL_PREFIX);

export type PendingOp = { method: string; path: string; body?: any; meta?: Record<string, any>; createdAt?: number };

type Ev =
  | { k: 'water+'; id: string; clientId: string; date: string; amountMl: number; at: number }
  | { k: 'water-'; id: string }
  | { k: 'food+'; id: string; clientId: string; date: string; mealType: string; foodName: string; nutritionTotal: Record<string, number>; consumedQuantity: number; servingUnit: string; servings: number; at: number; foodId?: string; planId?: string }
  | { k: 'plan+'; id: string; clientId: string; date: string; mealType: string; foodId: string; foodName: string; quantity: number; servingUnit: string; nutrition: Record<string, number>; why: string }
  | { k: 'food-'; id: string }
  | { k: 'plan-'; id: string }                                                                                   // a planned item removed
  | { k: 'plan~'; id: string; patch: { quantity?: number; mealType?: string; date?: string } }                  // a planned item's amount, meal or day changed
  | { k: 'food~'; id: string; mealType: string }
  | { k: 'food*'; id: string; patch: { foodName?: string; per: Record<string, number> }; date?: string; delta?: Record<string, number> }   // a corrected quick-add estimate
  | { k: 'weight+'; id: string; clientId: string; date: string; weightKg: number; scaleId?: string; at: number }
  | { k: 'weight-'; id: string }
  | { k: 'task+'; id: string; clientId: string; fields: any; at: number }
  | { k: 'task~'; id: string; patch: any; wasCompleted?: boolean }
  | { k: 'task-'; id: string }
  | { k: 'habitlog'; habitId: string; date: string; completedValue: number; name: string; target: number; unit: string }
  | { k: 'exercise+'; id: string; clientId: string; date: string; activityName: string; category: string; durationMinutes: number; caloriesBurned: number; sets: any[]; at: number }
  | { k: 'exercise~'; id: string; patch: { durationMinutes?: number; caloriesBurned?: number; date?: string; notes?: string } } // a logged workout fixed (minutes / calories / day / note)
  | { k: 'exercise-'; id: string; clientId?: string } // by the entry's own id, or (a finished Workout-tab session being deleted) by the id the app gave it
  | { k: 'health+'; id: string; clientId: string; type: string; date: string; value: number; value2: number | null; source: string; at: number }
  | { k: 'health-'; id: string }
  | { k: 'steps='; date: string; value: number } // steps are one value per day: a newer reading REPLACES the old one
  | { k: 'habit+'; id: string; clientId: string; fields: any }
  | { k: 'habit~'; id: string; patch: any }
  | { k: 'habit-'; id: string }
  | { k: 'profile~'; patch: any };

let markPending = true;
const P = () => (markPending ? { pending: true } : {});

const num = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const lastSeg = (p: string) => decodeURIComponent(p.split('?')[0].split('/').filter(Boolean).pop() || '');

/** Turns one queued write into the effect it will have once synced (or null when we can't predict it). */
export function opToEvent(op: PendingOp): Ev | null {
  const m = op.method.toUpperCase();
  const base = op.path.split('?')[0].replace(/\/+$/, '');
  const b = op.body || {};
  const meta = op.meta || {};
  const at = op.createdAt ?? Date.now();
  const cid = (b.clientId as string) || '';

  if (m === 'POST' && base === '/api/water' && cid) return { k: 'water+', id: localId(cid), clientId: cid, date: b.date, amountMl: num(b.amountMl), at };
  if (m === 'DELETE' && base.startsWith('/api/water/')) return { k: 'water-', id: lastSeg(base) };

  if (m === 'POST' && base === '/api/food-logs' && cid && meta.nutritionTotal)
    return { k: 'food+', id: localId(cid), clientId: cid, date: b.date, mealType: b.mealType, foodName: meta.foodName || 'Food', nutritionTotal: meta.nutritionTotal, consumedQuantity: num(meta.consumedQuantity ?? b.quantity, 1), servingUnit: meta.servingUnit || '', servings: num(meta.servings, 1), at, foodId: b.foodId ? String(b.foodId) : undefined };
  // Eating a PLANNED item offline is a food log too: Home / History count it like any other, and the planner turns the planned row into a logged one.
  const planLog = base.match(/^\/api\/meal-plans\/([^/]+)\/log$/);
  if (m === 'POST' && planLog && cid && meta.nutritionTotal)
    return { k: 'food+', id: localId(cid), clientId: cid, date: b.date || meta.date, mealType: meta.mealType, foodName: meta.foodName || 'Food', nutritionTotal: meta.nutritionTotal, consumedQuantity: num(meta.consumedQuantity, 1), servingUnit: meta.servingUnit || '', servings: num(meta.servings, 1), at, foodId: meta.foodId ? String(meta.foodId) : undefined, planId: decodeURIComponent(planLog[1]) };
  if (m === 'POST' && base === '/api/meal-plans' && cid && meta.nutrition)
    return { k: 'plan+', id: localId(cid), clientId: cid, date: b.date, mealType: b.mealType, foodId: b.foodId ? String(b.foodId) : '', foodName: meta.foodName || 'Food', quantity: num(b.quantity, 1), servingUnit: meta.servingUnit || '', nutrition: meta.nutrition, why: meta.why || '' };
  if (m === 'DELETE' && base.startsWith('/api/food-logs/')) return { k: 'food-', id: lastSeg(base) };
  if (m === 'DELETE' && /^\/api\/meal-plans\/[^/]+$/.test(base)) return { k: 'plan-', id: lastSeg(base) };
  if (m === 'PATCH' && /^\/api\/meal-plans\/[^/]+$/.test(base) && (b.quantity !== undefined || b.mealType !== undefined || b.date !== undefined)) {
    const patch: { quantity?: number; mealType?: string; date?: string } = {};
    if (b.quantity !== undefined && Number.isFinite(Number(b.quantity))) patch.quantity = Number(b.quantity);
    if (b.mealType !== undefined) patch.mealType = String(b.mealType);
    if (b.date !== undefined) patch.date = String(b.date);
    return { k: 'plan~', id: lastSeg(base), patch };
  }
  if (m === 'PATCH' && /^\/api\/food-logs\/[^/]+$/.test(base) && b.mealType && b.quantity === undefined) return { k: 'food~', id: lastSeg(base), mealType: String(b.mealType) };
  // Correcting a quick-add estimate: the body holds only what changed (per serving); `meta` carries the day and how much each total moves, for the History totals.
  if (m === 'PATCH' && /^\/api\/food-logs\/[^/]+$/.test(base) && b.quantity === undefined && (b.foodName !== undefined || FOOD_KEYS.some((k) => b[k] !== undefined))) {
    const per: Record<string, number> = {}; for (const k of FOOD_KEYS) if (b[k] !== undefined && Number.isFinite(Number(b[k]))) per[k] = Number(b[k]);
    return { k: 'food*', id: lastSeg(base), patch: { ...(b.foodName !== undefined ? { foodName: String(b.foodName) } : {}), per }, date: meta.date, delta: meta.delta };
  }

  if (m === 'POST' && base === '/api/weight' && cid) return { k: 'weight+', id: localId(cid), clientId: cid, date: b.date, weightKg: num(b.weightKg), scaleId: b.scaleId ? String(b.scaleId) : '', at };
  if (m === 'DELETE' && base.startsWith('/api/weight/')) return { k: 'weight-', id: lastSeg(base) };

  if (m === 'POST' && base === '/api/tasks' && cid) return { k: 'task+', id: localId(cid), clientId: cid, fields: b, at };
  if (m === 'PATCH' && /^\/api\/tasks\/[^/]+\/toggle$/.test(base)) return { k: 'task~', id: base.split('/')[3], patch: { completed: b.completed }, wasCompleted: meta.wasCompleted };
  if (m === 'PATCH' && /^\/api\/tasks\/[^/]+$/.test(base)) return { k: 'task~', id: lastSeg(base), patch: b };
  if (m === 'DELETE' && /^\/api\/tasks\/[^/]+$/.test(base)) return { k: 'task-', id: lastSeg(base) };

  if (m === 'POST' && base === '/api/habits/logs' && b.habitId) return { k: 'habitlog', habitId: b.habitId, date: b.date, completedValue: num(b.completedValue), name: meta.habitName || 'Habit', target: num(meta.target, 1), unit: meta.unit || 'times' };
  if (m === 'POST' && base === '/api/habits' && cid) return { k: 'habit+', id: localId(cid), clientId: cid, fields: b };
  if (m === 'PUT' && /^\/api\/habits\/[^/]+$/.test(base)) return { k: 'habit~', id: lastSeg(base), patch: b };
  if (m === 'DELETE' && /^\/api\/habits\/[^/]+$/.test(base)) return { k: 'habit-', id: lastSeg(base) };

  if (m === 'POST' && base === '/api/activities/logs' && cid)
    return { k: 'exercise+', id: localId(cid), clientId: cid, date: b.date, activityName: meta.activityName || 'Workout', category: meta.category || '', durationMinutes: num(b.durationMinutes), caloriesBurned: num(b.caloriesBurned ?? meta.caloriesBurned), sets: b.sets || [], at };
  if (m === 'PATCH' && base.startsWith('/api/activities/logs/') && lastSeg(base)) {
    const patch: any = {};
    if (b.durationMinutes !== undefined && Number.isFinite(Number(b.durationMinutes))) patch.durationMinutes = Number(b.durationMinutes);
    if (b.caloriesBurned !== undefined && Number.isFinite(Number(b.caloriesBurned))) patch.caloriesBurned = Number(b.caloriesBurned);
    if (typeof b.date === 'string') patch.date = b.date;
    if (typeof b.notes === 'string') patch.notes = b.notes;
    return Object.keys(patch).length ? { k: 'exercise~', id: lastSeg(base), patch } : null;
  }
  if (m === 'DELETE' && base.startsWith('/api/activities/logs/')) return { k: 'exercise-', id: lastSeg(base) };
  // A finished Workout-tab session deleted by the id the app gave it: classic -> its exercise entry; Smart -> the entry the server made (bp-<id>).
  if (m === 'DELETE' && base === '/api/activities/logs' && q(op.path).get('clientId')) return { k: 'exercise-', id: '', clientId: String(q(op.path).get('clientId')) };
  if (m === 'DELETE' && base === '/api/body-plan/session' && q(op.path).get('clientId')) return { k: 'exercise-', id: '', clientId: `bp-${q(op.path).get('clientId')}` };

  if (m === 'POST' && base === '/api/health-logs' && b.type === 'steps' && b.date) return { k: 'steps=', date: b.date, value: Math.max(0, Math.round(num(b.value))) };
  if (m === 'POST' && base === '/api/health-logs' && cid) return { k: 'health+', id: localId(cid), clientId: cid, type: b.type, date: b.date, value: num(b.value), value2: b.value2 == null ? null : num(b.value2), source: b.source || 'manual', at };
  if (m === 'DELETE' && base.startsWith('/api/health-logs/')) return { k: 'health-', id: lastSeg(base) };

  if (m === 'PATCH' && base === '/api/profile') return { k: 'profile~', patch: b };
  return null;
}

// ---------------------------------------------------------------------------------------------- helpers
const iso = (t: number) => new Date(t).toISOString();
const q = (path: string) => new URLSearchParams(path.split('?')[1] || '');
const inRange = (date: string, from?: string | null, to?: string | null) => (!from || date >= from) && (!to || date <= to);

/** Applies queued meal moves to a list of food logs. */
function applyMoves(list: any[], evs: Ev[]) {
  const moves = evs.filter((e: any) => e.k === 'food~') as Extract<Ev, { k: 'food~' }>[];
  if (!moves.length) return list;
  return list.map((x: any) => { let out = x; for (const e of moves) if (e.id === x._id) out = { ...out, mealType: e.mealType }; return out; });
}

const FOOD_KEYS = ['calories', 'protein', 'carbohydrates', 'fat'] as const;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** One corrected quick-add row: the new name, and the new numbers (per serving, as sent to the server) with the totals scaled by the row's servings. */
export function applyQuickCorrection(row: any, patch: { foodName?: string; per: Record<string, number> }) {
  const servings = Number(row.servings) > 0 ? Number(row.servings) : 1;
  return { ...row, ...(patch.foodName !== undefined ? { foodName: patch.foodName } : {}),
    nutritionPerServing: { ...(row.nutritionPerServing || {}), ...patch.per },
    nutritionTotal: { ...(row.nutritionTotal || {}), ...Object.fromEntries(Object.entries(patch.per).map(([k, v]) => [k, r2(v * servings)])) } };
}
/** Applies queued quick-add corrections (name and numbers) to a list of food logs, oldest first. Only the quick-add form sends these (the server refuses them for a real food),
 *  and the day endpoint behind Home does not mark rows `quick`, so the row itself is not checked. */
function applyFoodEdits(list: any[], evs: Ev[]) {
  const edits = evs.filter((e: any) => e.k === 'food*') as Extract<Ev, { k: 'food*' }>[];
  if (!edits.length) return list;
  return list.map((x: any) => edits.filter((e) => e.id === x._id).reduce((row, e) => applyQuickCorrection(row, e.patch), x));
}

function mergeList(list: any[], adds: any[], removed: Set<string>, removedClientIds?: Set<string>) {
  const present = new Set(list.map((x) => x.clientId).filter(Boolean));
  const out = list.filter((x) => !removed.has(x._id) && !(removedClientIds && x.clientId && removedClientIds.has(x.clientId)));
  for (const a of adds) if (!present.has(a.clientId)) out.unshift({ ...a, ...P() });
  return out;
}
/** Apply queued edits (oldest first) to a list of logged workouts, then drop what the edit moved out of the day / range that is being shown. */
function applyEdits(list: any[], evs: Ev[], keep: (row: any) => boolean) {
  const edits = evs.filter((e: any) => e.k === 'exercise~') as any[];
  if (!edits.length) return list;
  return list.map((row) => edits.filter((e) => e.id === row._id).reduce((r, e) => patchRow(r, e.patch), row)).filter(keep);
}
const removedClientIds = (evs: Ev[], k: string) => new Set(evs.filter((e: any) => e.k === k && e.clientId).map((e: any) => e.clientId as string));
const removedSet = (evs: Ev[], k: string) => new Set(evs.filter((e: any) => e.k === k).map((e: any) => e.id as string));

const waterDoc = (e: any) => ({ _id: e.id, clientId: e.clientId, date: e.date, amountMl: e.amountMl, createdAt: iso(e.at) });
const foodDoc = (e: any) => ({ _id: e.id, clientId: e.clientId, date: e.date, mealType: e.mealType, foodName: e.foodName, consumedQuantity: e.consumedQuantity, servingUnit: e.servingUnit, servings: e.servings, nutritionTotal: e.nutritionTotal, createdAt: iso(e.at) });
// A queued weigh-in as the server will return it: `rawKg` = what the scale showed, `weightKg` = calibrated with that scale's offset (when the list carries scales).
const weightDoc = (e: any, scales: any[] = [], ref = 'main') => {
  const sid = e.scaleId || ref; const sc = scales.find((x: any) => x.id === sid);
  return { _id: e.id, clientId: e.clientId, date: e.date, rawKg: e.weightKg, weightKg: Math.round((e.weightKg - (sc ? Number(sc.offsetKg) || 0 : 0)) * 100) / 100, scaleId: sid, scaleName: sc ? sc.name : 'Scale', createdAt: iso(e.at) };
};
const sameScale = (x: any, sid: string) => (x.scaleId || 'main') === sid;
const exerciseDoc = (e: any) => ({ _id: e.id, clientId: e.clientId, date: e.date, activityName: e.activityName, category: e.category, durationMinutes: e.durationMinutes, caloriesBurned: e.caloriesBurned, caloriesSource: 'estimated', sets: e.sets, createdAt: iso(e.at) });
const healthDoc = (e: any) => ({ _id: e.id, clientId: e.clientId, type: e.type, date: e.date, value: e.value, value2: e.value2, source: e.source, createdAt: iso(e.at) });
const taskDoc = (e: any) => ({ _id: e.id, clientId: e.clientId, title: e.fields.title, date: e.fields.date, time: e.fields.time || '', priority: e.fields.priority || 'medium', category: e.fields.category || 'General', recurrence: e.fields.recurrence || 'none', completed: false, createdAt: iso(e.at) });

function patchTasks(tasks: any[], evs: Ev[], date: string) {
  let out = tasks.slice();
  const present = new Set(out.map((t) => t.clientId).filter(Boolean));
  for (const e of evs) {
    if (e.k === 'task+' && e.fields.date === date && !present.has(e.clientId)) out.unshift({ ...taskDoc(e), ...P() });
    if (e.k === 'task~') out = out.map((t) => (t._id === e.id ? { ...t, ...pick(e.patch, ['title', 'time', 'priority', 'category', 'recurrence', 'completed']), ...P() } : t));
    if (e.k === 'task-') out = out.filter((t) => t._id !== e.id);
  }
  return out;
}
function pick(o: any, keys: string[]) { const r: any = {}; for (const k of keys) if (o && o[k] !== undefined) r[k] = o[k]; return r; }

function applyHabitLogs(logs: any[], evs: Ev[], date: string) {
  const out = logs.slice();
  for (const e of evs) {
    if (e.k !== 'habitlog' || e.date !== date) continue;
    const completed = e.completedValue >= e.target && e.completedValue > 0;
    const i = out.findIndex((l) => String(l.habitId) === String(e.habitId));
    const next = { habitId: e.habitId, date, habitName: e.name, target: e.target, unit: e.unit, completedValue: e.completedValue, completed, ...P() };
    if (i >= 0) out[i] = { ...out[i], ...next }; else out.push({ _id: `${LOCAL_PREFIX}hl-${e.habitId}-${date}`, ...next });
  }
  return out;
}

/** kcal per step for this person: reuse the server's own ratio when it has one, otherwise 0.0005 x body weight. */
function perStepKcal(steps: number, stepCal: number, weightKg?: number | null) {
  return steps > 0 && stepCal > 0 ? stepCal / steps : (Number(weightKg) || 70) * 0.0005;
}
const lastSteps = (evs: Ev[], date: string) => { let v: Ev | null = null; for (const e of evs) if (e.k === 'steps=' && e.date === date) v = e; return v as Extract<Ev, { k: 'steps=' }> | null; };

function recomputeSummary(day: any) {
  const s = { ...(day.summary || {}) };
  const sum = (arr: any[], f: (x: any) => number) => (arr || []).reduce((t, x) => t + (Number(f(x)) || 0), 0);
  s.calories = sum(day.food, (x) => x.nutritionTotal?.calories);
  s.protein = sum(day.food, (x) => x.nutritionTotal?.protein);
  s.carbohydrates = sum(day.food, (x) => x.nutritionTotal?.carbohydrates);
  s.fat = sum(day.food, (x) => x.nutritionTotal?.fat);
  s.fiber = sum(day.food, (x) => x.nutritionTotal?.fiber);
  s.sugar = sum(day.food, (x) => x.nutritionTotal?.sugar);
  const meals: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  for (const l of day.food || []) if (meals[l.mealType] !== undefined) meals[l.mealType] += Number(l.nutritionTotal?.calories || 0);
  s.meals = meals;
  s.waterMl = sum(day.water, (x) => x.amountMl);
  s.exerciseMinutes = sum(day.exercise, (x) => x.durationMinutes);
  s.workoutCalories = sum(day.exercise, (x) => x.caloriesBurned);
  s.caloriesBurned = s.workoutCalories + (Number(s.stepCalories) || 0);
  const w = (day.weight || [])[0];
  s.weightKg = w ? Number(w.weightKg) : s.weightKg ?? null;
  return s;
}

function applyDay(data: any, evs: Ev[], date: string) {
  const d = { ...data };
  d.water = mergeList(d.water || [], evs.filter((e: any) => e.k === 'water+' && e.date === date).reverse().map(waterDoc), removedSet(evs, 'water-'));
  d.food = applyFoodEdits(applyMoves(mergeList(d.food || [], evs.filter((e: any) => e.k === 'food+' && e.date === date).reverse().map(foodDoc), removedSet(evs, 'food-')), evs), evs);
  d.exercise = applyEdits(mergeList(d.exercise || [], evs.filter((e: any) => e.k === 'exercise+' && e.date === date).reverse().map(exerciseDoc), removedSet(evs, 'exercise-'), removedClientIds(evs, 'exercise-')), evs, (r) => !r.date || r.date === date);
  // One weigh-in per day: a queued weigh-in replaces whatever that day had (the server does the same on replay).
  let weights = mergeList(d.weight || [], [], removedSet(evs, 'weight-'));
  for (const e of evs) {
    if (e.k !== 'weight+' || e.date !== date) continue;
    if (weights.some((x: any) => x.clientId === e.clientId)) continue;
    const sid = e.scaleId || d.referenceId || 'main';
    weights = [...weights.filter((x: any) => !sameScale(x, sid)), { ...weightDoc(e, d.scales || [], d.referenceId || 'main'), ...P() }]; // one weigh-in per day per scale
  }
  d.weight = weights;
  d.tasks = patchTasks(d.tasks || [], evs, date);
  d.habits = applyHabitLogs(d.habits || [], evs, date);
  const st = lastSteps(evs, date);
  if (st) {
    const s0 = d.summary || {};
    const w = (d.weight || [])[0]?.weightKg ?? s0.weightKg;
    d.summary = { ...s0, steps: st.value, stepCalories: Math.round(st.value * perStepKcal(Number(s0.steps) || 0, Number(s0.stepCalories) || 0, w)) };
  }
  d.summary = recomputeSummary(d);
  return d;
}

function applyHistory(data: any, evs: Ev[]) {
  if (!Array.isArray(data?.days)) return data;
  const days = data.days.map((r: any) => ({ ...r }));
  const row = (date: string) => days.find((r: any) => r.date === date);
  for (const e of evs) {
    if (e.k === 'water+') { const r = row(e.date); if (r) r.waterMl += e.amountMl; }
    if (e.k === 'food+') { const r = row(e.date); if (r) for (const [k, key] of [['calories', 'calories'], ['protein', 'protein'], ['carbohydrates', 'carbohydrates'], ['fat', 'fat'], ['fiber', 'fiber'], ['sugar', 'sugar']] as const) r[key] += Number(e.nutritionTotal?.[k] || 0); }
    if (e.k === 'food*' && e.date && e.delta) { const r = row(e.date); if (r) for (const k of FOOD_KEYS) r[k] += Number(e.delta[k] || 0); }
    if (e.k === 'exercise+') { const r = row(e.date); if (r) { r.exerciseMinutes += e.durationMinutes; r.caloriesBurned += e.caloriesBurned; } }
    if (e.k === 'weight+') { const r = row(e.date); if (r) { r.weightKg = e.weightKg; r.weighIn = true; } }
    if (e.k === 'steps=') {
      const r = row(e.date);
      if (r) {
        const oldCal = Number(r.stepCalories) || 0;
        const newCal = Math.round(e.value * perStepKcal(Number(r.steps) || 0, oldCal, r.weightKg));
        r.caloriesBurned = (Number(r.caloriesBurned) || 0) - oldCal + newCal; r.stepCalories = newCal; r.steps = e.value;
      }
    }
    if (e.k === 'task+') { const r = row(e.fields.date); if (r) r.tasksTotal += 1; }
    if (e.k === 'task~' && typeof e.patch.completed === 'boolean' && typeof e.wasCompleted === 'boolean' && e.wasCompleted !== e.patch.completed) {
      // History rows are per day; toggles from the Tasks screen only concern today's list, which is the last row of any range ending today.
      const r = days[days.length - 1]; if (r) r.tasksCompleted = Math.max(0, r.tasksCompleted + (e.patch.completed ? 1 : -1));
    }
  }
  const sumOf = (k: string) => days.reduce((t: number, r: any) => t + (Number(r[k]) || 0), 0);
  const totals = { ...(data.totals || {}), calories: sumOf('calories'), protein: sumOf('protein'), waterMl: sumOf('waterMl'), exerciseMinutes: sumOf('exerciseMinutes'), caloriesBurned: sumOf('caloriesBurned'), steps: sumOf('steps'), tasksCompleted: sumOf('tasksCompleted'), tasksTotal: sumOf('tasksTotal'), habitsCompleted: sumOf('habitsCompleted') };
  return { ...data, days, totals };
}

export function deepMerge(a: any, b: any): any {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = { ...(a || {}) };
  for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
  return out;
}

/**
 * Applies still-queued writes to a GET response. Returns the same object untouched when nothing applies.
 * Order matters (oldest first), exactly like the replay order.
 */
export function applyPending<T = any>(path: string, data: T, ops: PendingOp[], opts?: { pending?: boolean }): T {
  markPending = opts?.pending !== false;
  try { return applyPendingInner(path, data, ops); } finally { markPending = true; }
}

function applyPendingInner<T = any>(path: string, data: T, ops: PendingOp[]): T {
  if (!ops.length || !data || typeof data !== 'object') return data;
  const evs = ops.map(opToEvent).filter(Boolean) as Ev[];
  if (!evs.length) return data;
  const base = path.split('?')[0].replace(/\/+$/, '');
  const p = q(path);
  const d: any = data;

  if (base === '/api/meal-plans/view') {
    const pending = markPending;
    let view: any = d;
    const gone = removedSet(evs, 'food-');
    for (const e of evs) {
      if (e.k === 'food+') view = e.planId ? applyPlanLog(view, { planId: e.planId, clientId: e.clientId, date: e.date, pending }) : applyFoodLog(view, { clientId: e.clientId, date: e.date, mealType: e.mealType as MealId, foodId: e.foodId, foodName: e.foodName, nutritionTotal: e.nutritionTotal, quantity: e.consumedQuantity, servingUnit: e.servingUnit, pending });
      else if (e.k === 'plan-') view = applyPlanRemove(view, new Set([e.id]));
      else if (e.k === 'plan~') view = applyPlanEdit(view, { id: e.id, ...e.patch, mealType: e.patch.mealType as MealId | undefined });
      else if (e.k === 'plan+') view = applyPlanAdd(view, { clientId: e.clientId, date: e.date, mealType: e.mealType as MealId, foodId: e.foodId, foodName: e.foodName, quantity: e.quantity, servingUnit: e.servingUnit, nutrition: e.nutrition, why: e.why, pending });
    }
    return applyRemoveLogged(view, gone) as any;
  }
  if (base === '/api/progress/day' || base === '/api/progress/history/day') {
    const date = p.get('date');
    return date ? (applyDay(d, evs, date) as any) : data;
  }
  if (base === '/api/progress/history') {
    const from = p.get('from'); const to = p.get('to');
    return applyHistory(d, evs.filter((e: any) => !e.date || inRange(e.date, from, to)) as Ev[]) as any;
  }
  if (base === '/api/health-logs/steps/day') {
    const date = p.get('date');
    const st = date ? lastSteps(evs, date) : null;
    if (!st) return data;
    const kcal = Math.round(st.value * perStepKcal(Number(d.steps) || 0, Number(d.caloriesBurned) || 0, null));
    return { ...d, steps: st.value, caloriesBurned: kcal, distanceKm: Math.round((st.value * 0.762) / 10) / 100, source: 'manual' } as any;
  }
  if (base === '/api/water') {
    const date = p.get('date');
    const logs = mergeList(d.logs || [], evs.filter((e: any) => e.k === 'water+' && (!date || e.date === date)).reverse().map(waterDoc), removedSet(evs, 'water-'));
    const totalMl = logs.reduce((t: number, x: any) => t + (Number(x.amountMl) || 0), 0);
    return { ...d, logs, totalMl, totalLiters: totalMl / 1000 };
  }
  if (base === '/api/food-logs') {
    const date = p.get('date');
    return { ...d, logs: applyFoodEdits(applyMoves(mergeList(d.logs || [], evs.filter((e: any) => e.k === 'food+' && (!date || e.date === date)).reverse().map(foodDoc), removedSet(evs, 'food-')), evs), evs) };
  }
  if (base === '/api/activities/logs') {
    const date = p.get('date'); const from = p.get('from'); const to = p.get('to');
    const adds = evs.filter((e: any) => e.k === 'exercise+' && (date ? e.date === date : inRange(e.date, from, to))).reverse().map(exerciseDoc);
    return { ...d, logs: applyEdits(mergeList(d.logs || [], adds, removedSet(evs, 'exercise-'), removedClientIds(evs, 'exercise-')), evs, (r) => !r.date || (date ? r.date === date : inRange(r.date, from, to))) };
  }
  if (base === '/api/weight') {
    const date = p.get('date');
    let logs = (d.logs || []).filter((x: any) => !removedSet(evs, 'weight-').has(x._id));
    for (const e of evs) {
      if (e.k !== 'weight+' || (date && e.date !== date)) continue;
      if (logs.some((x: any) => x.clientId === e.clientId)) continue;
      const sid = e.scaleId || d.referenceId || 'main';
      logs = logs.filter((x: any) => !(x.date === e.date && sameScale(x, sid))); // one weigh-in per day per scale: the newest replaces it
      logs.push({ ...weightDoc(e, d.scales || [], d.referenceId || 'main'), ...P() });
    }
    logs.sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return { ...d, logs };
  }
  if (base === '/api/tasks') {
    const date = p.get('date');
    return date ? { ...d, tasks: patchTasks(d.tasks || [], evs, date) } : data;
  }
  if (base === '/api/habits/logs') {
    const date = p.get('date');
    return date ? { ...d, logs: applyHabitLogs(d.logs || [], evs, date) } : data;
  }
  if (base === '/api/habits') {
    let habits = (d.habits || []).slice();
    const present = new Set(habits.map((h: any) => h.clientId).filter(Boolean));
    for (const e of evs) {
      if (e.k === 'habit+' && !present.has(e.clientId)) habits.push({ _id: e.id, clientId: e.clientId, name: e.fields.name, frequency: e.fields.frequency || 'daily', target: e.fields.target || 1, unit: e.fields.unit || 'times', isActive: true, ...P() });
      if (e.k === 'habit~') habits = habits.map((h: any) => (h._id === e.id ? { ...h, ...pick(e.patch, ['name', 'target', 'unit']) } : h));
      if (e.k === 'habit-') habits = habits.filter((h: any) => h._id !== e.id);
    }
    return { ...d, habits };
  }
  if (base === '/api/health-logs') {
    const type = p.get('type'); const from = p.get('from'); const to = p.get('to');
    const adds = evs.filter((e: any) => e.k === 'health+' && (!type || e.type === type) && inRange(e.date, from, to)).reverse().map(healthDoc);
    const logs = mergeList(d.logs || [], adds, removedSet(evs, 'health-'));
    logs.sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return { ...d, logs };
  }
  if (base === '/api/profile') {
    let profile = d.profile;
    for (const e of evs) if (e.k === 'profile~') profile = deepMerge(profile, e.patch);
    return profile === d.profile ? data : { ...d, profile };
  }
  return data;
}
