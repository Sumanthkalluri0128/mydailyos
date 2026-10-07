import { useEffect, useMemo, useState } from "react";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import FoodPicker from "../components/FoodPicker";

const KEYS = ["calories", "protein", "carbohydrates", "fat", "fiber"];
const blank = { name: "", servings: 4, notes: "", ingredients: [] };

export default function RecipesPage({ onBack }) {
  const [recipes, setRecipes] = useState([]);
  const [editing, setEditing] = useState(null); // recipe being built or edited (null = list)
  const [foodMap, setFoodMap] = useState({});
  const [picking, setPicking] = useState(false);

  const load = () => apiFetch("/api/recipes").then((r) => r.json()).then((d) => d.success && setRecipes(d.recipes)).catch(() => notify("Could not load recipes.", "error"));
  useEffect(() => { load(); }, []);

  // live per-serving preview while building
  const preview = useMemo(() => {
    if (!editing) return null;
    const sum = Object.fromEntries(KEYS.map((k) => [k, 0]));
    for (const ing of editing.ingredients) {
      const f = foodMap[ing.foodId];
      if (!f) continue;
      const s = ing.quantity / (f.servingSize || 1);
      for (const k of KEYS) sum[k] += (f[k] || 0) * s;
    }
    const n = Math.max(Number(editing.servings) || 1, 0.25);
    return Object.fromEntries(KEYS.map((k) => [k, Math.round((sum[k] / n) * 10) / 10]));
  }, [editing, foodMap]);

  const edit = async (r) => {
    // fetch the ingredient foods so the preview works for saved recipes too
    const ids = r.ingredients.map((i) => i.foodId);
    const entries = await Promise.all(ids.map((id) => apiFetch(`/api/foods/${id}`).then((x) => x.json()).then((d) => d.food).catch(() => null)));
    setFoodMap((m) => ({ ...m, ...Object.fromEntries(entries.filter(Boolean).map((f) => [f._id, f])) }));
    setEditing({ ...r, ingredients: r.ingredients.map((i) => ({ foodId: i.foodId, foodName: i.foodName, quantity: i.quantity, servingUnit: i.servingUnit })) });
  };

  const save = async () => {
    const body = { name: editing.name, servings: Number(editing.servings), notes: editing.notes, ingredients: editing.ingredients.map((i) => ({ foodId: i.foodId, quantity: Number(i.quantity) })) };
    const res = await apiFetch(editing._id ? `/api/recipes/${editing._id}` : "/api/recipes", { method: editing._id ? "PUT" : "POST", body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) return notify(d.message || "Could not save.", "error");
    notify("Recipe saved — find it in your foods to log or plan.", "success");
    setEditing(null); load();
  };
  // Plain text works anywhere (WhatsApp, notes, email). Uses the phone's share sheet when there is one, otherwise copies.
  const share = async (r) => {
    const text = `${r.name} — makes ${r.servings} servings\n` +
      r.ingredients.map((i) => `• ${i.foodName}: ${i.quantity} ${i.servingUnit}`).join("\n") +
      `\nPer serving: ${Math.round(r.perServing.calories)} kcal, ${r.perServing.protein} g protein, ${r.perServing.fiber} g fibre` +
      (r.notes ? `\n\n${r.notes}` : "");
    try {
      if (navigator.share) await navigator.share({ title: r.name, text });
      else { await navigator.clipboard.writeText(text); notify("Recipe copied.", "success"); }
    } catch { /* cancelled */ }
  };
  const remove = async (r) => {
    if (!(await confirmAction("Meals you already logged keep their numbers.", { title: `Delete “${r.name}”?`, confirmText: "Delete" }))) return;
    await apiFetch(`/api/recipes/${r._id}`, { method: "DELETE" }); load();
  };

  if (editing) {
    const valid = editing.name.trim() && editing.ingredients.length && Number(editing.servings) > 0;
    return (
      <div className="recipes-page">
        <div className="food-logger-header"><div><button className="secondary-button" onClick={() => setEditing(null)}>← Recipes</button><h1>{editing._id ? "Edit recipe" : "New recipe"}</h1></div></div>
        <div className="large-card recipe-form">
          <input placeholder="Recipe name (e.g. Rajma masala)" value={editing.name} maxLength={100} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Recipe name" />
          <label className="recipe-servings">Makes <input type="number" min="0.25" step="any" value={editing.servings} onChange={(e) => setEditing({ ...editing, servings: e.target.value })} /> servings</label>
          <h3>Ingredients</h3>
          {editing.ingredients.map((ing, i) => (
            <div className="text-logger-item" key={`${ing.foodId}-${i}`}>
              <span>{ing.foodName}</span>
              <input type="number" min="0.01" step="any" value={ing.quantity} aria-label={`Amount of ${ing.foodName}`}
                onChange={(e) => setEditing({ ...editing, ingredients: editing.ingredients.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} />
              <small>{ing.servingUnit}</small>
              <button className="delete-log-button" aria-label={`Remove ${ing.foodName}`} onClick={() => setEditing({ ...editing, ingredients: editing.ingredients.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          {picking
            ? <FoodPicker actionLabel="Add ingredient" onCancel={() => setPicking(false)} onPick={(f, q) => {
                setFoodMap((m) => ({ ...m, [f._id]: f }));
                setEditing({ ...editing, ingredients: [...editing.ingredients, { foodId: f._id, foodName: f.name, quantity: q, servingUnit: f.servingUnit }] });
                setPicking(false);
              }} />
            : <button className="secondary-button" onClick={() => setPicking(true)}>+ Add ingredient</button>}
          {preview && editing.ingredients.length > 0 && (
            <div className="recipe-preview"><strong>Per serving</strong>
              <span>{Math.round(preview.calories)} kcal</span><span>{preview.protein} g protein</span><span>{preview.carbohydrates} g carbs</span><span>{preview.fat} g fat</span><span>{preview.fiber} g fibre</span></div>
          )}
          <textarea placeholder="Notes or method (optional)" value={editing.notes} maxLength={1000} rows={3} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          <button className="primary-button" disabled={!valid} onClick={save}>Save recipe</button>
        </div>
      </div>
    );
  }

  return (
    <div className="recipes-page">
      <div className="food-logger-header"><div><button className="secondary-button" onClick={onBack}>← Back</button><div className="bd-head"><h1>Recipes</h1><Buddy scene="chef" size={76} says="Let's cook!" /></div><p>Combine ingredients once, then log or plan a serving in one tap.</p></div></div>
      <div className="large-card">
        <button className="primary-button" onClick={() => setEditing({ ...blank })}>+ New recipe</button>
        {!recipes.length && <p className="card-description"><Buddy scene="chef" size={56} /> No recipes yet. Build one and it appears in your food list as “{`<name>`}” per serving.</p>}
        {recipes.map((r) => (
          <div className="planner-item" key={r._id}>
            <span><strong>{r.name}</strong><small>{r.servings} servings · {Math.round(r.perServing.calories)} kcal, {r.perServing.protein} g protein, {r.perServing.fiber} g fibre each</small></span>
            <button className="secondary-button" onClick={() => share(r)}>Share</button>
            <button className="secondary-button" onClick={() => edit(r)}>Edit</button>
            <button className="delete-log-button" aria-label={`Delete ${r.name}`} onClick={() => remove(r)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
