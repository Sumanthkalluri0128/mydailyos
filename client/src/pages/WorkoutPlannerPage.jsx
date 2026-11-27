import { useCallback, useEffect, useMemo, useState } from "react";
import { canStart } from "../utils/planStart";
import { beginPlannedStart } from "../utils/plannedStart";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import { getLocalDate } from "../utils/date";
import { KINDS, WEEKDAYS, addDays, dayState, exercisesToText, itemState, itemsOn, kindMeta, monthGrid, mondayOf, parseExercises, patternFromRows, shiftMonth, weekDays, weekTotals } from "../utils/workoutPlanView";
import "./gymlog.css";
import "./workoutPlanner.css";

const fmtDay = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
const fmtShort = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const fmtMonth = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const EMPTY_FORM = { kind: "strength", title: "", minutes: "", exercises: "", note: "" };

/** Plan workouts for any day, a week or a month ahead. A planned workout shows as done when your own exercise log covers it. */
export default function WorkoutPlannerPage({ onBack, onStart }) {
  const today = getLocalDate();
  const [view, setView] = useState("week");
  const [start, setStart] = useState(mondayOf(today));
  const [month, setMonth] = useState(today);
  const [data, setData] = useState({ items: [], days: {} });
  const [state, setState] = useState("loading");
  const [form, setForm] = useState(null);             // { id?, date, ...fields } while adding or editing
  const [moving, setMoving] = useState(null);         // { id, date }
  const [ahead, setAhead] = useState(false);
  const [rows, setRows] = useState(() => WEEKDAYS.map((_, i) => ({ dow: i + 1, kind: "", title: "", minutes: "" })));
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => monthGrid(month), [month]);
  const [from, to] = view === "week" ? [start, addDays(start, 6)] : [grid.gridStart, grid.gridEnd];

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/workout-plan?from=${from}&to=${to}`);
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || "load failed");
      setData({ items: j.items, days: j.days }); setState("ok");
    } catch { setState("error"); }
  }, [from, to]);
  useEffect(() => { setState("loading"); load(); }, [load]);

  /** One request at a time: a second tap while it runs is ignored. */
  const send = async (method, path, body, okMsg) => {
    if (busy) return null;
    setBusy(true);
    try {
      const r = await apiFetch(path, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, today }) } : {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || "That did not work");
      if (okMsg) notify(typeof okMsg === "function" ? okMsg(j) : okMsg, "success");
      await load();
      return j;
    } catch (e) { notify(e.message || "That did not work", "error"); return null; }
    finally { setBusy(false); }
  };

  const saveForm = async () => {
    const f = form;
    const fields = { kind: f.kind, title: f.title, minutes: Number(f.minutes) || 0, exercises: parseExercises(f.exercises), note: f.note };
    const j = f.id ? await send("PATCH", `/api/workout-plan/${f.id}`, fields, "Workout updated") : await send("POST", "/api/workout-plan", { ...fields, date: f.date }, "Workout planned");
    if (j) setForm(null);
  };
  const setStatus = (it, status) => send("PATCH", `/api/workout-plan/${it._id}`, { status });
  const move = async () => { const j = await send("PATCH", `/api/workout-plan/${moving.id}`, { date: moving.date }, "Moved"); if (j) setMoving(null); };
  const remove = async (it) => { if (await confirmAction(`Remove “${it.title}” on ${fmtShort(it.date)} from your plan?`, { confirmLabel: "Remove" })) send("DELETE", `/api/workout-plan/${it._id}`, null, "Removed"); };
  const removeSeries = async (it) => { if (await confirmAction(`Remove “${it.title}” and the rest of this repeating plan from ${fmtShort(it.date)} on?`, { confirmLabel: "Remove all" })) send("DELETE", `/api/workout-plan/series/${encodeURIComponent(it.seriesId)}?from=${it.date}`, null, (j) => `Removed ${j.deleted} workouts`); };
  const planAhead = async () => {
    const pattern = patternFromRows(rows);
    if (!pattern.length) { notify("Pick a workout for at least one weekday", "error"); return; }
    const j = await send("POST", "/api/workout-plan/repeat", { from: start, weeks, pattern }, (x) => `Planned ${x.created} workouts`);
    if (j) setAhead(false);
  };
  const copyWeek = () => send("POST", "/api/workout-plan/copy-week", { fromStart: start, toStart: addDays(start, 7) }, (x) => (x.copied ? `Copied ${x.copied} workouts to next week${x.alreadyThere ? ` (${x.alreadyThere} already there)` : ""}` : x.alreadyThere ? "Next week already has these" : "Nothing to copy"));

  const totals = weekTotals(data.items.filter((i) => i.date >= start && i.date <= addDays(start, 6)));
  const days = weekDays(start);

  const renderItem = (it) => {
    const st = itemState(it), meta = kindMeta(it.kind);
    return (
      <div className="wpl-item" key={it._id}>
        <div className="wpl-item-main">
          <span className="wpl-icon" aria-hidden="true">{meta.icon}</span>
          <span className="wpl-title">{it.title}</span>
          {it.minutes > 0 && <span className="wpl-meta">{it.minutes} min</span>}
          {st !== "planned" && st !== "rest" && <span className={`wpl-state ${st}`}>{st === "done" ? (it.matched ? "Done · matches your log" : "Done") : "Skipped"}</span>}
          {it.movedFrom && <span className="wpl-meta">moved from {fmtShort(it.movedFrom)}</span>}
        </div>
        {it.exercises.length > 0 && <ul className="wpl-ex">{it.exercises.map((e, i) => <li key={i}>{e.name}{e.sets && e.reps ? ` · ${e.sets}×${e.reps}` : ""}{e.kg ? ` · ${e.kg} kg` : ""}</li>)}</ul>}
        {it.note && <p className="gl-muted" style={{ margin: "4px 0 0 28px" }}>{it.note}</p>}
        <div className="wpl-actions">
          {canStart({ ...it, done: it.matched }, today) && <button type="button" className="gl-btn gl-primary" disabled={busy} onClick={() => { beginPlannedStart(it); if (onStart) onStart(); }}>Start</button>}
          {it.kind !== "rest" && (it.status === "planned" && !it.matched
            ? <><button type="button" className="gl-btn gl-soft" disabled={busy} onClick={() => setStatus(it, "done")}>Mark done</button><button type="button" className="gl-btn gl-soft" disabled={busy} onClick={() => setStatus(it, "skipped")}>Skip</button></>
            : it.status !== "planned" ? <button type="button" className="gl-btn gl-soft" disabled={busy} onClick={() => setStatus(it, "planned")}>Undo</button> : null)}
          {it.date >= today && <button type="button" className="gl-btn gl-soft" disabled={busy} onClick={() => setMoving({ id: it._id, date: it.date })}>Move</button>}
          <button type="button" className="gl-btn gl-soft" disabled={busy} onClick={() => setForm({ id: it._id, date: it.date, kind: it.kind, title: it.title, minutes: it.minutes || "", exercises: exercisesToText(it.exercises), note: it.note })}>Edit</button>
          <button type="button" className="gl-btn gl-danger" disabled={busy} onClick={() => remove(it)}>Remove</button>
          {it.seriesId && <button type="button" className="gl-btn gl-danger" disabled={busy} onClick={() => removeSeries(it)}>Remove the rest of this repeat</button>}
        </div>
        {moving && moving.id === it._id && (
          <div className="wpl-inline"><label>Move to <input type="date" min={today} value={moving.date} onChange={(e) => setMoving({ ...moving, date: e.target.value })} /></label><button type="button" className="gl-btn gl-primary" disabled={busy || !moving.date} onClick={move}>Move</button><button type="button" className="gl-btn gl-soft" onClick={() => setMoving(null)}>Cancel</button></div>
        )}
      </div>
    );
  };

  const renderForm = () => (
    <div className="wpl-form">
      <div className="gl-chips">{KINDS.map(([k, icon, label]) => <button type="button" key={k} className={`gl-chip${form.kind === k ? " is-on" : ""}`} onClick={() => setForm({ ...form, kind: k })}>{icon} {label}</button>)}</div>
      {form.kind !== "rest" && <>
        <label className="gl-field"><span>Name (optional)</span><input value={form.title} maxLength={80} placeholder={kindMeta(form.kind).label} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="gl-field"><span>Minutes (optional)</span><input type="number" inputMode="numeric" min="0" max="300" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} /></label>
        <label className="gl-field"><span>Exercises (optional, one per line, e.g. “Squat 3x8 @60”)</span><textarea rows={4} value={form.exercises} onChange={(e) => setForm({ ...form, exercises: e.target.value })} /></label>
        <label className="gl-field"><span>Note (optional)</span><input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      </>}
      <div className="gl-row"><button type="button" className="gl-btn gl-primary" disabled={busy} onClick={saveForm}>{form.id ? "Save changes" : "Add to plan"}</button><button type="button" className="gl-btn gl-soft" onClick={() => setForm(null)}>Cancel</button></div>
    </div>
  );

  return (
    <div className="gl-page">
      <button type="button" className="gl-back" onClick={onBack}>← Back</button>
      <h2 className="gl-title">Workout planner</h2>
      <p className="gl-muted gl-private">Plan workouts for any day, a week or a month ahead. A workout shows as done when what you logged (Gym log, Workout tab, Exercise page, watch) covers it, or when you mark it. Planning never adds calories.</p>
      <div className="gl-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === "week"} className={`gl-tab${view === "week" ? " is-on" : ""}`} onClick={() => setView("week")}>Week</button>
        <button type="button" role="tab" aria-selected={view === "month"} className={`gl-tab${view === "month" ? " is-on" : ""}`} onClick={() => setView("month")}>Month</button>
      </div>

      {state === "error" && <div className="gl-card"><p className="gl-muted">Could not load your plan. The server may be waking up.</p><button type="button" className="gl-btn gl-primary" onClick={() => { setState("loading"); load(); }}>Try again</button></div>}

      {view === "week" && (
        <>
          <div className="wpl-week-head">
            <div className="wpl-nav">
              <button type="button" className="gl-btn gl-soft" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}>‹</button>
              <span className="wpl-range">{fmtShort(start)} – {fmtShort(addDays(start, 6))}</span>
              <button type="button" className="gl-btn gl-soft" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}>›</button>
            </div>
            {start !== mondayOf(today) && <button type="button" className="gl-btn gl-soft" onClick={() => setStart(mondayOf(today))}>This week</button>}
          </div>
          <p className="wpl-totals">{state === "loading" ? "Loading…" : totals.planned ? `${totals.done} of ${totals.planned} done${totals.skipped ? ` · ${totals.skipped} skipped` : ""} · ${totals.minutes} min planned` : "Nothing planned this week yet."}</p>
          {days.map((d) => {
            const its = itemsOn(data.items, d);
            return (
              <section key={d} className={`wpl-day${d === today ? " is-today" : ""}${d < today ? " is-past" : ""}`}>
                <div className="wpl-day-head">
                  <h4>{fmtDay(d)}<small>{fmtShort(d)}{d === today ? " · today" : ""}</small></h4>
                  {d >= today && !(form && !form.id && form.date === d) && <button type="button" className="gl-btn gl-soft" disabled={busy} onClick={() => setForm({ ...EMPTY_FORM, date: d })}>＋ Add</button>}
                </div>
                {its.length === 0 && !(form && !form.id && form.date === d) && <p className="gl-muted" style={{ margin: "6px 0 0" }}>{d < today ? "Nothing was planned." : "Nothing planned."}</p>}
                {its.map((it) => (form && form.id === it._id ? <div key={it._id}>{renderForm()}</div> : renderItem(it)))}
                {form && !form.id && form.date === d && renderForm()}
              </section>
            );
          })}
          <div className="gl-card">
            <div className="gl-card-head"><h3>Plan ahead</h3></div>
            {!ahead ? (
              <>
                <p className="gl-muted">Set up a repeating week and plan the next few weeks in one go, or copy this week to next week.</p>
                <div className="gl-row"><button type="button" className="gl-btn gl-primary" onClick={() => setAhead(true)}>Plan several weeks</button><button type="button" className="gl-btn gl-soft" disabled={busy || !totals.planned} onClick={copyWeek}>Copy this week to next week</button></div>
              </>
            ) : (
              <>
                <p className="gl-muted">Choose what you do on each weekday. It starts with the week shown above (days before today are skipped) and doing it twice never doubles the plan.</p>
                <div className="wpl-rows">
                  {rows.map((r, i) => (
                    <div key={r.dow} style={{ display: "contents" }}>
                      <strong>{WEEKDAYS[i]}</strong>
                      <select aria-label={`${WEEKDAYS[i]} workout`} value={r.kind} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}><option value="">—</option>{KINDS.filter((k) => k[0] !== "custom").map(([k, icon, label]) => <option key={k} value={k}>{icon} {label}</option>)}</select>
                      <input aria-label={`${WEEKDAYS[i]} minutes`} type="number" inputMode="numeric" min="0" max="300" placeholder="min" disabled={!r.kind || r.kind === "rest"} value={r.minutes} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, minutes: e.target.value } : x)))} />
                    </div>
                  ))}
                </div>
                <div className="wpl-inline"><label>For <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>{[1, 2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n} week{n > 1 ? "s" : ""}</option>)}</select></label></div>
                <div className="gl-row"><button type="button" className="gl-btn gl-primary" disabled={busy} onClick={planAhead}>Plan {weeks} week{weeks > 1 ? "s" : ""}</button><button type="button" className="gl-btn gl-soft" onClick={() => setAhead(false)}>Cancel</button></div>
              </>
            )}
          </div>
        </>
      )}

      {view === "month" && (
        <div className="gl-card">
          <div className="wpl-week-head">
            <div className="wpl-nav">
              <button type="button" className="gl-btn gl-soft" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
              <span className="wpl-range">{fmtMonth(grid.first)}</span>
              <button type="button" className="gl-btn gl-soft" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
            </div>
            {grid.month !== today.slice(0, 7) && <button type="button" className="gl-btn gl-soft" onClick={() => setMonth(today)}>This month</button>}
          </div>
          <div className="wpl-month" role="grid">
            {WEEKDAYS.map((w) => <div key={w} className="wpl-mh" role="columnheader">{w}</div>)}
            {grid.weeks.flat().map((d) => {
              const ds = dayState(data.days[d]);
              return (
                <button key={d} type="button" className={`wpl-cell${d.slice(0, 7) !== grid.month ? " out" : ""}${d === today ? " is-today" : ""}`} aria-label={`${fmtShort(d)}${ds ? `, ${ds}` : ""}`} onClick={() => { setStart(mondayOf(d)); setView("week"); }}>
                  {Number(d.slice(8))}<span className={`wpl-dot ${ds}`} />
                </button>
              );
            })}
          </div>
          <div className="wpl-legend"><span><i className="wpl-dot planned" /> planned</span><span><i className="wpl-dot done" /> done</span><span><i className="wpl-dot part" /> partly</span><span><i className="wpl-dot skipped" /> skipped</span><span><i className="wpl-dot rest" /> rest</span></div>
          <p className="gl-muted">Tap a day to open its week.</p>
        </div>
      )}
    </div>
  );
}
