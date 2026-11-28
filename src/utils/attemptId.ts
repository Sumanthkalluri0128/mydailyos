// A request id for "add these" style writes that is safe against double taps and timeout-then-retry.
//
//   * The SAME content asked for again while the first try has not clearly worked (a second tap, a retry after
//     a timeout whose first request may still have reached the server) gets the SAME id, so the server answers
//     "already done" instead of adding everything twice.
//   * DIFFERENT content (the person changed the selection in between) gets a NEW id, so it is never swallowed
//     by an earlier attempt.
//   * After a success the id is forgotten, so adding the same set again on purpose later works normally.
// (Same behaviour as client/src/utils/attemptId.js on the web.)
const live = new Map<string, string>(); // content key -> id of the attempt that is in flight or last failed
const MAX = 50;

const keyOf = (prefix: string, payload: unknown) => `${prefix}:${JSON.stringify(payload)}`;

export function attemptId(prefix: string, payload: unknown): string {
  const key = keyOf(prefix, payload);
  let id = live.get(key);
  if (!id) {
    id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (live.size >= MAX) live.delete(live.keys().next().value as string); // never grows without limit
    live.set(key, id);
  }
  return id;
}

/** Call once the request has clearly succeeded (or was safely queued): the next identical request is a new one on purpose. */
export function attemptDone(prefix: string, payload: unknown): void {
  live.delete(keyOf(prefix, payload));
}

/** Test helper. */
export function _resetAttempts(): void { live.clear(); }
