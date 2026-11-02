// Workout in progress: steps through the day (warm-up checklist, each exercise with a set logger, core, cool-down),
// keeps a clock that can pause, runs a rest timer after every ticked set, and ends on the "Workout complete" summary.
// All state lives in `active` (saved by the page after every change), so a refresh or a closed tab never loses a session.
import { useEffect, useMemo, useRef, useState } from "react";
import { FigThumb, Chip, fmtClock } from "./bits";
import { elapsedSec, finishActive, personalBests, setsFor, suggestNext, volumeOf, setsDone, estimateKcal } from "../../utils/workoutStore";
import { confirmAction } from "../../utils/confirm";

const FEELS = [["easy", "😌", "Easy"], ["good", "🙂", "Good"], ["challenging", "😤", "Challenging"], ["hard", "🥵", "Hard"]];

/** The flat list of steps for a day (an options block counts as one step). */
export function stepsOf(day) {
  const out = [];
  for (const b of day.blocks) {
    if (b.type === "sets") b.items.forEach((ex) => out.push({ kind: "ex", block: b, ex }));
    else out.push({ kind: b.type === "options" ? "options" : "check", block: b });
  }
  return out;
}

function Stepper({ value, onChange, step = 1, min = 0, max = 999, label, wide }) {
  const n = Number(value) || 0;
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <div className={`wp-stepper ${wide ? "wide" : ""}`}>
      <button type="button" onClick={() => set(n - step)} aria-label={`Less ${label}`}>−</button>
      <input inputMode="decimal" aria-label={label} value={value === 0 ? "0" : value} onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v === "" ? "" : v); }} onBlur={() => set(n)} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={() => set(n + step)} aria-label={`More ${label}`}>+</button>
    </div>
  );
}

