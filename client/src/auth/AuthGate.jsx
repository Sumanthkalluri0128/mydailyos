import { Suspense, lazy, useEffect, useState } from "react";

import { apiFetch, clearSession, startOfflineSync, syncNow } from "../config/api";
import { API_URL } from "../config";
import { isSignedIn, startSession, signInExtras } from "./session";
const AuthPage = lazy(loadWithRetry(() => import("../pages/AuthPage"))); // only needed while signed out: signed-in visits never download it
import { loadWithRetry } from "../utils/chunkRecovery";
import { purgeOthers } from "../offline/offlineApi";
import { parseGoogleHash, loginNoticeFor, sessionDecision, gateView } from "./gateLogic";

// Google sign-in redirects back to "/#google=ok&token=…" or "/#google=error&reason=…" (or "cancelled").
// Read it once (cached, so React StrictMode's double render can't lose it), then clean the URL.
let googleRedirect;
function readGoogleRedirect() {
  if (googleRedirect !== undefined) return googleRedirect;
  googleRedirect = null;
  const parsed = parseGoogleHash(window.location.hash);
  if (!parsed) return googleRedirect;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  googleRedirect = parsed;
  if (googleRedirect.status === "ok" && (googleRedirect.token || googleRedirect.code)) {
    // Whoever was signed in before is replaced; their saved dashboard copy goes with them (the new account is loaded below).
    localStorage.removeItem("mydailyos_dash_v1");
    localStorage.removeItem("mydailyos_user");
    if (googleRedirect.token) startSession(googleRedirect.token);          // classic mode: the redirect carried the token
    // cookie mode: the redirect carried a one-time code, swapped for the httpOnly cookie in the effect below
  }
  return googleRedirect;
}

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const redirect = readGoogleRedirect();
  // Errors/cancellation are shown on the login page itself (toasts only exist inside the signed-in app).
  const loginNotice = loginNoticeFor(redirect);

  useEffect(() => {
    let cancelled = false;

    const handleUnauthorized = () => {
      clearSession();
      if (!cancelled) setUser(null);
    };

    window.addEventListener("mydailyos:unauthorized", handleUnauthorized);
    readGoogleRedirect();

    // Cookie mode + Google: swap the one-time code for the httpOnly cookie first (it works once, for 60 seconds).
    const exchange = redirect && redirect.code
      ? fetch(`${API_URL}/api/auth/exchange`, { method: "POST", ...(signInExtras().credentials ? { credentials: signInExtras().credentials } : {}), headers: { "Content-Type": "application/json", ...signInExtras().headers }, body: JSON.stringify({ code: redirect.code }) })
          .then((r) => r.json().catch(() => ({})).then((d) => { if (r.ok && d.success) startSession(d.token); }))
          .catch(() => {})
      : Promise.resolve();

    exchange.then(() => {
    const token = isSignedIn();

    if (token) {
      apiFetch("/api/account/me")
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            // Only a real "this session is not valid" ends the session. Offline, or a sleeping/failing server, must not
            // sign anyone out: keep the person we already know and carry on with their saved data.
            let stored = null;
            try { stored = JSON.parse(localStorage.getItem("mydailyos_user") || "null"); } catch { /* none */ }
            if (sessionDecision({ ok: false, status: response.status, stored }) === "keep-stored") return { user: stored };
            throw new Error(data.message || "Session validation failed");
          }

          return data;
        })
        .then((data) => {
          if (cancelled) return;
          setUser(data.user);
          localStorage.setItem("mydailyos_user", JSON.stringify(data.user));
        })
        .catch(() => {
          if (cancelled) return;
          clearSession();
          setUser(null);
        })
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    } else {
      setReady(true);
    }
    });

    return () => {
      cancelled = true;
      window.removeEventListener(
        "mydailyos:unauthorized",
        handleUnauthorized
      );
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    purgeOthers().then(() => { startOfflineSync(); syncNow(); });
  }, [user]);

  const view = gateView({ ready, user });
  if (view === "loading") {
    return <div className="auth-loading">Loading FlexFit…</div>;
  }

  if (view === "login") {
    return (
      <Suspense fallback={<div className="auth-loading">Loading FlexFit…</div>}>
        <AuthPage
          notice={loginNotice}
          onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)}
        />
      </Suspense>
    );
  }

  return children;
}
