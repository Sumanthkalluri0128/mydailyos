// Optional crash/error reporting. Does nothing unless EXPO_PUBLIC_SENTRY_DSN is set — safe to
// ship with no DSN configured (the default), and never throws if @sentry/react-native can't init
// (e.g. running in Expo Go, where some native modules aren't available).
let Sentry: typeof import('@sentry/react-native') | null = null;

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry = require('@sentry/react-native');
    // release = the one shared version (version.json), the same name the web and server use
    const version = require('expo-constants').default?.expoConfig?.version || 'dev';
    Sentry!.init({ dsn, tracesSampleRate: 0.2, enableAutoSessionTracking: true, release: `mydailyos@${version}` });
  } catch {
    Sentry = null;
  }
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!Sentry) return;
  try {
    Sentry.withScope((scope) => {
      if (context) Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry!.captureException(error);
    });
  } catch {}
}
