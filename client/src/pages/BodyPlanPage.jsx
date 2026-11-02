// Body plan, in four tabs so nothing is buried:
//   Workout = what to do today (default)   Eating = calories, macros, vitamins   Me = goal setup + tape measurements   More = the "why" and extras
// The top card always shows the headline numbers and the one button that matters: "Use this plan" (saves it so Home, Food and the Planner follow it). Same server API as the phone app: GET /api/body-plan, POST /api/body-plan/apply (server/lib/bodyPlan.js).
// The plan is worked out on the server, so this page needs a connection.
import { useCallback, useEffect, useState } from "react";
import "./bodyplan.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import { Section, Lines, TrainingSetup, Analysis, Workout, ActiveDays, Progress, Safety } from "./TrainingSections";

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
export default function BodyPlanPage({ onBack, onSaved }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState("");
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("workout");
  const [prefs, setPrefs] = useState(null); // the training setup being edited; previewed on the server, saved with "Use this plan"

  const load = useCallback(async (type, tp) => {
    try {
      const q = new URLSearchParams();
      if (type) q.set("type", type);
      if (tp) for (const k of ["place", "level", "days", "minutes"]) q.set(k, tp[k] ?? "");
      if (tp) q.set("weekdays", (tp.weekdays || []).join(","));
      if (tp) for (const k of ["equipment", "limits", "focus"]) q.set(k, (tp[k] || []).join(","));
      q.set("date", getLocalDate());
      const j = await call(`/api/body-plan?${q}`);
      setD(j); setErr("");
      setPick((p) => type || p || j.chosen || "");
      const sp = j.plan && j.plan.training && j.plan.training.prefs;
      if (sp && !tp) setPrefs({ place: sp.place, level: sp.level, days: sp.days, minutes: sp.minutes, equipment: sp.equipment, limits: sp.limits, focus: sp.focus, weekdays: sp.weekdays || [] });
    } catch (e) { setErr(e.message); }
  }, []);
  const changePrefs = (next) => { setPrefs(next); load(pick, next); };
  useEffect(() => { load(); }, [load]);

  if (!d) {
    return (
      <section className="bp">
        {onBack && <button type="button" className="bp-back" onClick={onBack}>← Back</button>}
        {err ? <p className="bp-err" role="alert">{err} <button type="button" className="bp-link" onClick={() => load()}>Try again</button></p> : <p className="bp-muted">Loading your body plan…</p>}
      </section>
    );
  }

  const plan = d.plan;
  const ready = !!(plan && plan.ready);
  const choose = (id) => { setPick(id); load(id, prefs); };
  const isCurrent = d.chosen === pick;

  const saveTape = async () => {
    const entries = Object.entries(vals).filter(([, v]) => Number(v) > 0);
    if (!entries.length) return;
    setBusy(true);
    try {
      for (const [type, v] of entries) await call("/api/health-logs", { method: "POST", body: JSON.stringify({ type, date: getLocalDate(), value: Number(v), source: "manual" }) });
      setVals({}); notify("Saved. Your plan is updated with these measurements.", "success"); await load(pick, prefs);
    } catch (e) { notify(`Could not save: ${e.message}`, "error"); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      await call("/api/body-plan/apply", { method: "POST", body: JSON.stringify({ type: pick, training: prefs, date: getLocalDate() }) });
      notify("Plan saved. Your calories, macros, quests and training now follow this body goal.", "success");
      await load(pick, prefs);
      onSaved?.();
    } catch (e) { notify(`Could not save the plan: ${e.message}`, "error"); } finally { setBusy(false); }
  };

  const clientId = () => `bp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // Log a finished (or skipped) session. The server sends back the re-worked plan, so the week, targets and advice update at once.
  const logSession = async (payload) => {
    setBusy(true);
    try {
      const j = await call("/api/body-plan/session", { method: "POST", body: JSON.stringify({ ...payload, clientId: clientId() }) });
      setD((old) => ({ ...old, plan: j.plan }));
      if (payload.status === "skipped") notify("Noted. Your week has been adjusted.", "success");
      else notify(j.highlights && j.highlights.length ? `Session logged. ${j.highlights[0].name}: ${j.highlights[0].text}` : "Session logged. Your plan is updated.", "success");
      onSaved?.();
      return true;
    } catch (e) { notify(`Could not save: ${e.message}`, "error"); return false; } finally { setBusy(false); }
  };
  // One-tap suggestions (more days, remove moves that hurt, level up) change the saved setup, then the plan is worked out again.
  const applySuggestion = async (change) => {
    const next = { ...(prefs || {}), ...(change.prefs || {}) };
    setPrefs(next);
    setBusy(true);
    try { await call("/api/body-plan/apply", { method: "POST", body: JSON.stringify({ type: pick, training: next, date: getLocalDate() }) }); notify("Plan updated.", "success"); await load(pick, next); }
    catch (e) { notify(`Could not update: ${e.message}`, "error"); } finally { setBusy(false); }
  };

  const TABS = [["workout", "💪", "Workout"], ["eating", "🍽️", "Eating"], ["me", "📏", "Me"], ["more", "📘", "More"]];

  return (
    <section className="bp">
      {onBack && <button type="button" className="bp-back" onClick={onBack}>← Back</button>}
      <h1 className="bp-title">Body plan</h1>

      {/* Step 1: the goal. Four big buttons, one line of explanation for the chosen one. */}
      <div className="bp-types" role="radiogroup" aria-label="Body goal">
        {d.types.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={pick === t.id} className={`bp-type${pick === t.id ? " on" : ""}`} onClick={() => choose(t.id)}>
            <span className="bp-ic" aria-hidden="true">{ICON[t.id] || "🎯"}</span>
            <b>{t.label}{d.chosen === t.id ? " ✓" : ""}</b>
          </button>
        ))}
      </div>
      {pick && <p className="bp-muted">{(d.types.find((t) => t.id === pick) || {}).blurb}</p>}
      {err && <p className="bp-err" role="alert">{err}</p>}
      {!pick && <p className="bp-muted">Pick the body you are aiming for to see your plan.</p>}

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

          {/* Step 2: the headline numbers and the one button that saves everything. */}
          <div className="bp-card bp-hero">
            <div className="bp-stats">
              <Stat l="Calories a day" v={plan.calories ? `${plan.calories.toLocaleString()}` : "—"} />
              <Stat l={plan.mode === "lose" ? "Target weight" : "Weight"} v={plan.mode === "lose" ? `${plan.goal.targetWeightKg} kg` : "Hold steady"} />
              <Stat l={plan.mode === "lose" ? "Time needed" : "Waist goal"} v={plan.mode === "lose" ? `~${plan.goal.weeks} weeks` : `${plan.goal.waistCm} cm`} />
              <Stat l="Steps a day" v={plan.steps.toLocaleString()} />
            </div>
            <button type="button" className="bp-btn" onClick={apply} disabled={busy}>{busy ? "Saving…" : isCurrent ? "Save my changes" : "Use this plan"}</button>
          </div>

          {/* Step 3: four tabs. */}
          <div className="bp-maintabs" role="tablist" aria-label="Body plan sections">
            {TABS.map(([id, icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`bp-mt${tab === id ? " on" : ""}`} onClick={() => setTab(id)}><span aria-hidden="true">{icon}</span>{label}</button>
            ))}
          </div>

          {tab === "workout" && <Workout program={plan.training.program} adapt={plan.adapt} onLog={logSession} onApplySuggestion={applySuggestion} busy={busy} />}

          {tab === "eating" && (
            <>
              <div className="bp-card">
                <h3 className="bp-h0">Eat this every day</h3>
                <div className="bp-stats">
                  <Stat l={`Protein (${plan.protein.gPerKg} g per kg)`} v={`${plan.macros.protein} g`} />
                  <Stat l="Carbs" v={`${plan.macros.carbs} g`} />
                  <Stat l={`Fat (${Math.round(plan.fatShare * 100)}% of calories)`} v={`${plan.macros.fat} g`} />
                  <Stat l="Fibre" v={`${plan.fiberG} g`} />
                </div>
                <p className="bp-muted">Drink about {(plan.waterMl / 1000).toFixed(1)} L of water. Spread protein over 3 or 4 meals so it protects your muscle.</p>
              </div>
              <div className="bp-card">
                <h3 className="bp-h0">Vitamins and minerals to watch</h3>
                <p className="bp-muted">Your needs do not drop when you eat less, so these most often run short.</p>
                {plan.microPriority.map((m) => <p key={m.id} className="bp-micro"><b>{m.label}</b><br /><span className="bp-muted">{m.why}. Try: {m.foods}.</span></p>)}
              </div>
            </>
          )}

          {tab === "me" && (
            <>
              <div className="bp-card">
                <h3 className="bp-h0">How do you train?</h3>
                <TrainingSetup options={d.trainingOptions} prefs={prefs} serverPrefs={plan.training.prefs} onChange={changePrefs} />
                <p className="bp-muted">Your workout updates as you tap. Press “Use this plan” above to keep it.</p>
              </div>
              <div className="bp-card">
                <h3 className="bp-h0">Measurements</h3>
                <Lines items={plan.shape} />
                {plan.tape.length > 0 && (
                  <div className="bp-tape">
                    <p className="bp-muted">Add tape measurements (cm). More readings make the plan more exact.</p>
                    {plan.tape.map((m) => (
                      <label key={m.type} className="bp-field">
                        <span>{TAPE_LABEL[m.type] || m.type} (cm)</span>
                        <input type="number" inputMode="decimal" min="1" step="0.1" value={vals[m.type] || ""} placeholder={m.how} onChange={(e) => setVals((x) => ({ ...x, [m.type]: e.target.value }))} />
                      </label>
                    ))}
                    <button type="button" className="bp-btn ghost" onClick={saveTape} disabled={busy || !Object.values(vals).some((v) => Number(v) > 0)}>{busy ? "Saving…" : "Save measurements"}</button>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "more" && (
            <>
              <Section title="Your body analysis"><Analysis a={plan.analysis} /></Section>
              <Section title="Getting stronger every week"><Progress program={plan.training.program} /></Section>
              <Section title="Cardio and active days"><ActiveDays program={plan.training.program} /></Section>
              <Section title="Training safety"><Safety items={plan.training.program.safety} /></Section>
              <Section title="Where this plan comes from">
                <Lines items={[
                  "Calories and pace: your height, weight, age and sex through the Mifflin-St Jeor energy equation, with a safe floor and a loss pace capped near 1 percent of body weight a week.",
                  "Body fat: the US Navy tape method when you add waist and neck (and hips), otherwise the Deurenberg estimate from BMI, age and sex. Both can be off by a few points.",
                  "Muscle index (FFMI) and target body-fat bands: common sports-science reference ranges, used as guides, not as judgements.",
                  "Training: progressive overload with double progression, 10 to 20 hard sets per muscle a week, and stopping with reps in reserve. These are widely used strength-training principles (for example from ACSM position stands and hypertrophy research).",
                  "Cardio zones: Tanaka maximum heart rate. Activity calories: MET values from the Compendium of Physical Activities.",
                  "Adapting: the plan reads the sessions you log. Hit the top of the rep range and the weight goes up a small step; reps dip two sessions in a row and it eases off; skip a week and it slides sessions along; come back after a break and it starts a little lighter; do more than planned for weeks with good recovery and it offers an extra day.",
                  "This is general guidance, not medical advice or a diagnosis. If something hurts, or you have a health condition, check with a doctor or physiotherapist.",
                ]} />
              </Section>
              <Section title="About this plan">
                <div className="bp-stats">
                  <Stat l="Body fat now" v={`${plan.body.bodyFatPct}% (${plan.body.bodyFatSource === "tape" ? "from tape" : "estimate"})`} />
                  <Stat l="Healthy range" v={`${plan.goal.bodyFatBand[0]} to ${plan.goal.bodyFatBand[1]}%`} />
                  {plan.mode === "lose" && <Stat l="Pace" v={`${plan.goal.weeklyPaceKg} kg / week`} />}
                </div>
                {plan.notes.map((n, i) => <p key={i} className="bp-muted">{n}</p>)}
              </Section>
              {plan.checkpoints.length > 0 && <Section title="Checkpoints"><Lines items={plan.checkpoints.map((c) => `Week ${c.week}: about ${c.weightKg} kg. ${c.check}`)} /></Section>}
              <p className="bp-muted">Targets are estimates to start from, not medical advice. If you have a health condition, are pregnant or breastfeeding, check with your doctor.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
