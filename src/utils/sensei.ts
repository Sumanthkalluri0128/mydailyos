// Pure helpers for the Planning sensei chat (no React, no network): the lines the character says, how a draft answer turns into the value the
// server expects, and the small rules for chips. Same rules as the web app; the lines come from the server (/api/food-prefs/flow -> lines).
export type Tone = 'cheer' | 'calm' | 'strict';
export const TONES: Tone[] = ['cheer', 'calm', 'strict'];
export type Option = { id: string; label: string; emoji?: string };
export type Field = { id: string; label?: string; type?: 'single' | 'multi'; options?: Option[] };
export type Question = {
  id: string; type: 'single' | 'multi' | 'form' | 'text' | 'dates'; ask: string; hint?: string; options?: Option[]; groups?: { id: string; label: string; options: Option[] }[];
  fields?: Field[]; suggestions?: string[]; max?: number; allowNone?: boolean; exclusive?: string; usual?: any; needsConsent?: boolean;
};
export type Lines = Record<string, any>;

export function hash(s: string): number { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (arr: string[] | undefined, seed: string) => (arr && arr.length ? arr[hash(seed) % arr.length] : '');
const toneOf = (t?: string): Tone => (TONES.includes(t as Tone) ? (t as Tone) : 'cheer');

export function introLine({ lines, who, tone, mode }: { lines?: Lines; who: string; tone?: string; mode?: string }): string {
  const t = toneOf(tone);
  const base = pick(mode === 'update' ? lines?.update?.[t] : lines?.intro?.[t], `${who}|intro`);
  const open = lines?.coach?.[who]?.open;
  return `${open ? `${open} ` : ''}${base}`.trim();
}

export function askLine({ lines, who, tone, question, index = 0 }: { lines?: Lines; who: string; tone?: string; question?: { id?: string; ask?: string }; index?: number }): string {
  const t = toneOf(tone);
  const lead = index === 0 && lines?.coach?.[who]?.open && question ? lines.coach[who].open : pick(lines?.ask?.[t], `${who}|${question?.id}|${index}`);
  return `${lead} ${question?.ask || ''}`.trim();
}

const isNone = (v: any) => v === undefined || v === null || (Array.isArray(v) && (!v.length || (v.length === 1 && v[0] === 'none')));

export function reactLine({ lines, who, tone, qid, value, labels = [], skipped = false, usual = false, done = false }: { lines?: Lines; who: string; tone?: string; qid?: string; value?: any; labels?: string[]; skipped?: boolean; usual?: boolean; done?: boolean }): string {
  const t = toneOf(tone);
  const seed = `${who}|${qid}|${JSON.stringify(value ?? '')}`;
  let line: string;
  if (done) line = pick(lines?.done?.[t], seed);
  else if (skipped) line = pick(lines?.skip?.[t], seed);
  else if (usual) line = pick(lines?.usual?.[t], seed);
  else {
    const spec = qid ? lines?.specific?.[qid] : undefined;
    const key = Array.isArray(value) ? (isNone(value) && spec?.none ? 'none' : 'any') : (typeof value === 'string' && spec?.[value] ? value : 'any');
    const arr = spec?.[key]?.[t];
    line = arr && arr.length ? pick(arr, seed) : pick(lines?.react?.[t], seed);
  }
  line = line.replace('{v}', labels.length ? labels.join(', ') : 'those');
  const close = lines?.coach?.[who]?.close;
  return done && close ? `${line} ${close}` : line;
}

const labelFor = (opts: Option[] | undefined, id: string) => (opts || []).find((o) => o.id === id)?.label || id;

export function answerText(q: Question, value: any): string {
  if (value === undefined || value === null) return '';
  if (q.type === 'single') return labelFor(q.options, value);
  if (q.type === 'multi') {
    if (isNone(value)) return q.allowNone ? 'Nothing to avoid' : 'None';
    const all = q.groups ? q.groups.flatMap((g) => g.options) : q.options;
    return (value as string[]).map((v) => labelFor(all, v)).join(', ');
  }
  if (q.type === 'text') return value.length ? value.join(', ') : 'Nothing to add';
  if (q.type === 'dates') return value.to && value.to !== value.from ? `${value.from} to ${value.to}` : value.days ? `${value.from} for ${value.days} days` : value.from || '';
  if (q.type === 'form') {
    return (q.fields || []).map((f) => {
      const v = value[f.id]; if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return null;
      const txt = Array.isArray(v) ? v.map((x: string) => labelFor(f.options, x)).join(', ') : labelFor(f.options, v);
      return `${f.label || f.id}: ${txt}`;
    }).filter(Boolean).join(' · ');
  }
  return String(value);
}

export function chosenLabels(q: Question, value: any): string[] {
  if (isNone(value) || !Array.isArray(value)) return typeof value === 'string' ? [labelFor(q.options, value)] : [];
  const all = q.groups ? q.groups.flatMap((g) => g.options) : q.options;
  return value.filter((v: string) => v !== 'none').map((v: string) => labelFor(all, v));
}

export function emptyDraft(q: Question): any {
  const u = q.usual;
  if (q.type === 'form') return { ...Object.fromEntries((q.fields || []).map((f) => [f.id, f.type === 'multi' ? [] : ''])), ...(u && typeof u === 'object' ? u : {}) };
  if (q.type === 'multi' || q.type === 'text') return Array.isArray(u) ? [...u] : [];
  if (q.type === 'dates') return { from: u?.from || '', to: u?.to || '', days: u?.days || '30' };
  return typeof u === 'string' ? u : '';
}

export function toggleMulti(list: string[] | undefined, id: string, exclusive = 'none'): string[] {
  const cur = Array.isArray(list) ? list : [];
  if (id === exclusive) return cur.includes(id) ? [] : [id];
  const without = cur.filter((x) => x !== exclusive);
  return without.includes(id) ? without.filter((x) => x !== id) : [...without, id];
}

export function addWord(list: string[], word: string, max = 30): string[] {
  const w = String(word || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (w.length < 2) return list;
  if (list.some((x) => x.toLowerCase() === w.toLowerCase()) || list.length >= max) return list;
  return [...list, w];
}

export function draftValid(q: Question, draft: any): boolean {
  switch (q.type) {
    case 'single': return !!draft;
    case 'multi': return true;
    case 'text': return true;
    case 'dates': return /^\d{4}-\d{2}-\d{2}$/.test(draft?.from || '') && (!draft.to || draft.to >= draft.from);
    case 'form': return (q.fields || []).every((f) => f.type === 'multi' || !f.options || !!draft?.[f.id]);
    default: return true;
  }
}

export function draftValue(q: Question, draft: any): any {
  if (q.type === 'multi' && q.allowNone && isNone(draft)) return ['none'];
  return draft;
}

export const dotsFor = (index: number, total: number): ('done' | 'now' | 'todo')[] => Array.from({ length: total }, (_, i) => (i < index ? 'done' : i === index ? 'now' : 'todo'));

export const knownLine = (known: { label: string; value: string }[] = []): string => (known.length ? `I already know your ${known.map((k) => `${k.label.toLowerCase()} (${k.value})`).join(', ')}, so I will not ask again.` : '');
