// Keeps the server's Smart program in memory and decides which plan the whole Workout area runs on (Smart or Classic).
// The program comes through the app's offline layer (peek/readMeta), which is already per signed-in person, so another account on the same
// phone never sees this plan, and the last answer still works with no connection. The Smart/Classic choice is a saved preference.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { today } from '../config/api';
import { peek, readMeta } from './offline';
import { setActiveDays } from '../data/workoutPlan';
import { programToPhoneDays, registerProgram, smartUsable } from './smartPlan';
import { getFlags, refreshFlags } from './flagStore';
import { flagOn } from './flags';

/** Staged rollout: Smart is on for everyone until the flag "smart-program" exists on the server; then only the people it names get it. */
export const SMART_FLAG = 'smart-program';

const SOURCE_KEY = 'ff_plan_source';
export type PlanSource = 'smart' | 'classic';
type View = { data: any; usable: boolean; source: PlanSource; offline: boolean; loading: boolean; error: string };

let data: any = null;
let source: PlanSource = 'smart';
let offline = false;
let loading = false;
let error = '';
let hydrated = false;
const listeners = new Set<() => void>();
const path = () => `/api/body-plan?date=${today()}`;

function apply() {
  const usable = smartUsable(data, today()) && flagOn(getFlags(), SMART_FLAG, true);
  if (source === 'smart' && usable) {
    const program = data.plan.training.program;
    registerProgram(program);
    setActiveDays(programToPhoneDays(program, data.plan.adapt));
  } else setActiveDays(null);
  listeners.forEach((l) => l());
}

/** Reads the saved choice and the last plan the phone has, so the right plan is active before any workout screen opens. */
export async function hydrateSmartPlan() {
  if (hydrated) return;
  hydrated = true;
  try { const s = await AsyncStorage.getItem(SOURCE_KEY); if (s === 'classic' || s === 'smart') source = s; } catch { /* keep the default */ }
  try { const cached = await peek<any>(path()); if (cached) { data = cached; offline = true; } } catch { /* nothing saved yet */ }
  apply();
  refreshFlags().then(() => apply()).catch(() => {});   // the rollout flag may arrive after the first paint
}

/** Asks the server for this week's plan (falls back to the saved copy when offline). Safe to call often. */
export async function refreshSmartPlan() {
  if (loading) return;
  loading = true; listeners.forEach((l) => l());
  try {
    const r = await readMeta<any>(path());
    if (r && r.data && r.data.success !== false) { data = r.data; offline = !!r.stale; error = ''; }
  } catch (e: any) { error = e?.message || 'Not available right now'; }
  finally { loading = false; apply(); }
}

export async function setPlanSource(next: PlanSource) {
  source = next;
  try { await AsyncStorage.setItem(SOURCE_KEY, next); } catch { /* the choice still applies for this session */ }
  apply();
}

/** The server answered a saved workout with the re-worked plan: use it straight away. */
export function setSmartPlan(plan: any) { if (plan) { data = { ...(data || {}), plan }; apply(); } }

const view = (): View => ({ data, usable: smartUsable(data, today()), source, offline, loading, error });

/** For screens: the plan state, kept fresh. Opening a screen that shows the plan refreshes it once. */
export function useSmartPlan(refresh = true): View & { reload: () => Promise<void> } {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    hydrateSmartPlan().then(() => { if (refresh) refreshSmartPlan(); });
    return () => { listeners.delete(l); };
  }, [refresh]);
  return { ...view(), reload: refreshSmartPlan };
}
