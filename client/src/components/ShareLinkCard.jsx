// Profile: optional accountability link. One private weekly summary page for ONE person you choose. You pick the fields.
// No public feed, no leaderboard. You can turn it off any time; a new link replaces the old one.
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import "./medicines.css";

const call = async (opts) => { const r = await apiFetch(`${API_URL}/api/share`, opts); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Something went wrong"); return j; };

export default function ShareLinkCard() {
  const [d, setD] = useState(null);
  const [label, setLabel] = useState("");
  const [fields, setFields] = useState(null);
  const [url, setUrl] = useState("");        // shown once, right after creating
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call().then((j) => { setD(j); setFields((f) => f || j.link?.fields || j.defaults); setLabel((l) => l || j.link?.label || ""); }).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const toggle = (id) => setFields((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const create = async () => {
    if (d.link && !(await confirmAction("The old link stops working and your person needs the new one.", { title: "Make a new link?", confirmText: "Make new link", danger: false }))) return;
    setBusy(true); try { const j = await call({ method: "POST", body: JSON.stringify({ label, fields }) }); setUrl(j.url); await load(); } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };
  const save = async () => { setBusy(true); try { await call({ method: "PUT", body: JSON.stringify({ label, fields }) }); notify("Saved. The same link now shows these fields.", "success"); await load(); } catch (e) { notify(e.message, "error"); } finally { setBusy(false); } };
  const revoke = async () => {
    if (!(await confirmAction("The link stops working straight away.", { title: "Turn off the link?", confirmText: "Turn off" }))) return;
    try { await call({ method: "DELETE" }); setUrl(""); setD({ ...d, link: null }); notify("Link turned off.", "success"); } catch (e) { notify(e.message, "error"); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); notify("Link copied.", "success"); } catch { notify("Select the link and copy it.", "info"); } };
  return (
    <section className="large-card md-card" aria-label="Accountability link">
      <h3>Share a weekly summary</h3>
      <p className="md-note">Optional. Make one private page for one person you trust, like a friend or coach. It shows only what you tick, for the last 7 days. It is not public, not in any feed, and not ranked. You can turn it off any time.</p>
      <div className="md-form">
        <label>Who is it for? (only you and the page header see this)<input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Asha" /></label>
        <fieldset><legend>What can they see?</legend>
          {d.fields.map((f) => <label key={f.id} className="cc-switch"><input type="checkbox" checked={!!fields?.includes(f.id)} onChange={() => toggle(f.id)} /> <span>{f.label}{f.health ? " (health number)" : ""}</span></label>)}
        </fieldset>
        <div className="md-actions">
          {d.link ? <><button type="button" className="primary-button" disabled={busy} onClick={save}>Save choices</button><button type="button" className="secondary-button" disabled={busy} onClick={create}>Make a new link</button><button type="button" className="secondary-button" onClick={revoke}>Turn off</button></>
            : <button type="button" className="primary-button" disabled={busy || !fields?.length} onClick={create}>Create private link</button>}
        </div>
      </div>
      {url && <div className="md-note" role="status"><b>Your link (shown once, copy it now):</b><br /><input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Private link" style={{ width: "100%" }} /> <button type="button" className="secondary-button" onClick={copy}>Copy</button></div>}
      {d.link && !url && <p className="md-sub">Link is on{d.link.label ? ` for ${d.link.label}` : ""}. Opened {d.link.views} time{d.link.views === 1 ? "" : "s"}{d.link.lastViewedAt ? `, last on ${new Date(d.link.lastViewedAt).toLocaleDateString()}` : ""}. For safety the address is only shown when you create it.</p>}
    </section>
  );
}
