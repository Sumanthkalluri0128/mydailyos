import { useEffect, useState } from "react";
import "./fatloss.css";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";

// What fits what is left today: whole plates when there is room, very light options when you are nearly out or over (it used to go
// blank exactly then), and "make it fit" tips for what is already logged. One tap logs a serving or a whole plate.
export default function SmartSuggestions({ date, mealType, refreshKey, onLogged }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/foods/suggest?date=${date}&mealType=${mealType}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.success) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [date, mealType, refreshKey]);

  if (!data || !(data.suggestions?.length || data.fresh?.length || data.healthy?.length || data.meals?.length || data.light?.length || data.makeItFit?.length)) return null;
  const logFood = async (food, servings = 1) => {
    const res = await apiFetch("/api/food-logs", { method: "POST", body: JSON.stringify({ foodId: food._id, date, mealType, quantity: food.servingSize * servings, clientId: `sg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }) });
    if (!res.ok) throw new Error();
  };
  const addOne = async (food) => { try { await logFood(food); notify(`Added ${food.name} to ${mealType}.`, "success"); onLogged?.(); } catch { notify("Could not add that food.", "error"); } };
  const addPlate = async (items) => { try { for (const it of items) await logFood(it.food, it.servings); notify(`Added ${items.map((i) => i.label).join(" + ")} to ${mealType}.`, "success"); onLogged?.(); } catch { notify("Could not add that plate.", "error"); } };
  const halve = async (o) => {
    if (o.kind === "swap") return notify(`Next time try ${o.to}. It saves about ${o.saves} kcal.`, "info");
    const r = await apiFetch(`/api/food-logs/${o.logId}`, { method: "PATCH", body: JSON.stringify({ halve: true }) });
    if (r.ok) { notify(`${o.name} halved. Saved about ${o.saves} kcal.`, "success"); onLogged?.(); } else notify("Could not change it.", "error");
  };
  const addNew = async (h) => {
    try {
      const a = await apiFetch("/api/foods/adopt", { method: "POST", body: JSON.stringify({ name: h.name }) });
      const j = await a.json(); if (!a.ok) throw new Error();
      await logFood(j.food); notify(`Added ${h.name} to ${mealType}. It is now in My Foods too.`, "success"); onLogged?.();
    } catch { notify("Could not add that food.", "error"); }
  };
  const gaps = [data.remaining.protein > 0 && `${data.remaining.protein} g protein`, data.remaining.fiber > 0 && `${data.remaining.fiber} g fibre`].filter(Boolean);
  const caps = [data.caps?.carbs != null && `carbs up to ${data.caps.carbs} g`, data.caps?.fat != null && `fat up to ${data.caps.fat} g`].filter(Boolean);

  return (
    <div className="large-card smart-suggestions">
      <div className="section-header"><div>
        <h2>{data.mode === "over" ? "🌿 Still helpful when you are over" : "💡 Suggested for you"}</h2>
        <p>{data.mode === "over" ? data.message : `${data.remaining.calories} kcal left${gaps.length ? ` · still to go: ${gaps.join(" · ")}` : ""}${caps.length ? ` · ${caps.join(" · ")}` : ""}`}</p>
      </div></div>
      {data.meals?.length > 0 && <div className="suggestion-list">{data.meals.map((m, i) => (
        <button key={`m${i}`} className="suggestion-chip" onClick={() => addPlate(m.items)} title="Add this whole plate"><strong>+ {m.items.map((x) => x.label).join(" + ")}</strong><small>{m.reason}</small></button>
      ))}</div>}
      {data.light?.length > 0 && <><p className="fl-eyebrow" style={{ marginTop: 10 }}>Very light options</p><div className="suggestion-list">{data.light.map((l, i) => (
        <button key={`l${i}`} className="suggestion-chip" disabled={!l.food} onClick={() => l.food && addOne(l.food)}><strong>{l.food ? "+ " : ""}{l.name}</strong><small>{l.kcal} kcal · {l.tip}</small></button>
      ))}</div></>}
      {data.makeItFit?.length > 0 && <><p className="fl-eyebrow" style={{ marginTop: 10 }}>Make it fit</p><div className="suggestion-list">{data.makeItFit.map((o, i) => (
        <button key={`f${i}`} className="suggestion-chip" onClick={() => halve(o)}><strong>{o.name}: {o.kind === "swap" ? `swap to ${o.to}` : "half portion"}</strong><small>saves about {o.saves} kcal{o.afterOver > 0 ? ` · still ${o.afterOver} over` : " · fits your budget"}</small></button>
      ))}</div></>}
      {(data.healthy?.length > 0 || data.fresh?.length > 0) && <><p className="fl-eyebrow" style={{ marginTop: 10 }}>✨ Try something new (not on your list)</p><div className="suggestion-list">
        {data.healthy?.map((h) => <button key={h.name} className="suggestion-chip" onClick={() => addNew(h)} title="Add one serving and save it to My Foods"><strong>+ {h.name}</strong><small>{h.kcal} kcal · {h.protein} g protein · {h.note}</small></button>)}
        {data.fresh?.map(({ food, reason }) => <button key={food._id} className="suggestion-chip" onClick={() => addOne(food)} title="Add one serving"><strong>+ {food.name}</strong><small>{food.servingSize} {food.servingUnit} · {reason}</small></button>)}
      </div></>}
      {data.suggestions?.length > 0 && <><p className="fl-eyebrow" style={{ marginTop: 10 }}>Single foods</p><div className="suggestion-list">{data.suggestions.map(({ food, reason }) => (
        <button key={food._id} className="suggestion-chip" onClick={() => addOne(food)} title="Add one serving"><strong>+ {food.name}</strong><small>{food.servingSize} {food.servingUnit} · {reason}</small></button>
      ))}</div></>}
    </div>
  );
}
