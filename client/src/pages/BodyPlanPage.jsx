// Body plan: pick the body you are aiming for, add a few tape measurements, and get a plan (target weight and waist, safe pace,
// calories, macros, training, the vitamins and minerals that matter while eating less). "Use this plan" saves it so Home, Food and
// the Planner follow it. Same server API as the phone app: GET /api/body-plan, POST /api/body-plan/apply (server/lib/bodyPlan.js).
// The plan is worked out on the server, so this page needs a connection.
import { useCallback, useEffect, useState } from "react";
import "./bodyplan.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";

const ICON = { lean: "🌿", athletic: "🏃", muscular: "🏋️", balanced: "🧘" };
const TAPE_LABEL = { waist: "Waist", neck: "Neck", hips: "Hips", chest: "Chest", arm: "Upper arm", thigh: "Thigh" };

async function call(path, options) {
  const r = await apiFetch(path, options);
  let j = null;
  try { j = await r.json(); } catch { /* not JSON */ }
  if (!r.ok || !j || j.success === false) {
    const err = new Error((j && j.message) || (r.status === 503 ? "The body plan needs a connection." : `Request failed (${r.status})`));
    err.plan = j && j.plan;
    throw err;
  }
  return j;
}

function Stat({ l, v }) {
  return <div className="bp-stat"><small>{l}</small><b>{v}</b></div>;
}
function Fold({ title, open, onToggle, children }) {
  return (
    <section className="bp-card">
      <button type="button" className="bp-fold" aria-expanded={!!open} onClick={onToggle}><span>{title}</span><i aria-hidden="true">{open ? "▾" : "▸"}</i></button>
      {open && <div className="bp-body">{children}</div>}
    </section>
  );
}
const Lines = ({ items }) => <ul className="bp-lines">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;

