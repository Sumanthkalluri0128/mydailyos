import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../config/api";

// Search foods (catalogue + mine) and choose an amount. Calls onPick(food, quantityInFoodUnit).
export default function FoodPicker({ onPick, onCancel, actionLabel = "Add", initialQuery = "" }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [food, setFood] = useState(null);
  const [qty, setQty] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      const id = ++seq.current; // ignore answers that arrive after a newer search
      apiFetch(`/api/foods?search=${encodeURIComponent(q.trim())}&limit=12`)
        .then((r) => r.json()).then((d) => d.success && id === seq.current && setResults(d.foods)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (f) => { setFood(f); setQty(String(f.servingSize)); };

  if (food) {
    const units = [{ label: food.servingUnit, quantity: 1 }, ...(food.units || []).map((u) => ({ label: u.label, quantity: u.quantity }))];
    return (
      <div className="food-picker">
        <strong>{food.name}</strong>
        <div className="food-picker-row">
          <input type="number" min="0.01" step="any" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Amount" />
          <span>{food.servingUnit}</span>
          {units.length > 1 && (
            <select value="" aria-label="Use a household measure" onChange={(e) => e.target.value && setQty(String(e.target.value))}>
              <option value="">or pick a measure…</option>
              {units.slice(1).map((u) => <option key={u.label} value={u.quantity}>1 {u.label} = {u.quantity} {food.servingUnit}</option>)}
            </select>
          )}
        </div>
        <div className="food-picker-row">
          <button className="primary-button" disabled={!(Number(qty) > 0)} onClick={() => onPick(food, Number(qty))}>{actionLabel}</button>
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
