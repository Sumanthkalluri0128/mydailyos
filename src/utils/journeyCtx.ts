// Shares today's journey data (level, quests, streak, goals) with every character so they can comment on real progress.
import { get, today } from '../config/api';

let ctx: any = null, at = 0, inflight: Promise<any> | null = null;
const subs = new Set<(c: any) => void>();
export const getCtx = () => ctx;
export const onCtx = (fn: (c: any) => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export function refreshCtx(force = false): Promise<any> {
  if (!force && ctx && Date.now() - at < 90000) return Promise.resolve(ctx);
  if (inflight) return inflight;
  inflight = get<any>(`/api/goals/journey?today=${today()}`)
    .then((d) => { if (d?.success) { ctx = d; at = Date.now(); subs.forEach((f) => f(ctx)); } return ctx; })
    .catch(() => ctx)
    .finally(() => { inflight = null; });
  return inflight;
}
