// The tour's brain: pure functions, no DOM, no React, no network. Web and mobile use the same logic (the mobile copy is src/utils/tourEngine.ts).
// Steps, copy and paths come from tourContent.json, the one content file for both apps.
import CONTENT from "./tourContent.json" with { type: "json" };

export const content = CONTENT;
export const TONES = ["cheer", "calm", "strict"];
export const toneOf = (t) => (TONES.includes(t) ? t : "cheer");
export const GOAL_IDS = CONTENT.goals.map((g) => g.id);

/** Which real action a finished request means. Used to detect the "first win" steps without any extra code at each button. */
export function actionForRequest(method, url) {
  if (String(method || "GET").toUpperCase() !== "POST") return null;
  const p = String(url || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/+$/, "");
  if (p === "/api/water") return "water_logged";
  if (p === "/api/food-logs" || p === "/api/food-logs/bulk" || p === "/api/food-logs/text") return "food_logged";
  if (p === "/api/weight") return "weight_logged";
  if (p === "/api/activities" || p === "/api/activities/logs") return "activity_logged";
  if (p === "/api/meal-plans" || p === "/api/meal-plans/auto" || p === "/api/meal-plans/copy-week") return "plan_created";
  return null;
}

/** The path (list of step ids, at most 5) for a goal and mode. Unknown goal = "healthy". */
export function pathFor(goal, mode) {
  const base = CONTENT.paths[GOAL_IDS.includes(goal) ? goal : "healthy"];
  const swap = (mode === "advanced" && CONTENT.modeSwap.advanced) || {};
  return base.map((id) => swap[id] || id).filter((id) => CONTENT.steps[id]).slice(0, 5);
}

const stepOf = (id) => CONTENT.steps[id];

/** A fresh tour state. status: active | finished | skipped. */
export function init(path, saved) {
  const s = saved || {};
  const done = (Array.isArray(s.done) ? s.done : []).filter((id) => path.includes(id));
  const index = Number.isInteger(s.index) && s.index >= 0 && s.index < path.length ? s.index : 0;
  return { path, index, done, skipped: (s.skippedSteps || []).filter((id) => path.includes(id)), status: s.status === "skipped" || s.status === "finished" ? s.status : "active", justDone: null };
}

export const currentId = (st) => (st.status === "active" ? st.path[st.index] || null : null);
export const currentStep = (st) => (currentId(st) ? stepOf(currentId(st)) : null);
export const isDone = (st, id) => st.done.includes(id);
export const progress = (st) => ({ at: Math.min(st.index + 1, st.path.length), of: st.path.length, doneCount: st.done.length });

/** First index at or after `from` (moving by `dir`) whose anchor is on screen. Steps without a usable anchor are skipped, never shown broken. */
function findPresent(st, from, dir, hasAnchor) {
  for (let i = from; i >= 0 && i < st.path.length; i += dir) {
    const stp = stepOf(st.path[i]);
    if (!stp) continue;
    if (!stp.anchor || !hasAnchor || hasAnchor(stp.anchor, stp)) return i;
  }
  return -1;
}

/** Next step. Past the last one the tour is finished. */
export function next(st, hasAnchor) {
  if (st.status !== "active") return st;
  const i = findPresent(st, st.index + 1, 1, hasAnchor);
  return i === -1 ? { ...st, status: "finished", justDone: null } : { ...st, index: i, justDone: null };
}

/** Back goes to the nearest earlier step that can be shown; at the first step it stays put. */
export function back(st, hasAnchor) {
  if (st.status !== "active") return st;
  const i = findPresent(st, st.index - 1, -1, hasAnchor);
  return i === -1 ? st : { ...st, index: i, justDone: null };
}

/** Skip the whole tour (can be resumed from Profile; progress is kept). */
export const skipAll = (st) => ({ ...st, status: "skipped", justDone: null });

/** Resume from where it stopped. Starts at the first step that is not done yet. */
export function resume(st, hasAnchor) {
  const firstOpen = st.path.findIndex((id) => !st.done.includes(id));
  if (firstOpen === -1) return { ...st, status: "finished" };
  const probe = { ...st, status: "active", index: firstOpen };
  const i = findPresent(probe, firstOpen, 1, hasAnchor);
  return i === -1 ? { ...st, status: "finished" } : { ...probe, index: i, justDone: null };
}

