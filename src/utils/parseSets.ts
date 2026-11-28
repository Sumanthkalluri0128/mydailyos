import { post } from '../config/api';

// Typed gym notes -> sets matched to known exercises ("bench press 3x10 @ 60kg, squats 4x8 @ 80").
// The server does the parsing and matching (server/lib/setText.js); this is the phone's typed client. Nothing is saved by this call:
// show the entries, let the person confirm or pick an alternative, then log through /api/training/workout/log as usual.
export type ParsedSet = { reps: number; weightKg: number; seconds: number };
export type ExerciseMatch = { id: string; name: string; source: 'activity' | 'plan'; activityName?: string; category?: string; score?: number };
export type ParsedEntry = {
  raw: string; name: string; sets: ParsedSet[]; seconds: number;
  match: ExerciseMatch | null; alternatives: ExerciseMatch[]; confidence: 0 | 'high' | 'low'; needsSets: boolean;
};

export async function parseWorkoutText(text: string): Promise<ParsedEntry[]> {
  const j = await post<{ entries: ParsedEntry[] }>('/api/training/parse-sets', { text });
  return j.entries || [];
}

/** Entries that can be logged as they are: a confident match and at least one set. Everything else needs a tap from the person. */
export const readyToLog = (e: ParsedEntry) => !!e.match && e.confidence === 'high' && !e.needsSets;

/** One short line per entry for the confirm list, e.g. "Barbell bench press · 3 × 10 @ 60 kg". */
export function entryLine(e: ParsedEntry): string {
  const name = e.match?.name || e.name;
  if (!e.sets.length) return `${name} · add sets`;
  const s = e.sets[0];
  const same = e.sets.every((x) => x.reps === s.reps && x.weightKg === s.weightKg && x.seconds === s.seconds);
  const what = s.reps ? `${s.reps}` : `${s.seconds}s`;
  const kg = s.weightKg ? ` @ ${s.weightKg} kg` : '';
  return same ? `${name} · ${e.sets.length} × ${what}${kg}` : `${name} · ${e.sets.map((x) => `${x.reps || x.seconds + 's'}${x.weightKg ? `@${x.weightKg}` : ''}`).join(', ')}`;
}
