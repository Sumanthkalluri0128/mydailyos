// Remembers how much of each food you usually have (1.5 rotis, 2 katoris) and offers it as one tap in the portion editor.
// Kept on this device only. Pure helpers take the stored object, so they are easy to test. Shared by web and mobile (keep identical).
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PRESET_KEY = 'ff_portion_presets_v1';
export const MIN_USES = 2;                       // a one-off is not a habit yet
const HOUSEHOLD = /^(roti|rotis|chapati|chapatis|phulka|phulkas|katori|katoris|bowl|bowls|glass|glasses|cup|cups|ladle|ladles|kadchi|spoon|spoons|tbsp|tsp|piece|pieces|slice|slices|idli|idlis|dosa|dosas|plate|plates|puri|puris|paratha|parathas)$/i;
type Entry = { n: Record<string, number>; last: number | null };
export type Presets = Record<string, Entry>;

export const isHousehold = (unit: string | undefined | null) => HOUSEHOLD.test(String(unit || '').trim());
export const foodKey = (foodId?: string | null, name?: string | null) => String(foodId || String(name || '').trim().toLowerCase());
const r2 = (n: number) => Math.round(Number(n) * 100) / 100;

/** Count one more use of `q` for this food. Returns the new stored object (never mutates). */
export function bump(data: Presets | null | undefined, key: string, q: number): Presets {
  const amount = r2(q);
  if (!key || !(amount > 0)) return data || {};
  const cur: Entry = (data && data[key]) || { n: {}, last: null };
  return { ...(data || {}), [key]: { n: { ...cur.n, [amount]: (cur.n[amount] || 0) + 1 }, last: amount } };
}

/** The amount used most often (ties go to the latest). Null until it has been used MIN_USES times. */
export function usual(data: Presets | null | undefined, key: string): number | null {
  const e = data && data[key];
  if (!e) return null;
  let best: { a: number; n: number } | null = null;
  for (const [amt, n] of Object.entries(e.n || {})) {
    const a = Number(amt);
    if (n < MIN_USES) continue;
    if (!best || n > best.n || (n === best.n && a === e.last)) best = { a, n };
  }
  return best ? best.a : null;
}

/** "1½" style label for friendly counts. */
export function fracLabel(n: number): string {
  const whole = Math.floor(n + 1e-9), rest = r2(n - whole);
  const f = ({ 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' } as Record<number, string>)[rest];
  if (f === undefined) return String(r2(n));
  return whole === 0 ? (f || '0') : `${whole}${f}`;
}

const load = async (): Promise<Presets> => { try { return JSON.parse((await AsyncStorage.getItem(PRESET_KEY)) || '{}') || {}; } catch { return {}; } };
export const usualPortion = async (foodId?: string | null, name?: string | null) => usual(await load(), foodKey(foodId, name));
export async function recordPortion(foodId: string | null | undefined, name: string | null | undefined, q: number) {
  try { await AsyncStorage.setItem(PRESET_KEY, JSON.stringify(bump(await load(), foodKey(foodId, name), q))); } catch { /* the chip just will not appear */ }
}
