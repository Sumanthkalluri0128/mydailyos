// Everything the home-screen widget needs to know, in one place. The widget runs in a headless JS task (no screens, no React
// state), so this file talks to the server directly with the saved token, uses the SAME energy maths as the Home screen
// (dayBalance / waterTargetMl), and keeps the last good snapshot on the phone so the widget still shows something offline.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { API_URL, TOKEN_KEY, newClientId, today } from '../config/api';
import { dayBalance, resolveTargets } from '../utils/energy';
import { ADD_WATER_ML, buildSnapshot, snapshotIsStale, type WidgetSnapshot } from '../utils/widgetSnapshot';
import { getWeeklyTheme } from './widgetTheme';

export const WIDGET_NAME = 'FlexFitWidget';
const CACHE_KEY = 'ff.widgetSnapshot';
const TONE_KEY = 'ff-coach-tone'; // written by utils/coachTone.ts
// A widget update has to finish quickly or Android kills the task, so keep the network wait short.
const FETCH_TIMEOUT_MS = 9000;
// If the app itself pushed a snapshot a moment ago it is as fresh as anything we could fetch.
const FRESH_MS = 60_000;

export type WidgetState =
  | { kind: 'ok'; snap: WidgetSnapshot; note?: string }
  | { kind: 'signedOut' }
  | { kind: 'offline' };

export async function saveWidgetSnapshot(snap: WidgetSnapshot): Promise<void> {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch { /* the widget just refetches */ }
}
export async function loadWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WidgetSnapshot;
    return s && typeof s.at === 'number' && typeof s.caloriesValue === 'string' && typeof s.dateLabel === 'string' && !!s.missions ? s : null; // ignore snapshots from an older app version
  } catch { return null; }
}
export async function clearWidgetSnapshot(): Promise<void> { try { await AsyncStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } }

async function getToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}

async function call(path: string, token: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    let data: any = {};
    try { data = JSON.parse(await res.text()); } catch { /* empty / non-JSON body */ }
    return { status: res.status, data };
  } finally { clearTimeout(timer); }
}

async function isGentle(): Promise<boolean> {
  try { const raw = await AsyncStorage.getItem(TONE_KEY); return !!(raw && JSON.parse(raw).gentle); } catch { return false; }
}

/** Today's numbers from the server -> a widget snapshot. Throws on network failure; returns null when the session is gone. */
async function fetchSnapshot(token: string): Promise<WidgetSnapshot | null> {
  // steps and the streak come from two small extra requests; if either fails the widget just shows a dash for it
  const [res, stepsRes, streakRes] = await Promise.all([
    call(`/api/progress/day?date=${today()}&include=profile`, token),
    call(`/api/health-logs/steps/day?date=${today()}`, token).catch(() => null),
    call(`/api/progress/streaks?today=${today()}`, token).catch(() => null),
  ]);
  if (res.status === 401) return null;
  if (res.status < 200 || res.status >= 300 || !res.data?.summary) throw new Error(`widget: day request failed (${res.status})`);
  const f = res.data.summary || {}, prof = res.data.profile || {}, goals = prof.goals || {};
  const stepKcal = Number(f.stepCalories) || 0;
  const workout = f.workoutCalories ?? Math.max(0, (Number(f.caloriesBurned) || 0) - stepKcal);
  const bal = dayBalance(prof, { eaten: Number(f.calories) || 0, workout: Number(workout) || 0, steps: stepKcal, extra: Number(res.data.eventExtra) || 0 });
  const T = resolveTargets(prof as any)!;
  const waterTarget = T.waterMl;
  const proteinTarget = T.macros.protein;
  const stepsOk = !!stepsRes && stepsRes.status >= 200 && stepsRes.status < 300 && stepsRes.data && stepsRes.data.steps !== undefined;
  const streakOk = !!streakRes && streakRes.status >= 200 && streakRes.status < 300 && streakRes.data?.streaks;
  return buildSnapshot({
    who: await getWeeklyTheme(),
    calorieTarget: bal.budget > 0 ? bal.budget : null, eaten: bal.eaten, burned: 0,
    waterMl: Number(f.waterMl) || 0, waterTargetMl: waterTarget,
    gentle: await isGentle(), hideNumbers: !!prof.safety?.hideNumbers,
    kj: prof.units?.energy === 'kJ', oz: prof.units?.volume === 'oz',
    protein: Number(f.protein) || 0, proteinTarget,
    steps: stepsOk ? Math.max(0, Number(stepsRes!.data.steps) || 0) : null, stepsTarget: Number(goals.stepsTarget) || 10000,
    streak: streakOk ? Number(streakRes!.data.streaks.current) || 0 : null,
  });
}

/**
 * The state the widget should draw right now.
 *  - signed out  -> asks the person to open the app
 *  - normal      -> fresh numbers from the server (or the app's own just-pushed snapshot)
 *  - no network  -> today's last snapshot; if there is none from today, "can't reach FlexFit"
 * `cacheOnly` skips the network (used for resizes, where speed matters more than freshness).
 */
export async function loadWidgetState(opts: { force?: boolean; cacheOnly?: boolean } = {}): Promise<WidgetState> {
  const token = await getToken();
  if (!token) { await clearWidgetSnapshot(); return { kind: 'signedOut' }; }
  const cached = await loadWidgetSnapshot();
  const cachedToday = cached && !snapshotIsStale(cached) ? cached : null;
  if (opts.cacheOnly) return cachedToday ? { kind: 'ok', snap: cachedToday } : { kind: 'offline' };
  if (!opts.force && cachedToday && Date.now() - cachedToday.at < FRESH_MS) return { kind: 'ok', snap: cachedToday };
  try {
    const snap = await fetchSnapshot(token);
    if (!snap) { await clearWidgetSnapshot(); return { kind: 'signedOut' }; }
    await saveWidgetSnapshot(snap);
    return { kind: 'ok', snap };
  } catch {
    return cachedToday ? { kind: 'ok', snap: cachedToday, note: 'Offline · last update' } : { kind: 'offline' };
  }
}

/** The widget's "+250 ml" button. Returns true when the server saved it. */
export async function addWaterFromWidget(ml = ADD_WATER_ML): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  try {
    const res = await call('/api/water', token, { method: 'POST', body: JSON.stringify({ date: today(), amountMl: ml, clientId: newClientId('w') }) });
    return res.status >= 200 && res.status < 300;
  } catch { return false; }
}
