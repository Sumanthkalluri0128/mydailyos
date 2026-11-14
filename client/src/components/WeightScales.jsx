import { useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";

const sign = (n) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

/** One-line explanation of how a scale is calibrated. */
export function offsetNote(s, ref) {
  if (!ref || s.id === ref.id) return "Main scale: every other scale is matched to this one.";
  if (s.mode === "manual") return `Set by you: reads ${sign(s.offsetKg)} kg vs ${ref.name}.`;
  if (s.learnedKg == null) return `Not matched yet. Weigh on this scale and on ${ref.name} the same day, or enter the difference by hand.`;
  return `Reads ${sign(s.offsetKg)} kg vs ${ref.name} (learned from ${s.samples} same-day ${s.samples === 1 ? "pair" : "pairs"}).`;
}

async function call(path, method, body) {
  const res = await apiFetch(`${API_URL}/api/weight${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || data.error || "Something went wrong.");
  return data;
}

/** Add / rename / calibrate / delete scales. `onChanged()` reloads the weigh-ins and the profile (every number is recalibrated). */
export default function WeightScales({ scales, referenceId, onChanged, onPick }) {
  const ref = scales.find((s) => s.id === referenceId) || scales[0];
  const [name, setName] = useState("");
  const [diff, setDiff] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null); // scale id being edited
  const [draft, setDraft] = useState({ name: "", offset: "" });

  const run = async (fn, done) => {
    try { setBusy(true); const d = await fn(); if (done) notify(done, "success"); await onChanged(); return d; }
    catch (e) { notify(e.message, "error"); return null; }
    finally { setBusy(false); }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const body = { name: name.trim() };
    if (diff !== "") body.offsetKg = Number(diff);
    const d = await run(() => call("/scales", "POST", body), `Added ${name.trim()}`);
    if (d) { setName(""); setDiff(""); onPick && onPick(d.scale.id); }
  };

  const startEdit = (s) => { setEdit(s.id); setDraft({ name: s.name, offset: s.mode === "manual" || s.learnedKg == null ? String(s.offsetKg) : "" }); };
  const save = (s) => run(async () => {
    const body = { name: draft.name };
    if (s.id !== referenceId && draft.offset !== "") body.offsetKg = Number(draft.offset);
    await call(`/scales/${encodeURIComponent(s.id)}`, "PATCH", body); setEdit(null);
  }, "Saved");
  const auto = (s) => run(() => call(`/scales/${encodeURIComponent(s.id)}`, "PATCH", { mode: "auto" }), "Using the learned difference");
  const makeMain = async (s) => { if (await confirmAction("Nothing is deleted. Every weight is shown in this scale's terms from now on.", { title: `Make ${s.name} your main scale?`, confirmText: "Make main", danger: false })) run(() => call(`/scales/${encodeURIComponent(s.id)}/reference`, "POST"), `${s.name} is now your main scale`); };
  const remove = async (s) => { if (await confirmAction(`Its weigh-ins are kept: they move to ${ref.name}, adjusted so your trend does not change.`, { title: `Delete ${s.name}?`, confirmText: "Delete" })) run(() => call(`/scales/${encodeURIComponent(s.id)}`, "DELETE"), `Deleted ${s.name}`); };

  return (
    <section className="wt-scales">
      <h2>My scales</h2>
      <p className="wt-scales-hint">Different scales read differently. Name each one and pick it when you log. Charts, trends and your calorie plan use the weight adjusted to <b>{ref.name}</b>, so switching scales never looks like gaining or losing.</p>
      <ul>
        {scales.map((s) => (
          <li key={s.id}>
            {edit === s.id ? (
              <div className="wt-scale-edit">
                <input value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Scale name" />
                {s.id !== referenceId && <label>Reads <input type="number" step="0.1" inputMode="decimal" value={draft.offset} placeholder="auto" onChange={(e) => setDraft({ ...draft, offset: e.target.value })} aria-label="Difference in kg" /> kg vs {ref.name}</label>}
                <div className="wt-scale-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => save(s)}>Save</button><button type="button" className="secondary-button" onClick={() => setEdit(null)}>Cancel</button></div>
              </div>
            ) : (
              <>
                <div><b>{s.name}{s.id === referenceId && <em className="wt-chip up">main</em>}</b><small>{offsetNote(s, ref)}{s.entries ? ` · ${s.entries} weigh-in${s.entries === 1 ? "" : "s"}` : ""}</small></div>
                <div className="wt-scale-actions">
                  <button type="button" className="secondary-button" onClick={() => startEdit(s)}>Edit</button>
                  {s.id !== referenceId && s.mode === "manual" && s.learnedKg != null && <button type="button" className="secondary-button" disabled={busy} onClick={() => auto(s)} title={`Use the learned ${sign(s.learnedKg)} kg`}>Use learned</button>}
                  {s.id !== referenceId && <button type="button" className="secondary-button" disabled={busy} onClick={() => makeMain(s)}>Make main</button>}
                  {s.id !== referenceId && <button type="button" className="delete-log-button" disabled={busy} onClick={() => remove(s)} aria-label={`Delete ${s.name}`}>✕</button>}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="wt-scale-add" onSubmit={add}>
        <input value={name} maxLength={40} placeholder="New scale, e.g. Gym scale" onChange={(e) => setName(e.target.value)} aria-label="New scale name" />
        <input type="number" step="0.1" inputMode="decimal" value={diff} placeholder={`vs ${ref.name} (kg, optional)`} onChange={(e) => setDiff(e.target.value)} aria-label="Difference in kg, optional" />
        <button type="submit" className="primary-button" disabled={busy || !name.trim()}>Add scale</button>
      </form>
    </section>
  );
}
