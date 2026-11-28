// Coach tone + gentle mode (mobile twin of the web util). Copy comes from /api/coach/tone and is cached on the device so the
// characters and reminders can use it without waiting for the network.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, put } from '../config/api';
import { setToneBundle } from '../motion/talk';
import { getLang, t } from '../i18n';

const KEY = 'ff-coach-tone';
export type ToneState = { tone: 'gentle' | 'strict' | 'funny'; gentle: boolean; tones?: string[]; mood?: any; voice?: any; review?: any; notify?: any; support?: { text: string; india: string }; eatingOutPadPct?: number };
const DEFAULT: ToneState = { tone: 'funny', gentle: false, tones: ['gentle', 'strict', 'funny'] };
let state: ToneState = DEFAULT;
let loaded = false;
const subs = new Set<(s: ToneState) => void>();

function apply(s: ToneState) {
  state = s;
  setToneBundle(s.tone !== 'funny' ? s : null);
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
  subs.forEach((f) => f(s));
}
/** Reads the cached copy first (instant), then refreshes from the server. Never throws. */
export async function loadTone(): Promise<void> {
  try {
    if (!loaded) { loaded = true; const c = await AsyncStorage.getItem(KEY); if (c) apply({ ...DEFAULT, ...JSON.parse(c) }); }
    apply(await get<ToneState>('/api/coach/tone'));
  } catch { /* offline: keep the cached copy */ }
}
export async function saveToneSettings(patch: { tone?: string; gentle?: boolean }): Promise<void> { apply(await put<ToneState>('/api/coach/settings', patch)); }
export const getToneState = () => state;
export const isGentle = () => !!state.gentle;
/** Notification copy for a kind in the current tone ("meal" text has {meal}); null means use the built-in text. */
export function toneNotify(kind: 'meal' | 'tiffin' | 'water', vars: Record<string, string> = {}): { title: string; body: string } | null {
  // UI language wins for the reminders we have translated (breakfast / lunch / dinner). Other kinds stay in English.
  if (getLang() !== 'en' && kind === 'meal' && ['breakfast', 'lunch', 'dinner'].includes(vars.meal)) return { title: 'FlexFit', body: t(`notif.${vars.meal}`) };
  if (state.tone === 'funny' || !state.notify?.[kind]) return null;
  const f = (t: string) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t);
  return { title: f(state.notify[kind].title), body: f(state.notify[kind].body) };
}
export function useCoachTone(): ToneState {
  const [s, setS] = useState<ToneState>(state);
  useEffect(() => { subs.add(setS); loadTone(); return () => { subs.delete(setS); }; }, []);
  return s;
}
