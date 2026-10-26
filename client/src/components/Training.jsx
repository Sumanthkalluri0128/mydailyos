// Strength and training hub (Exercise page): today's suggestion, workout mode, routines with sets, progress and power level,
// plate calculator, beginner "training arcs", and guided meditate / stretch. Rules live on the server (lib/strength, programs,
// workoutSuggest, guided); the plate maths and breathing animation are in utils/training.js so they work offline.
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import Buddy, { BuddyEmpty } from "../motion/Buddy";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import { undoGate } from "../utils/undo";
import { confirmAction } from "../utils/confirm";
import { FORMULAS, SAFETY_NOTE, checkJump, plateCalc, breathPhase, cueAt, clock, planSets, toResults, DEFAULT_PLATES, DEFAULT_BAR } from "../utils/training";
import "./training.css";

const api = async (path, opts) => {
  const r = await apiFetch(`${API_URL}${path}`, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Something went wrong");
  return j;
};
const post = (path, body, method = "POST") => api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const newId = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const TABS = [["today", "Today"], ["routines", "Routines"], ["progress", "Progress"], ["arcs", "Training arcs"], ["calm", "Calm"]];

// ---------- rest timer (manual start, buzzes when done) ----------
function RestTimer({ autoSec, tick }) {
  const [left, setLeft] = useState(0);
  const end = useRef(0);
  const start = useCallback((s) => { end.current = Date.now() + s * 1000; setLeft(s); }, []);
  useEffect(() => { if (tick && autoSec) start(autoSec); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!left) return undefined;
    const id = setInterval(() => {
      const r = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setLeft(r);
      if (r === 0) { try { navigator.vibrate?.([300, 120, 300]); } catch { /* ignore */ } notify("Rest is over. Ready when you are.", "info"); }
    }, 250);
    return () => clearInterval(id);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tr-rest" role="group" aria-label="Rest timer">
      <strong>⏱ Rest {left ? clock(left) : ""}</strong>
      {[30, 60, 90, 120].map((s) => <button key={s} type="button" className="chip" onClick={() => start(s)}>{s < 90 ? `${s}s` : s === 90 ? "1:30" : "2 min"}</button>)}
      {left > 0 && <button type="button" className="chip" onClick={() => setLeft(0)}>Stop</button>}
    </div>
  );
}

// ---------- workout mode: step through exercises, log each set, save as one workout ----------
function WorkoutMode({ title, who = "goku", scene = "lift", exercises, onFinish, onClose, intro }) {
  const [state, setState] = useState(() => exercises.map((e) => ({ ...e, sets: planSets(e, null), hint: null, recentBestKg: 0 })));
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [sure, setSure] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let live = true;
    api(`/api/training/last-sets?date=${getLocalDate()}&names=${encodeURIComponent(exercises.map((e) => e.name).join("|"))}`).then((j) => {
      if (!live) return;
      setState((cur) => cur.map((e, i) => { const last = j.lastSets?.[e.name]; return { ...e, sets: planSets(exercises[i], last), hint: last?.beat?.text || null, recentBestKg: last?.recentBestKg || 0, lastDate: last?.date }; }));
    }).catch(() => {});
    return () => { live = false; };
  }, [exercises]);

  const ex = state[idx];
  const edit = (si, patch) => setState((cur) => cur.map((e, i) => (i === idx ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e)));
  const toggle = (si) => { const s = ex.sets[si]; edit(si, { done: !s.done }); if (!s.done) setTick((n) => n + 1); };
  const addSet = () => setState((cur) => cur.map((e, i) => (i === idx ? { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] || { reps: "", kg: "0" }), done: false }] } : e)));
  const finish = async () => {
    const results = toResults(state);
    if (!results.length) { notify("Tick at least one set to save the workout.", "info"); return; }
    setBusy(true);
    try {
      const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
      const res = await onFinish(results, minutes);
      setDone(res || {});
    } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };

  if (done) {
    const recs = done.records || [];
    return (
      <div className="tr-modal" role="dialog" aria-modal="true" aria-label="Workout saved">
        <div className="tr-sheet tr-center">
          <Buddy who={recs.length ? "goku" : who} scene={recs.length ? "powerup" : "victory"} size={120} />
          <h3>{recs.length ? "Power up!" : "Workout saved"}</h3>
          {recs.map((r) => <p key={r.activityName} className="tr-power"><strong>{r.activityName}</strong>: {r.kind === "1rm" ? `estimated 1RM ${r.value} kg` : `heaviest set ${r.value} kg`} (was {r.previous} kg)</p>)}
          <p className="md-sub">{done.minutes ? `${done.minutes} min · ${done.kcal} kcal logged.` : "Logged in your exercise history."}</p>
          <button className="primary-button" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }
  if (!ex) return null;
  return (
    <div className="tr-modal" role="dialog" aria-modal="true" aria-label={`Workout: ${title}`}>
      <div className="tr-sheet">
        <div className="tr-head"><Buddy who={who} scene={scene} size={64} /><div><h3>{title}</h3><small>Exercise {idx + 1} of {state.length}</small></div><button className="secondary-button" onClick={onClose}>Close</button></div>
        {intro && <p className="md-sub">{intro}</p>}
        <h4>{ex.name}</h4>
        {ex.hint && <p className="tr-hint">💪 {ex.hint}</p>}
        {ex.type === "hold" && <p className="md-sub">Hold for the seconds shown. Ease off if it feels wrong.</p>}
        <div className="tr-sets">
          {ex.sets.map((s, si) => {
            const jump = ex.type === "hold" ? { needsConfirm: false } : checkJump(Number(s.kg), ex.recentBestKg);
            return (
              <div key={si} className={`tr-set ${s.done ? "done" : ""}`}>
                <span>Set {si + 1}</span>
                <label>{ex.type === "hold" ? "Sec" : "Reps"}<input inputMode="numeric" value={s.reps} onChange={(e) => edit(si, { reps: e.target.value })} aria-label={`Set ${si + 1} ${ex.type === "hold" ? "seconds" : "reps"}`} /></label>
                {ex.type !== "hold" && <label>kg<input inputMode="decimal" value={s.kg} onChange={(e) => edit(si, { kg: e.target.value })} aria-label={`Set ${si + 1} weight in kilograms`} /></label>}
                <button type="button" className={s.done ? "primary-button" : "secondary-button"} aria-pressed={s.done} onClick={() => toggle(si)}>{s.done ? "✓ Done" : "Done"}</button>
                {jump.needsConfirm && !sure[`${idx}-${si}`] && <p className="tr-warn" role="alert">{jump.note} <button type="button" className="chip" onClick={() => setSure((m) => ({ ...m, [`${idx}-${si}`]: true }))}>Keep it</button></p>}
              </div>
            );
          })}
        </div>
        <button type="button" className="chip" onClick={addSet}>+ Add set</button>
        <RestTimer autoSec={ex.restSec} tick={tick} />
        <p className="tr-safe">{SAFETY_NOTE}</p>
        <div className="md-actions">
          <button className="secondary-button" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>‹ Back</button>
          {idx < state.length - 1 ? <button className="primary-button" onClick={() => setIdx(idx + 1)}>Next exercise ›</button> : <button className="primary-button" disabled={busy} onClick={finish}>{busy ? "Saving…" : "Finish and save"}</button>}
          {idx < state.length - 1 && <button className="secondary-button" disabled={busy} onClick={finish}>Finish early</button>}
        </div>
      </div>
    </div>
  );
}

