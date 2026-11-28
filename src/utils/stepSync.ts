/** Decide whether a new device step count is worth sending to the server (avoids a request on every sensor tick). */
export function shouldPost(prev: number | null, next: number, lastPostAt: number, now: number): boolean {
  if (!(next > 0)) return false;
  if (prev === null) return true;
  if (next === prev) return false;
  return Math.abs(next - prev) >= 50 || now - lastPostAt > 5 * 60_000;
}

/** Android's pedometer only reports steps since we started listening; fold each reading into a running day total. */
export function accumulate(total: number, lastSeen: number, reading: number): { total: number; lastSeen: number } {
  const delta = reading >= lastSeen ? reading - lastSeen : reading; // sensor restarted -> reading is the new delta
  return { total: total + Math.max(0, delta), lastSeen: reading };
}
