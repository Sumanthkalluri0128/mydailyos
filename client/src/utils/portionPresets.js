// Remembers how much of each food you usually have (1.5 rotis, 2 katoris) and offers it as one tap in the portion editor.
// Kept on this device only. Pure helpers take the stored object, so they are easy to test. Shared by web and mobile (keep identical).
export const PRESET_KEY = "ff_portion_presets_v1";
export const MIN_USES = 2;                       // a one-off is not a habit yet
const HOUSEHOLD = /^(roti|rotis|chapati|chapatis|phulka|phulkas|katori|katoris|bowl|bowls|glass|glasses|cup|cups|ladle|ladles|kadchi|spoon|spoons|tbsp|tsp|piece|pieces|slice|slices|idli|idlis|dosa|dosas|plate|plates|puri|puris|paratha|parathas)$/i;

export const isHousehold = (unit) => HOUSEHOLD.test(String(unit || "").trim());
export const foodKey = (foodId, name) => String(foodId || String(name || "").trim().toLowerCase());
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/** Count one more use of `q` for this food. Returns the new stored object (never mutates). */
export function bump(data, key, q) {
  const amount = r2(q);
  if (!key || !(amount > 0)) return data || {};
  const cur = (data && data[key]) || { n: {}, last: null };
  return { ...(data || {}), [key]: { n: { ...cur.n, [amount]: (cur.n[amount] || 0) + 1 }, last: amount } };
}

/** The amount used most often (ties go to the latest). Null until it has been used MIN_USES times. */
export function usual(data, key) {
  const e = data && data[key];
  if (!e) return null;
  let best = null;
  for (const [amt, n] of Object.entries(e.n || {})) {
    const a = Number(amt);
    if (n < MIN_USES) continue;
    if (!best || n > best.n || (n === best.n && a === e.last)) best = { a, n };
  }
  return best ? best.a : null;
}

/** "1½" style label for friendly counts. */
export function fracLabel(n) {
  const whole = Math.floor(n + 1e-9), rest = r2(n - whole);
  const f = { 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" }[rest];
  if (f === undefined) return String(r2(n));
  return whole === 0 ? (f || "0") : `${whole}${f}`;
}

const read = () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "{}") || {}; } catch { return {}; } };
export const usualPortion = (foodId, name) => usual(read(), foodKey(foodId, name));
export function recordPortion(foodId, name, q) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(bump(read(), foodKey(foodId, name), q))); } catch { /* storage full or blocked: the chip just will not appear */ }
}
