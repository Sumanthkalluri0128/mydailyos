import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, getStoredUser } from '../config/api';
import { parseFlags, flagsFresh, flagOn } from './flags';

// Feature flags: the server decides per person, the app keeps the answer for 6 hours (saved with the owner's email so another
// person signing in on the same phone never sees someone else's flags).
const KEY = 'ff_flags';
const listeners = new Set<() => void>();
let memory: Record<string, boolean> = {};
let loaded = false;

// The signed-in person is kept in SecureStore (see config/api.ts), NOT AsyncStorage: reading it from the wrong place made every flag answer "off".
async function owner(): Promise<string> {
  try { const u: any = await getStoredUser(); return String(u?.email || '').trim().toLowerCase(); } catch { return ''; }
}
async function readSaved(): Promise<{ at: number; owner: string; flags: Record<string, boolean> } | null> {
  try { const e = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null'); return e ? { at: Number(e.at), owner: String(e.owner || ''), flags: parseFlags(e.flags) as Record<string, boolean> } : null; } catch { return null; }
}
export const getFlags = () => memory;

/** Loads flags: from the saved copy straight away, from the server when the copy is old. Never throws. */
export async function refreshFlags(force = false): Promise<Record<string, boolean>> {
  const who = await owner();
  if (!who) { memory = {}; return memory; }
  const saved = await readSaved();
  const mine = saved && saved.owner === who ? saved : null;
  if (!loaded || mine) { memory = mine ? mine.flags : {}; loaded = true; }
  if (!force && flagsFresh(mine)) return memory;
  try {
    const d: any = await get('/api/flags');
    memory = parseFlags(d?.flags) as Record<string, boolean>;
    await AsyncStorage.setItem(KEY, JSON.stringify({ at: Date.now(), owner: who, flags: memory })).catch(() => {});
    listeners.forEach((fn) => fn());
  } catch { /* offline or server asleep: keep the saved copy */ }
  return memory;
}
/** const on = useFlag('new-chart'): false until the server says otherwise. */
export function useFlag(key: string, fallback = false): boolean {
  const [, tick] = useState(0);
  useEffect(() => { const fn = () => tick((n) => n + 1); listeners.add(fn); refreshFlags().then(fn); return () => { listeners.delete(fn); }; }, []);
  return flagOn(memory, key, fallback);
}
