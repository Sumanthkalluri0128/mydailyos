import { useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";

const MEALS = [["breakfast", "🌅 Breakfast"], ["lunch", "☀️ Lunch"], ["dinner", "🌙 Dinner"], ["snacks", "🍎 Snacks"]];

// Restaurant / party / "no idea exactly": log an estimate, optionally as a range. The midpoint counts; the range is kept in the note.
export default function EatingOut({ date, defaultMeal = "dinner", onLogged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [meal, setMeal] = useState(defaultMeal);
  const [busy, setBusy] = useState(false);

  const lo = Number(low), hi = Number(high);
  const mid = lo > 0 && hi >= lo ? Math.round((lo + hi) / 2) : lo > 0 && !hi ? lo : 0;
  const valid = name.trim() && mid > 0;

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/food-logs/quick", {
        method: "POST",
        body: JSON.stringify({ date, mealType: meal, name: name.trim(), calories: mid, caloriesLow: hi ? lo : 0, caloriesHigh: hi || 0, clientId: `eo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Could not log that");
      notify(`Logged ~${mid} kcal to ${meal}.`, "success");
      setName(""); setLow(""); setHigh(""); setOpen(false);
      onLogged?.();
    } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };

  if (!open) return <button className="secondary-button eating-out-toggle" onClick={() => setOpen(true)}>🍽️ Eating out? Log an estimate</button>;
  return (
    <div className="large-card text-logger">
      <div className="section-header"><div><h2>🍽️ Eating out</h2><p>No exact numbers? Enter a guess — or a range, and we'll log the middle.</p></div>
        <button className="link-button" onClick={() => setOpen(false)}>Close</button></div>
      <div className="text-logger-row eating-out-row">
        <input placeholder="What was it? (e.g. Biryani at Paradise)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="What did you eat" />
        <input type="number" min="0" placeholder="kcal (low)" value={low} onChange={(e) => setLow(e.target.value)} aria-label="Calories, low estimate" />
        <input type="number" min="0" placeholder="kcal (high, optional)" value={high} onChange={(e) => setHigh(e.target.value)} aria-label="Calories, high estimate" />
        <select value={meal} onChange={(e) => setMeal(e.target.value)} aria-label="Meal">{MEALS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
      </div>
      {mid > 0 && <p className="card-description">Will log about <strong>{mid} kcal</strong>{hi ? ` (range ${lo}–${hi})` : ""}. Tip: restaurant portions are usually bigger than home portions — lean toward the higher number when unsure.</p>}
      <button className="primary-button" disabled={busy || !valid} onClick={save}>Log estimate</button>
    </div>
  );
}
