// The Gym log as sync records and back (see utils/recordSync.ts). Pure: no storage, no network. Shared by the phone and the web app.
// What travels: each logged exercise, each body measurement, the body goal and the profile (unit, height, sex) when the person set one.
// A body measurement is one per day: if two devices each made one for the same day, the newest stays.
import { GymState, cleanBody, cleanEntry, sane } from './gymClean';
import { dropDuplicateDays, keyOf } from './recordSync';

export const GYM_SPACE = 'gym';
export type Rec = { kind: string; rid: string; data: any; updatedAt?: number };
export type Gone = { kind: string; rid: string };

/** What this device holds, as records. A goal that is not set, or a profile still at its defaults, is simply not a record. */
export function gymToRecords(s: GymState): Record<string, Rec> {
  const out: Record<string, Rec> = {};
  for (const e of s.entries) out[keyOf('entry', e.id)] = { kind: 'entry', rid: e.id, data: e, updatedAt: e.at };
  for (const b of s.body) out[keyOf('body', b.id)] = { kind: 'body', rid: b.id, data: b, updatedAt: b.at };
  if (s.goal) out[keyOf('goal', 'goal')] = { kind: 'goal', rid: 'goal', data: s.goal };
  const p = s.profile;
  if (p && (p.unit !== 'kg' || p.heightCm || p.sex)) out[keyOf('profile', 'profile')] = { kind: 'profile', rid: 'profile', data: p };
  return out;
}

/** Apply what other devices changed. Everything is cleaned like a restored backup, so a bad record can never break the log. */
export function applyRecords(s: GymState, upserts: Rec[], removals: Gone[]): GymState {
  const entries = new Map(s.entries.map((e) => [e.id, e]));
  const body = new Map(s.body.map((b) => [b.id, b]));
  let goal: any = s.goal, profile: any = s.profile;
  for (const r of removals) {
    if (r.kind === 'entry') entries.delete(r.rid);
    else if (r.kind === 'body') body.delete(r.rid);
    else if (r.kind === 'goal') goal = null;
    else if (r.kind === 'profile') profile = { unit: 'kg' };
  }
  for (const u of upserts) {
    if (u.kind === 'entry') { const c = cleanEntry({ ...u.data, id: u.rid }); if (c) entries.set(c.id, c); }
    else if (u.kind === 'body') { const c = cleanBody({ ...u.data, id: u.rid }); if (c) body.set(c.id, c); }
    else if (u.kind === 'goal') goal = u.data;
    else if (u.kind === 'profile') profile = u.data;
  }
  const list = [...body.values()];
  const drop = new Set(dropDuplicateDays(list));
  return sane({ ...s, entries: [...entries.values()], body: list.filter((b) => !drop.has(b.id)), goal, profile });
}