/** A real action happened. Every step that waits for it is marked done (even a later one the person did early). `justDone` is set when the CURRENT step completed. */
export function onAction(st, action) {
  if (st.status !== "active" || !action) return st;
  const ids = st.path.filter((id) => stepOf(id).action === action && !st.done.includes(id));
  if (!ids.length) return st;
  const cur = currentId(st);
  return { ...st, done: [...st.done, ...ids], justDone: ids.includes(cur) ? cur : null };
}

/** "Look" steps are done by tapping Next. */
export function markLookDone(st) {
  const id = currentId(st);
  return id && stepOf(id).kind === "look" && !st.done.includes(id) ? { ...st, done: [...st.done, id] } : st;
}

/** The text for a step in the person's coach tone. {coach} is replaced with the coach's name. At most 20 words (tested). */
export function stepCopy(id, tone, coach) {
  const s = stepOf(id);
  if (!s) return "";
  return String(s.say[toneOf(tone)] || s.say.cheer).replace("{coach}", coach || "Your coach");
}
export function doneCopy(id, tone) {
  const s = stepOf(id);
  return s && s.done ? s.done[toneOf(tone)] || s.done.cheer : "";
}
export const rewardLine = (tone) => CONTENT.reward.line[toneOf(tone)];

/** Welcome screens (at most 3). Screens for facts we already have (goal, coach) become a short confirmation instead of a question: nobody is asked twice. */
export function welcomeScreens({ goalKnown, coachKnown }) {
  return CONTENT.welcome.map((w) => ({ ...w, known: (w.id === "goal" && !!goalKnown) || (w.id === "coach" && !!coachKnown) }));
}

/* ---------- spotlight geometry ---------- */

/**
 * Where to put the tooltip. `rect` = {x,y,width,height} of the element in the viewport, `tip` = {width,height}, `vp` = {width,height}.
 * Prefers below the element; flips above when there is no room; if neither fits (tiny phone, tall element) it centres on screen.
 * The tooltip is always clamped inside the viewport, including a 360 x 640 phone.
 */
export function placeTooltip(rect, tip, vp, opts) {
  const gap = (opts && opts.gap) || 12, margin = (opts && opts.margin) || 8;
  const w = Math.min(tip.width, vp.width - margin * 2);
  const clampX = (x) => Math.max(margin, Math.min(x, vp.width - w - margin));
  if (!rect) return { placement: "center", top: Math.max(margin, (vp.height - tip.height) / 2), left: clampX((vp.width - w) / 2), width: w, arrowLeft: null };
  const cx = rect.x + rect.width / 2;
  const left = clampX(cx - w / 2);
  const arrowLeft = Math.max(16, Math.min(cx - left, w - 16));
  const below = rect.y + rect.height + gap, above = rect.y - gap - tip.height;
  if (below + tip.height <= vp.height - margin) return { placement: "bottom", top: below, left, width: w, arrowLeft };
  if (above >= margin) return { placement: "top", top: above, left, width: w, arrowLeft };
  return { placement: "center", top: Math.max(margin, (vp.height - tip.height) / 2), left: clampX((vp.width - w) / 2), width: w, arrowLeft: null };
}

/** The highlighted hole: the element's rectangle padded a little and kept inside the viewport. */
export function cutout(rect, vp, pad = 6) {
  if (!rect) return null;
  const x = Math.max(0, rect.x - pad), y = Math.max(0, rect.y - pad);
  const r = Math.min(vp.width, rect.x + rect.width + pad), b = Math.min(vp.height, rect.y + rect.height + pad);
  const width = r - x, height = b - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** An element counts as visible only if it has size and overlaps the viewport. */
export const rectUsable = (rect, vp) => !!rect && rect.width > 0 && rect.height > 0 && rect.x + rect.width > 0 && rect.y + rect.height > 0 && rect.x < vp.width && rect.y < vp.height;

/* ---------- checklist, coachmarks, what's new ---------- */

export const checklistText = (c) => `${c.doneCount} of ${c.total}`;

/** The hints for a screen that were not seen yet. Shown once; "Got it" marks them. Replay (the ? icon) passes ignoreSeen. */
export function hintsFor(screen, seen, ignoreSeen) {
  const list = CONTENT.coachmarks[screen] || [];
  return ignoreSeen ? list : list.filter((h) => !(seen || []).includes(h.id));
}
export const markSeen = (seen, ids) => [...new Set([...(seen || []), ...ids])];

/** Live "What's new" hotspots by date, not yet seen. */
export function whatsNew(seen, today) {
  return CONTENT.whatsNew.filter((w) => !(seen || []).includes(w.id) && (!w.from || today >= w.from) && (!w.until || today <= w.until));
}
