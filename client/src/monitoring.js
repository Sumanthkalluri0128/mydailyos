// Optional error reporting. Does nothing unless VITE_SENTRY_DSN is set at build time,
// and Sentry is loaded lazily so it never slows down the first paint.
import { setErrorSink } from "./utils/errorReport";

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  import("@sentry/react")
    .then((Sentry) => {
      // Release = the one shared version (see tools/syncVersion.mjs), so a crash points at the exact build.
      Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0.1, release: `mydailyos@${__APP_VERSION__}` });
      setErrorSink((error, ctx) => Sentry.withScope((scope) => {
        scope.setTag("boundary", ctx.scope); if (ctx.name) scope.setTag("area", ctx.name);
        if (ctx.componentStack) scope.setContext("react", { componentStack: ctx.componentStack });
        Sentry.captureException(error);
      }));
    })
    .catch(() => {});
}
