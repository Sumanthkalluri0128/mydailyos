// One fetch of /api/goals/simple shared by every piece of the simplified Progress UI (Home, Goals, Weekly). Offline-aware via read().
import { useCallback, useEffect, useState } from 'react';
import { read, useRefreshOnSync } from './offline';
import { today } from '../config/api';

let cache: any = null, at = 0, inflight: Promise<any> | null = null;
const subs = new Set<(d: any) => void>();

export function refreshSimple(force = false): Promise<any> {
  if (!force && cache && Date.now() - at < 60000) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = read<any>(`/api/goals/simple?today=${today()}`)
    .then((d) => { if (d?.success) { cache = d; at = Date.now(); subs.forEach((f) => f(cache)); } return cache; })
    .catch(() => cache)
    .finally(() => { inflight = null; });
  return inflight;
}

export function useSimple(): [any, () => Promise<any>] {
  const [d, setD] = useState<any>(cache);
  useEffect(() => { subs.add(setD); refreshSimple(true); return () => { subs.delete(setD); }; }, []);
  useRefreshOnSync(() => { refreshSimple(true); });
  const reload = useCallback(() => refreshSimple(true), []);
  return [d, reload];
}

export { OLD_TO_NEW, oldBadgeUnlocked } from './simpleBadges';
