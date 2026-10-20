// Body weight is hidden by default, on every launch and every screen. Tapping a weight reveals ALL weight values for a few
// seconds (one shared switch), then they blur again by themselves. Pure logic (no React) so it is unit-tested.
export const REVEAL_MS = 8000;

let revealed = false;
let timer = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export const isWeightRevealed = () => revealed;
export function subscribeWeight(fn) { subs.add(fn); return () => { subs.delete(fn); }; }
export function hideWeight() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (revealed) { revealed = false; emit(); }
}
export function revealWeight(ms = REVEAL_MS) {
  if (timer) clearTimeout(timer);
  const was = revealed;
  revealed = true;
  timer = setTimeout(hideWeight, ms);
  if (!was) emit();
}
export function toggleWeight(ms = REVEAL_MS) { if (revealed) hideWeight(); else revealWeight(ms); return revealed; }

// ---- text helpers -------------------------------------------------------------------------------------------------
const NUM = /\d+(?:\.\d+)?/g;
/** "80.7 kg" -> "88.8 kg": same layout, no real digits. The real value is never rendered while hidden. */
export const decoy = (text) => text.replace(/\d/g, '8');
export const hasNumber = (text) => /\d/.test(text);
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
/** The text with every number rolled `t` (0..1) of the way from `from` (default 8 % lower) to its real value. */
export function rollText(text, t, from) {
  const e = ease(t);
  return text.replace(NUM, (m) => {
    const target = parseFloat(m), dec = (m.split('.')[1] || '').length;
    const start = from !== undefined && Number.isFinite(from) ? from : target * 0.92;
    return (start + (target - start) * e).toFixed(dec);
  });
}
/** Splits text into runs so only the digits are blurred and words around them stay readable. */
export function runs(text) {
  const out = [];
  const re = /\d+(?:\.\d+)?/g; let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) out.push({ t: text.slice(last, m.index), num: false }); out.push({ t: m[0], num: true }); last = m.index + m[0].length; }
  if (last < text.length) out.push({ t: text.slice(last), num: false });
  return out;
}
/** What a screen reader / label gets: nothing numeric until revealed. */
export const a11yText = (text, shown) => (shown ? text : 'Weight hidden');
