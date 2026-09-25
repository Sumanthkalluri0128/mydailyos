import { useEffect, useState } from 'react';
import AuthPage from '../pages/AuthPage';
import { apiFetch } from '../config/api';

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('mydailyos_token');

    if (!token) {
      setReady(true);
      return;
    }

    apiFetch('/api/account/me')
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Session validation failed');
        }
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        localStorage.setItem('mydailyos_user', JSON.stringify(data.user));
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem('mydailyos_token');
        localStorage.removeItem('mydailyos_user');
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => { cancelled = true; };
  }, []);

  if (!ready) return <div className="auth-loading">Loading MyDailyOS…</div>;

  if (!user) {
    return <AuthPage onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)} />;
  }

  return children;
}
