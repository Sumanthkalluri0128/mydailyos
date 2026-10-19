// "Plan my week": builds the plan, shows it with the reasons, and only saves when they press "Use this plan".
//   Balanced (recommended)  every plate has protein + carbs + vegetables; your own foods first, healthy foods fill the gaps
//   Only foods I eat        the older mode: your history only, in your usual portions
// After heavy days the plan uses lighter targets (the same numbers as the warning banner) and leaves out treats.
import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import "./autoplan.css";

const MEALS = [["breakfast", "🌅", "Breakfast"], ["lunch", "☀️", "Lunch"], ["dinner", "🌙", "Dinner"], ["snacks", "🍎", "Snacks"]];
const DIETS = [["v", "🥦 Vegetarian"], ["e", "🥚 Eggetarian"], ["n", "🍗 Non-veg"]];
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dayName = (s) => parse(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const flag = (x) => (x === "low" ? "↓" : x === "high" ? "↑" : "");

export default function AutoPlanPanel({ from, to, onClose, onSaved }) {
  const today = getLocalDate();
  const first = from < today ? today : from;
  const past = to < today;
  const days = Math.max(1, Math.min(7, diff(first, to) + 1));
  const [meals, setMeals] = useState(["breakfast", "lunch", "dinner", "snacks"]);
  const [mode, setMode] = useState("balanced");
  const [diet, setDiet] = useState("");
  const [ctx, setCtx] = useState(null);
  const [variant, setVariant] = useState(0);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState({});

  useEffect(() => {
    apiFetch(`/api/meal-plans/context?from=${first}&days=${days}&today=${today}`).then((r) => r.json()).then((d) => { if (d.success) { setCtx(d); setDiet((x) => x || d.diet || "v"); } }).catch(() => {});
  }, [first, days, today]);

  const run = async (preview, v = variant) => {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch("/api/meal-plans/auto", { method: "POST", body: JSON.stringify({ from: first, days, meals, mode, diet: diet || undefined, variant: v, preview, today }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.message || "Could not build the plan."); if (preview) setPlan(null); return; }
      if (preview) { setPlan(d); setOpen({ [d.days[0]?.date]: true }); } else { notify(`Planned ${d.saved} foods for ${days} day${days === 1 ? "" : "s"}.`, "success"); onSaved?.(); onClose?.(); }
    } catch { setErr("Planning needs a connection. Try again in a moment."); } finally { setBusy(false); }
  };
  const toggle = (m) => { setMeals((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m])); setPlan(null); };
  const itemsOf = (date, meal) => (plan?.items || []).filter((i) => i.date === date && i.mealType === meal);
  const a = ctx?.advice;

  return (
    <section className="large-card ap" aria-label="Plan my week">
      <div className="section-header">
        <div><h2>✨ Plan my week</h2><p>Balanced plates sized to your calories and macros, with your own foods first.</p></div>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>

      {a && (
        <div className={`ib ${a.level === "watch" ? "" : "is-hot"}`} role="status">
          <span className="ib-ic" aria-hidden="true">{a.level === "watch" ? "💡" : "⚠️"}</span>
          <div><b>{a.headline}</b><p>{a.skipCut ? a.detail : "The plan below already uses these lighter days and leaves out treats until you are back on track."}</p></div>
        </div>
      )}

      <fieldset className="ap-meals"><legend>How should I plan?</legend>
        <div className="ap-seg">
          <button type="button" className={mode === "balanced" ? "on" : ""} onClick={() => { setMode("balanced"); setPlan(null); }}>⚖️ Balanced (recommended)</button>
          <button type="button" className={mode === "mine" ? "on" : ""} onClick={() => { setMode("mine"); setPlan(null); }}>🍽️ Only foods I eat</button>
        </div>
        <p className="ap-sub">{mode === "balanced" ? "Every plate gets protein, a carb and vegetables. Healthy foods you do not log yet fill the gaps (they are added to your list when you save)." : "Uses only foods you really log, in your usual portions. It can only be as balanced as your log."}</p>
      </fieldset>

      {mode === "balanced" && (
        <fieldset className="ap-meals"><legend>Food style</legend>
          <div className="ap-seg">{DIETS.map(([id, label]) => <button key={id} type="button" className={diet === id ? "on" : ""} onClick={() => { setDiet(id); setPlan(null); }}>{label}</button>)}</div>
        </fieldset>
      )}

      <fieldset className="ap-meals"><legend>Which meals should I plan?</legend>
        {MEALS.map(([id, icon, label]) => (
          <label key={id} className={meals.includes(id) ? "on" : ""}><input type="checkbox" checked={meals.includes(id)} onChange={() => toggle(id)} />{icon} {label}</label>
        ))}
      </fieldset>
      <p className="ap-note">{past ? "This week is over. Go to this week or a future week to plan it." : `Planning ${days} day${days === 1 ? "" : "s"} from ${dayName(first)}. Meals you already planned or ate are left alone.`}</p>
      <div className="ap-actions">
        <button type="button" className="primary-button" disabled={busy || past || !meals.length} onClick={() => { const v = plan ? variant + 1 : variant; setVariant(v); run(true, v); }}>{busy && !plan ? "Building…" : plan ? "↻ Different plan" : "Preview my plan"}</button>
        {plan && <button type="button" className="primary-button ap-accept" disabled={busy} onClick={() => run(false)}>✓ Use this plan</button>}
      </div>
      {err && <p className="ap-err" role="alert">{err}</p>}

      {plan && (
        <>
          {plan.notes?.length > 0 && <div className="ap-notes">{plan.notes.map((n) => <p key={n}>ℹ️ {n}</p>)}</div>}
          <div className="ap-days">
            {plan.days.map((d) => (
              <div key={d.date} className="ap-day">
                <button type="button" className="ap-day-head" onClick={() => setOpen({ ...open, [d.date]: !open[d.date] })} aria-expanded={!!open[d.date]}>
                  <b>{dayName(d.date)}{d.trim > 0 && <span className="ap-light">lighter −{d.trim}</span>}</b>
                  <span>{d.totals.calories} of {d.target} kcal · P {d.totals.protein} g<i className="ap-flag">{flag(d.balance?.protein)}</i> · C {d.totals.carbohydrates} g<i className="ap-flag">{flag(d.balance?.carbs)}</i> · F {d.totals.fat} g<i className="ap-flag">{flag(d.balance?.fat)}</i> · fibre {d.totals.fiber} g<i className="ap-flag">{flag(d.balance?.fiber)}</i></span>
                  <em className={d.status.length ? "warn" : "ok"}>{d.status.length ? d.status[0] : "✓ balanced"}</em>
                </button>
                {open[d.date] && MEALS.map(([id, icon, label]) => itemsOf(d.date, id).length > 0 && (
                  <div key={id} className="ap-meal"><b>{icon} {label}</b>
                    {itemsOf(d.date, id).map((i) => (
                      <p key={`${i.foodId || i.foodName}|${i.mealType}`}><span>{i.foodName}<small>{i.why}</small></span><strong>{i.quantity} {i.servingUnit}<small>{i.calories} kcal · {i.protein} g protein</small></strong></p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {plan.limits?.length > 0 && (
            <details className="ap-habits"><summary>Variety I kept this week</summary>
              <div className="ap-limits">{plan.limits.map((l) => <p key={l.foodId || l.name}><span>{l.name}</span><small>{l.usedThisWeek} of max {l.weeklyCap}× per week{l.indulgent ? " · treat food" : ""}</small></p>)}</div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
