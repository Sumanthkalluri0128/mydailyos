import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { pendingOps } from "../offline/offlineApi";
import { fireConfetti } from "../motion/motion";
import { dayChar } from "../motion/chars";
import PlannerMeal from "../components/PlannerMeal";
import { chefDayLine, dayBarText, itemsToLog, overlayWebQueue } from "../utils/mealView";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import { getLocalDate } from "../utils/date";
import FoodPicker from "../components/FoodPicker";
import AutoPlanPanel from "../components/AutoPlanPanel";
import IntakeBanner from "../components/IntakeBanner";
import SenseiChat from "../components/SenseiChat";
import "../components/sensei.css";

const MEALS = [["breakfast", "🌅", "Breakfast"], ["lunch", "☀️", "Lunch"], ["dinner", "🌙", "Dinner"], ["snacks", "🍎", "Snacks"]];
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const mondayOf = (s) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));
const dayLabel = (s) => parse(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function PlannerPage({ onBack, goTo }) {
  const today = getLocalDate();
  const [start, setStart] = useState(mondayOf(today));
  const [view, setView] = useState(null);
  const who = useMemo(() => dayChar(), []);
  const prevDone = useRef({});
  const [adding, setAdding] = useState(null); // `${date}|${meal}`
  const [shop, setShop] = useState(null);
  const [checked, setChecked] = useState({});
  const [dragId, setDragId] = useState(null);
  const [auto, setAuto] = useState(false);
  const [more, setMore] = useState(null);   // { id, kind: "move" | "swap", alts }
  const [improve, setImprove] = useState(false);
  const [tpls, setTpls] = useState(null);     // week templates (null = closed)
  const end = addDays(start, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  // ONE response: logged + planned merged, day bars, suggestions. Offline: the saved copy, with changes still waiting to sync layered on top.
  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/meal-plans/view?from=${start}&to=${end}&today=${today}`);
      const d = await r.json();
      if (!d.success) { notify(d.message || "Could not load your plan.", "error"); return; }
      const v = overlayWebQueue(d, await pendingOps().catch(() => []));
      for (const day of v.days) {                       // finishing a day plays the victory scene
        if (day.complete && prevDone.current[day.date] === false) fireConfetti({ count: 90 });
        prevDone.current[day.date] = !!day.complete;
      }
      setView(v);
    } catch { notify("Could not load your plan.", "error"); }
  }, [start, end, today]);
  useEffect(() => { load(); setShop(null); }, [load]);
  useEffect(() => { const on = () => load(); window.addEventListener("flexfit:synced", on); return () => window.removeEventListener("flexfit:synced", on); }, [load]);

  const call = async (path, method, body, okMsg, meta) => {
    try {
      const r = await apiFetch(`/api/meal-plans${path}`, { method, body: body ? JSON.stringify(body) : undefined, meta });
      const d = await r.json();
      if (!r.ok) { notify(d.message || "Something went wrong.", "error"); return null; }
      if (okMsg) notify(okMsg, "success");
      await load();
      return d;
    } catch { notify("Planning needs a connection.", "error"); return null; }
  };

  const add = (date, mealType) => async (food, quantity) => {
    if (await call("", "POST", { date, mealType, foodId: food._id, quantity, today })) setAdding(null);
  };
  const nut = (i) => ({ calories: i.calories, protein: i.protein, fiber: i.fiber, carbohydrates: i.carbohydrates || 0, fat: i.fat || 0 });
  const logPlanned = (date, i, quiet) => call(`/${i.id}/log`, "POST", { date, clientId: `pl-${i.id}` }, quiet ? undefined : `Logged ${i.foodName}.`, { foodName: i.foodName, servingUnit: i.servingUnit });
  // Items already logged (or waiting to sync) are skipped, so nothing is counted twice. One request per item keeps an offline replay safe.
  const logDay = async (day) => { const todo = itemsToLog(day); if (!todo.length) { notify("Everything planned for this day is already logged.", "info"); return; } for (const i of todo) await logPlanned(day.date, i, true); notify(`Logged ${todo.length} planned food${todo.length === 1 ? "" : "s"}.`, "success"); };
  const planSuggestion = (day, s) => call("", "POST", s.foodId ? { date: day.date, mealType: s.mealType || s._meal, foodId: s.foodId, quantity: s.quantity, today, why: s.why } : { date: day.date, mealType: s.mealType || s._meal, name: s.foodName, quantity: s.quantity, today, why: s.why }, `Added ${s.foodName} to the plan.`, { foodName: s.foodName, servingUnit: s.servingUnit, nutrition: nut(s) });
  const logSuggestion = async (day, s) => {
    try {
      let foodId = s.foodId;
      if (!foodId) { const a = await apiFetch("/api/foods/adopt", { method: "POST", body: JSON.stringify({ name: s.foodName }) }); const j = await a.json(); if (!a.ok) throw new Error(); foodId = j.food._id; }
      const r = await apiFetch("/api/food-logs", { method: "POST", body: JSON.stringify({ foodId, date: today, mealType: s._meal, quantity: s.quantity }), meta: { foodName: s.foodName, servingUnit: s.servingUnit, nutritionTotal: nut(s) } });
      if (!r.ok) throw new Error();
      notify(`Logged ${s.foodName}.`, "success"); await load();
    } catch { notify("Could not log that.", "error"); }
  };
    const resize = (i, f) => call(`/${i.id}`, "PATCH", { quantity: Math.max(0.1, Math.round(i.quantity * f * 10) / 10) });
  const planDay = async (date) => { const d = await call("/auto", "POST", { from: date, days: 1, today, mode: "balanced" }); if (d) notify(`Planned ${d.saved} foods for ${dayLabel(date)}.`, "success"); };
  const clearDay = async (date) => { if (!(await confirmAction("Removes what is planned and not yet eaten on this day.", { title: `Clear ${dayLabel(date)}?`, confirmText: "Clear", danger: true }))) return; call("/clear", "POST", { from: date }, "Day cleared."); };
  const clearWeek = async () => { if (!(await confirmAction("Removes everything planned and not yet eaten this week.", { title: "Clear this whole week?", confirmText: "Clear week", danger: true }))) return; call("/clear", "POST", { from: start, to: end }, "Week cleared."); };
  const openSwap = async (i) => {
    if (more?.id === i.id && more.kind === "swap") { setMore(null); return; }
    setMore({ id: i.id, kind: "swap", alts: null });
    try { const r = await apiFetch(`/api/meal-plans/${i.id}/alternatives?today=${today}`); const d = await r.json(); setMore({ id: i.id, kind: "swap", alts: d.items || [] }); } catch { setMore(null); notify("Could not find swaps.", "error"); }
  };
  const doSwap = async (i, a) => { setMore(null); await call(`/${i.id}/swap`, "POST", { foodId: a.foodId || undefined, name: a.foodId ? undefined : a.name, servings: a.servings }, `Swapped to ${a.name}.`); };

  const lockMeal = (date, mealType) => (locked) => call("/lock", "POST", { date, mealType, locked }, locked ? "Locked. It stays when you re-shuffle." : "Unlocked.");
  const giveFeedback = async (i, kind) => {
    try {
      const r = await apiFetch("/api/food-prefs/feedback", { method: "POST", body: JSON.stringify({ planId: i.id, kind }) });
      const d = await r.json();
      if (!r.ok) { notify(d.message || "Could not save that.", "error"); return; }
      notify({ loved: "Noted. You will see this one more often.", too_heavy: "Noted. I will go lighter next time.", too_long: "Noted. I will pick quicker foods.", not_available: "Noted. I will leave it out for a few weeks." }[kind], "success");
    } catch { notify("Could not save that.", "error"); }
  };
  const resetFeedback = async () => { if (!(await confirmAction("Your loved / too heavy / too long / not available choices are cleared.", { title: "Reset what I learned?", confirmText: "Reset", danger: true }))) return; await apiFetch("/api/food-prefs/feedback", { method: "DELETE" }); notify("Feedback reset.", "success"); };
  const loadTemplates = async () => { const r = await apiFetch("/api/meal-plans/templates"); const d = await r.json(); setTpls(d.success ? d.templates : []); };
  const saveTemplate = async () => {
    const name = window.prompt("Name this week (for example, My cutting week)");
    if (!name) return;
    const r = await apiFetch("/api/meal-plans/templates", { method: "POST", body: JSON.stringify({ name, from: start }) });
    const d = await r.json();
    if (!r.ok) { notify(d.message || "Could not save the template.", "error"); return; }
    notify(d.replaced ? "Template updated." : "Template saved.", "success"); loadTemplates();
  };
  const applyTemplate = async (t, replace) => {
    const r = await apiFetch(`/api/meal-plans/templates/${t.id}/apply`, { method: "POST", body: JSON.stringify({ from: start, today, replace }) });
    const d = await r.json();
    if (!r.ok) { notify(d.message || "Could not load it.", "error"); return; }
    notify(`Loaded ${d.saved} foods${d.skipped?.length ? `. Skipped ${d.skipped.map((x) => `${x.name} (${x.reason})`).join(", ")}` : ""}.`, d.skipped?.length ? "info" : "success"); load();
  };
  const deleteTemplate = async (t) => { if (!(await confirmAction(`Delete "${t.name}"?`, { title: "Delete template", confirmText: "Delete", danger: true }))) return; await apiFetch(`/api/meal-plans/templates/${t.id}`, { method: "DELETE" }); loadTemplates(); };

  const openShopping = async (force) => {
    if (shop && force !== true) { setShop(null); return; }
    const r = await apiFetch(`/api/meal-plans/shopping-list?from=${start}&to=${end}`);
    const d = await r.json();
    if (d.success) { setShop(d); setChecked({}); }
  };
  const shopText = () => (shop?.items || []).map((i) => `• ${i.name} — ${i.quantity} ${i.unit}${i.approx ? ` (≈ ${i.approx.count} ${i.approx.label})` : ""}`).join("\n");
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
        <button className="primary-button" data-tour="plan-open" onClick={() => setAuto(!auto)}>✨ Plan my week</button>
        <button className="secondary-button" onClick={() => openShopping()}>🛒 Shopping list</button>
        <button className="secondary-button" onClick={() => (tpls ? setTpls(null) : loadTemplates())}>📑 Templates</button>
        <button className="secondary-button" onClick={clearWeek}>🗑️ Clear week</button>
        {goTo && <button className="secondary-button" onClick={() => goTo("recipes")}>🍲 Recipes</button>}
      </div>

      {view?.ctx?.sensei && !auto && !improve && (!view.ctx.sensei.setupDone || view.ctx.sensei.improve > 0) && (
        <div className="large-card ap-setup" role="note"><div className="ap-setup-head"><b>{view.ctx.sensei.setupDone ? "Improve my plan" : "Plan with the sensei"}</b></div>
          <p className="ap-sub">{view.ctx.sensei.setupDone ? "A couple of quick questions keep your plan right for this week." : "Answer a few quick questions and I will build a plan around your food, time and kitchen."}</p>
          <button className="secondary-button" onClick={() => setImprove(true)}>{view.ctx.sensei.setupDone ? "Improve my plan" : "Start"}</button></div>
      )}
      {improve && <SenseiChat onClose={() => { setImprove(false); load(); }} onDone={() => { setImprove(false); setAuto(true); load(); }} />}
      {view?.ctx?.safety?.flagged && <div className="ib is-hot" role="note"><span className="ib-ic" aria-hidden="true">🩺</span><div><b>Please check with a doctor or dietitian</b><p>{view.ctx.safety.note}</p></div></div>}
      {auto && <AutoPlanPanel from={start} to={end} onClose={() => setAuto(false)} onSaved={(o) => { load(); if (o?.shop) setTimeout(() => openShopping(true), 400); }} />}
      {tpls && (
        <div className="large-card shopping-list"><div className="section-header"><div><h2>📑 Week templates</h2><p>Save this week as a template, or load one onto this week.</p></div><button className="secondary-button" onClick={saveTemplate}>Save this week</button></div>
          {!tpls.length && <p className="card-description">No templates yet.</p>}
          {tpls.map((t) => <div key={t.id} className="shop-row"><span>{t.name}<small> · {t.days} day{t.days === 1 ? "" : "s"} · about {t.kcalPerDay} kcal a day</small></span><span><button className="link-button" onClick={() => applyTemplate(t, false)}>Load into empty meals</button> <button className="link-button" onClick={() => applyTemplate(t, true)}>Replace this week</button> <button className="link-button" onClick={() => deleteTemplate(t)}>Delete</button></span></div>)}
          <button className="link-button" onClick={resetFeedback}>Reset what the sensei learned from my feedback</button>
        </div>
      )}

      {shop && (
        <div className="large-card shopping-list">
          <div className="section-header"><div><h2>🛒 Shopping list</h2><p>Planned and not yet eaten, {dayLabel(start)} – {dayLabel(end)}</p></div>
            <button className="secondary-button" onClick={copyShop}>Copy</button></div>
          {shop.people?.scaled && <p className="ap-sub">Scaled for {shop.people.adults} adult{shop.people.adults === 1 ? "" : "s"}{shop.people.kids ? `, ${shop.people.kids} kid${shop.people.kids === 1 ? "" : "s"}` : ""}{shop.people.elders ? `, ${shop.people.elders} elder${shop.people.elders === 1 ? "" : "s"}` : ""} (about {shop.people.factor} portions; estimates).</p>}
          {!shop.items.length && <p className="card-description">Nothing to buy — plan some meals first.</p>}
          {shop.items.map((i) => (
            <label key={i.foodId} className={`shop-row ${checked[i.foodId] ? "done" : ""}`}>
              <input type="checkbox" checked={!!checked[i.foodId]} onChange={() => setChecked({ ...checked, [i.foodId]: !checked[i.foodId] })} />
              <span>{i.name}</span>
              <strong>{i.quantity} {i.unit}{i.approx ? ` · ≈ ${i.approx.count} ${i.approx.label}` : ""}</strong>
            </label>
          ))}
          {shop.alreadyHave?.length > 0 && <details className="ap-habits"><summary>You already have ({shop.alreadyHave.length})</summary>{shop.alreadyHave.map((i) => <p key={i.foodId} className="ap-sub">{i.name}: {i.quantity} {i.unit} (not on the list)</p>)}</details>}
        </div>
      )}

      <div className="planner-grid">
        {(view?.days || []).map((vd) => {
          const date = vd.date; const b = vd.budget; const bt = dayBarText(b);
          const rg = view.ctx?.ranges;
          const hasPlanned = !vd.readOnly && MEALS.some(([id]) => vd.meals[id].planned.calories > 0);
          const t = vd.total;
          return (
            <section key={date} className={`large-card planner-day ${date === today ? "today" : ""}`}>
              <div className="section-header">
                <div><h3>{dayLabel(date)}{vd.kind === "today" ? " · today" : vd.readOnly ? " · history" : ""}</h3>
                  {vd.hasBudget && <p>{bt.eaten} · {bt.planned} · {bt.remaining} kcal{b.trim > 0 ? ` · lighter day (−${b.trim})` : ""}</p>}</div>
                {vd.kind === "today" && hasPlanned && <button className="secondary-button" onClick={() => logDay(vd)}>Log day</button>}
              </div>
              {b.budget > 0 && <div className="pl-daybar" aria-label="Eaten, planned and left"><i className={`eaten ${b.remaining < 0 ? "over" : ""}`} style={{ width: `${Math.min(100, (b.eaten / b.budget) * 100)}%` }} /><i className="planned" style={{ width: `${Math.max(0, Math.min(100 - (b.eaten / b.budget) * 100, (b.planned / b.budget) * 100))}%` }} /></div>}
              <div className="pl-chefcard">
                <Buddy scene={vd.complete ? "victory" : "chef"} size={60} who={who} talk={false} label="Chef" />
                <p>{chefDayLine(vd, who) || (vd.readOnly ? "This day is history. It shows what you logged." : "")}</p>
              </div>
              {t.calories > 0 && (
                <p className="pl-macros">Protein {Math.round(t.protein)} g{rg ? ` (aim ${rg.protein.min}–${rg.protein.max})` : ""} · Carbs {Math.round(t.carbohydrates)} g · Fat {Math.round(t.fat)} g · Fibre {Math.round(t.fiber * 10) / 10} g{rg ? ` (aim ${rg.fiber.goal}+)` : ""}
                  {rg && !vd.readOnly && t.protein > 0 && t.protein < rg.protein.min && <span className="pl-warn"> · Protein is low: try an add-on below.</span>}</p>
              )}
              {!vd.readOnly && (
                <div className="pl-tools">
                  <button className="secondary-button" onClick={() => planDay(date)}>✨ Plan this day</button>
                  {hasPlanned && <button className="secondary-button" onClick={() => clearDay(date)}>🗑️ Clear day</button>}
                </div>
              )}
              {MEALS.map(([id]) => {
                const key = `${date}|${id}`;
                return (
                  <PlannerMeal key={id} day={vd} meal={id} who={who} adding={adding === key} onToggleAdd={() => setAdding(adding === key ? null : key)} onLock={lockMeal(date, id)} onFeedback={giveFeedback}
                    dragging={!!dragId} onDrop={() => { if (dragId) call(`/${dragId}`, "PATCH", { date, mealType: id, today }); setDragId(null); }}
                    onLog={(i) => logPlanned(date <= today ? date : today, i)} onRemove={(i) => call(`/${i.id}`, "DELETE")}
                    onAddSuggestion={(s) => planSuggestion(vd, { ...s, _meal: id })} onLogSuggestion={(s) => logSuggestion(vd, { ...s, _meal: id })}
                    extras={{
                      dragStart: (i) => setDragId(i.id), dragEnd: () => setDragId(null),
                      buttons: (i) => (<><button className="link-button" onClick={() => openSwap(i)}>Swap</button><button className="link-button" onClick={() => setMore(more?.id === i.id && more.kind === "move" ? null : { id: i.id, kind: "move" })}>Move</button></>),
                      panel: (i) => (
                        <div className="pl-more" style={{ display: more?.id === i.id ? "block" : "none" }}>
                          {more?.id === i.id && more.kind === "move" && (
                            <>
                              <div className="row"><b>Meal</b>{MEALS.filter(([m]) => m !== id).map(([m, e, l]) => <button key={m} onClick={() => { setMore(null); call(`/${i.id}`, "PATCH", { mealType: m }); }}>{e} {l}</button>)}</div>
                              <div className="row"><b>Day</b>{days.filter((d) => d !== date && d >= today).map((d) => <button key={d} onClick={() => { setMore(null); call(`/${i.id}`, "PATCH", { date: d, today }); }}>{dayLabel(d)}</button>)}</div>
                              <div className="row"><b>Portion</b><button onClick={() => resize(i, 0.75)}>− 25%</button><button onClick={() => resize(i, 1.25)}>+ 25%</button></div>
                            </>
                          )}
                          {more?.id === i.id && more.kind === "swap" && (
                            <>
                              <b>Top 3 swaps, with the reason for each</b>
                              {!more.alts && <div>Finding options…</div>}
                              {more.alts?.length === 0 && <div>No similar foods found.</div>}
                              {more.alts?.map((a) => <button key={a.foodId || a.name} className="pl-alt" onClick={() => doSwap(i, a)}><span>{a.name}{a.familiar ? " ★" : ""}</span><small>{a.quantity} {a.unit} · {a.calories} kcal · {a.protein} g protein</small>{a.reason && <small className="pl-alt-why">{a.reason}</small>}</button>)}
                            </>
                          )}
                        </div>
                      ),
                    }}>
                    {adding === key && <FoodPicker actionLabel="Add to plan" onPick={add(date, id)} onCancel={() => setAdding(null)} />}
                  </PlannerMeal>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