export default function SessionView({ day, st, setActive, swaps, sessions, week, weightKg, onLeave, onDiscard, onSave, openSheet }) {
  const active = st.active;
  const steps = useMemo(() => stepsOf(day), [day]);
  const [now, setNow] = useState(Date.now());
  const [rest, setRest] = useState(null);       // { end, total }
  const [finishing, setFinishing] = useState(false);
  const [feel, setFeel] = useState("good");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const topRef = useRef(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => { topRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" }); }, [active.step, finishing]);

  const paused = !!active.pausedAt;
  const secs = elapsedSec(active, now);
  const step = steps[Math.min(active.step, steps.length - 1)];
  const patch = (fn) => setActive((a) => fn({ ...a }));

  // rest timer: ends with a short buzz (where supported)
  const left = rest ? Math.max(0, Math.ceil((rest.end - now) / 1000)) : 0;
  useEffect(() => {
    if (rest && left === 0) { try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ } const t = setTimeout(() => setRest(null), 1800); return () => clearTimeout(t); }
    return undefined;
  }, [rest, left]);

  const togglePause = () => patch((a) => (a.pausedAt ? { ...a, pausedMs: (a.pausedMs || 0) + (Date.now() - a.pausedAt), pausedAt: 0 } : { ...a, pausedAt: Date.now() }));
  const go = (n) => { setRest(null); patch((a) => ({ ...a, step: Math.min(steps.length, Math.max(0, n)) })); };

  // ---- derived for the summary
  const itemsDone = Object.values(active.checks).filter(Boolean).length;
  const exList = steps.filter((s) => s.kind === "ex");
  const exDone = exList.filter((s) => !active.skipped[s.ex.id] && (active.sets[s.ex.id] || []).some((x) => x.done)).length;
  const draft = useMemo(() => finishActive(active, day, { swaps, weightKg, feel, notes, now }), [active, day, swaps, weightKg, feel, notes, now]);
  const prs = useMemo(() => personalBests(draft, sessions), [draft, sessions]);

  const leave = async () => {
    const ok = await confirmAction("Leave for now? Your progress is saved. Continue from the Today tab.", { title: "Pause workout", confirmText: "Pause and leave", cancelText: "Keep going", danger: false });
    if (ok) onLeave();
  };
  const discard = async () => {
    const ok = await confirmAction("This deletes everything you logged in this workout.", { title: "Discard workout?", confirmText: "Discard", cancelText: "Keep it" });
    if (ok) onDiscard();
  };
  const save = async () => {
    if (saving) return; setSaving(true);
    try { await onSave(finishActive(active, day, { swaps, weightKg, feel, notes })); } finally { setSaving(false); }
  };

  // ---------------------------------------------------------------------------------------------------------- complete
  if (finishing || active.step >= steps.length) {
    const mins = Math.max(1, Math.round(secs / 60));
    return (
      <section className="wp-session wp-done" ref={topRef} aria-label="Workout complete">
        <div className="wp-burst" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => <i key={i} style={{ "--i": i }} />)}</div>
        <h2>Workout complete!</h2>
        <p className="wp-muted">{`Day ${day.n}: ${day.title}`}</p>
        <div className="wp-tiles3">
          <div><small>Duration</small><b>{mins}</b><em>min</em></div>
          <div><small>Burned</small><b>{estimateKcal(day, mins, weightKg)}</b><em>kcal est.</em></div>
          <div><small>Exercises</small><b>{exDone}/{exList.length || 0}</b><em>{setsDone(draft)} sets</em></div>
        </div>
        {volumeOf(draft) > 0 && <p className="wp-last">Total weight lifted: <b>{volumeOf(draft).toLocaleString()} kg</b></p>}
        {prs.length > 0 && <div className="wp-pr" role="status"><b>New personal best{prs.length > 1 ? "s" : ""}</b><ul>{prs.map((p) => <li key={p.id}>🏅 {p.name}: {p.w} kg</li>)}</ul></div>}
        <h3 className="wp-h">How was it?</h3>
        <div className="wp-feels" role="radiogroup" aria-label="How was the workout">
          {FEELS.map(([id, emo, label]) => <button key={id} type="button" role="radio" aria-checked={feel === id} className={feel === id ? "on" : ""} onClick={() => setFeel(id)}><span aria-hidden="true">{emo}</span>{label}</button>)}
        </div>
        <label className="wp-notes"><span>Notes (optional)</span><textarea value={notes} maxLength={300} rows={3} placeholder="Felt good, better form today!" onChange={(e) => setNotes(e.target.value)} /></label>
        {exDone === 0 && itemsDone === 0 && <p className="wp-warn">Nothing is ticked yet. You can still save it.</p>}
        <div className="wp-actions">
          <button type="button" className="wp-btn ghost" onClick={() => { setFinishing(false); go(steps.length - 1); }}>Back</button>
          <button type="button" className="wp-btn hot grow" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save & finish"}</button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------------------------------------- steps
  const last = active.step >= steps.length - 1;
  const title = step.kind === "ex" ? step.ex.name : step.block.title;

  return (
    <section className="wp-session" ref={topRef} aria-label="Workout in progress">
      <header className="wp-s-head">
        <button type="button" className="wp-icon-btn" onClick={leave} aria-label="Pause and leave">‹</button>
        <div><h2>Workout in progress</h2><p>Day {day.n} · {day.title}</p></div>
        <button type="button" className={`wp-clock ${paused ? "paused" : ""}`} onClick={togglePause} aria-label={paused ? "Resume the clock" : "Pause the clock"}>{fmtClock(secs)}<span aria-hidden="true">{paused ? "▶" : "❚❚"}</span></button>
      </header>

      <div className="wp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={active.step} aria-label={`Step ${active.step + 1} of ${steps.length}`}>
        {steps.map((s, i) => <button key={i} type="button" className={`${i < active.step ? "done" : ""} ${i === active.step ? "now" : ""}`} onClick={() => go(i)} aria-label={`Go to step ${i + 1}: ${s.kind === "ex" ? s.ex.name : s.block.title}`} />)}
      </div>
      <p className="wp-stepcount">Step {active.step + 1} of {steps.length}{step.block.optional ? " · optional" : ""}</p>

      {step.kind === "ex" && <ExStep key={step.ex.id} base={step.ex} active={active} patch={patch} swaps={swaps} sessions={sessions} week={week} setRest={setRest} openSheet={openSheet} />}
      {step.kind === "check" && <CheckStep key={step.block.id} block={step.block} active={active} patch={patch} swaps={swaps} openSheet={openSheet} />}
      {step.kind === "options" && <OptionsStep key={step.block.id} block={step.block} active={active} patch={patch} swaps={swaps} openSheet={openSheet} />}

      {rest && (
        <div className={`wp-rest ${left === 0 ? "over" : ""}`} role="timer" aria-live="off">
          <div className="wp-rest-bar" style={{ transform: `scaleX(${rest.total ? left / rest.total : 0})` }} aria-hidden="true" />
          <span>{left === 0 ? "Rest over. Next set!" : `Rest ${fmtClock(left)}`}</span>
          <button type="button" onClick={() => setRest((r) => ({ ...r, end: r.end + 15000, total: r.total + 15 }))}>+15s</button>
          <button type="button" onClick={() => setRest(null)}>Skip</button>
        </div>
      )}

      <div className="wp-actions sticky">
        <button type="button" className="wp-btn ghost" disabled={active.step === 0} onClick={() => go(active.step - 1)}>‹ Previous</button>
        {last
          ? <button type="button" className="wp-btn hot grow" onClick={() => setFinishing(true)}>Finish workout</button>
          : <button type="button" className="wp-btn hot grow" onClick={() => go(active.step + 1)}>Next ›</button>}
      </div>
      <button type="button" className="wp-link danger" onClick={discard}>Discard this workout</button>
      <span className="wp-sr" aria-live="polite">{title}</span>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------- one exercise
function ExStep({ base, active, patch, swaps, sessions, week, setRest, openSheet }) {
  const altId = swaps[base.id];
  const alt = altId ? base.alts.find((a) => a.id === altId) : null;
  const ex = alt ? { ...base, ...alt, sets: base.sets, reps: base.reps, repsMin: base.repsMin, repsMax: base.repsMax, from: base.id } : base;
  const rows = active.sets[base.id] || [];
  const skipped = !!active.skipped[base.id];
  const sug = suggestNext(ex, sessions);
  const target = setsFor(base, week);
  const doneCount = rows.filter((r) => r.done).length;
  const cur = rows.findIndex((r) => !r.done);
  const unitLabel = base.timed ? "Secs" : "Reps";

  const setRow = (i, p) => patch((a) => ({ ...a, sets: { ...a.sets, [base.id]: a.sets[base.id].map((r, j) => (j === i ? { ...r, ...p } : r)) } }));
  const tick = (i) => {
    const r = rows[i]; const next = !r.done;
    setRow(i, { done: next, w: Number(r.w) || 0, r: Number(r.r) || 0 });
    if (next && i < rows.length - 1) setRest({ end: Date.now() + ex.rest * 1000, total: ex.rest });
    if (!next) setRest(null);
  };
  const addSet = () => patch((a) => { const l = a.sets[base.id]; const lastRow = l[l.length - 1] || { w: sug.w, r: sug.r }; return { ...a, sets: { ...a.sets, [base.id]: [...l, { w: lastRow.w, r: lastRow.r, done: false }] } }; });
  const dropSet = () => patch((a) => { const l = a.sets[base.id]; return l.length > 1 ? { ...a, sets: { ...a.sets, [base.id]: l.slice(0, -1) } } : a; });

  return (
    <div className={`wp-ex ${skipped ? "skipped" : ""}`}>
      <div className="wp-ex-top">
        <FigThumb ex={ex} size={132} className="big" />
        <div className="wp-ex-info">
          <h3>{ex.name}</h3>
          <p className="wp-muted">{alt ? <>Alternative to {base.name}</> : (base.targets || []).join(", ")}</p>
          <p className="wp-ex-set">{skipped ? "Skipped" : cur === -1 ? "All sets done ✓" : `Set ${cur + 1} of ${rows.length}`}</p>
          <div className="wp-chips">
            <Chip>{target} × {base.reps}{base.timed ? "s" : ""}{base.perSide ? "/side" : ""}</Chip>
            <Chip>Rest {ex.rest}s</Chip>
            {week >= 5 && base.main && <Chip tone="hot">+1 set</Chip>}
          </div>
        </div>
      </div>

      <p className={`wp-sug ${sug.up ? "up" : ""}`}>{sug.note}{sug.w > 0 ? <> Try <b>{sug.w} kg × {sug.r}</b>.</> : null}</p>

      {!skipped && (
        <div className="wp-table" role="group" aria-label="Sets">
          <div className="wp-trow head"><span>Set</span><span>{base.bw || base.timed ? "Body" : "Weight (kg)"}</span><span>{unitLabel}</span><span /></div>
          {rows.map((r, i) => (
            <div key={i} className={`wp-trow ${r.done ? "done" : i === cur ? "cur" : ""}`}>
              <span className="wp-setno">{i + 1}</span>
              {base.bw && !(Number(r.w) > 0) && !r.addW
                ? <button type="button" className="wp-bw" onClick={() => setRow(i, { addW: true, w: 2 })} title="Add weight">BW ＋</button>
                : <Stepper value={r.w} step={2.5} max={500} label={`Weight, set ${i + 1}`} onChange={(v) => setRow(i, { w: v })} />}
              <Stepper value={r.r} step={base.timed ? 5 : 1} max={base.timed ? 600 : 100} label={`${unitLabel}, set ${i + 1}`} onChange={(v) => setRow(i, { r: v })} />
              <button type="button" className={`wp-check ${r.done ? "on" : ""}`} aria-pressed={r.done} aria-label={`Set ${i + 1} ${r.done ? "done" : "not done"}`} onClick={() => tick(i)}>{r.done ? "✓" : ""}</button>
            </div>
          ))}
          <div className="wp-trow-actions">
            <button type="button" className="wp-link" onClick={addSet}>＋ Add set</button>
            {rows.length > 1 && doneCount < rows.length && <button type="button" className="wp-link" onClick={dropSet}>− Remove set</button>}
          </div>
        </div>
      )}

      <div className="wp-ex-tools">
        <button type="button" className="wp-btn soft" onClick={() => openSheet(base, "how")}>How to do</button>
        <button type="button" className="wp-btn soft" onClick={() => openSheet(base, "alts")}>Alternatives ({base.alts.length})</button>
        <button type="button" className="wp-btn soft" onClick={() => patch((a) => ({ ...a, skipped: { ...a.skipped, [base.id]: !skipped } }))}>{skipped ? "Undo skip" : "Skip"}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------- tick lists
function Row({ it, active, patch, swaps, openSheet }) {
  const altId = swaps[it.id];
  const alt = altId ? it.alts.find((a) => a.id === altId) : null;
  const on = !!active.checks[it.id];
  return (
    <li className={on ? "on" : ""}>
      <button type="button" className={`wp-check ${on ? "on" : ""}`} aria-pressed={on} aria-label={`${alt ? alt.name : it.name}: ${on ? "done" : "not done"}`} onClick={() => patch((a) => ({ ...a, checks: { ...a.checks, [it.id]: !on } }))}>{on ? "✓" : ""}</button>
      <button type="button" className="wp-li-main" onClick={() => openSheet(it, "how")}>
        <FigThumb ex={alt ? { ...it, ...alt } : it} size={44} />
        <span><b>{alt ? alt.name : it.name}</b><small>{it.dose}{alt ? ` · instead of ${it.name}` : ""}</small></span>
      </button>
      {it.alts.length > 0 && <button type="button" className="wp-mini" onClick={() => openSheet(it, "alts")} aria-label={`Alternatives for ${it.name}`}>⇄ {it.alts.length}</button>}
    </li>
  );
}

function CheckStep({ block, active, patch, swaps, openSheet }) {
  const all = block.items.every((i) => active.checks[i.id]);
  return (
    <div className="wp-list-card">
      <div className="wp-list-head"><h3>{block.title}</h3>{block.minutes && <Chip>{block.minutes}</Chip>}</div>
      <ul className="wp-checks">{block.items.map((it) => <Row key={it.id} it={it} active={active} patch={patch} swaps={swaps} openSheet={openSheet} />)}</ul>
      <button type="button" className="wp-link" onClick={() => patch((a) => ({ ...a, checks: { ...a.checks, ...Object.fromEntries(block.items.map((i) => [i.id, !all])) } }))}>{all ? "Untick all" : "Tick all"}</button>
    </div>
  );
}

function OptionsStep({ block, active, patch, swaps, openSheet }) {
  const pick = active.choices[block.id];
  const opt = block.options.find((o) => o.id === pick);
  return (
    <div className="wp-list-card">
      <div className="wp-list-head"><h3>{block.title}</h3></div>
      <div className="wp-opts" role="radiogroup" aria-label={block.title}>
        {block.options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} className={pick === o.id ? "on" : ""} onClick={() => patch((a) => ({ ...a, choices: { ...a.choices, [block.id]: o.id } }))}><b>{o.label}</b><small>{o.note}</small></button>)}
      </div>
      {opt ? <ul className="wp-checks">{opt.items.map((it) => <Row key={it.id} it={it} active={active} patch={patch} swaps={swaps} openSheet={openSheet} />)}</ul> : <p className="wp-muted">Pick one to see the moves.</p>}
    </div>
  );
}
