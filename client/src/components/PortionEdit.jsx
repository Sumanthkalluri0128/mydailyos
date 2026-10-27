// Change how much you ate (or plan to eat) of one food. Type an amount, or tap a quick multiplier.
// Shows the new calories as you type, so nobody has to do the maths. The caller saves it (food log or planner).
import { useEffect, useRef, useState } from "react";
import "./portionedit.css";

const FACTORS = [[0.5, "½"], [0.75, "¾"], [1.25, "1¼"], [1.5, "1½"], [2, "2×"]];
const round = (n) => Math.round(n * 100) / 100;

export default function PortionEdit({ name, quantity, unit, calories = 0, protein = 0, onSave, onCancel, busy = false }) {
  const start = Number(quantity) > 0 ? Number(quantity) : 1;
  const [val, setVal] = useState(String(round(start)));
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const q = Number(val);
  const valid = q > 0 && q <= 100000;
  const k = start > 0 ? q / start : 1;                       // nutrition scales in a straight line with the amount
  const kcal = valid ? Math.round(Number(calories) * k) : 0;
  const prot = valid ? Math.round(Number(protein) * k * 10) / 10 : 0;
  const changed = valid && Math.abs(q - start) > 0.0001;
  const submit = (e) => { e.preventDefault(); if (valid && changed && !busy) onSave(round(q)); };

  return (
    <form className="pe" onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }} aria-label={`Change the amount of ${name}`}>
      <div className="pe-row">
        <label className="pe-field">
          <span>Amount</span>
          <input ref={ref} type="number" inputMode="decimal" min="0.01" step="any" value={val} onChange={(e) => setVal(e.target.value)} aria-label={`Amount of ${name} in ${unit}`} />
          <em>{unit}</em>
        </label>
        <div className="pe-quick" role="group" aria-label="Quick amounts">
          {FACTORS.map(([f, label]) => <button key={f} type="button" onClick={() => setVal(String(round(start * f)))} aria-label={`${label} of the original amount`}>{label}</button>)}
        </div>
      </div>
      <p className="pe-now" aria-live="polite">{valid ? <>{kcal} kcal · {prot} g protein{changed ? <small> (was {Math.round(Number(calories))} kcal)</small> : null}</> : "Enter an amount above 0."}</p>
      <div className="pe-acts">
        <button type="submit" className="pe-save" disabled={!valid || !changed || busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="pe-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
