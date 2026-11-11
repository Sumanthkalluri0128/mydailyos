// Home card for the saved Body plan: the same numbers as Body > Eating (one server plan), plus today's and this week's read-out.
// Data: GET /api/body-plan (the same call the Body plan page makes), so Home, Body plan and the phone can never disagree.
import { useEffect, useState } from "react";
import "../../pages/bodyplan.css";
import { apiFetch } from "../../config/api";
import { getLocalDate } from "../../utils/date";

const ICON = { lean: "🌿", athletic: "🏃", muscular: "🏋️", balanced: "🧘" };
const LABEL = { lean: "Lean & toned", athletic: "Athletic", muscular: "Strong & muscular", balanced: "Healthy & balanced" };
const Stat = ({ l, v }) => <div className="bp-stat"><small>{l}</small><b>{v}</b></div>;

export default function BodyPlanHomeCard({ goTo, refreshKey }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/body-plan?date=${getLocalDate()}`);
        const j = await r.json();
        if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || "unavailable");
        if (live) { setD(j); setErr(""); }
      } catch (e) { if (live) setErr(e.message); }
    })();
    return () => { live = false; };
  }, [refreshKey]);

  const plan = d && d.plan;
  if (err && !plan) return null;                       // never block Home
  if (!plan) return <div className="bp-card"><p className="bp-muted">Loading your body plan…</p></div>;
  if (!plan.ready) return null;

  const a = plan.adapt;
  const adh = a && a.adherence && a.adherence.pct;
  const wk = a && a.week;
  const daily = a && a.todayPlan && a.todayPlan.text;
  const type = d.chosen;

  return (
    <div className="bp-card bp-home">
      <h3 className="bp-h0">{ICON[type] || "🎯"} My body plan{LABEL[type] ? ` · ${LABEL[type]}` : ""}</h3>
      <div className="bp-stats">
        <Stat l="Calories a day" v={plan.calories ? plan.calories.toLocaleString() : "—"} />
        <Stat l={plan.mode === "lose" ? "Target weight" : "Weight"} v={plan.mode === "lose" ? `${plan.goal.targetWeightKg} kg` : "Hold steady"} />
        <Stat l={plan.mode === "lose" ? "Time needed" : "Waist goal"} v={plan.mode === "lose" ? `~${plan.goal.weeks} weeks` : `${plan.goal.waistCm} cm`} />
        <Stat l="Steps a day" v={plan.steps.toLocaleString()} />
      </div>
      <div className="bp-stats">
        <Stat l="Protein" v={`${plan.macros.protein} g`} />
        <Stat l="Carbs" v={`${plan.macros.carbs} g`} />
        <Stat l="Fat" v={`${plan.macros.fat} g`} />
        <Stat l="Fibre" v={`${plan.fiberG} g`} />
      </div>

      <h4 className="bp-h">Today</h4>
      <p className="bp-muted">{daily || "Open Today in Workout & Body to see your session and how your body feels."}</p>

      <h4 className="bp-h">This week</h4>
      <div className="bp-stats">
        <Stat l="Sessions done" v={wk ? `${wk.doneSoFar} of ${wk.planned}` : "—"} />
        <Stat l="Kept to plan" v={adh === null || adh === undefined ? "Too early" : `${adh}%`} />
      </div>
      {plan.analysis && plan.analysis.headline && <p className="bp-lead">{plan.analysis.headline}</p>}

      <button type="button" className="bp-btn ghost" onClick={() => goTo("bodyPlan")}>Open full plan & analysis</button>
    </div>
  );
}
