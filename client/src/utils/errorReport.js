// Reports a crash with WHERE it happened (which tab or Home card), so one broken card is easy to find in Sentry.
// Sentry loads late (monitoring.js), so reports made before it is ready wait in a short queue instead of being lost.
const MAX_QUEUE = 20;
let sink = null;          // (error, context) => void, set once Sentry is ready
const queue = [];

export function setErrorSink(fn) {
  sink = fn;
  while (queue.length && sink) { const [e, c] = queue.shift(); try { sink(e, c); } catch { /* reporting must never crash the app */ } }
}
export function reportError(error, context = {}) {
  const ctx = { scope: "app", name: "", ...context };
  if (sink) { try { sink(error, ctx); } catch { /* ignore */ } return true; }
  queue.push([error, ctx]);
  if (queue.length > MAX_QUEUE) queue.shift();
  return false;
}
export const _queueLength = () => queue.length;
