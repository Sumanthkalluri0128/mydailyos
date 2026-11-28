// How old is the saved copy on screen? Pure helpers for the "updated X min ago" label and the same-day / same-person rule.
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const FRESH_MS = 2 * MIN; // newer than this: "just now"

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago". Unknown time returns "" so nothing is shown. */
export function ageLabel(at, now = Date.now()) {
  const t = Number(at);
  if (!Number.isFinite(t) || t <= 0) return "";
  const diff = Math.max(0, now - t);
  if (diff < FRESH_MS) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MIN)} min ago`;
  if (diff < 24 * HOUR) return `${Math.round(diff / HOUR)} h ago`;
  const days = Math.floor(diff / (24 * HOUR));
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** 'fresh' (under 2 min), 'recent' (under 6 h), 'old'. Used to colour the label and decide how loudly to say it. */
export function freshness(at, now = Date.now()) {
  const t = Number(at);
  if (!Number.isFinite(t) || t <= 0) return "unknown";
  const diff = Math.max(0, now - t);
  return diff < FRESH_MS ? "fresh" : diff < 6 * HOUR ? "recent" : "old";
}

/**
 * Should a saved dashboard copy be painted straight away? Only if it is the same person and the same calendar day:
 * yesterday's totals must never look like today's. Returns the copy or null.
 */
export function usableCopy(saved, { date, owner }) {
  if (!saved || typeof saved !== "object") return null;
  if (saved.date !== date) return null;
  if (owner !== undefined && saved.owner !== owner) return null;
  return saved;
}
