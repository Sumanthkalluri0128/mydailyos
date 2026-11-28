// What a logged-workout row looks like right after an edit, before the server has answered (the edit may wait offline). Mirrors the server's PATCH
// /api/activities/logs/:id: new minutes make the calories follow them (and they count as estimated again); calories typed by the person are kept and
// marked as entered by them. The next refresh replaces this with the server's own copy.
import { estimateBurn } from './energy';

export function patchRow<T extends Record<string, any>>(row: T, body: { durationMinutes?: number; caloriesBurned?: number; date?: string; notes?: string }): T {
  const r: any = { ...row };
  if (body.durationMinutes !== undefined) {
    r.durationMinutes = body.durationMinutes;
    if (body.caloriesBurned === undefined && Number(row.met) > 0 && Number(row.weightKg) > 0) { r.caloriesBurned = estimateBurn(Number(row.met), Number(row.weightKg), body.durationMinutes); r.caloriesSource = 'estimated'; }
  }
  if (body.caloriesBurned !== undefined) { r.caloriesBurned = body.caloriesBurned; r.caloriesSource = 'manual'; }
  if (body.date !== undefined) r.date = body.date;
  if (body.notes !== undefined) r.notes = body.notes;
  return r as T;
}
