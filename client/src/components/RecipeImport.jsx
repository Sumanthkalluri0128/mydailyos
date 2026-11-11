import { useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { scaleItems, withBase, totalFromPerServing } from "../utils/recipeScale";

const looksLikeLink = (s) => /^https?:\/\/\S+$/i.test(s.trim());

/** Import a recipe from a link or pasted text. Nothing is saved here: "Use this recipe" opens it in the normal recipe editor. */
export default function RecipeImport({ onUse, onCancel }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);   // { name, baseServings, servings, items, perServing, ... }

  const read = async () => {
    setBusy(true);
    try {
      const body = looksLikeLink(input) ? { url: input.trim() } : { text: input };
      const res = await apiFetch("/api/recipes/import", { method: "POST", body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return notify(d.message || "Could not read that recipe.", "error");
      setDraft({ ...d, baseServings: d.servings, items: withBase(d.items) });
    } catch { notify("Could not read that recipe. Check your connection.", "error"); } finally { setBusy(false); }
  };
  const setServings = (n) => {
    const s = Math.max(0.5, Math.min(200, Number(n) || 0.5));
    setDraft((d) => ({ ...d, servings: s, items: scaleItems(d.items, d.baseServings, s) }));
  };
  const total = draft ? totalFromPerServing(draft.perServing, draft.servings) : null;
  const usable = draft ? draft.items.filter((i) => Number(i.quantity) > 0) : [];

  return (
    <div className="large-card recipe-import" aria-label="Import a recipe">
      <strong>Import a recipe</strong>
      <textarea rows={5} value={input} maxLength={60000} placeholder="Paste a link (https://…) or the recipe text: title, Serves 4, Ingredients, Method" aria-label="Recipe link or text" onChange={(e) => { setInput(e.target.value); setDraft(null); }} />
      {!draft && <div className="row"><button type="button" className="primary-button" disabled={busy || !input.trim()} onClick={read}>{busy ? "Reading…" : looksLikeLink(input) ? "Import from link" : "Read the recipe"}</button><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button></div>}
      {draft && (
        <>
          <h3>{draft.name}</h3>
          <div className="row" role="group" aria-label="Servings">
            <button type="button" className="secondary-button" aria-label="Fewer servings" onClick={() => setServings(draft.servings - 1)}>−</button>
            <span><strong>{draft.servings}</strong> serving{draft.servings === 1 ? "" : "s"}{draft.servingsFound ? "" : " (not stated; please check)"}</span>
            <button type="button" className="secondary-button" aria-label="More servings" onClick={() => setServings(draft.servings + 1)}>+</button>
          </div>
          <p className="card-description"><strong>{Math.round(draft.perServing.calories)} kcal</strong> per serving · P {draft.perServing.protein} g · C {draft.perServing.carbohydrates} g · F {draft.perServing.fat} g<br /><small>Whole recipe: {Math.round(total.calories)} kcal</small></p>
          {draft.note && <p className="card-description">{draft.note}</p>}
          {draft.items.map((it, i) => (
            <div className="planner-item" key={`${it.foodId}-${i}`}>
              <div><strong>{it.foodName}</strong><small> {it.raw}</small>
                {(it.warnings || []).map((w, k) => <small key={k} className="card-description"><br />{w}</small>)}</div>
              <input type="number" min="0" inputMode="decimal" aria-label={`${it.foodName} amount in ${it.servingUnit}`} value={it.quantity ?? ""} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, quantity: e.target.value, baseQuantity: e.target.value === "" ? null : (Number(e.target.value) * draft.baseServings) / draft.servings } : x)) })} />
              <span>{it.servingUnit}</span>
            </div>
          ))}
          {draft.unmatched.length > 0 && <p className="card-description">Could not match: {draft.unmatched.join(", ")}. Add them in the editor with + Add ingredient.</p>}
          <div className="row">
            <button type="button" className="primary-button" disabled={!usable.length} onClick={() => onUse({ name: draft.name, servings: draft.servings, notes: [draft.sourceUrl && `Source: ${draft.sourceUrl}`, ...(draft.steps || [])].filter(Boolean).join("\n").slice(0, 1000), items: usable })}>Use this recipe</button>
            <button type="button" className="secondary-button" onClick={() => setDraft(null)}>Back</button>
          </div>
        </>
      )}
    </div>
  );
}
