// Home, minimal: ONE card that answers "how is today going and what should I do now".
// Calories ring + protein / water / steps in one place, the coach's single most important next step (same engine as the chat),
// and four primary actions. Everything else lives in the collapsed sections below it.
import { useEffect, useState } from "react";
import "./homefocus.css";
import { apiFetch } from "../config/api";
import { dayBalance, expectedEnergy, macroTargets } from "../utils/energy";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import Buddy from "../motion/Buddy";

const n = (v) => Math.round(Number(v) || 0);
const greet = (h) => (h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Good night");

function Ring({ pct, over, children }) {
  const r = 70, c = 2 * Math.PI * r, fill = Math.max(0, Math.min(1, pct));
  return (
    <div className={`hf-ring ${over ? "is-over" : ""}`}>
      <svg viewBox="0 0 170 170" aria-hidden="true">
        <circle cx="85" cy="85" r={r} className="hf-track" />
        <circle cx="85" cy="85" r={r} className="hf-arc" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - fill)} transform="rotate(-90 85 85)" />
      </svg>
      <div className="hf-ring-in">{children}</div>
    </div>
  );
}

function Meter({ label, value, target, unit, tone, onClick }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <button type="button" className={`hf-meter tone-${tone}`} onClick={onClick} aria-label={`${label}: ${n(value)} of ${n(target)} ${unit}`}>
      <span>{label}</span>
      <i><b style={{ width: `${pct}%` }} /></i>
      <strong>{n(value).toLocaleString()}<small> / {n(target).toLocaleString()} {unit}</small></strong>
    </button>
  );
}

export default function HomeFocus({ profile, summary, activity, water, waterTarget, latestWeight, streak, goTo, onAsk, syncTick, onChanged }) {
  const hour = new Date().getHours();
  const e = expectedEnergy(profile);
  const bal = dayBalance(profile, { eaten: summary?.calories, workout: Number(activity?.workoutCalories ?? 0), steps: Number(activity?.stepCalories || 0) });
  const macros = bal.target ? macroTargets(bal.target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget) : null;
  const stepsT = profile?.goals?.stepsTarget ?? 10000;
  const over = bal.budget > 0 && bal.remaining < 0;
  const name = (profile?.name || "").split(" ")[0];
  const tw = profile?.goals?.targetWeightKg;

  // the coach's one most important next step (same engine as Ask FlexFit)
  const [next, setNext] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/assistant/ask", { method: "POST", body: JSON.stringify({ question: "What should I do next?", today: getLocalDate(), hour: new Date().getHours() }) })
      .then((r) => r.json()).then((d) => { if (alive && d?.success) setNext({ text: (d.top || d.text.split("\n")[0]), actions: d.actions || [] }); }).catch(() => {});
    return () => { alive = false; };
  }, [syncTick, summary?.calories, water?.totalMl]);

  const [busy, setBusy] = useState(false);
  const addWater = async (ml) => {
    if (busy) return; setBusy(true);
    try {
      const r = await apiFetch("/api/water", { method: "POST", body: JSON.stringify({ date: getLocalDate(), amountMl: ml }) });
      if (r.ok) { notify(`Added ${ml >= 1000 ? "1 L" : `${ml} ml`} of water.`, "success"); onChanged?.(); } else notify("Could not add water.", "error");
    } catch { notify("Could not add water.", "error"); } finally { setBusy(false); }
  };
  const act = (a) => { if (a.page) goTo(a.page); else if (a.ask) onAsk?.({ question: a.ask }); };

  return (
    <section className="hf" aria-label="Today">
      <header className="hf-top">
        <div>
          <small>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</small>
          <h1>{greet(hour)}{name ? `, ${name}` : ""}</h1>
        </div>
        {streak?.current > 0 && <span className="hf-streak" title="Days in a row you logged">🔥 {streak.current}</span>}
      </header>

      <div className="hf-main">
        <Ring pct={bal.budget ? bal.eaten / bal.budget : 0} over={over}>
          <strong>{bal.budget ? Math.abs(n(bal.remaining)).toLocaleString() : "—"}</strong>
          <span>{!bal.budget ? "Add your body details" : over ? "kcal over" : "kcal left"}</span>
          {bal.budget > 0 && <small>{n(bal.eaten).toLocaleString()} of {n(bal.budget).toLocaleString()}</small>}
        </Ring>
        <div className="hf-meters">
          {macros && <Meter label="Protein" value={summary?.protein} target={macros.protein} unit="g" tone="protein" onClick={() => goTo("foodLogger")} />}
          <Meter label="Water" value={water?.totalMl} target={waterTarget} unit="ml" tone="water" onClick={() => goTo("water")} />
          <Meter label="Steps" value={activity?.steps} target={stepsT} unit="" tone="steps" onClick={() => goTo("exercise")} />
          <button type="button" className="hf-weight" onClick={() => goTo("weight")}>
            <span>Weight</span>
            <strong>{latestWeight != null ? `${Number(latestWeight).toFixed(1)} kg` : "Add"}</strong>
            {latestWeight != null && tw ? <small>{Math.abs(latestWeight - tw).toFixed(1)} kg to {Number(tw).toFixed(1)}</small> : <small>See trend</small>}
          </button>
        </div>
      </div>

      <div className="hf-coach">
        <Buddy scene={over ? "sad" : "think"} size={56} talk={false} />
        <div>
          <b>Your next step</b>
          <p>{next?.text || (over ? "You're over today. Keep the rest light and walk after dinner." : "Log what you eat as you go. I'll tell you what matters most.")}</p>
        </div>
        <div className="hf-coach-actions">
          {next?.actions?.slice(0, 1).map((a) => <button key={a.label} type="button" className="hf-pill" onClick={() => act(a)}>{a.label}</button>)}
          <button type="button" className="hf-pill hf-ghost" onClick={() => onAsk?.()}>💬 Ask</button>
        </div>
      </div>

      <div className="hf-actions">
        <button type="button" className="hf-primary" onClick={() => goTo("foodLogger")}><span>🍽️</span>Log food</button>
        <button type="button" onClick={() => addWater(250)} disabled={busy}><span>💧</span>+250 ml</button>
        <button type="button" onClick={() => addWater(500)} disabled={busy}><span>🥤</span>+500 ml</button>
        <button type="button" onClick={() => goTo("exercise")}><span>🔥</span>Workout</button>
      </div>
    </section>
  );
}
