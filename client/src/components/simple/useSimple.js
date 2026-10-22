// One fetch of /api/goals/simple shared by every piece of the simplified Progress UI (Home, Goals, Progress).
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { getLocalDate } from "../../utils/date";

let cache = null, at = 0, inflight = null;
const subs = new Set();

export function refreshSimple(force = false) {
  if (!force && cache && Date.now() - at < 60000) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = apiFetch(`/api/goals/simple?today=${getLocalDate()}`)
    .then((r) => r.json())
    .then((d) => { if (d?.success) { cache = d; at = Date.now(); subs.forEach((f) => f(cache)); } return cache; })
    .catch(() => cache)
    .finally(() => { inflight = null; });
  return inflight;
}

export function useSimple(syncTick) {
  const [d, setD] = useState(cache);
  useEffect(() => { subs.add(setD); refreshSimple(syncTick !== undefined); return () => { subs.delete(setD); }; }, [syncTick]);
  const reload = useCallback(() => refreshSimple(true), []);
  return [d, reload];
}
