// Correct a quick-add estimate (an "eating out" guess, a protein check-in, a chai count): its name and its calories / protein / carbs / fat.
// A quick-add has no real food behind it, so the portion editor ("how much of it") means nothing here. The caller saves it and offers Undo.
// What is checked and what is sent comes from utils/quickEdit.js (shared with the phone): only the boxes that changed are sent.
import { useEffect, useRef, useState } from "react";
import "./portionedit.css";
import "./quickcorrect.css";
import { quickEditRequest, quickFormStart } from "../utils/quickEdit";

export default function QuickCorrect({ entry, onSave, onCancel, busy = false }) {
  const [form, setForm] = useState(() => quickFormStart(entry));
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const req = quickEditRequest(entry, form);
  const canSave = req.ok && req.changed && !busy;
  const was = Math.round(Number(entry.nutritionTotal?.calories) || 0);
  const submit = (e) => { e.preventDefault(); if (canSave) onSave(req.body); };
  const num = (key, label, unit, inputRef) => (
    <label className="pe-field qc-num">
      <span>{label}</span>
      <input ref={inputRef} type="text" inputMode="decimal" value={form[key]} onChange={set(key)} aria-label={`${label} of ${entry.foodName}${unit === "kcal" ? " in kcal" : " in grams"}`} />
      <em>{unit}</em>
    </label>
  );

  return (
    <form className="pe qc" onSubmit={submit} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }} aria-label={`Correct the estimate of ${entry.foodName}`}>
      <p className="qc-hint">This is an estimate, so you can fix what it says.</p>
      <label className="pe-field qc-name">
        <span>Name</span>
        <input type="text" value={form.name} maxLength={80} onChange={set("name")} aria-label="Name" />
      </label>
      <div className="pe-row qc-nums">
        {num("calories", "Calories", "kcal", ref)}
        {num("protein", "Protein", "g")}
        {num("carbs", "Carbs", "g")}
        {num("fat", "Fat", "g")}
      </div>
      <p className="pe-now" aria-live="polite" role={req.ok ? undefined : "alert"}>
        {req.ok
          ? <>{Math.round(Number(String(form.calories).replace(",", ".")))} kcal{req.changed && req.body.calories !== undefined ? <small> (was {was} kcal)</small> : null}</>
          : req.error}
      </p>
      <div className="pe-acts">
        <button type="submit" className="pe-save" disabled={!canSave}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="pe-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
