import { useEffect, useState } from "react";
import AuthPage from "../pages/AuthPage";
import { apiFetch, clearSession } from "../config/api";

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
    return <div className="auth-loading">Loading MyDailyOS…</div>;
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
