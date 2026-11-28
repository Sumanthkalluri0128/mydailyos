// Simple vs advanced mode on mobile (twin of web utils/features.js). The server decides what is unlocked (/api/coach/features);
// the cache makes Profile render at once. With nothing known yet everything stays visible, so a network problem never hides a feature.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, post, put } from '../config/api';
import { t } from '../i18n';

const KEY = 'ff-features';
const INTRO = 'ff-features-intro';
export type FeatureState = { showAll: boolean; visible: string[] | null; locked: { id: string; hint: string }[]; newlyUnlocked?: string[] };
let state: FeatureState = { showAll: true, visible: null, locked: [] };
let loaded = false;
const subs = new Set<(s: FeatureState) => void>();
function apply(s: FeatureState) { state = s; AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {}); subs.forEach((f) => f(s)); }

export const isVisible = (id: string) => !state.visible || state.visible.includes(id);
const NAME: Record<string, string> = { recipes: 'nav.recipes', health: 'nav.health', goals: 'nav.goals', habit: 'nav.habit', achievements: 'nav.goals', weekly: 'nav.progress', northstar: 'nav.goals' };

/** Returns lines the caller can show in a toast (the sensei line on first run, or "New: … is now unlocked"). */
export async function loadFeatures(): Promise<string | null> {
  let say: string | null = null;
  try {
    if (!loaded) { loaded = true; const c = await AsyncStorage.getItem(KEY); if (c) apply(JSON.parse(c)); }
    const j = await get<FeatureState>('/api/coach/features');
    const fresh = j.newlyUnlocked || [];
    apply(j);
    if (fresh.length) {
      const first = !(await AsyncStorage.getItem(INTRO));
      AsyncStorage.setItem(INTRO, '1').catch(() => {});
      if (!first) { const names = [...new Set(fresh.filter((id) => NAME[id]).map((id) => t(NAME[id])))]; if (names.length) say = t('mode.unlocked', { name: names.join(', ') }); }
      else if (!j.showAll) say = t('mode.sensei');
      post('/api/coach/features/seen', { ids: fresh }).catch(() => {});
    }
  } catch { /* offline: keep the cached copy */ }
  return say;
}
export async function setShowAll(on: boolean): Promise<void> { apply(await put<FeatureState>('/api/coach/features', { showAll: !!on })); }
export function useFeatures(): FeatureState {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => { subs.delete(setS); }; }, []);
  return s;
}
