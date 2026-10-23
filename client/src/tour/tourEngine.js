// The tour as a small pure state machine (no UI, no storage), so web and mobile behave the same and it can be tested.
// state = { path: [stepId], index, status: 'idle'|'active'|'paused'|'done'|'dismissed', done: [stepId], skipped: [stepId], events: [event] }
import content from './tourContent.js';

const uniq = (a) => [...new Set(a)];
export const isInteractive = (id) => !!content.steps[id]?.event;
export const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/** Step ids for a goal ('lose' | 'build' | 'stay'). Unknown goals fall back to 'stay'. Interactive steps are capped at 5. */
export function pathFor(goal = 'stay') {
  const raw = content.paths[goal] || content.paths.stay;
  let n = 0;
  return raw.filter((id) => { if (!content.steps[id]) return false; if (isInteractive(id)) { n += 1; return n <= 5; } return true; });
}

export function init({ goal = 'stay', saved = null } = {}) {
  const path = pathFor(goal);
  if (saved && saved.path && saved.path.length) {
    const keep = saved.path.filter((id) => content.steps[id]);   // a step removed in a later version is simply dropped
    return { path: keep, index: Math.min(saved.index || 0, Math.max(0, keep.length - 1)), status: saved.status || 'idle', done: uniq(saved.done || []), skipped: uniq(saved.skipped || []), events: uniq(saved.events || []) };
  }
  return { path, index: 0, status: 'idle', done: [], skipped: [], events: [] };
}

export const current = (s) => (s.status === 'active' ? { id: s.path[s.index], ...content.steps[s.path[s.index]] } : null);
export const start = (s) => ({ ...s, status: s.status === 'done' || s.status === 'dismissed' ? s.status : 'active', index: firstOpen(s) });
const firstOpen = (s) => { const i = s.path.findIndex((id) => !s.done.includes(id) && !s.skipped.includes(id)); return i < 0 ? 0 : i; };
const finishIfEnd = (s, i) => (i >= s.path.length ? { ...s, index: s.path.length - 1, status: 'done' } : { ...s, index: i });
export const next = (s) => (s.status !== 'active' ? s : finishIfEnd(s, s.index + 1));
export const back = (s) => (s.status !== 'active' ? s : { ...s, index: Math.max(0, s.index - 1) });
/** "Skip" leaves the tour now and keeps your place so you can resume. */
export const skip = (s) => (s.status === 'active' ? { ...s, status: 'paused' } : s);
export const resume = (s) => (s.status === 'paused' || s.status === 'idle' ? { ...s, status: 'active', index: firstOpen(s) } : s);
/** "Don't show again". */
export const dismiss = (s) => ({ ...s, status: 'dismissed' });
export const replay = (s) => ({ ...s, status: 'active', index: 0, done: [], skipped: [] });

/** The anchor for this step is not on screen: skip it instead of breaking. */
export function skipMissing(s) {
  if (s.status !== 'active') return s;
  const id = s.path[s.index];
  return finishIfEnd({ ...s, skipped: uniq([...s.skipped, id]) }, s.index + 1);
}

/** A real action happened. Completes the current step when it waits for this event, and always remembers the event for the checklist. */
export function onEvent(s, event) {
  const events = uniq([...(s.events || []), event]);
  const id = s.path[s.index];
  if (s.status === 'active' && content.steps[id]?.event === event) {
    const done = uniq([...s.done, id]);
    return { state: finishIfEnd({ ...s, done, events }, s.index + 1), completed: id, cheer: content.steps[id].cheer };
  }
  // an action done earlier or out of order still counts for later steps
  const early = s.path.filter((x) => content.steps[x].event === event && !s.done.includes(x));
  return { state: { ...s, events, done: uniq([...s.done, ...early]) }, completed: null, cheer: '' };
}

/** Which API call is which event. */
export function detectEvent(method, url) {
  const m = String(method || 'GET').toUpperCase();
  const p = String(url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  for (const e of content.events) {
    if (m === e.method && p.startsWith(e.prefix) && !(e.not || []).some((x) => p.includes(x))) return e.event;
  }
  return null;
}

export function checklistState(events = []) {
  const set = new Set(events);
  const items = content.checklist.map((i) => ({ ...i, done: set.has(i.event) }));
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, complete: done === items.length, label: `${done} of ${items.length}`, reward: done === items.length ? content.checklistReward : null };
}

/** Hints still to show on a screen (max 3), given the ids already seen. */
export function hintsFor(screen, seen = []) {
  return (content.hints[screen] || []).filter((h) => !seen.includes(h.id)).slice(0, 3);
}
export const allHints = (screen) => (content.hints[screen] || []).slice(0, 3);

/** What's-new entries not yet seen (and not newer than the app, so a dot never shows for a feature this build lacks). */
export function whatsNewFor(seen = [], buildNumber = Infinity) {
  return content.whatsNew.filter((w) => !seen.includes(w.id) && Number(w.since) <= Number(buildNumber));
}

/** Merge progress saved on the device and on the server: nothing completed is ever lost. */
export function mergeSaved(a = {}, b = {}) {
  const arr = (k) => uniq([...(a[k] || []), ...(b[k] || [])]);
  const newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
  return { goal: newer.goal || a.goal || b.goal || '', coach: newer.coach || a.coach || b.coach || '', status: newer.status || 'idle', index: newer.index || 0, path: newer.path || a.path || b.path || [], done: arr('done'), skipped: arr('skipped'), events: arr('events'), hintsSeen: arr('hintsSeen'), newSeen: arr('newSeen'), checklistDismissed: !!(a.checklistDismissed || b.checklistDismissed), rewardClaimed: !!(a.rewardClaimed || b.rewardClaimed), updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}

/** Where to put a tooltip so it stays on screen. Pure geometry so it is shared and tested. rect = {x,y,w,h}; view = {w,h}; tip = {w,h}. */
export function placeTip(rect, view, tip, gap = 12, margin = 8) {
  const spaceBelow = view.h - (rect.y + rect.h), spaceAbove = rect.y;
  const below = spaceBelow >= tip.h + gap || spaceBelow >= spaceAbove;
  const y = below ? Math.min(rect.y + rect.h + gap, view.h - tip.h - margin) : Math.max(margin, rect.y - tip.h - gap);
  const x = Math.max(margin, Math.min(rect.x + rect.w / 2 - tip.w / 2, view.w - tip.w - margin));
  return { x, y, side: below ? 'below' : 'above' };
}
/** Is a measured element usable as a spotlight target? (zero-size or fully off-screen elements are not). */
export function usableRect(rect, view) {
  if (!rect || !(rect.w > 0) || !(rect.h > 0)) return false;
  return rect.x + rect.w > 0 && rect.y + rect.h > 0 && rect.x < view.w && rect.y < view.h;
}