// ---------- today's suggestion ----------
function Suggestion({ onStart, onGuided }) {
  const [minutes, setMinutes] = useState(20);
  const [equipment, setEquipment] = useState("none");
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true; setErr("");
    api(`/api/training/suggest?date=${getLocalDate()}&minutes=${minutes}&equipment=${equipment}`).then((j) => live && setS(j.suggestion)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [minutes, equipment]);
  return (
    <div className="card tr-card">
      <div className="md-head"><h3>Today's workout</h3>{s && <Buddy who={s.who} scene={s.scene} size={64} />}</div>
      <div className="serving-chips" role="group" aria-label="Time available">
        {[10, 20, 40].map((m) => <button key={m} type="button" className={minutes === m ? "chip active" : "chip"} onClick={() => setMinutes(m)}>{m} min</button>)}
        <span className="tr-gap" />
        {[["none", "No equipment"], ["gym", "Gym"]].map(([k, l]) => <button key={k} type="button" className={equipment === k ? "chip active" : "chip"} onClick={() => setEquipment(k)}>{l}</button>)}
      </div>
      {err && <p className="tr-warn">{err}</p>}
      {s && (
        <>
          <h4>{s.title}</h4>
          <ul className="tr-reasons">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {s.items.length > 0 && <ul className="tr-plan">{s.items.map((i) => <li key={i.name}><strong>{i.name}</strong> {i.sets} × {i.reps}{i.type === "hold" ? " s" : ""}</li>)}</ul>}
          {s.walkTip && <p className="md-sub">🚶 {s.walkTip}</p>}
          {s.type === "stretch"
            ? <button className="primary-button" onClick={() => onGuided("stretch", s.guided?.minutes || 5)}>Start guided stretch</button>
            : <button className="primary-button" onClick={() => onStart({ title: s.title, who: s.who, scene: s.scene, exercises: s.items, program: s.program })}>Start workout</button>}
          <p className="tr-safe">You can always pick something else. {SAFETY_NOTE}</p>
        </>
      )}
    </div>
  );
}

