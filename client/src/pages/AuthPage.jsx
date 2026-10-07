import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import '../auth/auth.css';
import ForgotPassword from './ForgotPassword';

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

export default function AuthPage({ onAuthenticated, notice = '' }) {

  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(notice);
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

      // A different person on this browser must not see the previous person's saved dashboard.
      localStorage.removeItem('mydailyos_dash_v1');
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

  if (mode === 'forgot') return <ForgotPassword onBack={() => switchMode('login')} />;

  return (
    <div className="auth-shell" data-mode={mode}>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">F</div>
          <div>
            <h1>FlexFit</h1>
            <p>Your daily operating system</p>
          </div>
        </div>

        <div className="auth-heading">
          <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
          <p>
            {mode === 'signup'
              ? 'One account works across web and mobile.'
              : 'Sign in to continue to FlexFit.'}
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

        {mode !== 'forgot' && (
          <button
            type="button"
            className="auth-google"
            onClick={() => { window.location.href = `${API_URL}/api/google/start?returnTo=${encodeURIComponent(`${window.location.origin}/`)}`; }}
          >
            Continue with Google
          </button>
        )}

        <p className="auth-hint">Already have an account? Google sign-in with the same email opens that same account and all its data.</p>

        {mode === 'login' && (
          <button type="button" className="auth-switch" onClick={() => switchMode('forgot')}>
            Forgot password?
          </button>
        )}

        <button
          type="button"
          className="auth-switch"
          onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
        >
          {mode === 'signup'
            ? 'Already have an account? Login'
            : 'Need an account? Create one'}
        </button>

        <p className="auth-legal">
          By continuing you agree to how we handle your data in our{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
