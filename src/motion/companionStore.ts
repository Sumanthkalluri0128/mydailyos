// What the companions remember on this device: bond with each character, today's mood check-in, challenges done,
// and how often you ignore their nudges (so they talk less when you're busy). AsyncStorage only, nothing is sent anywhere.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bondLevelOf, type Mood } from './brain';

const BOND_KEY = 'ff_bond', DAY_KEY = 'ff_companion_day', NUDGE_KEY = 'ff_companion_nudge';
let bond: Record<string, number> = {};
const bondReady = AsyncStorage.getItem(BOND_KEY).then((v) => { if (v) bond = { ...JSON.parse(v), ...bond }; }).catch(() => {});
export const bondXp = (who: string) => bond[who] || 0;
export const bondLevel = bondLevelOf;
export function addBond(who: string, n: number) {
  const before = bondLevelOf(bond[who]); bond[who] = (bond[who] || 0) + n;
  AsyncStorage.setItem(BOND_KEY, JSON.stringify(bond)).catch(() => {});
  const after = bondLevelOf(bond[who]); return { level: after, up: after > before, xp: bond[who] };
}
export const whenBondReady = () => bondReady;

const dayStr = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
type Day = { date: string; mood: Mood | null; dares: number; dareIds: string[] };
let day: Day | null = null;
async function loadDay(): Promise<Day> {
  if (day && day.date === dayStr()) return day;
  try { const v = JSON.parse((await AsyncStorage.getItem(DAY_KEY)) || 'null'); day = v && v.date === dayStr() ? v : null; } catch { day = null; }
  if (!day) day = { date: dayStr(), mood: null, dares: 0, dareIds: [] };
  return day;
}
const saveDay = () => { if (day) AsyncStorage.setItem(DAY_KEY, JSON.stringify(day)).catch(() => {}); };
export async function getToday(): Promise<Day> { return loadDay(); }
export async function setMood(m: Mood | null) { const d = await loadDay(); d.mood = m; saveDay(); }
export async function markDare(id: string) { const d = await loadDay(); d.dares += 1; d.dareIds = [...d.dareIds, id].slice(-20); saveDay(); return d.dares; }

// nudge backoff: 0 = engaged recently, goes up each time a nudge is ignored (see nudgeFor in brain.ts)
let nudge = { lastNudgeAt: 0, dismissStreak: 0, lastKey: '' as string };
AsyncStorage.getItem(NUDGE_KEY).then((v) => { if (v) nudge = { ...nudge, ...JSON.parse(v) }; }).catch(() => {});
const saveNudge = () => AsyncStorage.setItem(NUDGE_KEY, JSON.stringify(nudge)).catch(() => {});
export const getNudgeState = () => ({ ...nudge });
export const noteNudgeShown = (key: string) => { nudge.lastNudgeAt = Date.now(); nudge.lastKey = key; saveNudge(); };
export const noteNudgeIgnored = () => { nudge.dismissStreak = Math.min(6, nudge.dismissStreak + 1); saveNudge(); };
export const noteEngaged = () => { if (nudge.dismissStreak) { nudge.dismissStreak = 0; saveNudge(); } };
