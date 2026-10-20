import { useCallback, useEffect, useState } from "react";
import "./fatloss.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import WeightReveal from "./WeightReveal";

const j = (p) => apiFetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// The north-star card: progress on the plan, this week's graded fat-loss score, whether the TREND sits inside the expected corridor,
// the three weekly focus habits and any safety notes. Weights are always blurred until tapped; "Hide calorie numbers" mode also masks calories.
export default function FatLossCard({ onOpen, syncTick }) {
  const [p, setP] = useState(null);
  const [sc, setSc] = useState(null);
  const [tr, setTr] = useState(null);
  const load = useCallback(async () => {
    const t = getLocalDate();
    setP(await j(`/api/plan?today=${t}`));
    j(`/api/plan/score?today=${t}`).then(setSc);
    j(`/api/plan/trend?today=${t}`).then(setTr);
  }, []);
  useEffect(() => { load(); }, [load, syncTick]);
  if (!p?.success) return null;

  const hide = p.safety.hideNumbers;
  const mask = (s) => (hide ? "••" : s);
  if (!p.plan.active) {
    return (
      <button className="fl-card accent" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={onOpen}>
        <p className="fl-eyebrow">Your north star</p>
        <h3>Set one goal, like “lose 6 kg by March”</h3>
        <p>We work out a safe pace and three weekly habits. Everything else in the app then supports it.</p>
        <strong style={{ color: "var(--primary)" }}>Set my goal ›</strong>
      </button>
    );
  }
  const pr = p.progress;
  const status = tr?.current?.status;
  const corridor = tr?.week?.rewarded ? ["✅", "Your trend is inside the expected corridor this week. That is what counts."]
    : status === "behind" ? ["🧭", "Your trend is a little slower than planned. That is normal; weekly habits move it more than daily scale changes."]
    : status === "ahead" ? ["⚡", "Your trend is ahead of plan. Make sure you are eating enough protein and enough overall."]
    : status === "inside" ? ["✅", "Your trend is inside the expected corridor."] : null;
  const ready = p.rewards.find((r) => r.reached && !r.claimedAt);
  const next = p.rewards.find((r) => !r.reached);

  return (
    <>
      {p.safety.flags.length > 0 && (
        <div className={`fl-card ${p.safety.level === "alert" ? "alert" : "accent"}`}>
          {p.safety.flags.slice(0, 2).map((f) => <div key={f.id}><h3>💛 {f.title}</h3><p>{f.detail}</p></div>)}
        </div>
      )}
      <div className="fl-card" style={{ cursor: "pointer" }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen?.()}>
        <p className="fl-eyebrow">Your north star</p>
        <h3>{hide ? "••" : <WeightReveal compact reaction={false} text={`${pr?.lostKg ?? 0} of ${pr?.totalKg ?? 0} kg`} />}{pr?.daysLeft >= 0 ? ` · ${pr.daysLeft} days left` : ""}</h3>
        <div className="fl-bar" role="progressbar" aria-valuenow={pr?.pct ?? 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(2, pr?.pct ?? 0)}%` }} /></div>
        {corridor && <p>{corridor[0]} {corridor[1]}</p>}
        {ready && <p className="ink"><strong>🎁 Reward unlocked: {ready.text}</strong></p>}
        {!ready && next && <p>Next reward: {next.text} {hide ? "••" : <WeightReveal compact reaction={false} text={`(${next.remainingKg} kg to go)`} />}</p>}
        {p.event.phase !== "none" && <p>🎉 {p.event.message}</p>}
        {["due", "soon", "on-break"].includes(p.break.state) && <p>🌿 {p.break.message}</p>}
      </div>
      {sc?.score !== null && sc?.score !== undefined && (
        <div className="fl-card">
          <div className="fl-row">
            <div><p className="fl-eyebrow">Fat-loss score · this week</p><div className="fl-big">{sc.score}<small> / 100</small></div></div>
            <strong style={{ color: "var(--primary)" }}>{sc.label}</strong>
          </div>
          {sc.components.filter((c) => c.score !== null).map((c) => (
            <div key={c.id} className="fl-comp"><div className="fl-row"><span>{c.label}</span><span style={{ color: "var(--text-muted)" }}>{c.score}</span></div><div className="fl-bar"><i style={{ width: `${c.score}%` }} /></div></div>
          ))}
          {sc.budget && <p>{hide ? "Weekly calorie budget" : `Weekly calorie budget: ${sc.budget.used.toLocaleString()} of ${sc.budget.budget.toLocaleString()} kcal used.`} {sc.budget.absorbed ? "A heavier day this week is already absorbed by the rest of it." : ""}</p>}
        </div>
      )}
      {p.focus.length > 0 && (
        <div className="fl-card">
          <h3>This week’s 3 focus habits</h3>
          {p.focus.map((f) => (
            <div key={f.id} className="fl-comp"><div className="fl-row"><span>{f.icon} {f.title}</span><span style={{ color: f.done ? "var(--success)" : "var(--text-muted)" }}>{f.done ? "✓" : `${f.value}/${f.target}`}</span></div><div className={`fl-bar ${f.done ? "good" : ""}`}><i style={{ width: `${Math.min(100, (f.value / f.target) * 100)}%` }} /></div></div>
          ))}
        </div>
      )}
    </>
  );
}
