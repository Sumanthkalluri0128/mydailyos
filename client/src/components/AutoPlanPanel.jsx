// "Plan my week from what I eat": builds the plan from the person's own food history, shows it with the reasons and the limits
// it respected, and only saves when they press "Use this plan".
import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import "./autoplan.css";

const MEALS = [["breakfast", "🌅", "Breakfast"], ["lunch", "☀️", "Lunch"], ["dinner", "🌙", "Dinner"], ["snacks", "🍎", "Snacks"]];
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dayName = (s) => parse(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

export default function AutoPlanPanel({ from, to, onClose, onSaved }) {
  const today = getLocalDate();
  const first = from < today ? today : from;
  const past = to < today;
  const days = Math.max(1, Math.min(7, diff(first, to) + 1));
  const [meals, setMeals] = useState(["breakfast", "lunch", "dinner", "snacks"]);
  const [plan, setPlan] = useState(null);
  const [habits, setHabits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState({});

  useEffect(() => {
    apiFetch(`/api/meal-plans/habits?today=${today}`).then((r) => r.json()).then((d) => d.success && setHabits(d)).catch(() => {});
  }, [today]);

  const run = async (preview) => {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch("/api/meal-plans/auto", { method: "POST", body: JSON.stringify({ from: first, days, meals, preview, today }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.message || "Could not build the plan."); setPlan(null); return; }
      if (preview) { setPlan(d); setOpen({ [d.days[0]?.date]: true }); } else { notify(`Planned ${d.saved} items from what you eat.`, "success"); onSaved?.(); onClose?.(); }
    } catch { setErr("Planning needs a connection. Try again in a moment."); } finally { setBusy(false); }
  };
  const toggle = (m) => setMeals((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));
  const itemsOf = (date, meal) => (plan?.items || []).filter((i) => i.date === date && i.mealType === meal);

  return (
    <section className="large-card ap" aria-label="Plan my week from what I eat">
      <div className="section-header">
        <div><h2>✨ Plan my week from what I eat</h2><p>Uses only foods you really log, in your usual portions, with a weekly limit per food. Sized to your calories and macros.</p></div>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>

      {habits && habits.loggedDays > 0 && (
        <details className="ap-habits">
          <summary>What I learned from your last {habits.loggedDays} logged days</summary>
          <div className="ap-habit-grid">
            {MEALS.map(([id, icon, label]) => (habits.meals[id] || []).length > 0 && (
              <div key={id}><b>{icon} {label}</b>
                {habits.meals[id].slice(0, 5).map((h) => (
                  <p key={h.foodId}><span>{h.name}</span><small>~{Math.round(h.perWeek)}×/week · usual {h.usualQty} {h.unit} · max {h.weeklyCap}×/week{h.indulgent ? " · treat" : ""}</small></p>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      <fieldset className="ap-meals"><legend>Which meals should I plan?</legend>
        {MEALS.map(([id, icon, label]) => (
          <label key={id} className={meals.includes(id) ? "on" : ""}><input type="checkbox" checked={meals.includes(id)} onChange={() => toggle(id)} />{icon} {label}</label>
        ))}
      </fieldset>
      <p className="ap-note">{past ? "This week is over. Go to this week or a future week to plan it." : `Planning ${days} day${days === 1 ? "" : "s"} from ${dayName(first)}. Meals you already planned or ate are left alone.`}</p>
      <div className="ap-actions">
        <button type="button" className="primary-button" disabled={busy || past || !meals.length} onClick={() => run(true)}>{busy && !plan ? "Building…" : plan ? "Rebuild preview" : "Preview my plan"}</button>
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
                  <b>{dayName(d.date)}</b>
                  <span>{d.totals.calories} kcal · P {d.totals.protein} g · C {d.totals.carbohydrates} g · F {d.totals.fat} g</span>
                  <em className={d.status.length ? "warn" : "ok"}>{d.status.length ? d.status[0] : "✓ on plan"}</em>
                </button>
                {open[d.date] && MEALS.map(([id, icon, label]) => itemsOf(d.date, id).length > 0 && (
                  <div key={id} className="ap-meal"><b>{icon} {label}</b>
                    {itemsOf(d.date, id).map((i) => (
                      <p key={i.foodId + i.mealType}><span>{i.foodName}<small>{i.why}</small></span><strong>{i.quantity} {i.servingUnit}<small>{i.calories} kcal · {i.protein} g protein</small></strong></p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {plan.limits?.length > 0 && (
            <details className="ap-habits"><summary>Limits I kept to this week</summary>
              <div className="ap-limits">{plan.limits.map((l) => (
                <p key={l.foodId}><span>{l.name}</span><small>{l.usedThisWeek} of max {l.weeklyCap}× per week · portion up to {l.maxQty} {l.unit}{l.indulgent ? " · treat food" : ""}</small></p>
              ))}</div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
