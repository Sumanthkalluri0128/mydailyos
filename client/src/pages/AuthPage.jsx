import { useState } from 'react';
import { API_URL } from '../config';
import '../auth/auth.css';

async function readResponse(response) {
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `${API_URL}/api/auth/${mode === 'login' ? 'login' : 'signup'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        }
      );

      const data = await readResponse(response);

      localStorage.setItem('mydailyos_token', data.token);
      localStorage.setItem(
        'mydailyos_user',
        JSON.stringify(data.user)
      );

      onAuthenticated(data.user);
    } catch (requestError) {
      setError(requestError.message || 'Unable to continue');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">M</div>
          <div>
            <h1>MyDailyOS</h1>
            <p>Your daily operating system</p>
          </div>
        </div>

        <div className="auth-heading">
          <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
          <p>
            {mode === 'signup'
              ? 'One account works across web and mobile.'
              : 'Sign in to continue to MyDailyOS.'}
          </p>
        </div>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>

          {mode === 'signup' && (
            <label>
              Confirm password
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" disabled={busy}>
            {busy
              ? mode === 'signup'
                ? 'Creating…'
                : 'Signing in…'
              : mode === 'signup'
                ? 'Create account'
                : 'Login'}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
        >
          {mode === 'signup'
            ? 'Already have an account? Login'
            : 'Need an account? Create one'}
        </button>
      </div>
    </div>
  );
}
