// Section B: ONE goal, ONE daily focus, ONE level, ONE badge shelf. Everything else sits one tap deeper under "Details".
// All words come from the server payload (d.copy and the lines inside it), so web and mobile read exactly the same.
import { useState } from "react";
import "./simple.css";
import { useSimple } from "./useSimple";
import WeightReveal from "../WeightReveal";
import { notify } from "../../utils/notify";
import { apiFetch } from "../../config/api";
import { getLocalDate } from "../../utils/date";
import { refreshSimple } from "./useSimple";

const fmt = (n) => Number(n).toLocaleString();

export function GoalCard({ d, onOpen }) {
  const g = d?.goal;
  if (!g) return null;
  if (!g.active) {
    return <button type="button" className="sp-card sp-btn" style={{ width: "100%", textAlign: "left" }} onClick={onOpen}><h3>{g.title}</h3><p className="sp-muted">{g.empty}</p></button>;
  }
  return (
    <div className="sp-card" data-tour="goal-card">
      <div className="sp-row"><h3>{g.title}</h3><span className={`sp-pill ${g.status}`}>{g.statusLine}</span></div>
      <div><WeightReveal compact reaction={false} text={g.progressLine} /></div>
      <div className="sp-bar" role="progressbar" aria-valuenow={g.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(2, g.pct)}%` }} /></div>
      {g.eta && <p className="sp-muted">{g.eta.line}</p>}
      {g.etaNote && <p className="sp-muted">{g.etaNote}</p>}
    </div>
  );
}

export function FocusCard({ d, hide }) {
  const f = d?.focus;
  if (!f) return null;
  return (
    <div className="sp-card" data-tour="daily-focus">
      <div className="sp-row"><h3>{f.title}</h3><span className="sp-muted">{f.done}/{f.total}</span></div>
      {f.empty && <p className="sp-muted">{f.empty}</p>}
      {f.quests.map((q) => (
        <div key={q.id} className={`sp-quest ${q.done ? "done" : ""}`}>
          <span className="sp-tick" aria-hidden="true">{q.done ? "✓" : q.icon}</span>
          <div><b>{q.title}</b><small>{q.unit === "kcal" && hide ? "" : q.done ? "Done" : q.hint}</small></div>
        </div>
      ))}
      {f.bonus && <p className="sp-muted">{f.bonus.title}: {f.bonus.done ? "done" : `${fmt(f.bonus.value)} of ${fmt(f.bonus.target)}`}</p>}
      {f.reward && <div className="sp-reward" role="status">🎉 {f.reward.text} {f.reward.line}</div>}
    </div>
  );
}

export function LevelBar({ d }) {
  const l = d?.level;
  if (!l) return null;
  return (
    <div className="sp-card" data-tour="level">
      <div className="sp-row"><b>Level {l.level} · {l.rank}</b><span className="sp-muted">{l.nextLine}</span></div>
      <div className="sp-bar" role="progressbar" aria-valuenow={l.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(3, l.pct)}%` }} /></div>
    </div>
  );
}

function Badge({ b }) {
  return (
    <div className={`sp-badge ${b.rarity} ${b.earned ? "" : "locked"}`}>
      <span className="em" aria-hidden="true">{b.emoji}</span>
      <div style={{ flex: 1 }}>
        <b>{b.title}</b> <span className="sp-rar">{b.earned ? b.rarity : "next"} · {Math.max(b.tier, 0)}/{b.tiers}</span>
        <p className="sp-muted">{b.line}</p>
        {b.nextAt && <div className="sp-bar"><i style={{ width: `${Math.round(b.progress * 100)}%` }} /></div>}
      </div>
    </div>
  );
}

export function BadgeShelf({ d }) {
  const [all, setAll] = useState(false);
  const bs = d?.badges;
  if (!bs) return null;
  const c = bs.copy;
  return (
    <div className="sp-card" data-tour="badges">
      <h3>{c.next}</h3>
      {bs.next ? <Badge b={bs.next} /> : <p className="sp-muted">{c.none}</p>}
      {bs.last && <><p className="sp-muted" style={{ marginTop: 10 }}>{c.last}</p><Badge b={bs.last} /></>}
      <button type="button" className="sp-btn" style={{ marginTop: 10 }} onClick={() => setAll(!all)} aria-expanded={all}>{all ? "Hide" : c.seeAll} ({bs.earnedCount}/{bs.total})</button>
      {all && bs.shelves.map((s) => (
        <div key={s.id}><h3 style={{ marginTop: 14 }}>{s.label}</h3><div className="sp-shelf">{s.badges.map((b) => <Badge key={b.id} b={b} />)}</div></div>
      ))}
    </div>
  );
}

