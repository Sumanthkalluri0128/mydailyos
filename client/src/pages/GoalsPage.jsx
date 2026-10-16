// Goals & journey: level / XP, today's quests, this week's missions, the weight journey, and your own
// short-term and long-term goals — all computed from your real logs by the server (/api/goals/journey).
import { useCallback, useEffect, useState } from "react";
import "./goals.css";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import { fireConfetti } from "../motion/motion";
import { refreshCtx } from "../motion/ctxStore";

const METRICS = [
  { id: "workouts", label: "Workout days", unit: "days", def: 12 },
  { id: "logDays", label: "Days I log my food/day", unit: "days", def: 21 },
  { id: "waterDays", label: "Days I hit my water goal", unit: "days", def: 14 },
  { id: "calorieDays", label: "Days on my calorie target", unit: "days", def: 20 },
  { id: "stepsTotal", label: "Total steps", unit: "steps", def: 150000 },
  { id: "weight", label: "Reach a body weight", unit: "kg", def: "" },
  { id: "custom", label: "Something else (I'll update it)", unit: "", def: 10 },
];
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const STATUS = { done: ["Done 🎉", "ok"], ahead: ["Ahead of pace", "ok"], active: ["On the way", "mid"], behind: ["Behind pace", "warn"], missed: ["Deadline passed", "bad"] };

function Bar({ pct, tone = "mid" }) {
  return <div className="gp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i className={`gp-fill gp-${tone}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>;
}

