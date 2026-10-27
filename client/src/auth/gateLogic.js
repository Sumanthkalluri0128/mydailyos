// The auth gate's decisions as plain functions (so they are tested without a browser). AuthGate.jsx only wires them to React.

/** Reads the "#google=ok&token=…" part the Google sign-in comes back with. null when the hash has nothing to do with Google. */
export function parseGoogleHash(hash) {
  const h = String(hash || "").replace(/^#/, "");
  if (!h.includes("google=")) return null;
  const p = new URLSearchParams(h);
  return { status: p.get("google"), token: p.get("token") || "", reason: p.get("reason") || "" };
}

/** The line shown on the sign-in page after a Google redirect that did not work (nothing for a success or no redirect). */
export function loginNoticeFor(redirect) {
  if (!redirect || redirect.status === "ok") return "";
  return redirect.status === "cancelled" ? "Google sign-in was cancelled." : redirect.reason || "Google sign-in failed. Please try again.";
}

/**
 * What to do after asking the server "who am I?".
 *  - ok: the answer is a person: signed in.
 *  - keep-stored: the server is asleep/failing/offline (anything but 401 or 404) and we know who this is: stay signed in on the saved copy.
 *  - sign-out: a real "this session is not valid", or nothing saved to fall back on.
 */
export function sessionDecision({ ok, status, stored }) {
  if (ok) return "ok";
  if (status !== 401 && status !== 404 && stored && stored.email) return "keep-stored";
  return "sign-out";
}

/** What the gate shows: the loading line, the sign-in page, or the app. */
export const gateView = ({ ready, user }) => (!ready ? "loading" : !user ? "login" : "app");
