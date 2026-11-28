// Best-effort: also record a finished workout in the day's exercise log (the same /api/activities/logs the Exercise screen uses),
// so it counts toward "exercise minutes" and "calories burned" on Home. Uses the app's offline queue, and the session id as the clientId,
// so a replay can never double-count. The workout is ALWAYS saved on the phone first; if this fails it is retried next time the tab opens.
import { read, write } from './offline';
import { Session, pickSessionActivity } from './workoutEngine';
import { getWorkout, markSyncFailed, markSynced, settlePendingDeletes } from './workoutStore';
import { sessionPayload } from './smartPlan';
import { setSmartPlan } from './smartPlanStore';
import { ApiError, today } from '../config/api';
import { deletePath, deleteRequest, runPending } from './sessionDelete';
import { outcomeOf, pickToSync, reasonFor, runSync } from './syncRun';

let running = false;
let deleting = false;
const inflight = new Map<string, number>();   // server ids being sent right now: a delete for one of them waits until the send is over

type Sent = { outcome: 'ok' | 'offline' | 'rejected'; reason?: string };
const OK: Sent = { outcome: 'ok' };

/** What a failed request means: no connection (or the server busy / signed out) is retried later; a refusal for good is remembered and shown. */
function fromError(e: any): Sent {
  if (e instanceof ApiError && !e.network && e.status) { const o = outcomeOf(e.status); if (o !== 'ok') return { outcome: o, reason: reasonFor(e.status, e.message) }; }
  return { outcome: 'offline' };       // no answer, or an error we cannot read: try again later rather than call the workout refused
}

/** Sends one finished workout and says what happened: ok (sent, or safely queued offline), offline (try again later) or rejected (the server will not take it). */
export async function syncSessionOutcome(s: Session): Promise<Sent> {
  const cid = deleteRequest(s.id, { smart: s.plan === 'smart', classicPrefix: 'ws' })?.clientId || '';
  if (cid) inflight.set(cid, (inflight.get(cid) || 0) + 1);
  try { return await sendSession(s); } finally {
    if (cid) { const n = (inflight.get(cid) || 1) - 1; if (n > 0) inflight.set(cid, n); else inflight.delete(cid); }
    if (getWorkout().pendingDeletes.length) void flushSessionDeletes();   // a delete that was waiting for this send can go now
  }
}
export async function syncSessionToLog(s: Session): Promise<boolean> { return (await syncSessionOutcome(s)).outcome === 'ok'; }

/** Sends it and records the result on the workout: sent, or refused (with the reason, shown in History). Used right after a workout is finished. */
export async function syncAndRecord(s: Session): Promise<boolean> {
  const r = await syncSessionOutcome(s);
  if (r.outcome === 'ok') markSynced(s.id);
  else if (r.outcome === 'rejected') markSyncFailed(s.id, r.reason || reasonFor(0));
  return r.outcome === 'ok';
}

async function sendSession(s: Session): Promise<Sent> {
  if (s.plan === 'smart') return syncSmartSession(s);
  if (s.kind === 'rest') return OK;                    // a rest day's gentle mobility is not an exercise entry (same as the web)
  let list: any[];
  try { const res = await read<any>('/api/activities'); list = res?.activities || []; } catch (e) { return fromError(e); }
  if (!list.length) return { outcome: 'offline' };    // the exercise types have not loaded yet (no signal, nothing cached): try again later
  const act = pickSessionActivity<any>(list, s.kind);
  if (!act?._id) return { outcome: 'rejected', reason: 'The exercise type for this workout is missing on the server.' };
  try {
    await write('POST', '/api/activities/logs', {
      activityId: act._id, date: s.date, durationMinutes: Math.max(1, Math.round(s.durationSec / 60)), caloriesBurned: s.kcal, clientId: `ws-${s.id}`,
    }, `Workout: ${s.short}`, { activityName: act.name, category: act.category, caloriesBurned: s.kcal });
    try { void require('./notifications').refreshWorkoutReminders?.(); } catch { /* reminders are best effort; a lazy require keeps this module free of the notification code */ }   // a logged exercise can make a planned workout done
    return OK;
  } catch (e) { return fromError(e); }
}

/**
 * A Smart-program workout goes to POST /api/body-plan/session (queued offline, safe to repeat: the clientId is the workout's id). The server
 * counts the calories itself, so it must NOT also be logged as a separate exercise. The answer is the re-worked plan: use it at once.
 */
async function syncSmartSession(s: Session): Promise<Sent> {
  try {
    const r: any = await write('POST', '/api/body-plan/session', sessionPayload(s, { today: s.date }), `Workout: ${s.short}`);
    if (r && !r.queued && r.data && r.data.plan) setSmartPlan(r.data.plan);
    return OK;
  } catch (e) { return fromError(e); }
}

/**
 * Tries every workout that has not reached the server yet (up to 60 days back, oldest first, one at a time). No connection stops the run and it is
 * tried again later; a workout the server refuses is remembered with its reason (shown in History with a Try again button) and the others still go.
 * Answers how many were refused in this run.
 */
export async function retryUnsynced(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const todo = pickToSync(getWorkout().sessions, { today: today(), skip: (x: Session) => x.synced || x.kind === 'rest' || !!x.syncFailed });
    if (!todo.length) return 0;
    const r = await runSync(todo, (s: Session) => syncSessionOutcome(s), { stillWanted: (s: Session) => getWorkout().sessions.some((x) => x.id === s.id) }); // deleted while this was running: never send it now
    for (const id of r.done) markSynced(id);
    for (const [id, f] of Object.entries(r.failed)) markSyncFailed(id, (f as any).reason, (f as any).at);
    return Object.keys(r.failed).length;
  } finally { running = false; }
}

/**
 * Deleting a finished workout also has to remove its entry from the server, or the day's burn stays inflated. The delete goes through the app's offline queue
 * (`write`), which keeps order: with no signal it waits behind any create of the same workout still queued, then both are replayed. Entries still in their Undo
 * window are left until due. Safe to call often.
 */
export async function flushSessionDeletes(): Promise<void> {
  if (deleting) return;
  const list = getWorkout().pendingDeletes.filter((d) => !((inflight.get(d.clientId) || 0) > 0));
  if (!list.length) return;
  deleting = true;
  try {
    const r = await runPending(list, async (entry) => {
      try {
        const res: any = await write('DELETE', deletePath(entry, today()), undefined, 'Delete workout');
        if (res && res.queued) return { ok: true, status: 202 };           // the offline queue has it now and sends it in order
        return { ok: true, status: 200, plan: res && res.data ? res.data.plan : undefined };
      } catch (e: any) {
        if (e instanceof ApiError && e.network) return { ok: false, status: 0 };
        return { ok: false, status: Number(e && e.status) || 0 };
      }
    });
    settlePendingDeletes([...r.done, ...r.dropped]);
    if (r.plan) setSmartPlan(r.plan);
  } catch { /* stays on the list; tried again when the tab opens */ } finally { deleting = false; }
}