export default function BodyPlanPage({ onBack, onSaved }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState("");
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({ plan: true, macros: true });

  const load = useCallback(async (type) => {
    try {
      const j = await call(`/api/body-plan${type ? `?type=${encodeURIComponent(type)}` : ""}`);
      setD(j); setErr("");
      setPick((p) => type || p || j.chosen || "");
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!d) {
    return (
      <section className="bp">
        <button type="button" className="bp-back" onClick={onBack}>← Back</button>
        {err ? <p className="bp-err" role="alert">{err} <button type="button" className="bp-link" onClick={() => load()}>Try again</button></p> : <p className="bp-muted">Loading your body plan…</p>}
      </section>
    );
  }

  const plan = d.plan;
  const ready = !!(plan && plan.ready);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const choose = (id) => { setPick(id); load(id); };

  const saveTape = async () => {
    const entries = Object.entries(vals).filter(([, v]) => Number(v) > 0);
    if (!entries.length) return;
    setBusy(true);
    try {
      for (const [type, v] of entries) await call("/api/health-logs", { method: "POST", body: JSON.stringify({ type, date: getLocalDate(), value: Number(v), source: "manual" }) });
      setVals({}); notify("Saved. Your plan is updated with these measurements.", "success"); await load(pick);
    } catch (e) { notify(`Could not save: ${e.message}`, "error"); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      await call("/api/body-plan/apply", { method: "POST", body: JSON.stringify({ type: pick }) });
      notify("Plan saved. Your calories, macros and quests now follow this body goal.", "success");
      onSaved?.();
    } catch (e) { notify(`Could not save the plan: ${e.message}`, "error"); } finally { setBusy(false); }
  };

  return (
    <section className="bp">
      <button type="button" className="bp-back" onClick={onBack}>← Back</button>
      <h1 className="bp-title">Body plan</h1>
      <p className="bp-muted">Choose the body you are aiming for. Your calories, protein, fat and carbs are worked out from this and your measurements.</p>
      {err && <p className="bp-err" role="alert">{err}</p>}

      <div className="bp-types" role="radiogroup" aria-label="Body goal">
        {d.types.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={pick === t.id} className={`bp-type${pick === t.id ? " on" : ""}`} onClick={() => choose(t.id)}>
            <span className="bp-ic" aria-hidden="true">{ICON[t.id] || "🎯"}</span>
            <span className="bp-tt"><b>{t.label}{d.chosen === t.id ? "  ✓ current" : ""}</b><small>{t.blurb}</small></span>
          </button>
        ))}
      </div>

      {!pick && <p className="bp-muted">Pick one to see your plan.</p>}

      {pick && plan && !ready && (
        <div className="bp-card">
          <b>{plan.reason === "adult-only" ? "Adults only" : "A little more about you first"}</b>
          <p className="bp-muted">{plan.message}</p>
          {plan.reason === "missing-profile" && <button type="button" className="bp-btn" onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "profile" } }))}>Open my profile</button>}
        </div>
      )}

      {pick && ready && (
        <>
          {plan.safety.filter((s) => s.level !== "info").map((s) => (
            <div key={s.id} className={`bp-card bp-safe${s.level === "alert" ? " alert" : ""}`}><b>{s.title}</b><p className="bp-muted">{s.detail}</p></div>
          ))}

          <Fold title={`Your plan: ${plan.label}`} open={open.plan} onToggle={() => toggle("plan")}>
            <div className="bp-stats">
              <Stat l="Calories a day" v={plan.calories ? `${plan.calories.toLocaleString()} kcal` : "—"} />
              <Stat l="Target weight" v={plan.mode === "lose" ? `${plan.goal.targetWeightKg} kg` : "Hold steady"} />
              {plan.mode === "lose" && <Stat l="Pace" v={`${plan.goal.weeklyPaceKg} kg / week`} />}
              {plan.mode === "lose" && <Stat l="About" v={`${plan.goal.weeks} weeks`} />}
              <Stat l="Waist goal" v={`${plan.goal.waistCm} cm`} />
              <Stat l="Body fat now" v={`${plan.body.bodyFatPct}% (${plan.body.bodyFatSource === "tape" ? "from tape" : "estimate"})`} />
              <Stat l="Healthy range for this goal" v={`${plan.goal.bodyFatBand[0]} to ${plan.goal.bodyFatBand[1]}%`} />
              <Stat l="Steps a day" v={plan.steps.toLocaleString()} />
            </div>
            {plan.notes.map((n, i) => <p key={i} className="bp-muted">{n}</p>)}
          </Fold>

          <Fold title="Macros every day" open={open.macros} onToggle={() => toggle("macros")}>
            <div className="bp-stats">
              <Stat l={`Protein (${plan.protein.gPerKg} g per kg)`} v={`${plan.macros.protein} g`} />
              <Stat l="Carbs" v={`${plan.macros.carbs} g`} />
              <Stat l={`Fat (${Math.round(plan.fatShare * 100)}% of calories)`} v={`${plan.macros.fat} g`} />
              <Stat l="Fibre" v={`${plan.fiberG} g`} />
            </div>
            <p className="bp-muted">Water about {(plan.waterMl / 1000).toFixed(1)} L a day. Protein is spread over 3 or 4 meals so it keeps your muscle.</p>
          </Fold>

          <Fold title="Shape and measurements" open={open.shape} onToggle={() => toggle("shape")}>
            <Lines items={plan.shape} />
            {plan.tape.length > 0 && (
              <div className="bp-tape">
                <p className="bp-muted">Add measurements (cm). More readings make the plan more exact.</p>
                {plan.tape.map((m) => (
                  <label key={m.type} className="bp-field">
                    <span>{TAPE_LABEL[m.type] || m.type} (cm)</span>
                    <input type="number" inputMode="decimal" min="1" step="0.1" value={vals[m.type] || ""} placeholder={m.how} onChange={(e) => setVals((x) => ({ ...x, [m.type]: e.target.value }))} />
                  </label>
                ))}
                <button type="button" className="bp-btn ghost" onClick={saveTape} disabled={busy || !Object.values(vals).some((v) => Number(v) > 0)}>{busy ? "Saving…" : "Save measurements"}</button>
              </div>
            )}
          </Fold>

          <Fold title="Training that fits this body" open={open.train} onToggle={() => toggle("train")}>
            <Lines items={plan.training.sessions} />
          </Fold>

          <Fold title="Vitamins and minerals to watch" open={open.micro} onToggle={() => toggle("micro")}>
            <p className="bp-muted">Your needs do not drop when you eat less, so these are the ones that most often run short.</p>
            {plan.microPriority.map((m) => <p key={m.id} className="bp-micro"><b>{m.label}</b><br /><span className="bp-muted">{m.why}. Try: {m.foods}.</span></p>)}
          </Fold>

          {plan.checkpoints.length > 0 && (
            <Fold title="Checkpoints" open={open.check} onToggle={() => toggle("check")}>
              <Lines items={plan.checkpoints.map((c) => `Week ${c.week}: about ${c.weightKg} kg. ${c.check}`)} />
            </Fold>
          )}

          <div className="bp-save">
            <button type="button" className="bp-btn" onClick={apply} disabled={busy}>{busy ? "Saving…" : d.chosen === pick ? "Refresh my plan" : "Use this plan"}</button>
            <p className="bp-muted">Targets are estimates to start from, not medical advice. If you have a health condition, are pregnant or breastfeeding, check with your doctor.</p>
          </div>
        </>
      )}
    </section>
  );
}
