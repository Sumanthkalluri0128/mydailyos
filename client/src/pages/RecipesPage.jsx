import { useEffect, useMemo, useState } from "react";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import { undoGate } from "../utils/undo";
import FoodPicker from "../components/FoodPicker";
import "../components/logging1.css";

const KEYS = ["calories", "protein", "carbohydrates", "fat", "fiber"];
const blank = { name: "", servings: 4, notes: "", ingredients: [] };

export default function RecipesPage({ onBack }) {
  const [recipes, setRecipes] = useState([]);
  const [editing, setEditing] = useState(null); // recipe being built or edited (null = list)
  const [foodMap, setFoodMap] = useState({});
  const [picking, setPicking] = useState(false);

  const mealNow = () => { const h = new Date().getHours(); return h < 10 ? "breakfast" : h < 16 ? "lunch" : h < 18 ? "snacks" : "dinner"; };
  const localToday = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
  // Shared pot: "I cooked a pot" (servings and/or total cooked weight), then "I ate x servings / x g". Nutrition scales from the recipe.
  const [pot, setPot] = useState(null); // { id, mode: 'cook' | 'eat', servings, totalG, grams, by, meal }
  const openPot = (r, mode) => setPot({ id: r._id, mode, servings: String(mode === "cook" ? r.servings : 1), totalG: "", grams: "", by: "servings", meal: mealNow(), hasWeight: (r.potServingG || 0) > 0 });
  const sendPot = async (r) => {
    const body = pot.mode === "cook"
      ? { servings: Number(pot.servings) || undefined, totalG: pot.totalG ? Number(pot.totalG) : undefined }
      : { date: localToday(), mealType: pot.meal, ...(pot.by === "grams" ? { grams: Number(pot.grams) } : { portions: Number(pot.servings) }), clientId: `pot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    const res = await apiFetch(`/api/recipes/${r._id}/${pot.mode === "cook" ? "cook" : "eat"}`, { method: "POST", body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return notify(d.message || "Could not save that.", "error");
    if (pot.mode === "cook") notify(`${d.pot?.servings ?? r.servings} servings of ${r.name} in the pot${d.pot?.servingG ? ` (about ${Math.round(d.pot.servingG)} g each)` : ""}.`, "success");
    else {
      notify(`${d.servings} serving${d.servings === 1 ? "" : "s"} of ${r.name} added to ${pot.meal}.${d.moreThanLeft ? " That was more than the pot had left, so the pot is now empty." : ""}`, "success");
      if (d.sticker === "pot") notify("🥘 Sticker unlocked: Pot Boss! Your first shared-pot meal.", "success");
    }
    setPot(null); load();
  };

  // Paste ingredients -> editable draft (nothing saved until you press Save recipe)
  const [pasting, setPasting] = useState(null); // { text, servings, draft }
  const readPaste = async () => {
    const res = await apiFetch("/api/recipes/parse-ingredients", { method: "POST", body: JSON.stringify({ text: pasting.text, servings: Number(editing.servings) || 4 }) });
    const d = await res.json();
    if (!res.ok) return notify(d.message || "Could not read that list.", "error");
    setPasting({ ...pasting, draft: d });
  };
  const usePaste = async () => {
    const items = pasting.draft.items.filter((i) => Number(i.quantity) > 0);
    const entries = await Promise.all(items.map((i) => apiFetch(`/api/foods/${i.foodId}`).then((x) => x.json()).then((d) => d.food).catch(() => null)));
    setFoodMap((m) => ({ ...m, ...Object.fromEntries(entries.filter(Boolean).map((f) => [f._id, f])) }));
    setEditing({ ...editing, ingredients: [...editing.ingredients, ...items.map((i) => ({ foodId: i.foodId, foodName: i.foodName, quantity: Number(i.quantity), servingUnit: i.servingUnit }))] });
    setPasting(null);
  };

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
    if (!(await undoGate({ what: r.name, hide: () => setRecipes((cur) => cur.filter((x) => x._id !== r._id)), restore: () => load() }))) return;
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
          {pasting ? (
            <div className="ingr-draft large-card">
              <strong>Paste your ingredients</strong>
              <textarea rows={4} placeholder="2 cups rice, 1 cup toor dal, 2 tbsp oil, 1 tsp ghee" value={pasting.text} maxLength={2000} onChange={(e) => setPasting({ ...pasting, text: e.target.value, draft: null })} aria-label="Ingredient list" />
              {!pasting.draft && <button className="primary-button" disabled={!pasting.text.trim()} onClick={readPaste}>Read the list</button>}
              {pasting.draft && (
                <>
                  {pasting.draft.items.map((it, i) => (
                    <div key={`${it.foodId}-${i}`}>
                      <div className="text-logger-item"><span>{it.foodName}{it.confidence === "medium" ? " ?" : ""}</span>
                        <input type="number" min="0.01" step="any" value={it.quantity ?? ""} placeholder="grams" aria-label={`Amount of ${it.foodName}`}
                          onChange={(e) => setPasting({ ...pasting, draft: { ...pasting.draft, items: pasting.draft.items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) } })} />
                        <small>{it.servingUnit}</small>
                        <button className="delete-log-button" aria-label={`Remove ${it.foodName}`} onClick={() => setPasting({ ...pasting, draft: { ...pasting.draft, items: pasting.draft.items.filter((_, j) => j !== i) } })}>✕</button></div>
                      {it.warnings.map((w) => <p className="warn-line" key={w}>{w}</p>)}
                    </div>
                  ))}
                  {pasting.draft.unmatched.length > 0 && <p className="card-description">Could not find: {pasting.draft.unmatched.join(", ")}. Add them with + Add ingredient.</p>}
                  {pasting.draft.oilTspPerServing > 0 && <p className="card-description">Added oil: about {pasting.draft.oilTspPerServing} tsp per serving, roughly {Math.round(pasting.draft.oilTspPerServing * 40)} kcal.</p>}
                  <button className="primary-button" onClick={usePaste}>Use these ingredients</button>
                </>
              )}
              <button className="secondary-button" onClick={() => setPasting(null)}>Cancel</button>
            </div>
          ) : <button className="secondary-button" onClick={() => setPasting({ text: "", draft: null })}>📋 Paste ingredients</button>}
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
            <div className="meal-prep-row">
              <strong><Buddy scene="chef" size={28} talk={false} /> {r.portionsLeft || 0} serving{(r.portionsLeft || 0) === 1 ? "" : "s"} left in the pot</strong>
              <button className="secondary-button" onClick={() => openPot(r, "cook")}>🥘 I cooked a pot</button>
              <button className="secondary-button" onClick={() => openPot(r, "eat")}>I ate…</button>
            </div>
            {pot?.id === r._id && (
              <div className="pot-panel" role="group" aria-label={pot.mode === "cook" ? "Cooked a pot" : "Ate from the pot"}>
                {pot.mode === "cook" ? (
                  <>
                    <label>Servings the pot makes <input type="number" min="0.25" step="any" value={pot.servings} onChange={(e) => setPot({ ...pot, servings: e.target.value })} /></label>
                    <label>Total cooked weight in grams (optional, lets you log by grams) <input type="number" min="1" step="any" value={pot.totalG} onChange={(e) => setPot({ ...pot, totalG: e.target.value })} /></label>
                  </>
                ) : (
                  <>
                    <div className="chai-cups"><button type="button" className={pot.by === "servings" ? "chip active" : "chip"} onClick={() => setPot({ ...pot, by: "servings" })}>Servings</button>
                      {pot.hasWeight && <button type="button" className={pot.by === "grams" ? "chip active" : "chip"} onClick={() => setPot({ ...pot, by: "grams" })}>Grams</button>}</div>
                    {pot.by === "grams"
                      ? <label>Grams eaten <input type="number" min="1" step="any" value={pot.grams} onChange={(e) => setPot({ ...pot, grams: e.target.value })} /></label>
                      : <label>Servings eaten <input type="number" min="0.1" step="any" value={pot.servings} onChange={(e) => setPot({ ...pot, servings: e.target.value })} /></label>}
                    {!pot.hasWeight && <small>To log by grams, enter the total cooked weight when you cook the pot.</small>}
                    <select value={pot.meal} onChange={(e) => setPot({ ...pot, meal: e.target.value })} aria-label="Meal">{["breakfast", "lunch", "dinner", "snacks"].map((m) => <option key={m} value={m}>{m}</option>)}</select>
                  </>
                )}
                <div className="repeat-row"><button className="primary-button" onClick={() => sendPot(r)}>{pot.mode === "cook" ? "Save the pot" : "Log it"}</button><button className="secondary-button" onClick={() => setPot(null)}>Cancel</button></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
