// "Plan my week": the Planning sensei asks a few questions (first time, and "Improve my plan" later), then builds the plan, shows it with the
// reasons and only saves when they press "Use this plan".
//   Balanced (recommended)  every plate has protein + carbs + vegetables; your own foods first, healthy foods fill the gaps
//   Only foods I eat        the older mode: your history only, in your usual portions
// Everything the sensei learned (diet, allergies, cuisine, cook time, eating out, fasting ...) is applied by the server: an allergen you keep
// out never appears. After heavy days the plan uses lighter targets and leaves out treats; pregnancy, under 18 and medical conditions get a
// "check with a doctor or dietitian" note and a steady target instead of a cut.
import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import SenseiChat from "./SenseiChat";
import SenseiSticker from "./SenseiSticker";
import "./autoplan.css";

const MEALS = [["breakfast", "🌅", "Breakfast"], ["lunch", "☀️", "Lunch"], ["dinner", "🌙", "Dinner"], ["snacks", "🍎", "Snacks"]];
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dayName = (s) => parse(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const flag = (x) => (x === "low" ? "↓" : x === "high" ? "↑" : "");

export default function AutoPlanPanel({ from, to, onClose, onSaved }) {
  const today = getLocalDate();
  const first = from < today ? today : from;
  const past = to < today;
  const days = Math.max(1, Math.min(7, diff(first, to) + 1));
  const [stage, setStage] = useState("loading");        // loading | chat | plan
  const [sensei, setSensei] = useState(null);           // { chips, safety, setupDone, sensei: { sticker } }
  const [mode, setMode] = useState("balanced");
  const [ctx, setCtx] = useState(null);
  const [variant, setVariant] = useState(0);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState({});

  const loadSensei = () => apiFetch(`/api/food-prefs?days=${days}`).then((r) => r.json()).then((d) => { if (d.success) { setSensei(d); setStage(d.setupDone ? "plan" : "chat"); } else setStage("plan"); }).catch(() => setStage("plan"));
  useEffect(() => { loadSensei(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiFetch(`/api/meal-plans/context?from=${first}&days=${days}&today=${today}`).then((r) => r.json()).then((d) => { if (d.success) setCtx(d); }).catch(() => {});
  }, [first, days, today]);

  const run = async (preview, v = variant, thenShop = false) => {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch("/api/meal-plans/auto", { method: "POST", body: JSON.stringify({ from: first, days, mode, variant: v, preview, today }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.message || "Could not build the plan."); if (preview) setPlan(null); return; }
      if (preview) { setPlan(d); setOpen({ [d.days[0]?.date]: true }); } else { notify(`Planned ${d.saved} foods for ${days} day${days === 1 ? "" : "s"}.`, "success"); onSaved?.({ shop: thenShop }); onClose?.(); }
    } catch { setErr("Planning needs a connection. Try again in a moment."); } finally { setBusy(false); }
  };
  const itemsOf = (date, meal) => (plan?.items || []).filter((i) => i.date === date && i.mealType === meal);
  const a = ctx?.advice;

  if (stage === "loading") return <section className="large-card ap" aria-busy="true"><p className="ap-sub">Opening the planner…</p></section>;
  if (stage === "chat") return <SenseiChat onClose={onClose} onDone={(st) => { setSensei((s) => ({ ...s, ...st })); setPlan(null); setStage("plan"); }} />;

  const safety = plan?.safety?.flagged ? plan.safety : sensei?.safety?.flagged ? sensei.safety : null;
  const setChips = (sensei?.chips || []).filter((c) => c.set);

  return (
    <section className="large-card ap" aria-label="Plan my week">
      <div className="section-header">
        <div><h2>✨ Plan my week</h2><p>Balanced plates sized to your calories and macros, shaped by your answers.</p></div>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>

      {safety && <div className="ib is-hot" role="note"><span className="ib-ic" aria-hidden="true">🩺</span><div><b>Please check with a doctor or dietitian</b><p>{safety.note}</p></div></div>}

      {a && (
        <div className={`ib ${a.level === "watch" ? "" : "is-hot"}`} role="status">
          <span className="ib-ic" aria-hidden="true">{a.level === "watch" ? "💡" : "⚠️"}</span>
          <div><b>{a.headline}</b><p>{a.skipCut ? a.detail : "The plan below already uses these lighter days and leaves out treats until you are back on track."}</p></div>
        </div>
      )}

      <div className="ap-setup" aria-label="Your plan setup">
        <div className="ap-setup-head"><b>Your plan setup</b>{sensei?.sensei?.sticker && <SenseiSticker size={36} label={false} />}</div>
        <p className="ap-sub">{setChips.length ? setChips.map((c) => `${c.label}: ${c.value}`).join(" · ") : "Nothing saved yet."}</p>
        <div className="ap-actions">
          <button type="button" className="secondary-button" onClick={() => setStage("chat")}>{sensei?.setupDone ? "Improve my plan" : "Answer a few questions"}</button>
        </div>
      </div>

      <details className="ap-habits"><summary>Other ways to plan</summary>
        <div className="ap-seg" style={{ margin: "8px 0 12px" }}>
          <button type="button" className={mode === "balanced" ? "on" : ""} onClick={() => { setMode("balanced"); setPlan(null); }}>⚖️ Balanced (recommended)</button>
          <button type="button" className={mode === "mine" ? "on" : ""} onClick={() => { setMode("mine"); setPlan(null); }}>🍽️ Only foods I eat</button>
        </div>
        <p className="ap-sub">{mode === "balanced" ? "Every plate gets protein, a carb and vegetables. Healthy foods you do not log yet fill the gaps (they are added to your list when you save)." : "Uses only foods you really log, in your usual portions. It can only be as balanced as your log."}</p>
      </details>

      <p className="ap-note">{past ? "This week is over. Go to this week or a future week to plan it." : `Planning ${days} day${days === 1 ? "" : "s"} from ${dayName(first)}. Meals you already planned, locked or ate are left alone.`}</p>
      <div className="ap-actions">
        <button type="button" className="primary-button" disabled={busy || past} onClick={() => { const v = plan ? variant + 1 : variant; setVariant(v); run(true, v); }}>{busy && !plan ? "Building…" : plan ? "↻ Shuffle" : "Preview my plan"}</button>
        {plan && <button type="button" className="primary-button ap-accept" disabled={busy} onClick={() => run(false)}>✓ Use this plan</button>}
        {plan && <button type="button" className="secondary-button" disabled={busy} onClick={() => run(false, variant, true)}>✓ Use it and make my grocery list</button>}
      </div>
      {err && <p className="ap-err" role="alert">{err}</p>}

      {plan && (
        <>
          {plan.fixed?.filter((f) => f.loggedMeals.length).map((f) => <p key={`fx${f.date}`} className="ap-sub">🔒 {dayName(f.date)}: {f.loggedMeals.join(", ")} already logged ({f.eaten} kcal) stays as is. Planning fills the {Math.max(0, f.remaining)} kcal that are left.</p>)}
          {plan.addOns?.map((x) => <p key={`ao${x.date}${x.mealType}`} className="ap-sub">💡 {dayName(x.date)} {x.mealType}: {x.text}.</p>)}
          {plan.notes?.length > 0 && <div className="ap-notes">{plan.notes.filter((n) => n !== plan.safety?.note).map((n) => <p key={n}>ℹ️ {n}</p>)}</div>}
          <div className="ap-days">
            {plan.days.map((d) => (
              <div key={d.date} className="ap-day">
                <button type="button" className="ap-day-head" onClick={() => setOpen({ ...open, [d.date]: !open[d.date] })} aria-expanded={!!open[d.date]}>
                  <b>{dayName(d.date)}{d.trim > 0 && <span className="ap-light">lighter −{d.trim}</span>}{d.out?.length > 0 && <span className="ap-light">{d.out.map((o) => o.meal).join(" + ")} out</span>}{d.vrat && <span className="ap-light">vrat</span>}{d.ramadan && <span className="ap-light">Ramadan</span>}{d.festivalRoom > 0 && <span className="ap-light">feast room {d.festivalRoom}</span>}</b>
                  <span>{d.totals.calories} of {d.target} kcal · P {d.totals.protein} g<i className="ap-flag">{flag(d.balance?.protein)}</i> · C {d.totals.carbohydrates} g<i className="ap-flag">{flag(d.balance?.carbs)}</i> · F {d.totals.fat} g<i className="ap-flag">{flag(d.balance?.fat)}</i> · fibre {d.totals.fiber} g<i className="ap-flag">{flag(d.balance?.fiber)}</i></span>
                  <em className={d.status.length ? "warn" : "ok"}>{d.status.length ? d.status[0] : "✓ balanced"}</em>
                </button>
                {open[d.date] && d.out?.map((o) => <div key={o.meal} className="ap-meal"><b>🍱 {o.meal[0].toUpperCase() + o.meal.slice(1)} (eaten out{o.kind ? `: ${o.kind}` : ""})</b><p><span>Aim for about {o.aim} kcal with protein, a carb and vegetables.</span></p></div>)}
                {open[d.date] && MEALS.map(([id, icon, label]) => itemsOf(d.date, id).length > 0 && (
                  <div key={id} className="ap-meal"><b>{icon} {label}</b>
                    {itemsOf(d.date, id).map((i) => (
                      <p key={`${i.foodId || i.foodName}|${i.mealType}`}><span>{i.foodName}<small>{i.why}{i.cookNote ? ` · ${i.cookNote}` : ""}</small></span><strong>{i.quantity} {i.servingUnit}<small>{i.calories} kcal · {i.protein} g protein</small></strong></p>
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