// ---------- routines (templates with target sets) ----------
function Routines({ activities, onStart, onLogged }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => api("/api/templates").then((j) => setList(j.templates || [])).catch((e) => notify(e.message, "error")), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) return notify("Name your routine, for example Push day.", "info");
    if (!form.items.length) return notify("Add at least one exercise.", "info");
    const items = form.items.map((i) => ({ activityId: i.activityId, durationMinutes: Number(i.durationMinutes) || 10, targetSets: i.targetSets || undefined, targetReps: i.targetReps || undefined, targetWeightKg: i.targetWeightKg === "" ? undefined : i.targetWeightKg, restSec: i.restSec || undefined }));
    try {
      await post(form.id ? `/api/templates/${form.id}` : "/api/templates", { name: form.name.trim(), items }, form.id ? "PUT" : "POST");
      notify("Routine saved.", "success"); setForm(null); load();
    } catch (e) { notify(e.message, "error"); }
  };
  const remove = async (t) => {
    const go = await undoGate({ what: t.name, hide: () => setList((c) => c.filter((x) => x._id !== t._id)), restore: load });
    if (!go) return;
    try { await api(`/api/templates/${t._id}`, { method: "DELETE" }); } catch (e) { notify(e.message, "error"); load(); }
  };
  const logPlanned = async (t) => {
    try { await post(`/api/templates/${t._id}/log`, { date: getLocalDate(), clientId: newId("tpl") }); notify(`"${t.name}" logged.`, "success"); onLogged(); } catch (e) { notify(e.message, "error"); }
  };
  const start = (t) => onStart({
    title: t.name, who: "goku", scene: "lift",
    exercises: t.items.map((i) => ({ name: i.activityName, sets: i.targetSets || 3, reps: i.targetReps || "", weightKg: i.targetWeightKg ?? 0, restSec: i.restSec, type: /plank|hold/i.test(i.activityName) ? "hold" : "reps" })),
    template: t,
  });
  const shown = activities.filter((a) => !q.trim() || `${a.name} ${a.category}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  const setItem = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  return (
    <div className="card tr-card">
      <div className="md-head"><h3>Routines</h3><button className="secondary-button" onClick={() => setForm({ name: "", items: [] })}>+ New routine</button></div>
      {!list.length && !form && <BuddyEmpty scene="plan" size={84} title="No routines yet">Save a routine like Push day, with sets and reps, and run it step by step.</BuddyEmpty>}
      <ul className="tr-list">
        {list.map((t) => (
          <li key={t._id}>
            <div><strong>{t.name}</strong><small>{t.items.map((i) => (i.targetSets ? `${i.activityName} ${i.targetSets}×${i.targetReps || "?"}${i.targetWeightKg ? ` @ ${i.targetWeightKg} kg` : ""}` : `${i.activityName} (${i.durationMinutes} min)`)).join(" · ")}</small></div>
            <div className="tr-row">
              <button className="primary-button" onClick={() => start(t)}>Start</button>
              <button className="chip" onClick={() => logPlanned(t)}>Log as planned</button>
              <button className="chip" onClick={() => setForm({ id: t._id, name: t.name, items: t.items.map((i) => ({ ...i })) })}>Edit</button>
              <button className="chip" onClick={() => remove(t)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {form && (
        <div className="md-form">
          <label>Name<input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Push day" /></label>
          {form.items.map((it, i) => (
            <fieldset key={i} className="tr-item">
              <legend>{it.activityName}</legend>
              <label>Sets<input inputMode="numeric" value={it.targetSets || ""} onChange={(e) => setItem(i, { targetSets: Number(e.target.value) || "" })} /></label>
              <label>Reps<input inputMode="numeric" value={it.targetReps || ""} onChange={(e) => setItem(i, { targetReps: Number(e.target.value) || "" })} /></label>
              <label>kg<input inputMode="decimal" value={it.targetWeightKg ?? ""} onChange={(e) => setItem(i, { targetWeightKg: e.target.value === "" ? "" : Number(e.target.value) })} /></label>
              <label>Rest s<input inputMode="numeric" value={it.restSec || ""} onChange={(e) => setItem(i, { restSec: Number(e.target.value) || "" })} /></label>
              <label>Min<input inputMode="numeric" value={it.durationMinutes || ""} onChange={(e) => setItem(i, { durationMinutes: Number(e.target.value) || "" })} /></label>
              <button type="button" className="chip" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}>Remove</button>
            </fieldset>
          ))}
          <label>Add exercise<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. squat" /></label>
          {q.trim() && <ul className="tr-pick">{shown.map((a) => <li key={a._id}><button type="button" className="chip" onClick={() => { setForm({ ...form, items: [...form.items, { activityId: a._id, activityName: a.name, durationMinutes: 10, targetSets: 3, targetReps: 10, targetWeightKg: "" }] }); setQ(""); }}>{a.name}</button></li>)}</ul>}
          <p className="md-sub">Sets, reps and kg are optional. Leave them empty for a simple timed routine.</p>
          <div className="md-actions"><button className="primary-button" onClick={save}>Save routine</button><button className="secondary-button" onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}

// ---------- progress: power level, lifts, muscle volume, plate calculator ----------
function PlateCalc() {
  const [unit, setUnit] = useState("kg");
  const [target, setTarget] = useState("");
  const [bar, setBar] = useState("");
  const [plates, setPlates] = useState("");
  const list = plates.split(/[ ,]+/).map(Number).filter((n) => n > 0);
  const r = target ? plateCalc(Number(target), { unit, barWeight: bar === "" ? undefined : Number(bar), plates: list }) : null;
  return (
    <div className="card tr-card">
      <h3>Plate calculator</h3>
      <div className="serving-chips">{["kg", "lb"].map((u) => <button key={u} type="button" className={unit === u ? "chip active" : "chip"} onClick={() => setUnit(u)}>{u}</button>)}</div>
      <div className="tr-grid">
        <label>Target ({unit})<input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label>Bar ({unit})<input inputMode="decimal" value={bar} placeholder={String(DEFAULT_BAR[unit])} onChange={(e) => setBar(e.target.value)} /></label>
        <label>Plates you have<input value={plates} placeholder={DEFAULT_PLATES[unit].join(", ")} onChange={(e) => setPlates(e.target.value)} /></label>
      </div>
      {r && !r.error && (
        <div role="status">
          <p><strong>Each side:</strong> {r.perSide.length ? r.perSide.map((p) => `${p.count} × ${p.plate}`).join(" + ") : "no plates"} · total {r.achieved} {unit}</p>
          {r.note && <p className="md-sub">{r.note}</p>}
          <div className="tr-bar" aria-hidden="true">{[...r.perSide].reverse().flatMap((p) => Array.from({ length: p.count }, (_, i) => <i key={`${p.plate}${i}`} style={{ height: `${20 + p.plate * (unit === "lb" ? 0.8 : 1.6)}px` }} />))}<b /></div>
        </div>
      )}
    </div>
  );
}

function Progress({ onStartTarget }) {
  const [o, setO] = useState(null);
  const [lift, setLift] = useState(null);
  const [d, setD] = useState(null);
  useEffect(() => { api(`/api/training/overview?date=${getLocalDate()}`).then(setO).catch((e) => notify(e.message, "error")); }, []);
  useEffect(() => { if (lift) api(`/api/training/progress?name=${encodeURIComponent(lift)}&date=${getLocalDate()}`).then(setD).catch(() => setD(null)); else setD(null); }, [lift]);
  if (!o) return <div className="card tr-card"><p className="md-sub">Loading…</p></div>;
  const MUSCLES = [["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"], ["arms", "Arms"], ["core", "Core"], ["legs", "Legs"], ["glutes", "Glutes"]];
  const maxSets = Math.max(1, ...MUSCLES.map(([k]) => o.muscleVolume[k].sets));
  const stalled = o.lifts.filter((l) => l.deload === "deload");
  return (
    <>
      <div className="card tr-card">
        <div className="md-head"><div><h3>Power level</h3><p className="tr-bigpower">{o.powerLevel || "–"}</p><small className="md-sub">Sum of your best estimated 1RMs (kg). Your own sets, nothing more.</small></div><Buddy who="goku" scene={o.powerLevel ? "powerup" : "lift"} size={84} /></div>
        {stalled.length > 0 && <p className="tr-hint" role="status">🌿 {stalled[0].activityName} has been level for 3 weeks. A lighter "rest arc" week (about 60% of your usual weight, half the sets) often helps. You can ignore this any time.</p>}
        <p className="tr-formula">Estimated 1RM, Epley: {FORMULAS.epley}. Brzycki: {FORMULAS.brzycki} (up to 10 reps).</p>
        {!o.lifts.length ? <BuddyEmpty scene="chart" size={84} title="No lifts yet">Log sets with weights and your power level appears here.</BuddyEmpty> : (
          <ul className="tr-list">
            {o.lifts.map((l) => (
              <li key={l.activityName}>
                <button type="button" className="tr-lift" onClick={() => setLift(lift === l.activityName ? null : l.activityName)} aria-expanded={lift === l.activityName}>
                  <strong>{l.activityName}</strong>
                  <span>Epley {l.best1RM} kg{l.best1RMBrzycki ? ` · Brzycki ${l.best1RMBrzycki} kg` : ""}</span>
                  <small>Best set {l.bestWeightKg} kg × {l.bestWeightReps} · {Math.round(l.totalVolumeKg).toLocaleString()} kg total</small>
                </button>
                {lift === l.activityName && d && (
                  <div className="tr-detail">
                    {d.beat && <p className="tr-hint">🎯 Beat last time: {d.beat.text}</p>}
                    {d.deload.text && <p className="md-sub">{d.deload.text}</p>}
                    <table><thead><tr><th>Date</th><th>Best set</th><th>1RM</th><th>Volume</th></tr></thead>
                      <tbody>{[...d.history].reverse().slice(0, 8).map((h) => <tr key={h.date}><td>{h.date}</td><td>{h.bestWeightKg} × {h.bestReps}</td><td>{h.best1RM}</td><td>{h.volumeKg.toLocaleString()} kg</td></tr>)}</tbody></table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card tr-card">
        <h3>This week by muscle</h3>
        <ul className="tr-muscles">{MUSCLES.map(([k, l]) => <li key={k}><span>{l}</span><i style={{ width: `${(o.muscleVolume[k].sets / maxSets) * 100}%` }} /><b>{o.muscleVolume[k].sets} sets</b></li>)}</ul>
        <p className="md-sub">Last 7 days of logged sets. Exercises we cannot place on a muscle are left out.</p>
      </div>
      <PlateCalc />
      <p className="tr-safe">{o.safety}</p>
    </>
  );
}

// ---------- training arcs ----------
function Arcs({ onStart }) {
  const [programs, setPrograms] = useState([]);
  const [active, setActive] = useState(undefined);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    api("/api/training/programs").then((j) => setPrograms(j.programs)).catch(() => {});
    api(`/api/training/programs/active?date=${getLocalDate()}`).then((j) => setActive(j.active)).catch(() => setActive(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  const begin = async (id) => { try { const j = await post("/api/training/programs/start", { programId: id, date: getLocalDate() }); setActive(j.active); notify("Your arc has begun. Episode 1 is ready.", "success"); } catch (e) { notify(e.message, "error"); } };
  const stop = async () => { if (!(await confirmAction("Stop this training arc? Your logged workouts stay."))) return; await api("/api/training/programs/active", { method: "DELETE" }).catch(() => {}); setActive(null); };
  const detail = async (id) => { if (open?.id === id) return setOpen(null); try { const j = await api(`/api/training/programs/${id}`); setOpen(j.program); } catch { /* ignore */ } };
  const startSession = (s) => onStart({ title: `${s.episode}: day ${s.day}`, who: s.who, scene: s.scene, exercises: s.exercises, program: { week: s.week, day: s.day }, intro: s.rest ? "Rest arc: lighter on purpose. Move well and enjoy it." : undefined });
  const step = active && (
    <p className="tr-step">🚶 Step goal this week: <strong>{active.stepGoal.toLocaleString()}</strong> <small>(+500 a week from {active.baseSteps.toLocaleString()}, never above your profile goal of {active.stepCap.toLocaleString()})</small></p>
  );
  return (
    <>
      {active && (
        <div className="card tr-card">
          <div className="md-head"><div><h3>{active.title}</h3><small className="md-sub">{active.finished ? "Arc complete. Well done." : active.notStarted ? "Starts soon" : `Week ${active.week} of ${active.weeksCount} · ${active.episode}`}</small></div><Buddy who={active.rest ? "kakashi" : "goku"} scene={active.rest ? "health" : "lift"} size={72} /></div>
          {!active.finished && step}
          {active.rest && <p className="tr-hint">🌿 Rest arc: lighter sessions on purpose, so you come back stronger.</p>}
          {active.next ? (
            <button className="primary-button" onClick={() => startSession(active.next)}>Start episode {active.week}, day {active.next.day}</button>
          ) : !active.finished && <p className="md-sub">All sessions for this week are done. Next episode begins on day {active.week * 7 + 1}.</p>}
          <ul className="tr-plan">{active.sessions.map((s) => <li key={s.day}>{active.done.some((d) => d.week === active.week && d.day === s.day) ? "✅" : "⬜"} Day {s.day}: {s.exercises.map((e) => e.name).join(", ")}</li>)}</ul>
          <button className="chip" onClick={stop}>Stop this arc</button>
        </div>
      )}
      <div className="card tr-card">
        <h3>Beginner training arcs</h3>
        <p className="md-sub">Gradual weekly "episodes", three short sessions a week. {SAFETY_NOTE}</p>
        <ul className="tr-list">
          {programs.map((p) => (
            <li key={p.id}>
              <div><strong>{p.title}</strong><small>{p.weeksCount} weeks · {p.equipment === "none" ? "no equipment" : "basic gym"} · {p.summary}</small></div>
              <div className="tr-row">
                <button className="primary-button" disabled={active?.programId === p.id && !active.finished} onClick={() => begin(p.id)}>{active?.programId === p.id && !active.finished ? "In progress" : "Begin arc"}</button>
                <button className="chip" onClick={() => detail(p.id)}>{open?.id === p.id ? "Hide episodes" : "See episodes"}</button>
              </div>
              {open?.id === p.id && <ol className="tr-eps">{open.weeks.map((w) => <li key={w.week}><strong>Episode {w.week}: {w.episode}</strong>{w.rest && " 🌿"}<small>{w.sessions[0].exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(", ")}</small></li>)}</ol>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ---------- guided meditate and stretch ----------
function Guided({ kind: k0, minutes: m0, onClose, onLogged }) {
  const [kind, setKind] = useState(k0 || "meditate");
  const [minutes, setMinutes] = useState(m0 || 5);
  const [session, setSession] = useState(null);
  const [sec, setSec] = useState(0);
  const [run, setRun] = useState(false);
  const [sound, setSound] = useState(false);
  const [saved, setSaved] = useState(false);
  const ctx = useRef(null);
  const last = useRef("");

  const load = useCallback(() => api(`/api/training/guided?kind=${kind}&minutes=${minutes}`).then((j) => { setSession(j.session); setSec(0); setRun(false); setSaved(false); }).catch((e) => notify(e.message, "error")), [kind, minutes]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!run) return undefined;
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [run]);
  const bp = breathPhase(sec);
  const total = session?.totalSec || 0;
  const finished = !!session && sec >= total;
  useEffect(() => { if (finished && run) { setRun(false); } }, [finished, run]);
  useEffect(() => { // a soft generated tone at the start of each breath phase, only if switched on
    if (!sound || !run || last.current === bp.phase + Math.floor(sec / 12)) return;
    last.current = bp.phase + Math.floor(sec / 12);
    try {
      ctx.current = ctx.current || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.current.createOscillator(); const g = ctx.current.createGain();
      o.frequency.value = bp.phase === "inhale" ? 330 : bp.phase === "exhale" ? 247 : 294; g.gain.value = 0.04;
      o.connect(g); g.connect(ctx.current.destination); o.start(); o.stop(ctx.current.currentTime + 0.35);
    } catch { /* silence is fine */ }
  }, [bp.phase, sec, sound, run]);

  const cue = session ? cueAt(session.cues, sec) : null;
  const save = async () => {
    try { await post("/api/training/guided/log", { kind, minutes, date: getLocalDate(), clientId: newId("gd") }); setSaved(true); notify("Session logged. Calm done.", "success"); onLogged?.(); } catch (e) { notify(e.message, "error"); }
  };
  const scale = 0.55 + 0.45 * bp.progress;
  return (
    <div className="card tr-card tr-guided">
      <div className="md-head"><h3>{kind === "meditate" ? "Guided meditation" : "Guided stretch"}</h3>{onClose && <button className="chip" onClick={onClose}>Close</button>}</div>
      {!run && sec === 0 && (
        <div className="serving-chips" role="group" aria-label="Session setup">
          {[["meditate", "Meditate"], ["stretch", "Stretch"]].map(([key, l]) => <button key={key} className={kind === key ? "chip active" : "chip"} onClick={() => setKind(key)}>{l}</button>)}
          <span className="tr-gap" />
          {[3, 5, 7, 10].map((m) => <button key={m} className={minutes === m ? "chip active" : "chip"} onClick={() => setMinutes(m)}>{m} min</button>)}
        </div>
      )}
      <div className="tr-breath-wrap">
        <div className="tr-breath" style={{ transform: `scale(${run || sec ? scale : 0.8})` }} aria-hidden="true"><Buddy who={session?.who || "kakashi"} scene={session?.scene || "health"} size={96} talk={false} /></div>
        <p className="tr-phase" role="status" aria-live="polite">{finished ? "All done. Lovely." : run ? { inhale: "Breathe in", hold: "Hold gently", exhale: "Breathe out", rest: "Rest" }[bp.phase] : "Ready when you are"}</p>
      </div>
      {cue && <p className="tr-cue">{cue.title && <strong>{cue.title}. </strong>}{cue.text}</p>}
      <p className="tr-clock">{clock(Math.max(0, total - sec))} left</p>
      <div className="md-actions">
        {!finished && <button className="primary-button" onClick={() => setRun(!run)}>{run ? "Pause" : sec ? "Resume" : "Begin"}</button>}
        {(finished || sec >= 60) && !saved && <button className="primary-button" onClick={save}>Log session</button>}
        {sec > 0 && <button className="secondary-button" onClick={load}>Restart</button>}
        <label className="tr-sound"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Soft tones</label>
      </div>
      <p className="tr-safe">{session?.note}</p>
    </div>
  );
}

// ---------- hub ----------
export default function Training({ activities = [], onLogged = () => {} }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("ff-train-tab") || "today"; } catch { return "today"; } });
  const [workout, setWorkout] = useState(null);
  const [guided, setGuided] = useState(null);
  const pick = (t) => { setTab(t); try { localStorage.setItem("ff-train-tab", t); } catch { /* ignore */ } };

  const finishFor = (w) => async (results, minutes) => {
    const date = getLocalDate();
    let res;
    if (w.template) {
      res = await post(`/api/templates/${w.template._id}/log`, { date, clientId: newId("wk"), results: results.map((r) => ({ index: r.index, sets: r.sets })) });
    } else {
      res = await post("/api/training/workout/log", { date, clientId: newId("wk"), name: w.title, exercises: results.map((r) => ({ activityName: r.activityName, sets: r.sets })) });
    }
    if (w.program) await post("/api/training/programs/done", { date, ...w.program }).catch(() => {});
    onLogged();
    return { records: res.records || [], minutes: res.totals?.minutes ?? minutes, kcal: res.totals?.caloriesBurned ?? 0 };
  };
  const afterClose = () => setWorkout(null);

  return (
    <section className="tr-hub" aria-label="Strength and training">
      <div className="serving-chips" role="tablist" aria-label="Training sections">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "chip active" : "chip"} onClick={() => pick(k)}>{l}</button>)}
      </div>
      {tab === "today" && <Suggestion onStart={setWorkout} onGuided={(kind, minutes) => { setGuided({ kind, minutes }); pick("calm"); }} />}
      {tab === "routines" && <Routines activities={activities} onStart={setWorkout} onLogged={onLogged} />}
      {tab === "progress" && <Progress />}
      {tab === "arcs" && <Arcs onStart={setWorkout} />}
      {tab === "calm" && <Guided key={guided ? `${guided.kind}${guided.minutes}` : "free"} kind={guided?.kind} minutes={guided?.minutes} onLogged={onLogged} />}
      {workout && <WorkoutMode key={workout.title} {...workout} onFinish={finishFor(workout)} onClose={afterClose} />}
    </section>
  );
}
