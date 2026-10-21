// Pure helpers for the Planning sensei chat (no React, no network): the lines the character says, how a draft answer turns into the value
// the server expects, and the small rules for chips (exclusive "none", valid forms, progress dots). The lines themselves come from the server
// (/api/food-prefs/flow -> lines) so the web app and the phone app say the same things.
export const TONES = ["cheer", "calm", "strict"];

export function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (arr, seed) => (arr && arr.length ? arr[hash(seed) % arr.length] : "");
const toneOf = (t) => (TONES.includes(t) ? t : "cheer");

/** What the character says to open the session. */
export function introLine({ lines, who, tone, mode, name = "" }) {
  const t = toneOf(tone);
  const base = pick(mode === "update" ? lines?.update?.[t] : lines?.intro?.[t], `${who}|intro`);
  const open = lines?.coach?.[who]?.open;
  return `${open ? `${open} ` : ""}${base}`.trim();
}

/** The question in the character's tone: a short lead-in, then the question. The coach's own opening only on the first question. */
export function askLine({ lines, who, tone, question, index = 0 }) {
  const t = toneOf(tone);
  const lead = index === 0 && lines?.coach?.[who]?.open && question ? lines.coach[who].open : pick(lines?.ask?.[t], `${who}|${question?.id}|${index}`);
  return `${lead} ${question?.ask || ""}`.trim();
}

const isNone = (v) => v === undefined || v === null || (Array.isArray(v) && (!v.length || (v.length === 1 && v[0] === "none")));

/** A short in-character reaction to an answer. `labels` = the readable choices (used where the line says {v}). */
export function reactLine({ lines, who, tone, qid, value, labels = [], skipped = false, usual = false, done = false }) {
  const t = toneOf(tone);
  const seed = `${who}|${qid}|${JSON.stringify(value ?? "")}`;
  let line;
  if (done) line = pick(lines?.done?.[t], seed);
  else if (skipped) line = pick(lines?.skip?.[t], seed);
  else if (usual) line = pick(lines?.usual?.[t], seed);
  else {
    const spec = lines?.specific?.[qid];
    const key = Array.isArray(value) ? (isNone(value) && spec?.none ? "none" : "any") : (typeof value === "string" && spec?.[value] ? value : "any");
    const arr = spec?.[key]?.[t];
    line = arr && arr.length ? pick(arr, seed) : pick(lines?.react?.[t], seed);
  }
  line = line.replace("{v}", labels.length ? labels.join(", ") : "those");
  const close = lines?.coach?.[who]?.close;
  return done && close ? `${line} ${close}` : line;
}

const labelFor = (opts, id) => (opts || []).find((o) => o.id === id)?.label || id;

/** Readable text for the person's own answer bubble. */
export function answerText(q, value) {
  if (value === undefined || value === null) return "";
  if (q.type === "single") return labelFor(q.options, value);
  if (q.type === "multi") {
    if (isNone(value)) return q.allowNone ? "Nothing to avoid" : "None";
    const all = q.groups ? q.groups.flatMap((g) => g.options) : q.options;
    return value.map((v) => labelFor(all, v)).join(", ");
  }
  if (q.type === "text") return value.length ? value.join(", ") : "Nothing to add";
  if (q.type === "dates") return value.to && value.to !== value.from ? `${value.from} to ${value.to}` : value.days ? `${value.from} for ${value.days} days` : value.from || "";
  if (q.type === "form") {
    return (q.fields || []).map((f) => {
      const v = value[f.id]; if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return null;
      const txt = Array.isArray(v) ? v.map((x) => labelFor(f.options, x)).join(", ") : labelFor(f.options, v);
      return `${f.label || f.id}: ${txt}`;
    }).filter(Boolean).join(" · ");
  }
  return String(value);
}

/** Chips to show as the labels for {v} in a reaction. */
export function chosenLabels(q, value) {
  if (isNone(value) || typeof value !== "object" || !Array.isArray(value)) return typeof value === "string" ? [labelFor(q.options, value)] : [];
  const all = q.groups ? q.groups.flatMap((g) => g.options) : q.options;
  return value.filter((v) => v !== "none").map((v) => labelFor(all, v));
}

/** The starting draft for a question: the usual answer when there is one. */
export function emptyDraft(q) {
  const u = q.usual;
  if (q.type === "form") return { ...(Object.fromEntries((q.fields || []).map((f) => [f.id, f.type === "multi" ? [] : ""]))), ...(u && typeof u === "object" ? u : {}) };
  if (q.type === "multi" || q.type === "text") return Array.isArray(u) ? [...u] : [];
  if (q.type === "dates") return { from: u?.from || "", to: u?.to || "", days: u?.days || "30" };
  return typeof u === "string" ? u : "";
}

/** Tap a chip in a multi-select. "none" (and the exclusive option) clears the others; any other chip clears "none". */
export function toggleMulti(list, id, exclusive = "none") {
  const cur = Array.isArray(list) ? list : [];
  if (id === exclusive) return cur.includes(id) ? [] : [id];
  const without = cur.filter((x) => x !== exclusive);
  return without.includes(id) ? without.filter((x) => x !== id) : [...without, id];
}

/** Adds a typed word (dislikes, loves, ingredients at home) to a text list: trimmed, no duplicates, limited. */
export function addWord(list, word, max = 30) {
  const w = String(word || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (w.length < 2) return list;
  if (list.some((x) => x.toLowerCase() === w.toLowerCase()) || list.length >= max) return list;
  return [...list, w];
}

/** Can this draft be sent? */
export function draftValid(q, draft) {
  switch (q.type) {
    case "single": return !!draft;
    case "multi": return true;                 // an empty choice means "nothing": allowed
    case "text": return true;
    case "dates": return /^\d{4}-\d{2}-\d{2}$/.test(draft?.from || "") && (!draft.to || draft.to >= draft.from);
    case "form": return (q.fields || []).every((f) => f.type === "multi" || !f.options || draft?.[f.id]);
    default: return true;
  }
}

/** The value sent to the server for a draft. */
export function draftValue(q, draft) {
  if (q.type === "multi" && q.allowNone && isNone(draft)) return ["none"];
  return draft;
}

/** Progress dots for a session: done / current / todo. */
export function dotsFor(index, total) { return Array.from({ length: total }, (_, i) => (i < index ? "done" : i === index ? "now" : "todo")); }

/** The line under the plan setup card: what is known and not asked. */
export function knownLine(known = []) { return known.length ? `I already know your ${known.map((k) => `${k.label.toLowerCase()} (${k.value})`).join(", ")}, so I will not ask again.` : ""; }
