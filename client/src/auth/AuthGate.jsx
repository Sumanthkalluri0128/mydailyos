import { useEffect, useState } from "react";
import AuthPage from "../pages/AuthPage";
import { apiFetch, clearSession } from "../config/api";

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
  if (googleRedirect.status === "ok" && googleRedirect.token) localStorage.setItem("mydailyos_token", googleRedirect.token);
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