export function DetailsPanel({ d }) {
  if (!d) return null;
  const ws = d.weeklyScore, st = d.streak, rc = d.recap, ps = d.phaseSuggestion;
  return (
    <details className="sp-card sp-details">
      <summary>{d.copy.detailsLabel}</summary>
      {d.updatedLine && <p className="sp-muted">{d.updatedLine}</p>}
      <h3>{ws.title}</h3>
      {ws.score === null ? <p className="sp-muted">{ws.empty}</p> : (
        <>
          <div className="sp-row"><b style={{ fontSize: "1.6rem" }}>{ws.score}<small> / 100</small></b><span className="sp-pill">{ws.label}</span></div>
          {ws.parts.filter((p) => p.score !== null).map((p) => (
            <div key={p.id}><div className="sp-row"><span>{p.label}</span><span className="sp-muted">{p.score}</span></div><div className="sp-bar"><i style={{ width: `${p.score}%` }} /></div><p className="sp-muted">{p.why}</p></div>
          ))}
        </>
      )}
      <h3>Streak</h3>
      <p>🔥 {st.current} day{st.current === 1 ? "" : "s"} <span className="sp-muted">(best {st.longest})</span></p>
      <p className="sp-muted">{st.token.line}</p>
      {st.comeback && <p>🌅 {st.comeback.line} +{st.comeback.bonusXp} XP</p>}
      <h3>{rc.title}</h3>
      <p>{rc.win}</p>
      {ps && <p className="sp-note">{ps.line}</p>}
    </details>
  );
}

const KEY = { calories: "calorieTarget", protein: "proteinTarget", water: "waterTargetMl", steps: "stepsTarget", goalWeight: "targetWeightKg" };

function TargetRow({ r, onSaved }) {
  const [val, setVal] = useState(r.value ?? "");
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (idKey, raw, extra = {}) => {
    setBusy(true);
    try {
      const chk = await (await apiFetch("/api/goals/check-target", { method: "POST", body: JSON.stringify({ key: r.id, value: raw }) })).json();
      if (!chk.ok) { notify(chk.note, "error"); if (chk.value != null) setVal(chk.value); return; }
      const goals = { [KEY[r.id]]: chk.value, ...extra };
      const res = await (await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ goals, today: getLocalDate() }) })).json();
      if (!res.success) throw new Error(res.message || "Could not save");
      notify("Saved.", "success"); setVal(chk.value); await refreshSimple(true); onSaved?.();
    } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div className="sp-target">
      <div className="sp-row"><b>{r.label}</b><span className="sp-muted">{r.unit}</span></div>
      <div className="sp-row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <input inputMode="decimal" aria-label={r.label} value={val} onChange={(e) => setVal(e.target.value)} />
        <button type="button" className="sp-btn primary" disabled={busy || val === "" || Number(val) === Number(r.value)} onClick={() => save(r.id, val, r.id === "calories" ? { calorieMode: "manual" } : {})}>Save</button>
        {r.recommended != null && !r.atRecommended && <button type="button" className="sp-btn" disabled={busy} onClick={() => save(r.id, r.recommended, r.id === "calories" ? { calorieMode: "auto" } : {})}>Use recommended ({fmt(r.recommended)})</button>}
        <button type="button" className="sp-btn" aria-expanded={why} onClick={() => setWhy(!why)}>Why this number?</button>
      </div>
      {why && <p className="sp-muted">{r.why}</p>}
    </div>
  );
}

export function TargetsPanel({ d, onSaved }) {
  const [adv, setAdv] = useState(false);
  const t = d?.targets;
  if (!t) return null;
  return (
    <div className="sp-card" data-tour="targets">
      <h3>Targets</h3>
      <p className="sp-muted">{t.phase.label} phase. {t.phase.why}</p>
      {t.basic.map((r) => <TargetRow key={r.id} r={r} onSaved={onSaved} />)}
      <button type="button" className="sp-btn" style={{ marginTop: 10 }} aria-expanded={adv} onClick={() => setAdv(!adv)}>{t.copy.advanced}</button>
      {adv && t.advanced.map((r) => (
        <div key={r.id} className="sp-target"><div className="sp-row"><b>{r.label}</b><span>{r.value != null ? `${r.value} ${r.unit}` : ""}</span></div><p className="sp-muted">{r.why}</p></div>
      ))}
    </div>
  );
}

// Home: just the goal card (plus any safety note).
export function HomeGoal({ syncTick, onOpen }) {
  const [d] = useSimple(syncTick);
  if (!d) return null;
  return (
    <>
      {d.safety?.flags?.length > 0 && <div className="sp-card"><h3>💛 {d.safety.flags[0].title}</h3><p className="sp-muted">{d.safety.flags[0].detail}</p></div>}
      <GoalCard d={d} onOpen={onOpen} />
      {d.updatedLine && <p className="sp-muted">{d.updatedLine}</p>}
    </>
  );
}

// The full simplified block used on the Goals screen; Home uses the pieces directly.
export default function SimpleProgress({ syncTick, onOpenGoals }) {
  const [d, reload] = useSimple(syncTick);
  if (!d) return <p className="sp-muted">Loading…</p>;
  const hide = d.hideNumbers;
  return (
    <>
      {d.safety?.flags?.length > 0 && <div className="sp-card"><h3>💛 {d.safety.flags[0].title}</h3><p className="sp-muted">{d.safety.flags[0].detail}</p></div>}
      <GoalCard d={d} onOpen={onOpenGoals} />
      <FocusCard d={d} hide={hide} />
      <LevelBar d={d} />
      <BadgeShelf d={d} />
      <DetailsPanel d={d} />
      <TargetsPanel d={d} onSaved={reload} />
    </>
  );
}
