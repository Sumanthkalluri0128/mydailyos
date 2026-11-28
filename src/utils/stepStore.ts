// Today's steps, shared by every screen. One store (not one copy of the numbers per screen) is what makes a step count
// typed on the Health screen show up on Home straight away — each screen used to keep its own private copy.
// Pure (no React Native imports) so it can be unit-tested.
export type StepState = 'checking' | 'unavailable' | 'needs-permission' | 'denied' | 'active';

export type StepSource = 'sensor' | 'health-connect';

export type StepSnap = {
  day: string;
  server: number;                                  // what the server last confirmed (or what we just queued)
  device: number | null;                           // live reading from this phone's step counter
  manual: { value: number; deviceAt: number } | null; // a correction typed by the person; steps counted after it are added on top
  state: StepState;
  source: StepSource;                              // where the phone reading comes from
  sourceNames: string[];                           // e.g. ['Samsung Health'] when source is health-connect
  hcSupported: boolean;                            // Android with a usable Health Connect
};

const fresh = (day = ''): StepSnap => ({ day, server: 0, device: null, manual: null, state: 'checking', source: 'sensor', sourceNames: [], hcSupported: false });
let snap: StepSnap = fresh();
const listeners = new Set<() => void>();

export const getSteps = () => snap;
export function subscribeSteps(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function setSteps(patch: Partial<StepSnap>) { snap = { ...snap, ...patch }; listeners.forEach((l) => l()); }

/** Forget everything (sign-out, new day, different account). Keeps the permission state, which belongs to the phone. */
export function resetStepStore(day = '') { const keep = snap.state; snap = { ...fresh(day), state: keep === 'checking' ? 'checking' : keep, source: snap.source, sourceNames: snap.sourceNames, hcSupported: snap.hcSupported }; listeners.forEach((l) => l()); }

/** The number to show everywhere. A typed correction wins, then any steps the phone counted after it are added on top. */
export function displayedSteps(s: StepSnap): number {
  const dev = s.device ?? 0;
  if (s.manual) return Math.max(0, Math.round(s.manual.value + Math.max(0, dev - s.manual.deviceAt)));
  return Math.max(s.server, dev);
}
