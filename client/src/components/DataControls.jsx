import { useState } from "react";
import { apiFetch, clearSession } from "../config/api";
import { confirmAction } from "../utils/confirm";
import { notify } from "../utils/notify";
import "../auth/account.css";

async function download(format) {
  const res = await apiFetch(`/api/account/export?format=${format}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flexfit-export-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// "Your data": CSV/JSON export, change password, delete account.
export default function DataControls() {
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { notify(e.message || "Something went wrong", "error"); } finally { setBusy(false); }
  };

  const changePassword = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await apiFetch("/api/account/change-password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setCurrent(""); setNext("");
      notify("Password updated", "success");
    });
  };

  const logout = async () => {
    const ok = await confirmAction("You will need to sign in again to use FlexFit on this device.", { title: "Log out?", confirmText: "Log out" });
    if (!ok) return;
    clearSession();
    window.location.reload();
  };

  const deleteAccount = () =>
    run(async () => {
      const ok = await confirmAction("Permanently delete your FlexFit account and all your data? This cannot be undone.", { title: "Delete account?", confirmText: "Delete account" });
      if (!ok) return;
      const res = await apiFetch("/api/account/me", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Delete failed");
      clearSession();
      window.location.reload();
    });

  return (
    <div className="profile-form data-controls">
      <h2>Your data</h2>
      <p className="card-description">Download everything you've logged, or remove your account completely.</p>
      <div className="data-actions">
        <button className="secondary-button" disabled={busy} onClick={() => run(() => download("csv"))}>⬇ Export CSV</button>
        <button className="secondary-button" disabled={busy} onClick={() => run(() => download("json"))}>⬇ Export JSON</button>
      </div>

      <form onSubmit={changePassword} className="password-form">
        <h3>Change password</h3>
        <input type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" placeholder="New password (min 8 characters)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <button className="primary-button" disabled={busy || !current || next.length < 8}>Update password</button>
      </form>

      <div className="session-box">
        <h3>Session</h3>
        <p className="card-description">Sign out of FlexFit on this device. Your data stays safe in your account.</p>
        <button type="button" className="secondary-button" disabled={busy} onClick={logout}>Log out</button>
      </div>

      <div className="danger-box">
        <h3>Danger zone</h3>
        <p>Delete this account and all personal logs permanently.</p>
        <button className="danger-button" disabled={busy} onClick={deleteAccount}>Delete account</button>
      </div>
    </div>
  );
}
