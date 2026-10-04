import { useEffect, useState } from "react";
import { API_URL } from "../config";
import "../auth/auth.css";

async function post(path, body) {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

// Two steps: ask for an emailed one-time code, then enter it with a new password.
export default function ForgotPassword({ onBack }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return undefined; const t = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  async function run(fn) {
    setError(""); setBusy(true);
    try { await fn(); } catch (e) { setError(e.message || "Something went wrong"); } finally { setBusy(false); }
  }

  const sendCode = (event) => {
    event?.preventDefault();
    run(async () => {
      await post("/api/auth/forgot", { email });
      setStep("code"); setCooldown(30);
      setMessage("If that email is registered, we sent an 8-character code. It expires in 30 minutes. Check your spam folder too.");
    });
  };
  const reset = (event) => {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    run(async () => { await post("/api/auth/reset", { email, code, newPassword: password }); setMessage("Password updated. You can sign in now."); setStep("done"); });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand"><div className="auth-logo">F</div><div><h1>FlexFit</h1><p>Your daily operating system</p></div></div>
        <div className="auth-heading"><h2>Reset password</h2><p>{step === "email" ? "We'll email you a one-time code." : step === "code" ? `Enter the code sent to ${email}.` : "All done."}</p></div>

        {message && <p className="auth-success" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}

        {step === "email" && (
          <form onSubmit={sendCode}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            <button type="submit" disabled={busy}>{busy ? "Please wait…" : "Send code"}</button>
          </form>
        )}
        {step === "code" && (
          <form onSubmit={reset}>
            <label>Code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="one-time-code" placeholder="ABCD2345" required /></label>
            <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <button type="submit" disabled={busy}>{busy ? "Please wait…" : "Update password"}</button>
          </form>
        )}
        {step === "code" && (
          <button type="button" className="auth-switch" disabled={busy || cooldown > 0} onClick={() => sendCode()}>
            {cooldown > 0 ? `Didn't get it? Resend in ${cooldown}s` : "Didn't get it? Send a new code"}
          </button>
        )}
        <button type="button" className="auth-switch" onClick={onBack}>{step === "done" ? "Go to sign in" : "Back to sign in"}</button>
      </div>
    </div>
  );
}