export default function GoalsPage({ onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("short");
  const [form, setForm] = useState(null);
  const today = getLocalDate();

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/goals/journey?today=${today}`); const d = await r.json();
      if (!d.success) throw new Error(d.message || "Could not load goals");
      setData(d); setErr("");
    } catch (e) { setErr(e.message || "Could not load goals"); }
  }, [today]);
  useEffect(() => { load(); }, [load]);

  const openForm = (kind, preset = {}) => setForm({ kind, title: "", metric: "workouts", target: 12, deadline: addDays(today, kind === "short" ? 30 : 120), ...preset });
  const save = async (e) => {
    e.preventDefault();
    const m = METRICS.find((x) => x.id === form.metric);
    try {
      const r = await apiFetch("/api/goals", { method: "POST", body: JSON.stringify({ title: form.title || m.label, kind: form.kind, metric: form.metric, target: Number(form.target), unit: m.unit, deadline: form.deadline, startDate: today, today }) });
      const d = await r.json(); if (!d.success) throw new Error(d.message || "Could not save");
      setForm(null); setTab(form.kind); notify("Goal added — let's go!", "success"); load(); refreshCtx(true);
    } catch (er) { notify(er.message, "error"); }
  };
  const patch = async (g, body, msg) => {
    try {
      const r = await apiFetch(`/api/goals/${g._id || g.id}`, { method: "PATCH", body: JSON.stringify({ ...body, today }) }); const d = await r.json();
      if (!d.success) throw new Error(d.message || "Could not update");
      if (msg) notify(msg, "success"); if (body.done) fireConfetti({ count: 90 }); load(); refreshCtx(true);
    } catch (er) { notify(er.message, "error"); }
  };
  const remove = async (g) => { try { await apiFetch(`/api/goals/${g._id || g.id}`, { method: "DELETE" }); notify("Goal removed", "info"); load(); refreshCtx(true); } catch (er) { notify(er.message, "error"); } };

  if (err && !data) return <section className="gp"><button className="gp-back" onClick={onBack}>← Back</button><p className="gp-err">{err}</p></section>;
  if (!data) return <section className="gp"><button className="gp-back" onClick={onBack}>← Back</button><p>Loading your journey…</p></section>;
  const { level: lv, today: dq, week, streak, weightJourney: wj, goals } = data;
  const list = goals.filter((g) => g.kind === tab);
  const active = list.filter((g) => !g.done), finished = list.filter((g) => g.done);

  return (
    <section className="gp">
      <button className="gp-back" onClick={onBack}>← Back</button>

      <div className="gp-hero">
        <Buddy scene={dq.done === dq.total && dq.total ? "victory" : "powerup"} size={112} />
        <div className="gp-hero-t">
          <small>{lv.rank}</small>
          <h2>Level {lv.level}</h2>
          <Bar pct={lv.pct} tone="xp" />
          <p>{lv.xpToNext} XP to level {lv.level + 1} · {lv.xp} XP total</p>
          <p className="gp-chips"><span>🔥 {streak.current}-day streak</span><span>🏅 best {streak.best}</span><span>⭐ {data.perfectDays} perfect days</span></p>
        </div>
      </div>

      <h3>Today's quests <small>{dq.done}/{dq.total} · {dq.xpEarned}/{dq.xpAvailable} XP</small></h3>
      <div className="gp-list">
        {dq.quests.length === 0 && <p className="gp-muted">Finish your profile to get daily targets.</p>}
        {dq.quests.map((q) => (
          <div key={q.id} className={`gp-card ${q.done ? "is-done" : ""}`}>
            <div className="gp-row"><b>{q.icon} {q.title}</b><span className="gp-xp">{q.done ? "✓" : "+"}{q.xp} XP</span></div>
            <Bar pct={q.pct} tone={q.done ? "ok" : "mid"} />
            <small>{q.value.toLocaleString()} / {q.target.toLocaleString()} {q.unit} — {q.done ? "complete!" : q.hint}</small>
          </div>
        ))}
      </div>

      <h3>This week's missions <small>{week.done}/{week.total}</small></h3>
      <div className="gp-list">
        {week.missions.map((m) => (
          <div key={m.id} className={`gp-card ${m.done ? "is-done" : ""}`}>
            <div className="gp-row"><b>{m.icon} {m.title}</b><span className="gp-xp">+{m.xp} XP</span></div>
            <Bar pct={m.pct} tone={m.done ? "ok" : "mid"} /><small>{m.value}/{m.target} days</small>
          </div>
        ))}
      </div>

      {wj && (
        <>
          <h3>Your weight journey <small>{wj.startKg} → {wj.targetKg} kg</small></h3>
          <div className="gp-card">
            <div className="gp-row"><b>{wj.reached ? "Goal reached! 🏆" : `${wj.remainingKg} kg to go`}</b><span>{wj.pct}%</span></div>
            <Bar pct={wj.pct} tone={wj.reached ? "ok" : "xp"} />
            <div className="gp-steps">{wj.checkpoints.map((c) => <span key={c.label} className={c.reached ? "on" : ""}>{c.reached ? "✓" : "○"} {c.label}<em>{c.kg} kg</em></span>)}</div>
            {!wj.reached && <small>About {wj.weeksLeft} weeks at your chosen pace — you're at {wj.currentKg} kg now.</small>}
          </div>
        </>
      )}

      <h3>Streak milestones</h3>
      <div className="gp-card">
        <div className="gp-steps">{[3, 7, 14, 30, 60, 100, 180, 365].map((s) => <span key={s} className={streak.reached.includes(s) ? "on" : ""}>{streak.reached.includes(s) ? "🏅" : "○"} {s} days</span>)}</div>
        {streak.next && <small>{streak.toNext} more day{streak.toNext === 1 ? "" : "s"} to reach {streak.next}. Log something every day!</small>}
      </div>

      <h3>My goals</h3>
      <div className="gp-tabs">
        <button className={tab === "short" ? "on" : ""} onClick={() => setTab("short")}>Short-term</button>
        <button className={tab === "long" ? "on" : ""} onClick={() => setTab("long")}>Long-term</button>
      </div>
      <p className="gp-muted">{tab === "short" ? "Days to a few weeks — quick wins that build momentum." : "Months — the big changes that become your new lifestyle."}</p>

      <div className="gp-list">
        {active.map((g) => <GoalCard key={g._id || g.id} g={g} onDone={() => patch(g, { done: true }, "Goal completed! 🎉")} onDelete={() => remove(g)} onManual={(v) => patch(g, { manualValue: v })} />)}
        {active.length === 0 && <p className="gp-muted">No active {tab === "short" ? "short" : "long"}-term goals yet.</p>}
      </div>
      <div className="gp-presets">
        {(tab === "short"
          ? [["Work out 12 times in 30 days", { metric: "workouts", target: 12 }], ["Log food 14 days in a row-ish", { metric: "logDays", target: 14, deadline: addDays(today, 18) }], ["Hit water goal 10 days", { metric: "waterDays", target: 10 }]]
          : [["Land my calories 60 days", { metric: "calorieDays", target: 60, deadline: addDays(today, 100) }], ["Work out 100 times", { metric: "workouts", target: 100, deadline: addDays(today, 200) }], ["Walk 1,000,000 steps", { metric: "stepsTotal", target: 1000000, deadline: addDays(today, 150) }]]
        ).map(([t, p]) => <button key={t} type="button" onClick={() => openForm(tab, { title: t, ...p })}>＋ {t}</button>)}
      </div>
      <button className="gp-add" onClick={() => openForm(tab)}>＋ New {tab === "short" ? "short-term" : "long-term"} goal</button>

      {finished.length > 0 && (<><h3>Completed 🎉</h3><div className="gp-list">{finished.map((g) => <GoalCard key={g._id || g.id} g={g} onDelete={() => remove(g)} onUndo={() => patch(g, { done: false })} />)}</div></>)}

      {form && (
        <div className="gp-modal" onClick={() => setForm(null)}>
          <form className="gp-form" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>New {form.kind === "short" ? "short" : "long"}-term goal</h3>
            <label>Name<input value={form.title} maxLength={120} placeholder="e.g. Get stronger" onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>What counts?
              <select value={form.metric} onChange={(e) => { const m = METRICS.find((x) => x.id === e.target.value); setForm({ ...form, metric: m.id, target: m.def }); }}>
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Target{form.metric === "weight" ? " (kg)" : ""}<input type="number" step="any" min="0.1" required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></label>
            <label>Deadline<input type="date" min={today} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label>
            <div className="gp-actions"><button type="button" onClick={() => setForm(null)}>Cancel</button><button className="primary" type="submit">Save goal</button></div>
          </form>
        </div>
      )}
    </section>
  );
}

function GoalCard({ g, onDone, onDelete, onManual, onUndo }) {
  const p = g.progress; const [label, tone] = STATUS[p.status] || STATUS.active;
  const unit = g.unit || "";
  return (
    <div className={`gp-card ${g.done ? "is-done" : ""}`}>
      <div className="gp-row"><b>{g.title}</b><span className={`gp-badge gp-${tone}`}>{label}</span></div>
      <Bar pct={p.pct} tone={tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "mid"} />
      <small>{g.metric === "weight" ? `${p.value} kg now · goal ${p.target} kg` : `${p.value.toLocaleString()} / ${p.target.toLocaleString()} ${unit}`} · {p.pct}%{p.daysLeft !== null && !g.done ? (p.daysLeft >= 0 ? ` · ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left` : " · deadline passed") : ""}</small>
      <div className="gp-actions">
        {g.metric === "custom" && !g.done && onManual && <><button type="button" onClick={() => onManual(Math.max(0, p.value - 1))}>−1</button><button type="button" onClick={() => onManual(p.value + 1)}>＋1</button></>}
        {!g.done && onDone && <button type="button" onClick={onDone}>Mark done</button>}
        {g.done && onUndo && <button type="button" onClick={onUndo}>Reopen</button>}
        <button type="button" className="gp-del" onClick={onDelete} aria-label={`Delete ${g.title}`}>Delete</button>
      </div>
    </div>
  );
}
