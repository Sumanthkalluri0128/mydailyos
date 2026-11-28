// Tour progress: kept on this phone (AsyncStorage) AND on the server (/api/tour), merged so nothing completed is ever lost.
// No third-party trackers: the only network calls are to our own API. Same API as the web store.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import content from './tourContent';
import * as T from './tourEngine';
import { get, hasSession, put } from '../config/api';
import { onApiWrite } from './events';

const KEY = 'ff_tour_v1', PENDING = 'ff_tour_pending';
export type Saved = { goal: string; coach: string; welcomeSeen: boolean; status: T.EngineState['status']; index: number; path: string[]; done: string[]; skipped: string[]; events: string[]; hintsSeen: string[]; newSeen: string[]; checklistDismissed: boolean; rewardClaimed: boolean; updatedAt: number };
const blank = (): Saved => ({ goal: '', coach: '', welcomeSeen: false, status: 'idle', index: 0, path: [], done: [], skipped: [], events: [], hintsSeen: [], newSeen: [], checklistDismissed: false, rewardClaimed: false, updatedAt: 0 });

let saved: Saved = blank();
let ready = false;
const subs = new Set<(s: Saved) => void>(), cheers = new Set<(c: { step: string; text: string }) => void>();
let pushT: any = null;

const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => {});
const push = () => { clearTimeout(pushT); pushT = setTimeout(async () => { try { if (await hasSession()) await put('/api/tour', saved); } catch { /* offline: try again next change */ } }, 1200); };
function set(patch: Partial<Saved>, sync = true) { saved = { ...saved, ...patch, updatedAt: Date.now() }; persist(); subs.forEach((f) => f(saved)); if (sync) push(); }

export const getTour = () => saved;
export const subscribe = (f: (s: Saved) => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const onCheer = (f: (c: { step: string; text: string }) => void) => { cheers.add(f); return () => { cheers.delete(f); }; };
export function useSaved(): Saved { const [s, setS] = useState(saved); useEffect(() => { setS(saved); return subscribe(setS); }, []); return s; }

/** Load from the phone once at startup. */
export async function hydrate() {
  if (ready) return; ready = true;
  try { const raw = await AsyncStorage.getItem(KEY); if (raw) saved = { ...blank(), ...JSON.parse(raw) }; } catch { /* corrupt: start fresh */ }
  subs.forEach((f) => f(saved));
}

export const engineState = (): T.EngineState => T.init({ goal: saved.goal || 'stay', saved: saved.path.length ? saved : null });
const pick = (e: T.EngineState) => ({ status: e.status, index: e.index, path: e.path, done: e.done, skipped: e.skipped, events: e.events });
export const apply = (fn: (s: T.EngineState) => T.EngineState) => set(pick(fn(engineState())));

export const queueTour = () => AsyncStorage.setItem(PENDING, '1').catch(() => {});
export const clearPending = () => AsyncStorage.removeItem(PENDING).catch(() => {});
export const tourPending = async () => (await AsyncStorage.getItem(PENDING).catch(() => null)) === '1';

export const chooseGoal = (goal: string) => set({ goal, ...pick(T.init({ goal })) });
export const chooseCoach = (coach: string) => set({ coach });
export function beginTour() { clearPending(); set({ welcomeSeen: true }); apply(T.start); }
export const closeWelcome = () => { clearPending(); set({ welcomeSeen: true }); };
export const skipTour = () => apply(T.skip);
export const dontShowAgain = () => { clearPending(); set({ welcomeSeen: true, checklistDismissed: true }); apply(T.dismiss); };
export const replayTour = () => { clearPending(); set({ welcomeSeen: true }); apply(() => T.start(T.replay(T.init({ goal: saved.goal || 'stay' })))); };
export const resumeTour = () => apply(T.resume);
export const nextStep = () => apply(T.next);
export const backStep = () => apply(T.back);
export const skipMissing = () => apply(T.skipMissing);
export const claimReward = () => set({ rewardClaimed: true });
export const dismissChecklist = () => set({ checklistDismissed: true });
export const showChecklist = () => set({ checklistDismissed: false });
export const markHints = (ids: string[]) => set({ hintsSeen: [...new Set([...saved.hintsSeen, ...ids])] });
export const resetHints = (screen: string) => { const ids = T.allHints(screen).map((h) => h.id); set({ hintsSeen: saved.hintsSeen.filter((x) => !ids.includes(x)) }); };
export const markNewSeen = (id: string) => set({ newSeen: [...new Set([...saved.newSeen, id])] });

/** A real action happened. Completes the current step when it waits for this event, and always remembers it for the checklist. */
export function emit(event: string | null) {
  if (!event) return;
  const r = T.onEvent(engineState(), event);
  set(pick(r.state));
  if (r.completed) cheers.forEach((f) => f({ step: r.completed as string, text: r.cheer }));
}
/** Connect the API bus to the tour (call once). */
export const connectEvents = () => onApiWrite((method, path) => emit(T.detectEvent(method, path)));

/** Pull what the server has, merge, push back. Call once the person is signed in. */
export async function syncFromServer() {
  try {
    const j: any = await get('/api/tour');
    if (!j?.success) return;
    const m = T.mergeSaved(saved, j.tour || {});
    saved = { ...saved, ...m, welcomeSeen: saved.welcomeSeen || !!(j.tour && ((j.tour.status && j.tour.status !== 'idle') || (j.tour.done || []).length)) };
    persist(); subs.forEach((f) => f(saved)); push();
  } catch { /* offline: the local copy is enough */ }
}
export { content };
