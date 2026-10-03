import { useEffect, useState } from "react";
import AuthPage from "../pages/AuthPage";
import { apiFetch, clearSession } from "../config/api";
import { notify } from "../utils/notify";

// Google redirects back to "/#google=ok&token=…" (sign-in) or "/#google=ok" (sheet connected). Take it, then clean the URL.
function consumeGoogleRedirect() {
  const h = window.location.hash.replace(/^#/, "");
  if (!h.includes("google=")) return;
  const p = new URLSearchParams(h);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  const status = p.get("google");
  if (status === "ok" && p.get("token")) localStorage.setItem("mydailyos_token", p.get("token"));
  else if (status === "ok") setTimeout(() => notify("Google connected — your sheet is being created.", "success"), 500);
  else if (status === "error") setTimeout(() => notify(p.get("reason") || "Google sign-in failed.", "error"), 500);
}

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const handleUnauthorized = () => {
      clearSession();
      if (!cancelled) setUser(null);
    };

    window.addEventListener("mydailyos:unauthorized", handleUnauthorized);
    consumeGoogleRedirect();

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
        onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)}
      />
    );
  }

  return children;
}
