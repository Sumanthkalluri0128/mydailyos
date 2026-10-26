// Medicine and supplement checklist (Health page). Private: it lives in your account, is part of the export and is deleted with the account.
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import { undoGate } from "../utils/undo";
import "./medicines.css";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const call = async (path, opts) => { const r = await apiFetch(`${API_URL}/api/meds${path}`, opts); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Something went wrong"); return j; };
export const NOTIFY_KEY = "ff-med-notify";

export default function Medicines() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);       // null = closed, object = add/edit
  const [busy, setBusy] = useState(false);
  const [bn, setBn] = useState(() => { try { return localStorage.getItem(NOTIFY_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted"; } catch { return false; } });
  const load = useCallback(() => call(`?date=${getLocalDate()}&now=${nowHm()}`).then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (it) => {
    try { setD(await call(`/${it.medId}/take`, { method: "POST", body: JSON.stringify({ date: getLocalDate(), time: it.time, taken: !it.taken, now: nowHm() }) })); window.dispatchEvent(new Event("ff:meds")); }
    catch (e) { notify(e.message, "error"); }
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = JSON.stringify({ ...form, times: form.times.filter(Boolean) });
      if (form._id) await call(`/${form._id}`, { method: "PUT", body }); else await call("", { method: "POST", body });
      setForm(null); await load(); window.dispatchEvent(new Event("ff:meds"));
    } catch (er) { notify(er.message, "error"); } finally { setBusy(false); }
  };
  const remove = async (m) => {
    const go = await undoGate({ what: m.name, hide: () => setD((cur) => cur && { ...cur, meds: cur.meds.filter((x) => x._id !== m._id), checklist: { ...cur.checklist, items: cur.checklist.items.filter((i) => i.medId !== m._id) } }), restore: () => load() });
    if (!go) return; try { await call(`/${m._id}`, { method: "DELETE" }); await load(); window.dispatchEvent(new Event("ff:meds")); } catch (e) { notify(e.message, "error"); }
  };
  const enableBrowser = async () => {
    if (typeof Notification === "undefined") { notify("This browser cannot show notifications.", "error"); return; }
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    const on = p === "granted"; setBn(on); try { localStorage.setItem(NOTIFY_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    window.dispatchEvent(new Event("ff:meds"));
    if (!on) notify("Notifications are blocked for this site.", "info");
  };
  const c = d?.checklist;
  return (
    <section className="large-card md-card" aria-label="Medicines and supplements">
      <div className="md-head"><h3>Medicines and supplements</h3><button type="button" className="secondary-button" onClick={() => setForm({ name: "", dose: "", kind: "medicine", times: ["08:00"], days: [], notes: "" })}>＋ Add</button></div>
      <p className="md-note" role="note">{d?.note || "This is a reminder tool, not medical advice. Follow what your doctor or pharmacist told you."}</p>
      {c && c.items.length > 0 && <ul className="md-list">{c.items.map((it) => (
        <li key={`${it.medId}-${it.time}`} className={it.taken ? "done" : it.state}>
          <label><input type="checkbox" checked={it.taken} onChange={() => toggle(it)} /> <span><b>{it.time}</b> · {it.name}{it.dose ? ` · ${it.dose}` : ""}</span></label>
          <small>{it.taken ? "Taken" : it.state === "due" ? "Not marked yet" : "Later"}</small>
        </li>))}</ul>}
      {c && c.items.length === 0 && <p className="md-note">{d.meds.length ? "Nothing scheduled today." : "Nothing here yet. Add what you take and when, and tick it off each day."}</p>}
      {c && c.total > 0 && <p className="md-sub">{c.taken} of {c.total} marked today</p>}
      {d?.meds?.length > 0 && <details className="md-manage"><summary>Manage</summary>
        <ul>{d.meds.map((m) => <li key={m._id}><span>{m.name}{m.dose ? ` · ${m.dose}` : ""} · {m.times.join(", ")}{m.days.length ? ` · ${m.days.map((x) => DAYS[x]).join("")}` : ""}</span>
          <span><button type="button" className="link-button" onClick={() => setForm({ ...m })}>Edit</button> <button type="button" className="link-button" onClick={() => remove(m)}>Delete</button></span></li>)}</ul>
        <label className="cc-switch"><input type="checkbox" checked={bn} onChange={enableBrowser} /> <span>Reminders in this browser while FlexFit is open (quiet hours 22:00 to 07:00 are respected)</span></label>
        <small>Phone reminders are in the mobile app.</small>
      </details>}
      {form && (
        <form className="md-form" onSubmit={save}>
          <label>Name<input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Dose (optional)<input value={form.dose} maxLength={40} onChange={(e) => setForm({ ...form, dose: e.target.value })} placeholder="e.g. 1 tablet" /></label>
          <label>Type<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="medicine">Medicine</option><option value="supplement">Supplement</option></select></label>
          <fieldset><legend>Times</legend>{form.times.map((t, i) => <input key={i} type="time" value={t} aria-label={`Time ${i + 1}`} onChange={(e) => setForm({ ...form, times: form.times.map((x, j) => (j === i ? e.target.value : x)) })} />)}
            {form.times.length < 6 && <button type="button" className="link-button" onClick={() => setForm({ ...form, times: [...form.times, "20:00"] })}>＋ time</button>}</fieldset>
          <fieldset><legend>Days (none selected = every day)</legend><div className="md-days">{DAYS.map((x, i) => <button key={i} type="button" aria-pressed={form.days.includes(i)} className={form.days.includes(i) ? "on" : ""} aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]} onClick={() => setForm({ ...form, days: form.days.includes(i) ? form.days.filter((y) => y !== i) : [...form.days, i] })}>{x}</button>)}</div></fieldset>
          <div className="md-actions"><button type="submit" className="primary-button" disabled={busy}>Save</button><button type="button" className="secondary-button" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
    </section>
  );
}
