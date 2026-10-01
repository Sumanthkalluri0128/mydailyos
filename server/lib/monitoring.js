// Optional server-side error reporting. Does nothing unless SENTRY_DSN is set AND @sentry/node
// is installed (it's an optionalDependency), so it can never take the API down.
let Sentry = null;

function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({ dsn, environment: process.env.NODE_ENV || 'production', tracesSampleRate: 0.1 });
    console.log('Sentry error reporting enabled');
  } catch (e) {
    Sentry = null;
    console.warn('SENTRY_DSN is set but @sentry/node is not installed — error reporting disabled.');
  }
}

function captureError(err, context = {}) {
  if (!Sentry) return;
  try {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  } catch (_) { /* never throw from the reporter */ }
}

module.exports = { initMonitoring, captureError };
