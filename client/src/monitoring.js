// Optional error reporting. Does nothing unless VITE_SENTRY_DSN is set at build time,
// and Sentry is loaded lazily so it never slows down the first paint.
export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0.1 });
    })
    .catch(() => {});
}
