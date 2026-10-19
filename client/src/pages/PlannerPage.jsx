import { useCallback, useEffect, useMemo, useState } from "react";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import { getLocalDate } from "../utils/date";
import FoodPicker from "../components/FoodPicker";
import AutoPlanPanel from "../components/AutoPlanPanel";
import IntakeBanner from "../components/IntakeBanner";

const MEALS = [["breakfast", "🌅", "Breakfast"], ["lunch", "☀️", "Lunch"], ["dinner", "🌙", "Dinner"], ["snacks", "🍎", "Snacks"]];
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const mondayOf = (s) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));
const dayLabel = (s) => parse(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function PlannerPage({ onBack, goTo }) {
  const today = getLocalDate();
  const [start, setStart] = useState(mondayOf(today));
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(null); // `${date}|${meal}`
  const [shop, setShop] = useState(null);
  const [checked, setChecked] = useState({});
  const [dragId, setDragId] = useState(null);
  const [auto, setAuto] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [more, setMore] = useState(null);   // { id, kind: "move" | "swap", alts }
  const end = addDays(start, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/meal-plans?from=${start}&to=${end}`);
      const d = await r.json();
      if (d.success) setItems(d.items);
    } catch { notify("Could not load your plan.", "error"); }
  }, [start, end]);
  useEffect(() => { load(); setShop(null); }, [load]);
  useEffect(() => { apiFetch(`/api/meal-plans/context?from=${start}&days=7&today=${today}`).then((r) => r.json()).then((d) => d.success && setCtx(d)).catch(() => {}); }, [start, items.length, today]);

  const call = async (path, method, body, okMsg) => {
    try {
      const r = await apiFetch(`/api/meal-plans${path}`, { method, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) { notify(d.message || "Something went wrong.", "error"); return null; }
      if (okMsg) notify(okMsg, "success");
      await load();
      return d;
    } catch { notify("Planning needs a connection.", "error"); return null; }
  };

  const add = (date, mealType) => async (food, quantity) => {
    if (await call("", "POST", { date, mealType, foodId: food._id, quantity })) setAdding(null);
  };
  const dayTotals = (date) => items.filter((i) => i.date === date).reduce((a, i) => ({ k: a.k + i.calories, p: a.p + i.protein, f: a.f + i.fiber, c: a.c + (i.carbohydrates || 0), fat: a.fat + (i.fat || 0) }), { k: 0, p: 0, f: 0, c: 0, fat: 0 });
  const resize = (i, f) => call(`/${i._id}`, "PATCH", { quantity: Math.max(0.1, Math.round(i.quantity * f * 10) / 10) });
  const planDay = async (date) => { const d = await call("/auto", "POST", { from: date, days: 1, today, mode: "balanced" }); if (d) notify(`Planned ${d.saved} foods for ${dayLabel(date)}.`, "success"); };
  const clearDay = async (date) => { if (!(await confirmAction("Removes what is planned and not yet eaten on this day.", { title: `Clear ${dayLabel(date)}?`, confirmText: "Clear", danger: true }))) return; call("/clear", "POST", { from: date }, "Day cleared."); };
  const clearWeek = async () => { if (!(await confirmAction("Removes everything planned and not yet eaten this week.", { title: "Clear this whole week?", confirmText: "Clear week", danger: true }))) return; call("/clear", "POST", { from: start, to: end }, "Week cleared."); };
  const openSwap = async (i) => {
    if (more?.id === i._id && more.kind === "swap") { setMore(null); return; }
    setMore({ id: i._id, kind: "swap", alts: null });
    try { const r = await apiFetch(`/api/meal-plans/${i._id}/alternatives?today=${today}`); const d = await r.json(); setMore({ id: i._id, kind: "swap", alts: d.items || [] }); } catch { setMore(null); notify("Could not find swaps.", "error"); }
  };
  const doSwap = async (i, a) => { setMore(null); await call(`/${i._id}/swap`, "POST", { foodId: a.foodId || undefined, name: a.foodId ? undefined : a.name, servings: a.servings }, `Swapped to ${a.name}.`); };

  const openShopping = async () => {
    if (shop) { setShop(null); return; }
    const r = await apiFetch(`/api/meal-plans/shopping-list?from=${start}&to=${end}`);
    const d = await r.json();
    if (d.success) { setShop(d.items); setChecked({}); }
  };
  const shopText = () => (shop || []).map((i) => `• ${i.name} — ${i.quantity} ${i.unit}${i.approx ? ` (≈ ${i.approx.count} ${i.approx.label})` : ""}`).join("\n");
  const copyShop = async () => {
    try { await navigator.clipboard.writeText(`Shopping list ${start} → ${end}\n${shopText()}`); notify("Shopping list copied.", "success"); }
    catch { notify("Could not copy. Select the text instead.", "error"); }
  };

  const copyWeek = async () => {
    if (!(await confirmAction("Everything planned last week is added to this week.", { title: "Copy last week's plan here?", confirmText: "Copy", danger: false }))) return;
    const d = await call("/copy-week", "POST", { fromStart: addDays(start, -7), toStart: start });
    if (d) notify(d.copied ? `Copied ${d.copied} planned items.` : "Last week had nothing planned.", d.copied ? "success" : "info");
  };

  return (
    <div className="planner-page">
      <div className="food-logger-header">
        <div>
          <button className="secondary-button" onClick={onBack}>← Back</button>
          <div className="bd-head"><h1>Meal planner</h1><Buddy scene="plan" size={76} says="Plan the week!" /></div>
          <p>Plan the week, log with one tap, and get a shopping list.</p>
        </div>
      </div>

      <IntakeBanner />

      <div className="planner-toolbar large-card">
        <button className="secondary-button" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">‹</button>
        <strong>{dayLabel(start)} – {dayLabel(end)}</strong>
        <button className="secondary-button" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">›</button>
        <button className="secondary-button" onClick={() => setStart(mondayOf(today))}>This week</button>
        <button className="secondary-button" onClick={copyWeek}>Copy last week</button>
        <button className="primary-button" onClick={() => setAuto(!auto)}>✨ Plan my week</button>
        <button className="secondary-button" onClick={openShopping}>🛒 Shopping list</button>
        <button className="secondary-button" onClick={clearWeek}>🗑️ Clear week</button>
        {goTo && <button className="secondary-button" onClick={() => goTo("recipes")}>🍲 Recipes</button>}
      </div>

      {auto && <AutoPlanPanel from={start} to={end} onClose={() => setAuto(false)} onSaved={load} />}

      {shop && (
        <div className="large-card shopping-list">
          <div className="section-header"><div><h2>🛒 Shopping list</h2><p>Planned and not yet eaten, {dayLabel(start)} – {dayLabel(end)}</p></div>
            <button className="secondary-button" onClick={copyShop}>Copy</button></div>
          {!shop.length && <p className="card-description">Nothing to buy — plan some meals first.</p>}
          {shop.map((i) => (
            <label key={i.foodId} className={`shop-row ${checked[i.foodId] ? "done" : ""}`}>
              <input type="checkbox" checked={!!checked[i.foodId]} onChange={() => setChecked({ ...checked, [i.foodId]: !checked[i.foodId] })} />
              <span>{i.name}</span>
              <strong>{i.quantity} {i.unit}{i.approx ? ` · ≈ ${i.approx.count} ${i.approx.label}` : ""}</strong>
            </label>
          ))}
        </div>
      )}

      <div className="planner-grid">
        {days.map((date) => {
          const t = dayTotals(date);
          const unlogged = items.some((i) => i.date === date && !i.logged);
          const planned = items.some((i) => i.date === date && !i.logged);
          const target = ctx?.targets?.[date] ?? ctx?.baseTarget ?? null;
          const trimmed = !!ctx?.baseTarget && !!target && target < ctx.baseTarget;
          const rg = ctx?.ranges;
          return (
            <section key={date} className={`large-card planner-day ${date === today ? "today" : ""}`}>
              <div className="section-header">
                <div><h3>{dayLabel(date)}{date === today ? " · today" : ""}</h3><p>{Math.round(t.k)}{target ? ` of ${Math.round(target)}` : ""} kcal{trimmed ? ` · lighter day (−${Math.round(ctx.baseTarget - target)})` : ""}</p></div>
                {unlogged && <button className="secondary-button" onClick={() => call("/log-day", "POST", { date, clientId: `pd-${date}-${Date.now()}` }, "Logged the day's plan.")}>Log day</button>}
              </div>
              {!!target && <div className="pl-bar"><i className={t.k > target * 1.08 ? "over" : ""} style={{ width: `${Math.min(100, (t.k / target) * 100)}%` }} /></div>}
              {t.k > 0 && (
                <p className="pl-macros">Protein {Math.round(t.p)} g{rg ? ` (aim ${rg.protein.min}–${rg.protein.max})` : ""} · Carbs {Math.round(t.c)} g · Fat {Math.round(t.fat)} g · Fibre {Math.round(t.f * 10) / 10} g{rg ? ` (aim ${rg.fiber.goal}+)` : ""}
                  {rg && t.p > 0 && t.p < rg.protein.min && <span className="pl-warn"> · Protein is low: try “Swap” on a dal or paneer.</span>}</p>
              )}
              <div className="pl-tools">
                <button className="secondary-button" onClick={() => planDay(date)}>✨ Plan this day</button>
                {planned && <button className="secondary-button" onClick={() => clearDay(date)}>🗑️ Clear day</button>}
              </div>
              {MEALS.map(([id, emoji, label]) => {
                const slot = items.filter((i) => i.date === date && i.mealType === id);
                const key = `${date}|${id}`;
                return (
                  <div key={id} className="planner-slot"
                    onDragOver={(e) => dragId && e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragId) call(`/${dragId}`, "PATCH", { date, mealType: id }); setDragId(null); }}>
                    <div className="planner-slot-head"><span>{emoji} {label}</span>
                      <button className="link-button" onClick={() => setAdding(adding === key ? null : key)}>{adding === key ? "Close" : "+ Add"}</button></div>
                    {slot.map((i) => (
                      <div key={i._id}>
                        <div title={i.why || undefined} className={`planner-item ${i.logged ? "logged" : ""}`} draggable={!i.logged} onDragStart={() => setDragId(i._id)} onDragEnd={() => setDragId(null)}>
                          <span><strong>{i.foodName}</strong><small>{i.quantity} {i.servingUnit} · {i.calories} kcal</small></span>
                          {i.logged ? <em>✓ eaten</em> : (
                            <>
                              <button className="secondary-button" onClick={() => call(`/${i._id}/log`, "POST", { date: date <= today ? date : today, clientId: `pl-${i._id}` }, `Logged ${i.foodName}.`)}>Log</button>
                              <button className="link-button" onClick={() => openSwap(i)}>Swap</button>
                              <button className="link-button" onClick={() => setMore(more?.id === i._id && more.kind === "move" ? null : { id: i._id, kind: "move" })}>Move</button>
                            </>
                          )}
                          <button className="delete-log-button" aria-label={`Remove ${i.foodName}`} onClick={() => call(`/${i._id}`, "DELETE")}>✕</button>
                        </div>
                        {!i.logged && (
                          <div className="pl-more" style={{ display: more?.id === i._id ? "block" : "none" }}>
                            {more?.id === i._id && more.kind === "move" && (
                              <>
                                <div className="row"><b>Meal</b>{MEALS.filter(([m]) => m !== id).map(([m, e, l]) => <button key={m} onClick={() => { setMore(null); call(`/${i._id}`, "PATCH", { mealType: m }); }}>{e} {l}</button>)}</div>
                                <div className="row"><b>Day</b>{days.filter((d) => d !== date).map((d) => <button key={d} onClick={() => { setMore(null); call(`/${i._id}`, "PATCH", { date: d }); }}>{dayLabel(d)}</button>)}</div>
                                <div className="row"><b>Portion</b><button onClick={() => resize(i, 0.75)}>− 25%</button><button onClick={() => resize(i, 1.25)}>+ 25%</button></div>
                              </>
                            )}
                            {more?.id === i._id && more.kind === "swap" && (
                              <>
                                <b>Swap for something similar</b>
                                {!more.alts && <div>Finding options…</div>}
                                {more.alts?.length === 0 && <div>No similar foods found.</div>}
                                {more.alts?.map((a) => <button key={a.foodId || a.name} className="pl-alt" onClick={() => doSwap(i, a)}><span>{a.name}{a.familiar ? " ★" : ""}</span><small>{a.quantity} {a.unit} · {a.calories} kcal · {a.protein} g protein</small></button>)}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {adding === key && <FoodPicker actionLabel="Add to plan" onPick={add(date, id)} onCancel={() => setAdding(null)} />}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
