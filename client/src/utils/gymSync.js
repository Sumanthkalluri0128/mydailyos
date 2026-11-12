// GENERATED from MyDailyOSMobile/src/utils/gymSync.ts (the typed source of truth). Edit that file, then re-run the generator; do not edit this copy.
// Pure planning for "Gym log -> Exercise log" sync (no React, no storage, no network), so it can be unit-tested and shared with the web app.
// The Gym log stays the place you type sets x reps x weight. Each logged exercise is also sent to the server as one activity row
// (minutes + estimated kcal, worked out here with the same maths the Gym screen shows), so the Exercise page and Home count it.
// One row per gym entry (keyed by the entry's id): editing updates it, deleting removes it, syncing twice never double counts.
import { DEFAULT_BODY_KG, bodyKgOn, entryKcal, entryMinutes, shiftDate, validSets } from './gymMath';
/** Only recent entries are pushed, so a big old history is not re-sent. Older ones were never counted in today's totals anyway. */
export const SYNC_DAYS = 60;
export const BATCH = 100;
/** If more than this many synced entries vanish at once without the person asking (a read error, an empty restore), nothing is deleted on the server. */
export const SAFE_AUTO_REMOVE = 20;
export const EMPTY_MEMORY = { synced: {} };
/** The body of one gym entry as the server wants it. */
export function toPayload(e, body) {
    const kg = bodyKgOn(body, e.date);
    const sets = validSets(e).map((s) => ({ kg: s.kg, reps: s.reps, ...(e.unit === 'min' && s.pace ? { pace: s.pace } : {}) }));
    return {
        id: e.id, date: e.date, name: e.name, cat: e.cat, unit: e.unit, sets, note: e.note,
        minutes: Math.max(1, Math.round(entryMinutes(e))), kcal: entryKcal(e, kg || DEFAULT_BODY_KG), ...(kg ? { bodyKg: kg } : {}),
    };
}
/** Short stable fingerprint: if it is unchanged since the last successful sync, there is nothing to send. */
export function fingerprint(p) {
    const s = JSON.stringify([p.date, p.name, p.cat, p.unit, p.sets, p.note || '', p.minutes, p.kcal, p.bodyKg || 0]);
    let h = 5381;
    for (let i = 0; i < s.length; i++)
        h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36) + ':' + s.length;
}
/**
 * What to send now. `entries` is the whole gym log; `bulkRemove` is true only when the person just cleared or restored the log on purpose.
 * Entries in the sync window whose fingerprint changed (new, edited, or body weight changed) are upserted, newest first;
 * entries the server has but the log no longer holds are removed.
 */
export function planGymSync(entries, body, mem, today, bulkRemove = false) {
    const from = shiftDate(today, -SYNC_DAYS);
    const upsert = [];
    for (const e of [...entries].sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1))) {
        if (e.date < from || !validSets(e).length)
            continue;
        const p = toPayload(e, body);
        if (mem.synced[e.id] !== fingerprint(p))
            upsert.push(p);
        if (upsert.length >= BATCH)
            break;
    }
    const have = new Set(entries.map((e) => e.id));
    const gone = Object.keys(mem.synced).filter((id) => !have.has(id));
    const safe = bulkRemove || gone.length <= SAFE_AUTO_REMOVE;
    return { upsert, removeIds: safe ? gone.slice(0, 300) : [], skippedRemovals: safe ? 0 : gone.length };
}
/** Memory after the server accepted the request: the sent entries are now in step, the removed ones forgotten. */
export function applyResult(mem, sent, syncedIds, removeIds) {
    const next = { ...mem.synced };
    const ok = new Set(syncedIds);
    for (const p of sent)
        if (ok.has(p.id))
            next[p.id] = fingerprint(p);
    for (const id of removeIds)
        delete next[id];
    return { synced: next };
}
export const hasWork = (p) => p.upsert.length > 0 || p.removeIds.length > 0;
