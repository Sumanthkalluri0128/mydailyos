import { useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";

const MEAL_OPTIONS = [["breakfast", "🌅 Breakfast"], ["lunch", "☀️ Lunch"], ["dinner", "🌙 Dinner"], ["snacks", "🍎 Snacks"]];

// "2 roti, dal, 1 cup rice" -> matched foods you can adjust, then logged in one go.
export default function TextLogger({ date, defaultMeal = "lunch", onLogged }) {
  const [text, setText] = useState("");
  const [meal, setMeal] = useState(defaultMeal);
  const [items, setItems] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [busy, setBusy] = useState(false);

  const parse = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/foods/parse", { method: "POST", body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not read that");
      setItems(data.items);
      setUnmatched(data.unmatched);
      if (!data.items.length) notify("No foods matched. Try simpler names, like \"roti, dal, rice\".", "info");
    } catch (e) {
      notify(navigator.onLine ? e.message : "Typing a meal needs a connection. Use search while offline.", "error");
    } finally { setBusy(false); }
  };

  const logAll = async () => {
    setBusy(true);
    try {
      for (const it of items) {
        await apiFetch("/api/food-logs", {
          method: "POST",
          body: JSON.stringify({ foodId: it.foodId, date, mealType: meal, quantity: Number(it.quantity) || 1, clientId: `txt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
        });
      }
      notify(`Logged ${items.length} item${items.length === 1 ? "" : "s"} to ${meal}.`, "success");
      setText(""); setItems(null); setUnmatched([]);
      onLogged?.();
    } catch {
      notify("Could not log everything. Please try again.", "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="large-card text-logger">
      <div className="section-header"><div><h2>✍️ Type what you ate</h2><p>e.g. “2 roti, dal, 1 cup rice, 100 g paneer”</p></div></div>
      <div className="text-logger-row">
        <input value={text} maxLength={600} placeholder="What did you eat?" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && parse()} aria-label="Describe your meal" />
        <select value={meal} onChange={(e) => setMeal(e.target.value)} aria-label="Meal">
          {MEAL_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button className="primary-button" disabled={busy || !text.trim()} onClick={parse}>Find foods</button>
      </div>
      {items && items.length > 0 && (
        <div className="text-logger-results">
          {items.map((it, i) => (
            <div className="text-logger-item" key={`${it.foodId}-${i}`}>
              <span>{it.foodName}{it.confidence === "medium" ? " ?" : ""}</span>
              <input type="number" min="0.01" step="any" value={it.quantity} aria-label={`Quantity of ${it.foodName}`}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
              <small>{it.servingUnit}</small>
              <button className="delete-log-button" aria-label={`Remove ${it.foodName}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {unmatched.length > 0 && <p className="card-description">Couldn't find: {unmatched.join(", ")} — add them with search below.</p>}
          <button className="primary-button" disabled={busy || !items.length} onClick={logAll}>Log {items.length} item{items.length === 1 ? "" : "s"}</button>
        </div>
      )}
      {items && items.length === 0 && unmatched.length > 0 && <p className="card-description">Nothing matched: {unmatched.join(", ")}.</p>}
    </div>
  );
}
