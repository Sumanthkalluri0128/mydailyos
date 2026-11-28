// Daily steps. ONE tracker for the whole app writes into a shared store (utils/stepStore.ts); every screen just reads it.
// So a count typed on the Health screen shows on Home instantly, and a phone reading shows everywhere at once.
//   iOS: today's total comes straight from the motion coprocessor (works with the app closed).
//   Android + Health Connect (Samsung Health etc.): today's total is read from Health Connect — the same number Samsung Health shows,
//     including steps taken while FlexFit was closed. Re-read every minute while the app is open and whenever it comes to the front.
//   Android without it: counts live while the app runs and adds to the day's saved total.
//   A typed correction wins; steps the phone counts afterwards are added on top of it.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { today } from '../config/api';
import { write, cachedGet } from '../utils/offline';
import { accumulate, shouldPost } from '../utils/stepSync';
import { displayedSteps, getSteps, resetStepStore, setSteps, subscribeSteps, StepSnap, StepState } from '../utils/stepStore';
import { hcGranted, hcRequest, hcSupport, hcTodaySources, hcTodaySteps } from '../utils/healthConnect';

export type { StepState };
const totalKey = (d: string) => `ff.steps.${d}`;            // Android running total
const manualKey = (d: string) => `ff.steps.manual.${d}`;     // typed correction
const HC_KEY = 'ff.steps.healthconnect';                     // '1' once the person connected Health Connect (Samsung Health)

let started = false;
let watcher: { remove: () => void } | null = null;
let running = { total: 0, lastSeen: 0 };
let lastPost: { value: number | null; at: number } = { value: null, at: 0 };
let hcMode = false;                       // Android: today's steps come from Health Connect instead of FlexFit's own counting
let hcTimer: ReturnType<typeof setInterval> | null = null;

/** Day rolled over (or first run): drop yesterday's numbers and load whatever this phone saved for today. */
async function ensureDay() {
  const d = today();
  if (getSteps().day === d) return;
  resetStepStore(d);
  lastPost = { value: null, at: 0 };
  const [saved, man] = await Promise.all([AsyncStorage.getItem(totalKey(d)).catch(() => null), AsyncStorage.getItem(manualKey(d)).catch(() => null)]);
  running = { total: Number(saved) || 0, lastSeen: running.lastSeen };
  let manual: StepSnap['manual'] = null;
  try { const m = man ? JSON.parse(man) : null; if (m && Number.isFinite(m.value) && Number.isFinite(m.deviceAt)) manual = m; } catch { /* ignore */ }
  setSteps({ day: d, manual, device: Platform.OS === 'android' && running.total ? running.total : null });
}

/** Pull today's number from the server. A value typed on another device (the website) becomes this phone's correction. */
async function loadServer() {
  try {
    const { data: r, stale } = await cachedGet<any>(`/api/health-logs/steps/day?date=${today()}`);
    if (stale) return; // an old saved copy must never overwrite something newer typed here
    const v = Math.max(0, Number(r.steps || 0));
    const s = getSteps();
    const patch: Partial<StepSnap> = { server: v };
    if (r.source === 'manual' && displayedSteps(s) !== v) patch.manual = { value: v, deviceAt: s.device ?? 0 };
    setSteps(patch);
    if (lastPost.value === null) lastPost.value = v;
  } catch { /* offline: keep what we have */ }
}

async function push(value: number, source: 'device' | 'manual') {
  const now = Date.now();
  if (source === 'device' && !shouldPost(lastPost.value, value, lastPost.at, now)) return;
  lastPost = { value, at: now };
  setSteps({ server: value }); // show it right away; if we are offline the write is queued and replayed later
  await write('POST', '/api/health-logs', { type: 'steps', date: today(), value, source }, 'Steps', { coalesce: `steps:${today()}` });
}

const pushDisplayed = () => push(displayedSteps(getSteps()), 'device').catch(() => { /* queued or rejected: the number on screen is still right */ });

async function readIOS() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const r = await Pedometer.getStepCountAsync(start, new Date());
  setSteps({ device: r.steps });
  pushDisplayed();
}

function attachWatcher() {
  watcher?.remove();
  watcher = Pedometer.watchStepCount((r) => {
    if (Platform.OS === 'ios') { readIOS().catch(() => {}); return; }
    running = accumulate(running.total, running.lastSeen, r.steps);
    AsyncStorage.setItem(totalKey(today()), String(running.total)).catch(() => {});
    setSteps({ device: running.total });
    pushDisplayed();
  });
}

async function readHC() {
  const v = await hcTodaySteps();
  setSteps({ device: v });
  pushDisplayed();
}

