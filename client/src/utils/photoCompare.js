// Before/after picking for the date slider. Pure: photos are [{ id, date }] sorted by date; positions are slider indexes.
export function initialPair(photos) {
  if (!photos.length) return { before: -1, after: -1 };
  return { before: 0, after: photos.length - 1 };
}
/** Keeps "before" earlier than "after" whichever slider moved. Returns the new pair. */
export function movePair(photos, pair, which, index) {
  const max = photos.length - 1; const i = Math.min(max, Math.max(0, Math.round(index)));
  if (max < 0) return { before: -1, after: -1 };
  if (which === "before") return { before: Math.min(i, pair.after), after: pair.after };
  return { before: pair.before, after: Math.max(i, pair.before) };
}
export function daysBetween(a, b) { return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000); }
export const spanText = (before, after) => { const d = daysBetween(before.date, after.date); return d <= 0 ? "Same day" : d < 14 ? `${d} days apart` : d < 90 ? `${Math.round(d / 7)} weeks apart` : `${Math.round(d / 30)} months apart`; };
