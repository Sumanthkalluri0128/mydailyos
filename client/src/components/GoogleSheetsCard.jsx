import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";

/** Profile card: link a Google account and keep a "FlexFit data" Google Sheet in the person's own Drive. */
export default function GoogleSheetsCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/google/status");
      if (res.ok) setStatus(await res.json());
    } catch { /* offline — keep the last known status */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/google/connect-url", { method: "POST", body: JSON.stringify({ returnTo: `${window.location.origin}/` }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not start Google connection");
      window.location.href = data.url; // Google consent, then back here with #google=ok
    } catch (e) { notify(e.message, "error"); setBusy(false); }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/google/sync", { method: "POST", body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Sync failed");
      notify("Your Google Sheet is up to date.", "success");
    } catch (e) { notify(e.message, "error"); }
    await load(); setBusy(false);
  }

  async function disconnect() {
    if (!window.confirm("Stop updating your Google Sheet? The sheet and its data stay in your Google Drive.")) return;
    setBusy(true);
    try { await apiFetch("/api/google/disconnect", { method: "POST", body: "{}" }); } catch { /* ignore */ }
    await load(); setBusy(false);
  }

  return (
    <div className="card">
      <h2>Google Sheets backup</h2>
      {!status ? <p className="muted">Checking…</p> : !status.available ? (
        <p className="muted">Not set up on the server yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
      ) : status.connected ? (
        <>
          <p className="muted">
            Every entry is copied to a “FlexFit data” sheet in {status.email || "your Google account"}.{" "}
            {status.lastSyncAt ? `Last synced ${new Date(status.lastSyncAt).toLocaleString()}.` : "First sync in progress…"}
          </p>
          {status.lastSyncError && <p style={{ color: "var(--danger)" }}>{status.needsReconnect ? "Google access expired — reconnect. " : ""}{status.lastSyncError}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {status.spreadsheetUrl && <a className="btn" href={status.spreadsheetUrl} target="_blank" rel="noreferrer">Open sheet</a>}
            <button type="button" disabled={busy} onClick={status.needsReconnect ? connect : syncNow}>{busy ? "Working…" : status.needsReconnect ? "Reconnect" : "Sync now"}</button>
            <button type="button" disabled={busy} onClick={disconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Keep a copy of your food, water, weight, workouts, tasks and habits in a Google Sheet in your own Google account. FlexFit can only see the one sheet it creates.</p>
          <button type="button" disabled={busy} onClick={connect}>{busy ? "Working…" : "Connect Google"}</button>
        </>
      )}
    </div>
  );
}