function stopHC() { if (hcTimer) { clearInterval(hcTimer); hcTimer = null; } }

/** Switch to Health Connect if it was connected AND is still allowed. Returns false (and leaves the sensor in charge) otherwise. */
async function beginHC(): Promise<boolean> {
  try {
    if (!(await hcGranted())) return false;
    hcMode = true;
    watcher?.remove(); watcher = null; // never count from two places at once
    setSteps({ state: 'active', source: 'health-connect' });
    await readHC();
    hcTodaySources().then((names) => setSteps({ sourceNames: names })).catch(() => {});
    stopHC();
    hcTimer = setInterval(() => { if (AppState.currentState === 'active') readHC().catch(() => {}); }, 60_000);
    return true;
  } catch { hcMode = false; stopHC(); setSteps({ source: 'sensor' }); return false; }
}

async function begin() {
  try {
    await ensureDay();
    if (Platform.OS === 'android') {
      hcSupport().then((r) => setSteps({ hcSupported: r === 'ready' })).catch(() => {});
      if ((await AsyncStorage.getItem(HC_KEY).catch(() => null)) === '1' && (await beginHC())) return;
    }
    if (!(await Pedometer.isAvailableAsync())) return setSteps({ state: 'unavailable' });
    const p = await Pedometer.getPermissionsAsync();
    if (p.status !== 'granted') return setSteps({ state: p.canAskAgain === false ? 'denied' : 'needs-permission' });
    setSteps({ state: 'active' });
    if (Platform.OS === 'ios') await readIOS();
    attachWatcher();
  } catch { setSteps({ state: 'unavailable' }); }
}

/** Reload from the server and re-read the phone. Call when a screen comes into view. */
export async function refreshSteps() {
  await ensureDay();
  await loadServer();
  if (Platform.OS === 'ios' && getSteps().state === 'active') await readIOS().catch(() => {});
  if (hcMode) await readHC().catch(() => {});
}

/** Starts the one app-wide tracker (safe to call from many places). */
export function startStepTracking() {
  if (started) return;
  started = true;
  AppState.addEventListener('change', (s) => { if (s === 'active') refreshSteps().catch(() => {}); });
  begin().then(loadServer);
}

/** The person typed their step count. Shown everywhere immediately; saved (or queued offline) behind the scenes. */
export async function setManualSteps(n: number) {
  const value = Math.max(0, Math.min(200000, Math.round(n)));
  await ensureDay();
  const prev = getSteps(); const prevRunning = running.total;
  if (Platform.OS === 'android' && !hcMode) {
    running = { total: value, lastSeen: running.lastSeen };
    AsyncStorage.setItem(totalKey(today()), String(value)).catch(() => {});
    setSteps({ device: value, manual: null });
  } else {
    const manual = { value, deviceAt: prev.device ?? 0 };
    AsyncStorage.setItem(manualKey(today()), JSON.stringify(manual)).catch(() => {});
    setSteps({ manual });
  }
  try { await push(value, 'manual'); }
  catch (e) { // the server refused it (e.g. out of range): put everything back
    running = { total: prevRunning, lastSeen: running.lastSeen };
    setSteps({ server: prev.server, device: prev.device, manual: prev.manual });
    throw e;
  }
}

export async function enableStepCounting() {
  try {
    const p = await Pedometer.requestPermissionsAsync();
    if (p.status === 'granted') await begin(); else setSteps({ state: 'denied' });
  } catch { setSteps({ state: 'unavailable' }); }
}

/** Android: allow FlexFit to read steps from Health Connect (where Samsung Health puts them). Resolves true when connected. */
export async function connectHealth(): Promise<boolean> {
  if (!(await hcRequest())) return false;
  await AsyncStorage.setItem(HC_KEY, '1').catch(() => {});
  return beginHC();
}

/** Back to FlexFit's own step counting. */
export async function disconnectHealth() {
  stopHC(); hcMode = false;
  await AsyncStorage.removeItem(HC_KEY).catch(() => {});
  setSteps({ source: 'sensor', sourceNames: [], device: running.total || null });
  await begin();
}

export function useSteps() {
  const snap = useSyncExternalStore(subscribeSteps, getSteps, getSteps);
  useEffect(() => { startStepTracking(); }, []);
  const refresh = useCallback(() => refreshSteps(), []);
  return {
    steps: displayedSteps(snap), state: snap.state as StepState, enable: enableStepCounting, setManual: setManualSteps, refresh,
    source: snap.source, sourceNames: snap.sourceNames, hcSupported: snap.hcSupported, connectHealth, disconnectHealth,
  };
}
