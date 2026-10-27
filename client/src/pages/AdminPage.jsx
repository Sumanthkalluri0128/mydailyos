import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";

// Admin only, deliberately plain: numbers and a flags editor. Open it with #admin in the address. Everyone else gets "Admins only" from the server.
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");
const secs = (ms) => (ms == null ? "n/a" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const EMPTY = { key: "", enabled: false, percent: 0, allow: "", deny: "", description: "" };

export default function AdminPage({ onBack }) {
  const [h, setH] = useState(null);
  const [flags, setFlags] = useState([]);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/health");
      if (r.status === 403) { setErr("Admins only."); return; }
      const d = await r.json(); if (!r.ok) throw new Error(d.message || "Could not load");
      setH(d); setErr("");
      const f = await (await apiFetch("/api/admin/flags")).json(); setFlags(f.flags || []);
    } catch (e) { setErr(e.message || "Could not load"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveFlag = async (f) => {
    const body = { ...f, allow: Array.isArray(f.allow) ? f.allow : String(f.allow).split(/[\s,]+/).filter(Boolean), deny: Array.isArray(f.deny) ? f.deny : String(f.deny).split(/[\s,]+/).filter(Boolean) };
    const r = await apiFetch(`/api/admin/flags/${encodeURIComponent(f.key)}`, { method: "PUT", body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return notify(d.message || "Could not save the flag", "error");
    notify("Flag saved", "success"); setDraft(EMPTY); load();
  };
  const removeFlag = async (key) => { await apiFetch(`/api/admin/flags/${encodeURIComponent(key)}`, { method: "DELETE" }); load(); };

  if (err) return <div className="account-form"><button className="secondary-button" onClick={onBack}>Back</button><p>{err}</p></div>;
  if (!h) return <div className="account-form"><p>Loading…</p></div>;
  const ka = h.keepAlive;
  return (
    <div className="account-form" style={{ maxWidth: 820 }}>
      <button className="secondary-button" onClick={onBack}>Back</button>
      <h2>Server health</h2>
      <p>Version {h.version} · database {h.db} · up {Math.round(h.uptimeSec / 60)} min · <button className="secondary-button" onClick={load}>Refresh</button></p>

      <h3>Cold starts</h3>
      <p>Last start: listening after {secs(h.bootNow?.listenMs)}, database after {secs(h.bootNow?.dbMs)} ({when(h.bootNow?.at)}).</p>
      <p>Waits reported by the apps ({h.wake.samples} samples): typical {secs(h.wake.p50)}, slowest 1 in 20 {secs(h.wake.p95)}, worst {secs(h.wake.max)}.</p>

      <h3>Keep-alive: {ka.status === "ok" ? "OK" : "quiet"}</h3>
      <p>{ka.note}</p>
      <ul>
        <li>Server self-ping: last {when(ka.self.last)}, {ka.self.count24h} in 24 h</li>
        <li>GitHub workflow: last {when(ka.github.last)}, {ka.github.count24h} in 24 h</li>
        <li>Other (monitors, browsers): last {when(ka.other.last)}, {ka.other.count24h} in 24 h</li>
      </ul>

      <h3>Counts per day</h3>
      <table style={{ width: "100%", textAlign: "left" }}>
        <thead><tr><th>Day (UTC)</th><th>Server errors</th><th>Failed syncs</th><th>Dropped offline writes</th><th>Wake reports</th></tr></thead>
        <tbody>{h.days.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.errors5xx}</td><td>{d.syncFailed}</td><td>{d.writesDropped}</td><td>{d.wakeReports}</td></tr>)}</tbody>
      </table>
      <p style={{ fontSize: 12 }}>A "dropped" write is one the server refused for good (for example a bad value), so it was removed from the phone's waiting list.</p>

      <h3>Latest server errors</h3>
      {h.recentErrors.length ? <ul>{h.recentErrors.map((e, i) => <li key={i}>{when(e.at)} · {e.method} {e.path} · {e.message}</li>)}</ul> : <p>None recorded.</p>}

      <h3>Feature flags</h3>
      <p style={{ fontSize: 12 }}>Off by default. A person gets a feature when the flag is on AND (they are on the allow list, or their share of the percentage covers them). The deny list always wins. Apps keep the answer for 6 hours.</p>
      <table style={{ width: "100%", textAlign: "left" }}>
        <thead><tr><th>Key</th><th>On</th><th>%</th><th>Allow</th><th>Deny</th><th /></tr></thead>
        <tbody>{flags.map((f) => (
          <tr key={f.key}>
            <td title={f.description}>{f.key}</td><td>{f.enabled ? "yes" : "no"}</td><td>{f.percent}</td><td>{f.allow.join(", ")}</td><td>{f.deny.join(", ")}</td>
            <td><button className="secondary-button" onClick={() => setDraft({ ...f, allow: f.allow.join(", "), deny: f.deny.join(", ") })}>Edit</button> <button className="secondary-button" onClick={() => removeFlag(f.key)}>Delete</button></td>
          </tr>))}</tbody>
      </table>
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        <input placeholder="key, e.g. new-chart" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} aria-label="Flag key" />
        <input placeholder="what it is for" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Description" />
        <label><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> On</label>
        <label>Percent of people <input type="number" min="0" max="100" value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: e.target.value })} /></label>
        <input placeholder="allow list: emails or ids, comma separated" value={draft.allow} onChange={(e) => setDraft({ ...draft, allow: e.target.value })} aria-label="Allow list" />
        <input placeholder="deny list" value={draft.deny} onChange={(e) => setDraft({ ...draft, deny: e.target.value })} aria-label="Deny list" />
        <button className="secondary-button" disabled={!draft.key} onClick={() => saveFlag(draft)}>Save flag</button>
      </div>
    </div>
  );
}
