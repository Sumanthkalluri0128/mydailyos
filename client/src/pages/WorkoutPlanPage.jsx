// Workout Plans tab. Screens: Today (week strip, today's workout, stats), Plan (the 7-day schedule + guide), Day overview,
// Exercise Library, History, and the live workout. The plan itself is data (data/workoutPlan.js); the rules are pure functions
// (utils/workoutStore.js). Logs are kept in this browser (per signed-in email) and each finished workout is also sent to the
// Exercise log (best effort) so its calories count in the day's totals.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { getLocalDate } from "../utils/date";
import { currentOwner } from "../utils/cacheOwner";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import { DAYS, GUIDE, PLAN, FILTERS, MUSCLE_LABEL, dayById, libraryList } from "../data/workoutPlan";
import { addDays, fromStr, inRange, loadState, mondayOf, newActive, phaseFor, saveState, streak, summarize, volumeOf, weekNumber, weekStrip, elapsedSec } from "../utils/workoutStore";
import ExSheet, { Chip, FigThumb, MUSCLE_ICON, fmtClock } from "../components/workout/bits";
import SessionView from "../components/workout/SessionView";
import BodyPlanPage from "./BodyPlanPage";
import "../components/workout/workoutplan.css";

const VIEWS = [["today", "Today", "🏠"], ["plan", "My plan", "📋"], ["body", "Body", "💪"], ["library", "Library", "📚"], ["history", "History", "🕘"]];
const KCAL_ACTIVITY = { strength: "Strength Training", conditioning: "Bodyweight circuit", recovery: "Walking - Moderate" };
const FEEL_LABEL = { easy: "😌 Easy", good: "🙂 Good", challenging: "😤 Challenging", hard: "🥵 Hard" };
const STATUS_ICON = { done: "✓", today: "●", missed: "–", upcoming: "", "rest-past": "☾" };
const prettyDate = (s) => fromStr(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

async function logToExercise(rec, day, weightKg) {
  const name = KCAL_ACTIVITY[day.kind];
  if (!name) return true; // rest day: nothing to log
  const r = await apiFetch(`${API_URL}/api/activities?search=${encodeURIComponent(name)}`);
  if (!r.ok) return false;
  const j = await r.json();
  const act = (j.activities || []).find((a) => a.name === name);
  if (!act) return false;
  const body = { date: rec.date, activityId: act._id, durationMinutes: Math.max(1, rec.minutes), weightKg, caloriesBurned: rec.kcal, notes: `${rec.title} (Workout Plans)`, clientId: `wp-${rec.id}` };
  const w = await apiFetch(`${API_URL}/api/activities/logs`, { method: "POST", body: JSON.stringify(body) });
  return w.ok;
}

export default function WorkoutPlanPage({ startView }) {
  const owner = useMemo(() => currentOwner(), []);
  const [today, setToday] = useState(getLocalDate());
  const [st, setSt] = useState(() => { const s = loadState(owner); return s.startDate ? s : { ...s, startDate: getLocalDate() }; });
  const [view, setViewRaw] = useState(() => { if (startView) return startView; try { const v = sessionStorage.getItem("ff-wp-view"); return VIEWS.some((x) => x[0] === v) ? v : "today"; } catch { return "today"; } });
  const tabsRef = useRef(null);
  // switching tab keeps you at the tabs (never left at the old scroll position, which is what made the page jump up and down)
  const setView = useCallback((v) => {
    setViewRaw(v);
    requestAnimationFrame(() => { const el = tabsRef.current; if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 66, behavior: "instant" }); });
  }, []);
  const [body, setBody] = useState(null); // headline numbers from the body plan (null until the server answers)
  useEffect(() => {
    let alive = true;
    apiFetch(`${API_URL}/api/body-plan?date=${getLocalDate()}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j && j.plan && j.plan.ready) setBody({ chosen: j.chosen, plan: j.plan }); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [dayOpen, setDayOpen] = useState(null);
  const [selDay, setSelDay] = useState(null);
  const [running, setRunning] = useState(false);
  const [sheet, setSheet] = useState(null);

  // keep "today" right if the tab stays open past midnight
  useEffect(() => {
    const f = () => setToday(getLocalDate());
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  useEffect(() => { saveState(owner, st); }, [owner, st]);
  useEffect(() => { try { sessionStorage.setItem("ff-wp-view", view); } catch { /* ignore */ } }, [view]);

  // send workouts that were not sent yet (offline, or the server was asleep). One at a time, last 14 days only.
  const syncing = useRef(false);
  useEffect(() => {
    if (syncing.current) return undefined;
    const todo = st.sessions.filter((s) => !st.synced[s.id] && s.date >= addDays(today, -14));
    if (!todo.length) return undefined;
    syncing.current = true;
    let alive = true;
    (async () => {
      const ok = {};
      for (const s of todo) {
        try { if (await logToExercise(s, dayById(s.dayId) || DAYS[0], st.weightKg)) ok[s.id] = true; } catch { /* try again next time */ }
      }
      syncing.current = false;
      if (alive && Object.keys(ok).length) { setSt((x) => ({ ...x, synced: { ...x.synced, ...ok } })); window.dispatchEvent(new Event("ff:refresh")); }
    })();
    return () => { alive = false; syncing.current = false; };
  }, [st.sessions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const week = weekNumber(st.startDate, today);
  const phase = phaseFor(week);
  const strip = useMemo(() => weekStrip(st.sessions, today), [st.sessions, today]);
  const run = streak(st.sessions, today);
  const todayDay = strip.find((s) => s.isToday).day;
  const shownDay = selDay ? dayById(selDay) : todayDay;
  const weekDone = strip.filter((s) => s.status === "done" && s.day.kind !== "rest").length;
  const weekPlanned = DAYS.filter((d) => d.kind !== "rest").length;

  const setActive = useCallback((fn) => setSt((s) => (s.active ? { ...s, active: typeof fn === "function" ? fn(s.active) : fn } : s)), []);
  const swaps = st.swaps;
  const onSwap = (rootId, altId) => setSt((s) => { const sw = { ...s.swaps }; if (altId) sw[rootId] = altId; else delete sw[rootId]; return { ...s, swaps: sw }; });
  const onFav = (id) => setSt((s) => ({ ...s, favs: s.favs.includes(id) ? s.favs.filter((x) => x !== id) : [...s.favs, id] }));
  const openSheet = (ex, tab = "how", canSwap = true) => setSheet({ ex, tab, canSwap });

  const start = (day) => {
    setSt((s) => ({ ...s, active: s.active && s.active.dayId === day.id ? s.active : newActive(day, { week, sessions: s.sessions, swaps: s.swaps, today }) }));
    setDayOpen(null); setRunning(true);
  };
  const startAsk = async (day) => {
    if (st.active && st.active.dayId !== day.id) {
      const ok = await confirmAction(`You have an unfinished workout (${dayById(st.active.dayId)?.title}). Starting this one discards it.`, { title: "Start a new workout?", confirmText: "Start new", cancelText: "Keep old" });
      if (!ok) return;
      setSt((s) => ({ ...s, active: null }));
    }
    start(day);
  };
  const leave = () => { setSt((s) => (s.active && !s.active.pausedAt ? { ...s, active: { ...s.active, pausedAt: Date.now() } } : s)); setRunning(false); };
  const discard = () => { setSt((s) => ({ ...s, active: null })); setRunning(false); };
  const save = async (rec) => {
    setSt((s) => ({ ...s, sessions: [...s.sessions, rec], active: null }));
    setRunning(false); setView("history");
    notify("Workout saved. Nice work!", "success"); // the effect above sends it to the Exercise log
  };
  const resume = () => {
    setSt((s) => (s.active?.pausedAt ? { ...s, active: { ...s.active, pausedMs: (s.active.pausedMs || 0) + (Date.now() - s.active.pausedAt), pausedAt: 0 } } : s));
    setRunning(true);
  };

  const sheetEl = sheet && <ExSheet ex={sheet.ex} tab={sheet.tab} sessions={st.sessions} swaps={swaps} onSwap={onSwap} favs={st.favs} onFav={onFav} canSwap={sheet.canSwap} onClose={() => setSheet(null)} />;

  // ---------------------------------------------------------------------------------------------------------- live workout
  if (running && st.active) {
    const day = dayById(st.active.dayId);
    return (
      <div className="wp">
        <SessionView day={day} st={st} setActive={setActive} swaps={swaps} sessions={st.sessions} week={week} weightKg={st.weightKg} onLeave={leave} onDiscard={discard} onSave={save} openSheet={(ex, tab) => openSheet(ex, tab)} />
        {sheetEl}
      </div>
    );
  }

  // ---------------------------------------------------------------------------------------------------------- day overview
  if (dayOpen) {
    return (
      <div className="wp">
        <DayView day={dayById(dayOpen)} week={week} swaps={swaps} done={st.sessions.some((s) => s.dayId === dayOpen && s.date >= mondayOf(today) && s.date <= addDays(mondayOf(today), 6))}
          onBack={() => setDayOpen(null)} onStart={startAsk} openSheet={openSheet} />
        {sheetEl}
      </div>
    );
  }

  return (
    <div className="wp">
      <header className="wp-top">
        <div>
          <h1>Workout &amp; Body</h1>
          <p className="wp-muted">{PLAN.name} · Week {week} · {phase.label}</p>
        </div>
        {run > 0 && <Chip tone="hot" title="Training days in a row">🔥 {run}</Chip>}
      </header>

      <nav className="wp-tabs" aria-label="Workout sections" ref={tabsRef}>
        {VIEWS.map(([id, label, ic]) => <button key={id} type="button" className={view === id ? "on" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}><span aria-hidden="true">{ic}</span>{label}</button>)}
      </nav>

      {view === "today" && (
        <TodayView body={body} strip={strip} shownDay={shownDay} selected={selDay} onPick={setSelDay} st={st} week={week} phase={phase} run={run} weekDone={weekDone} weekPlanned={weekPlanned}
          onStart={startAsk} onResume={resume} onDiscard={async () => { if (await confirmAction("This deletes everything you logged in this workout.", { title: "Discard workout?", confirmText: "Discard", cancelText: "Keep it" })) discard(); }}
          onOpen={(id) => setDayOpen(id)} go={setView} today={today} />
      )}
      {view === "plan" && <PlanView st={st} setSt={setSt} week={week} phase={phase} today={today} onOpen={(id) => setDayOpen(id)} strip={strip} />}
      {view === "body" && <div className="wp-body"><BodyPlanPage embedded onSaved={() => window.dispatchEvent(new Event("ff:refresh"))} /></div>}
      {view === "library" && <LibraryView favs={st.favs} onFav={onFav} openSheet={openSheet} />}
      {view === "history" && <HistoryView st={st} setSt={setSt} today={today} go={setView} />}
      {sheetEl}
    </div>
  );
}

// ================================================================================================================ Today
function TodayView({ body, strip, shownDay, selected, onPick, st, week, phase, run, weekDone, weekPlanned, onStart, onResume, onDiscard, onOpen, go, today }) {
  const cell = strip.find((s) => s.day.id === shownDay.id);
  const doneRec = st.sessions.find((s) => s.dayId === shownDay.id && s.date === cell.date);
  const exCount = shownDay.blocks.filter((b) => b.type === "sets").reduce((n, b) => n + b.items.length, 0);
  const activeDay = st.active ? dayById(st.active.dayId) : null;
  const total = summarize(st.sessions);
  const isRest = shownDay.kind === "rest";

  return (
    <div className="wp-grid">
      <div className="wp-col">
        <div className="wp-week" role="group" aria-label="This week">
          {strip.map((c) => (
            <button key={c.day.id} type="button" className={`wp-wd ${c.status} ${c.day.id === shownDay.id ? "sel" : ""}`} aria-pressed={c.day.id === shownDay.id} aria-label={`${c.day.short}: ${c.day.title}, ${c.status.replace("-past", "")}`} onClick={() => onPick(c.isToday ? null : c.day.id)}>
              <small>{c.day.short}</small>
              <span aria-hidden="true">{STATUS_ICON[c.status]}</span>
            </button>
          ))}
        </div>

        {activeDay && (
          <div className="wp-resume" role="status">
            <div><b>Workout in progress</b><small>Day {activeDay.n} · {activeDay.title} · {fmtClock(elapsedSec(st.active))}</small></div>
            <button type="button" className="wp-btn hot" onClick={onResume}>Continue</button>
            <button type="button" className="wp-link danger" onClick={onDiscard}>Discard</button>
          </div>
        )}

        <article className={`wp-hero k-${shownDay.kind}`}>
          <div className="wp-hero-glow" aria-hidden="true" />
          <div className="wp-hero-row">
            <span className="wp-eyebrow">{cell.isToday ? "Today's workout" : `${cell.day.short}, ${prettyDate(cell.date)}`}</span>
            <Chip tone="glass">{shownDay.level}</Chip>
          </div>
          <h2>Day {shownDay.n} · {shownDay.title}</h2>
          <p className="wp-hero-focus">{shownDay.focus}</p>
          <ul className="wp-hero-stats">
            <li><b>{shownDay.minutes}</b><small>min</small></li>
            <li><b>~{shownDay.kcal}</b><small>kcal</small></li>
            <li><b>{exCount || shownDay.blocks.reduce((n, b) => n + (b.items ? b.items.length : 0), 0)}</b><small>{exCount ? "exercises" : "items"}</small></li>
          </ul>
          <div className="wp-hero-cta">
            {doneRec ? (
              <><Chip tone="ok">✓ Done · {doneRec.minutes} min</Chip><button type="button" className="wp-btn glass" onClick={() => onStart(shownDay)}>Do it again</button></>
            ) : (
              <button type="button" className="wp-btn hot big" onClick={() => onStart(shownDay)}>{st.active?.dayId === shownDay.id ? "Continue workout" : isRest ? "Open rest-day checklist" : "Start workout"}</button>
            )}
            <button type="button" className="wp-btn glass" onClick={() => onOpen(shownDay.id)}>View details</button>
          </div>
        </article>

        {body ? (
          <section className="wp-card wp-bodycard" aria-label="Your body goal">
            <div className="wp-row"><h3 className="wp-h">Your body goal</h3><button type="button" className="wp-link" onClick={() => go("body")}>Open ›</button></div>
            <ul className="wp-bstats">
              <li><b>{body.plan.calories ? body.plan.calories.toLocaleString() : "–"}</b><small>kcal / day</small></li>
              <li><b>{body.plan.mode === "lose" ? `${body.plan.goal.targetWeightKg} kg` : "Hold"}</b><small>{body.plan.mode === "lose" ? "target" : "weight"}</small></li>
              <li><b>{body.plan.steps.toLocaleString()}</b><small>steps / day</small></li>
              <li><b>{Math.round(body.plan.macros.protein)} g</b><small>protein</small></li>
            </ul>
          </section>
        ) : (
          <section className="wp-card wp-bodycard"><div className="wp-row"><h3 className="wp-h">Your body goal</h3><button type="button" className="wp-link" onClick={() => go("body")}>Set it up ›</button></div><p className="wp-muted wp-small">Pick lean, athletic, muscular or balanced to get calories, protein and steps that match your workouts.</p></section>
        )}

        <section className="wp-card">
          <h3 className="wp-h">Week {week}: {phase.label}</h3>
          <p>{phase.tip}</p>
          <ProgressionBar week={week} />
        </section>
      </div>

      <div className="wp-col">
        <div className="wp-stats">
          <div><small>This week</small><b>{weekDone}<span>/{weekPlanned}</span></b></div>
          <div><small>Streak</small><b>{run}<span> days</span></b></div>
          <div><small>All time</small><b>{total.workouts}<span> workouts</span></b></div>
          <div><small>Time trained</small><b>{Math.round(total.minutes / 60 * 10) / 10}<span> h</span></b></div>
        </div>

        <section className="wp-card">
          <div className="wp-row"><h3 className="wp-h">Muscles in focus</h3></div>
          <div className="wp-chips">{shownDay.muscles.map((m) => <Chip key={m} tone="hot"><span aria-hidden="true">{MUSCLE_ICON[m]}</span> {MUSCLE_LABEL[m]}</Chip>)}</div>
        </section>

        <section className="wp-card">
          <h3 className="wp-h">Jump to</h3>
          <div className="wp-quick">
            <button type="button" onClick={() => go("plan")}><span aria-hidden="true">📋</span>My plan</button>
            <button type="button" onClick={() => go("body")}><span aria-hidden="true">💪</span>Body &amp; food</button>
            <button type="button" onClick={() => go("library")}><span aria-hidden="true">📚</span>Exercise library</button>
            <button type="button" onClick={() => go("history")}><span aria-hidden="true">🕘</span>History</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "progress" } }))}><span aria-hidden="true">📈</span>Progress</button>
          </div>
        </section>
        <p className="wp-muted wp-small">{today === cell.date ? "Stop if you feel sharp pain. This is a training guide, not medical advice." : ""}</p>
      </div>
    </div>
  );
}

function ProgressionBar({ week }) {
  return (
    <ol className="wp-phases" aria-label="Progression plan">
      {GUIDE.progression.map((p) => {
        const on = (p.phase === "learn" && week <= 2) || (p.phase === "build" && week >= 3 && week <= 4) || (p.phase === "progress" && week >= 5);
        return <li key={p.weeks} className={on ? "on" : ""}><b>{p.weeks}</b><span>{p.title}</span><small>{p.text}</small></li>;
      })}
    </ol>
  );
}

// ================================================================================================================ Day overview
function DayView({ day, week, swaps, done, onBack, onStart, openSheet }) {
  const [alts, setAlts] = useState(false);
  const main = day.blocks.filter((b) => b.type === "sets");
  const count = main.reduce((n, b) => n + b.items.length, 0);
  return (
    <div className="wp-daypage">
      <header className="wp-sheet-head plain">
        <button type="button" className="wp-icon-btn" onClick={onBack} aria-label="Back">‹</button>
        <h2>{`Day ${day.n} · ${day.title}`}</h2>
        <span />
      </header>

      <article className={`wp-hero k-${day.kind}`}>
        <div className="wp-hero-glow" aria-hidden="true" />
        <div className="wp-hero-row"><span className="wp-eyebrow">{day.short}day · {day.focus}</span><Chip tone="glass">{day.level}</Chip></div>
        <h2>{day.title}</h2>
        <ul className="wp-hero-stats">
          <li><b>{day.minutes}</b><small>min</small></li>
          <li><b>~{day.kcal}</b><small>kcal</small></li>
          <li><b>{count || "–"}</b><small>exercises</small></li>
        </ul>
        <div className="wp-chips on-dark">{day.muscles.map((m) => <Chip key={m} tone="glass"><span aria-hidden="true">{MUSCLE_ICON[m]}</span> {MUSCLE_LABEL[m]}</Chip>)}</div>
        <div className="wp-hero-cta">
          <button type="button" className="wp-btn hot big" onClick={() => onStart(day)}>{done ? "Do it again" : "Start workout"}</button>
          {count > 0 && <button type="button" className="wp-btn glass" aria-pressed={alts} onClick={() => setAlts((a) => !a)}>{alts ? "Hide alternatives" : "View alternatives"}</button>}
        </div>
      </article>

      {day.blocks.map((b) => (
        <section key={b.id} className="wp-card">
          <div className="wp-row"><h3 className="wp-h">{b.title}{b.optional ? " (optional)" : ""}</h3>{b.minutes && <Chip>{b.minutes}</Chip>}</div>
          {b.type === "options" ? b.options.map((o) => (
            <div key={o.id} className="wp-opt-block"><b>{o.label}</b><small>{o.note}</small><ul className="wp-rows">{o.items.map((it) => <ItemRow key={it.id} it={it} swaps={swaps} openSheet={openSheet} />)}</ul></div>
          )) : (
            <ul className="wp-rows">{b.items.map((it) => (
              <li key={it.id}>
                <ItemRow it={it} swaps={swaps} openSheet={openSheet} sets={b.type === "sets" ? it : null} week={week} />
                {alts && b.type === "sets" && (
                  <div className="wp-altrow" aria-label={`Alternatives for ${it.name}`}>
                    {it.alts.map((a) => <button key={a.id} type="button" onClick={() => openSheet(it, "alts")}><FigThumb ex={{ ...it, ...a }} size={64} /><span>{a.name}</span></button>)}
                  </div>
                )}
              </li>
            ))}</ul>
          )}
        </section>
      ))}
    </div>
  );
}

function ItemRow({ it, swaps, openSheet, sets, week }) {
  const alt = swaps[it.id] ? it.alts.find((a) => a.id === swaps[it.id]) : null;
  const shown = alt ? { ...it, ...alt } : it;
  const wrap = (kids) => (sets !== undefined ? <>{kids}</> : <li>{kids}</li>);
  return wrap(
    <button type="button" className="wp-item" onClick={() => openSheet(it, "how")}>
      <FigThumb ex={shown} size={64} />
      <span className="wp-item-t">
        <b>{shown.name}</b>
        <small>{sets ? `${(it.main && week >= 5 && !it.timed ? it.sets + 1 : it.sets)} sets × ${it.reps}${it.timed ? " sec" : " reps"}${it.perSide ? " /side" : ""}` : it.dose}{alt ? " · swapped" : ""}</small>
      </span>
      <span className="wp-go" aria-hidden="true">›</span>
    </button>
  );
}

// ================================================================================================================ Plan
function PlanView({ st, setSt, week, phase, today, onOpen, strip }) {
  const [edit, setEdit] = useState(false);
  const [w, setW] = useState(String(st.weightKg));
  const saveW = () => { const n = Number(w); if (n >= 30 && n <= 300) { setSt((s) => ({ ...s, weightKg: n })); setEdit(false); } else notify("Enter a weight between 30 and 300 kg.", "info"); };
  const restart = async () => { if (await confirmAction("Week 1 starts again from this week. Your logged workouts stay in History.", { title: "Restart the plan?", confirmText: "Restart", cancelText: "Cancel", danger: false })) setSt((s) => ({ ...s, startDate: today })); };

  return (
    <div className="wp-grid">
      <div className="wp-col">
        <article className="wp-hero plan">
          <div className="wp-hero-glow" aria-hidden="true" />
          <div className="wp-hero-row"><span className="wp-eyebrow">My plan</span><Chip tone="glass">{PLAN.level}</Chip></div>
          <h2>{PLAN.name} Plan</h2>
          <ul className="wp-goals">{PLAN.goals.map((g) => <li key={g}>✓ {g}</li>)}</ul>
          <div className="wp-chips on-dark">
            <Chip tone="glass">{st.weightKg} kg</Chip><Chip tone="glass">{PLAN.profile.heightCm} cm</Chip><Chip tone="glass">{PLAN.profile.steps} steps</Chip><Chip tone="glass">{PLAN.profile.calories}</Chip>
          </div>
          <div className="wp-hero-cta">
            <Chip tone="ok">Week {week} · {phase.label}</Chip>
            <button type="button" className="wp-btn glass" onClick={() => setEdit((e) => !e)}>Body weight</button>
            <button type="button" className="wp-btn glass" onClick={restart}>Restart plan</button>
          </div>
          {edit && (
            <div className="wp-inline">
              <label>Body weight (kg), used to estimate calories<input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></label>
              <button type="button" className="wp-btn hot" onClick={saveW}>Save</button>
            </div>
          )}
        </article>

        <section className="wp-card">
          <h3 className="wp-h">Weekly schedule</h3>
          <ul className="wp-sched">
            {strip.map((c) => (
              <li key={c.day.id}>
                <button type="button" onClick={() => onOpen(c.day.id)} className={c.isToday ? "today" : ""}>
                  <span className="wp-sd">{c.day.short}</span>
                  <span className="wp-st"><b>{c.day.title}</b><small>{c.day.focus}</small></span>
                  <Chip tone={c.day.kind === "strength" ? "hot" : c.day.kind === "rest" ? "" : "ok"}>{c.day.kind === "strength" ? "Moderate" : c.day.kind === "conditioning" ? "Moderate" : c.day.kind === "recovery" ? "Light" : "Rest"}</Chip>
                  <span className={`wp-dot ${c.status}`} aria-label={c.status.replace("-past", "")}>{STATUS_ICON[c.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="wp-col">
        <section className="wp-card"><h3 className="wp-h">Beginner progression</h3><ProgressionBar week={week} /></section>

        <details className="wp-card wp-acc" open>
          <summary>Key beginner principles</summary>
          <ul className="wp-list">{GUIDE.principles.map((p) => <li key={p}>{p}</li>)}</ul>
        </details>
        <details className="wp-card wp-acc">
          <summary>Nutrition targets (daily)</summary>
          <dl className="wp-dl">{GUIDE.nutrition.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <h4>Pre-workout (30–60 min before)</h4>
          <ul className="wp-list">{GUIDE.pre.map((p) => <li key={p}>{p}</li>)}</ul>
          <h4>Post-workout (within 60 min)</h4>
          <ul className="wp-list">{GUIDE.post.map((p) => <li key={p}>{p}</li>)}</ul>
        </details>
        <details className="wp-card wp-acc">
          <summary>Expected results (realistic)</summary>
          <ul className="wp-results">{GUIDE.results.map(([k, v]) => { const n = parseInt(k.replace(/\D/g, ""), 10); return <li key={k} className={week >= n ? "on" : ""}><b>{k}</b><span>{v}</span></li>; })}</ul>
        </details>
        <details className="wp-card wp-acc">
          <summary>How to use alternatives</summary>
          <ul className="wp-list">{GUIDE.quick.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="wp-muted wp-small">Tap any exercise, open Alternatives, and press Use. The swap is remembered for next time.</p>
        </details>
      </div>
    </div>
  );
}

// ================================================================================================================ Library
function LibraryView({ favs, onFav, openSheet }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const list = useMemo(() => libraryList(), []);
  const shown = list.filter((e) => (f === "all" || e.cat === f) && (!onlyFav || favs.includes(e.id)) && (!q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()) || e.alts.some((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()))));
  return (
    <div>
      <div className="wp-search">
        <input type="search" placeholder="Search exercises (e.g. squat, row)" aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={`wp-icon-btn ${onlyFav ? "on" : ""}`} aria-pressed={onlyFav} aria-label="Show favourites only" onClick={() => setOnlyFav((v) => !v)}>{onlyFav ? "♥" : "♡"}</button>
      </div>
      <div className="wp-filters" role="group" aria-label="Filter by muscle">
        {FILTERS.map((x) => <button key={x} type="button" className={f === x ? "on" : ""} aria-pressed={f === x} onClick={() => setF(x)}>{x === "all" ? "All" : MUSCLE_LABEL[x]}</button>)}
      </div>
      <p className="wp-muted wp-small" aria-live="polite">{shown.length} exercise{shown.length === 1 ? "" : "s"}</p>
      {shown.length === 0 ? <p className="wp-empty">{onlyFav ? "No favourites yet. Tap the heart on an exercise." : "Nothing matches. Try another word or filter."}</p> : (
        <ul className="wp-lib">
          {shown.map((e) => (
            <li key={e.id}>
              <button type="button" className="wp-item" onClick={() => openSheet(e, "how", false)}>
                <FigThumb ex={e} size={64} />
                <span className="wp-item-t"><b>{e.name}</b><small>{MUSCLE_LABEL[e.cat] || e.cat}{e.alts.length ? ` · ${e.alts.length} alternatives` : ""}</small></span>
              </button>
              <button type="button" className={`wp-heart ${favs.includes(e.id) ? "on" : ""}`} aria-pressed={favs.includes(e.id)} aria-label={`${favs.includes(e.id) ? "Remove" : "Add"} ${e.name} ${favs.includes(e.id) ? "from" : "to"} favourites`} onClick={() => onFav(e.id)}>{favs.includes(e.id) ? "♥" : "♡"}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ================================================================================================================ History
function HistoryView({ st, setSt, today, go }) {
  const [range, setRange] = useState("week");
  const [anchor, setAnchor] = useState(today);
  const [open, setOpen] = useState(null);
  const list = useMemo(() => inRange(st.sessions, range, anchor).slice().sort((a, b) => (a.date === b.date ? b.startedAt - a.startedAt : a.date < b.date ? 1 : -1)), [st.sessions, range, anchor]);
  const sum = summarize(list);
  const shift = (n) => setAnchor((a) => (range === "week" ? addDays(a, n * 7) : (() => { const d = fromStr(a); d.setMonth(d.getMonth() + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; })()));
  const label = range === "all" ? "All time" : range === "month" ? fromStr(anchor).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : mondayOf(anchor) === mondayOf(today) ? "This week" : `${prettyDate(mondayOf(anchor))} – ${prettyDate(addDays(mondayOf(anchor), 6))}`;
  const del = async (s) => { if (await confirmAction(`Delete ${s.title} on ${prettyDate(s.date)}?`, { title: "Delete workout", confirmText: "Delete", cancelText: "Keep" })) setSt((x) => ({ ...x, sessions: x.sessions.filter((y) => y.id !== s.id) })); };

  return (
    <div>
      <div className="wp-seg wide" role="tablist" aria-label="Range">
        {[["week", "Weekly"], ["month", "Monthly"], ["all", "All time"]].map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={range === id} className={range === id ? "on" : ""} onClick={() => { setRange(id); setAnchor(today); }}>{l}</button>)}
      </div>
      <div className="wp-range">
        <button type="button" className="wp-icon-btn" onClick={() => shift(-1)} disabled={range === "all"} aria-label="Previous">‹</button>
        <b>{label}</b>
        <button type="button" className="wp-icon-btn" onClick={() => shift(1)} disabled={range === "all" || (range === "week" ? mondayOf(anchor) >= mondayOf(today) : anchor.slice(0, 7) >= today.slice(0, 7))} aria-label="Next">›</button>
      </div>
      <div className="wp-stats">
        <div><small>Workouts</small><b>{sum.workouts}</b></div>
        <div><small>Total time</small><b>{sum.minutes}<span> min</span></b></div>
        <div><small>Calories</small><b>~{sum.kcal.toLocaleString()}</b></div>
        <div><small>Lifted</small><b>{sum.volume.toLocaleString()}<span> kg</span></b></div>
      </div>
      <h3 className="wp-h">Workouts</h3>
      {list.length === 0 ? (
        <div className="wp-empty"><p>No workouts {range === "all" ? "yet" : "in this period"}.</p><button type="button" className="wp-btn hot" onClick={() => go("today")}>Start today's workout</button></div>
      ) : (
        <ul className="wp-hist">
          {list.map((s) => (
            <li key={s.id} className={open === s.id ? "open" : ""}>
              <button type="button" className="wp-hist-row" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className="wp-ok" aria-hidden="true">✓</span>
                <span className="wp-item-t"><b>{prettyDate(s.date)} · {s.title}</b><small>{s.minutes} min · ~{s.kcal} kcal{s.feel ? ` · ${FEEL_LABEL[s.feel] || s.feel}` : ""}</small></span>
                <span className="wp-go" aria-hidden="true">{open === s.id ? "⌄" : "›"}</span>
              </button>
              {open === s.id && (
                <div className="wp-hist-body">
                  {s.exercises.length ? s.exercises.map((e) => (
                    <div key={e.id} className="wp-hx"><b>{e.name}</b>{e.from ? <small> (instead of {e.from})</small> : null}<span>{e.sets.map((t) => (t.w > 0 ? `${t.w}×${t.r}` : `${t.r}`)).join("  ·  ")}</span></div>
                  )) : <p className="wp-muted">No sets logged. {s.checks} of {s.checksTotal} items ticked.</p>}
                  {volumeOf(s) > 0 && <p className="wp-muted wp-small">Total lifted: {volumeOf(s).toLocaleString()} kg</p>}
                  {s.notes && <p className="wp-note">“{s.notes}”</p>}
                  <button type="button" className="wp-link danger" onClick={() => del(s)}>Delete this workout</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

