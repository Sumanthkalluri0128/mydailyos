import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../config/api";
import { recordPortion, usualPortion } from "../utils/portionPresets";

// Search foods (catalogue + mine) and choose an amount. Calls onPick(food, quantityInFoodUnit).
export default function FoodPicker({ onPick, onCancel, actionLabel = "Add", initialQuery = "" }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [food, setFood] = useState(null);
  const [qty, setQty] = useState("");
  const [servings, setServings] = useState(1);
  const [usual, setUsual] = useState(null); // what you usually have of this food (after two uses)
  const seq = useRef(0);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      const id = ++seq.current; // ignore answers that arrive after a newer search
      apiFetch(`/api/foods?search=${encodeURIComponent(q.trim())}&limit=12`)
        .then((r) => r.json()).then((d) => d.success && id === seq.current && setResults(d.foods)).catch(() => {});
    }, 110);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (f) => {
    setFood(f); setQty(String(f.servingSize)); setServings(1); setUsual(null);
    Promise.resolve(usualPortion(f._id, f.name)).then((u) => { if (u && f.servingSize > 0) { setUsual(u); setQty(String(u)); setServings(Math.min(20, Math.max(0.5, Math.round((u / f.servingSize) * 2) / 2))); } }).catch(() => {});
  };
  const clamp = (n) => Math.min(20, Math.max(0.5, Math.round(n * 2) / 2));
  const setBy = (n) => { setServings(n); setQty(String(Math.round(n * (food.servingSize || 1) * 100) / 100)); };
  const typed = (v) => { setQty(v); const n = Number(v); if (n > 0 && food.servingSize > 0) setServings(clamp(n / food.servingSize)); };

  if (food) {
    const units = [{ label: food.servingUnit, quantity: 1 }, ...(food.units || []).map((u) => ({ label: u.label, quantity: u.quantity }))];
    return (
      <div className="food-picker">
        <strong>{food.name}</strong>
        <div className="food-picker-row servings-row" role="group" aria-label="Servings">
          <button type="button" className="servings-btn" aria-label="Fewer servings" disabled={servings <= 0.5} onClick={() => setBy(clamp(servings - 0.5))}>−</button>
          <b aria-live="polite" className="servings-val">{servings} serving{servings === 1 ? "" : "s"}</b>
          <button type="button" className="servings-btn" aria-label="More servings" disabled={servings >= 20} onClick={() => setBy(clamp(servings + 0.5))}>+</button>
          <small>1 serving = {food.servingSize} {food.servingUnit} · about {Math.round(food.calories * servings)} kcal{usual ? ` · starts at your usual ${usual} ${food.servingUnit}` : ""}</small>
        </div>
        <div className="food-picker-row">
          <input type="number" min="0.01" step="any" value={qty} onChange={(e) => typed(e.target.value)} aria-label="Amount" />
          <span>{food.servingUnit}</span>
          {units.length > 1 && (
            <select value="" aria-label="Use a household measure" onChange={(e) => e.target.value && typed(String(e.target.value))}>
              <option value="">or pick a measure…</option>
              {units.slice(1).map((u) => <option key={u.label} value={u.quantity}>1 {u.label} = {u.quantity} {food.servingUnit}</option>)}
            </select>
          )}
        </div>
        <div className="food-picker-row">
          <button className="primary-button" disabled={!(Number(qty) > 0)} onClick={() => { recordPortion(food._id, food.name, Number(qty)); onPick(food, Number(qty)); }}>{actionLabel}</button>
          <button className="secondary-button" onClick={() => setFood(null)}>Back</button>
        </div>
      </div>
    );
  }
  return (
    <div className="food-picker">
      <input autoFocus placeholder="Search foods…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search foods" />
      <div className="food-picker-results">
        {results.map((f) => (
          <button key={f._id} className="suggestion-chip" onClick={() => choose(f)}>
            <strong>{f.name}</strong><small>{f.servingSize} {f.servingUnit} · {Math.round(f.calories)} kcal</small>
          </button>
        ))}
        {q.trim() && !results.length && <small>No matches yet.</small>}
      </div>
      {onCancel && <button className="secondary-button" onClick={onCancel}>Cancel</button>}
    </div>
  );
}
