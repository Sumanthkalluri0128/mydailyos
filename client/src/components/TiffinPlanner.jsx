import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import "./logging2.css";

const addDay = (d, n) => { const t = new Date(`${d}T00:00:00`); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

// Plan tomorrow's lunch tonight: canteen favourites and recent lunches are one tap. Goes into the planner like any planned food.
export default function TiffinPlanner() {
  const today = getLocalDate();
  const tomorrow = addDay(today, 1);
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null); // new canteen favourite
  const load = () => apiFetch(`${API_URL}/api/tiffin?date=${tomorrow}`).then((r) => r.json()).then((j) => j.success && setD(j)).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = async (f) => {
    const r = await apiFetch(`${API_URL}/api/meal-plans`, { method: "POST", body: JSON.stringify({ date: tomorrow, mealType: "lunch", foodId: f._id, quantity: f.servingSize || 1, today, clientId: `tf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.message || "Could not plan that.", "error");
    notify(`${f.name} planned for tomorrow's lunch.`, "success"); load();
  };
  const unplan = async (it) => { await apiFetch(`${API_URL}/api/meal-plans/${it._id}`, { method: "DELETE" }); load(); };
  const saveFav = async () => {
    const r = await apiFetch(`${API_URL}/api/tiffin/favorites`, { method: "POST", body: JSON.stringify({ name: form.name, calories: Number(form.calories), protein: form.protein === "" ? undefined : Number(form.protein) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.message || "Could not save it.", "error");
    setForm(null); load();
  };
  const dropFav = async (f) => { await apiFetch(`${API_URL}/api/tiffin/favorites/${f._id}`, { method: "DELETE" }); load(); };
  if (!d) return null;
  const evening = new Date().getHours() >= 17;
  return (
    <div className="large-card tiffin-card">
      <div className="section-header"><div><h2>🍱 Tomorrow's lunch</h2><p>{evening ? "Tonight is a good time to sort tomorrow's lunch." : "Plan it ahead so lunch is one less decision."}</p></div></div>
      {d.planned.length > 0 && d.planned.map((it) => <div key={it._id} className="cook-item"><span><strong>{it.foodName}</strong><small>{Math.round(it.calories)} kcal · {Math.round(it.protein)} g protein</small></span><button className="delete-log-button" aria-label={`Remove ${it.foodName}`} onClick={() => unplan(it)}>✕</button></div>)}
      {!d.planned.length && <p className="card-description">Nothing planned yet. Pick a favourite:</p>}
      <div className="pantry-chips">
        {d.favourites.map((f) => <span key={f._id} className="repeat-row"><button className="chip" onClick={() => plan(f)}>⭐ {f.name} · {Math.round(f.calories)} kcal</button><button className="delete-log-button" aria-label={`Remove favourite ${f.name}`} onClick={() => dropFav(f)}>✕</button></span>)}
        {d.recent.map((f) => <button key={f._id} className="chip" onClick={() => plan(f)}>{f.name} · {Math.round(f.calories)} kcal</button>)}
      </div>
      {form ? (
        <div className="repeat-row">
          <input placeholder="Canteen dish, e.g. Rajma chawal" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Dish name" />
          <input type="number" min="1" placeholder="kcal" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} aria-label="Calories" />
          <input type="number" min="0" placeholder="protein g (optional)" value={form.protein} onChange={(e) => setForm({ ...form, protein: e.target.value })} aria-label="Protein" />
          <button className="primary-button" disabled={!form.name.trim() || !(Number(form.calories) > 0)} onClick={saveFav}>Save favourite</button>
          <button className="secondary-button" onClick={() => setForm(null)}>Cancel</button>
        </div>
      ) : <button className="secondary-button" onClick={() => setForm({ name: "", calories: "", protein: "" })}>＋ Save a canteen favourite</button>}
      <small>Your own numbers: we never guess what a canteen dish contains. On the phone app, an evening reminder can be switched on under Reminders; it follows your quiet hours and daily limit.</small>
    </div>
  );
}
