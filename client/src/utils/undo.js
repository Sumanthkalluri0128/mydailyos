// Undo toast. Usage inside a delete handler (replaces the old confirm):
//   const go = await undoGate({ what: "Water entry", hide: () => setLogs(...), restore: () => reload() });
//   if (!go) return;            // person pressed Undo: the item is already back
// Real confirmation (confirmAction) stays for clear-the-week, bulk actions and account deletion.
import { createUndoQueue } from "./undoCore";
import { t } from "../i18n";

const queue = createUndoQueue();
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") queue.flushAll(); });
  window.addEventListener("pagehide", () => queue.flushAll());
}

export async function undoGate({ what, hide, restore, delay = 5000 }) {
  try { hide?.(); } catch { /* ignore */ }
  const g = queue.gate(delay);
  const onUndo = () => {
    if (g.undo()) { try { restore?.(); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent("mydailyos:toast", { detail: { message: t("undo.back"), type: "success", duration: 2200, kind: "undone" } })); }
  };
  window.dispatchEvent(new CustomEvent("mydailyos:toast", { detail: { message: t("undo.deleted", { what: what || "" }).trim(), type: "info", duration: delay, kind: "undo", sub: t("undo.sensei"), action: { label: t("common.undo"), onClick: onUndo } } }));
  return g.promise;
}
/**
 * Undo for a change that is already saved (e.g. a portion edit): shows the same 5 s Undo toast, and Undo runs `onUndo` to put it back.
 * Nothing waits for the toast, so leaving the page never loses or doubles the change.
 */
export function undoNotice({ message, onUndo, delay = 5000 }) {
  const run = () => { Promise.resolve().then(() => onUndo?.()).catch(() => {}); window.dispatchEvent(new CustomEvent("mydailyos:toast", { detail: { message: t("undo.back"), type: "success", duration: 2200, kind: "undone" } })); };
  window.dispatchEvent(new CustomEvent("mydailyos:toast", { detail: { message, type: "info", duration: delay, kind: "undo", sub: t("undo.sensei"), action: { label: t("common.undo"), onClick: run } } }));
}
export const flushUndo = () => queue.flushAll();
