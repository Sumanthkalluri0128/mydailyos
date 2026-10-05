import { useEffect, useState } from "react";
import AuthPage from "../pages/AuthPage";
import { apiFetch, clearSession, startOfflineSync, syncNow } from "../config/api";
import { purgeOthers } from "../offline/offlineApi";

// Google sign-in redirects back to "/#google=ok&token=…" or "/#google=error&reason=…" (or "cancelled").
// Read it once (cached, so React StrictMode's double render can't lose it), then clean the URL.
let googleRedirect;
function readGoogleRedirect() {
  if (googleRedirect !== undefined) return googleRedirect;
  googleRedirect = null;
  const h = window.location.hash.replace(/^#/, "");
  if (!h.includes("google=")) return googleRedirect;
  const p = new URLSearchParams(h);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  googleRedirect = { status: p.get("google"), token: p.get("token") || "", reason: p.get("reason") || "" };
  if (googleRedirect.status === "ok" && googleRedirect.token) {
    // Whoever was signed in before is replaced; their saved dashboard copy goes with them (the new account is loaded below).
    localStorage.removeItem("mydailyos_dash_v1");
    localStorage.removeItem("mydailyos_user");
    localStorage.setItem("mydailyos_token", googleRedirect.token);
  }
  return googleRedirect;
}

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const redirect = readGoogleRedirect();
  // Errors/cancellation are shown on the login page itself (toasts only exist inside the signed-in app).
  const loginNotice = redirect && redirect.status !== "ok"
    ? (redirect.status === "cancelled" ? "Google sign-in was cancelled." : redirect.reason || "Google sign-in failed. Please try again.")
    : "";

  useEffect(() => {
    let cancelled = false;

    const handleUnauthorized = () => {
      clearSession();
      if (!cancelled) setUser(null);
    };

    window.addEventListener("mydailyos:unauthorized", handleUnauthorized);
    readGoogleRedirect();

    const token = localStorage.getItem("mydailyos_token");

    if (token) {
      apiFetch("/api/account/me")
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            // Only a real "this session is not valid" ends the session. Offline, or a sleeping/failing server, must not
            // sign anyone out: keep the person we already know and carry on with their saved data.
            if (response.status !== 401 && response.status !== 404) {
              try {
                const stored = JSON.parse(localStorage.getItem("mydailyos_user") || "null");
                if (stored && stored.email) return { user: stored };
              } catch { /* fall through */ }
            }
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

  if (!ready) {
    return <div className="auth-loading">Loading FlexFit…</div>;
  }

  if (!user) {
    return (
      <AuthPage
        notice={loginNotice}
        onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)}
      />
    );
  }

  return children;
}
