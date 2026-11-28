// Validation for gym-log data: turns anything (a saved copy, an imported backup, a half-written record) into safe, typed data.
// Pure (no storage, no React), shared by the phone app and the web app, and unit-tested.
import { BodyEntry, GymEntry, GymGoal, GymProfile, GymSet, SiteKey } from './gymMath';

export type GymState = { v: 1; entries: GymEntry[]; body: BodyEntry[]; goal: GymGoal | null; profile: GymProfile };

const num = (x: any): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);
const str = (x: any, d = '') => (typeof x === 'string' ? x : d);
const isDate = (x: any) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

export function cleanSet(s: any): GymSet | null {
  if (!s || typeof s !== 'object') return null;
  const reps = Number(s.reps), kg = Number(s.kg) || 0;
  if (!(reps > 0) || kg < 0) return null;
  const out: GymSet = { kg, reps };
  if (Number(s.rpe) >= 1 && Number(s.rpe) <= 10) out.rpe = Number(s.rpe);
  if (Number(s.pace) >= 2 && Number(s.pace) <= 30) out.pace = Math.round(Number(s.pace) * 1000) / 1000;
  if (out.pace && Number(s.incline) > 0) out.incline = Math.min(40, Math.round(Number(s.incline) * 10) / 10);
  return out;
}
export function cleanEntry(e: any): GymEntry | null {
  if (!e || typeof e.id !== 'string' || !isDate(e.date) || typeof e.exId !== 'string' || !Array.isArray(e.sets)) return null;
  const sets = e.sets.map(cleanSet).filter(Boolean) as GymSet[];
  if (!sets.length) return null;
  const unit = e.unit === 'sec' || e.unit === 'min' ? e.unit : 'reps';
  return { id: e.id, date: e.date, exId: e.exId, name: str(e.name, e.exId), cat: str(e.cat, 'Other'), unit, sets, note: str(e.note) || undefined, at: Number(e.at) || 0 };
}
export function cleanBody(b: any): BodyEntry | null {
  if (!b || typeof b.id !== 'string' || !isDate(b.date)) return null;
  const sites: Partial<Record<SiteKey, number>> = {};
  if (b.sites && typeof b.sites === 'object') for (const k of Object.keys(b.sites)) { const v = num(b.sites[k]); if (v) sites[k as SiteKey] = v; }
  const out: BodyEntry = { id: b.id, date: b.date, sites, at: Number(b.at) || 0 };
  const w = num(b.weightKg), f = num(b.bodyFat);
  if (w) out.weightKg = w;
  if (f) out.bodyFat = f;
  if (str(b.note)) out.note = str(b.note);
  if (!out.weightKg && !out.bodyFat && !Object.keys(sites).length) return null;
  return out;
}
export function sane(raw: any): GymState {
  const o = raw && typeof raw === 'object' ? raw : {};
  const g = o.goal && typeof o.goal === 'object' && isDate(o.goal.startDate) ? o.goal : null;
  const goal: GymGoal | null = g ? { startDate: g.startDate, targetDate: isDate(g.targetDate) ? g.targetDate : undefined, weightKg: num(g.weightKg), bodyFat: num(g.bodyFat), sites: Object.fromEntries(Object.entries(g.sites || {}).filter(([, v]) => num(v))) as any } : null;
  const p = o.profile && typeof o.profile === 'object' ? o.profile : {};
  return {
    v: 1,
    entries: (Array.isArray(o.entries) ? o.entries : []).map(cleanEntry).filter(Boolean) as GymEntry[],
    body: (Array.isArray(o.body) ? o.body : []).map(cleanBody).filter(Boolean) as BodyEntry[],
    goal,
    profile: { unit: p.unit === 'lb' ? 'lb' : 'kg', heightCm: num(p.heightCm), sex: p.sex === 'male' || p.sex === 'female' ? p.sex : undefined },
  };
}
