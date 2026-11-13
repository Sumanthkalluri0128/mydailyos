// Workout & Body. ONE plan runs the whole page: Today (week strip, today's workout), My plan (the week and the guide), Body (goal, eating,
// setup), Library, History and the live workout.
//
// The plan is either the SMART program (built on the server from your body, goal and every session you log, and re-worked each week) or
// the CLASSIC 7-day plan (data/workoutPlan.js, fully offline). Both are turned into the same "days" (utils/unifiedPlan.js), so every
// screen below works on either, and an exercise is never listed twice. Smart is used whenever the server has a plan for you; you can
// switch under My plan. Finished smart workouts go to the server, which counts the calories itself; classic ones go to the Exercise log.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { getLocalDate } from "../utils/date";
import { resolveTargets } from "../utils/energy";
import { currentOwner } from "../utils/cacheOwner";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import { DAYS, GUIDE, PLAN, SMART_ID, FILTERS, MUSCLE_LABEL, dayById, findExercise, libraryList } from "../data/workoutPlan";
import { addDays, fromStr, inRange, loadState, mondayOf, newActive, phaseFor, saveState, streak, summarize, volumeOf, weekNumber, weekStrip, elapsedSec } from "../utils/workoutStore";
import { findInDays, mergeLibrary, programToDays, sessionPayload, smartPhase, smartProgression, smartStrip, variantDay } from "../utils/unifiedPlan";
import useSmartPlan, { smartUsable } from "../utils/useSmartPlan";
import { useFlag } from "../utils/flagStore";
import ExSheet, { Chip, FigThumb, fmtClock } from "../components/workout/bits";
import SessionView from "../components/workout/SessionView";
import AdaptCard from "../components/workout/AdaptCard";
import BodyPlanPage from "./BodyPlanPage";
import PersonalPlans from "../components/workout/PersonalPlans";
import { customIdOf, customToDays, sourceFor } from "../utils/customPlans";
import { lookupExercise } from "../utils/exerciseLookup";
import { ActiveDays, Progress, Safety } from "./TrainingSections";
import "../components/workout/workoutplan.css";

const VIEWS = [["today", "Today", "🏠"], ["plan", "My plan", "📋"], ["body", "Body", "💪"], ["library", "Library", "📚"], ["history", "History", "🕘"]];
const KCAL_ACTIVITY = { strength: "Strength Training", conditioning: "Bodyweight circuit", recovery: "Walking - Moderate" };
const FEEL_LABEL = { easy: "😌 Easy", good: "🙂 Good", challenging: "😤 Challenging", hard: "🥵 Hard" };
const STATUS_ICON = { done: "✓", today: "●", missed: "–", upcoming: "", "rest-past": "☾" };
const SKIP_REASONS = [["tired", "Tired"], ["busy", "No time"], ["sick", "Unwell"], ["pain", "Sore or hurt"], ["travel", "Travelling"]];
const prettyDate = (s) => fromStr(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const countItems = (day) => { const sets = day.blocks.filter((b) => b.type === "sets").reduce((n, b) => n + b.items.length, 0); return sets || day.blocks.reduce((n, b) => n + (b.items ? b.items.length : 0), 0); };

// ---------------------------------------------------------------------------------------------------------------- sending finished workouts
/** Classic plan: the finished workout becomes an entry in the Exercise log (so its calories count in the day's totals). */
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

/** Smart plan: the session goes to the body-plan engine, which also counts it in the day's exercise totals. Returns { plan, highlights } or null. */
async function sendSmart(rec, today, phase) {
  const body = sessionPayload(rec, { today, phase });
  if (!body.exercises.length) return {}; // nothing was ticked: there is nothing for the plan to learn from
  const r = await apiFetch("/api/body-plan/session", { method: "POST", body: JSON.stringify(body) });
  if (r.status === 202) return {};      // offline: kept on this device and sent automatically later
  if (!r.ok) return r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 429 ? {} : null; // a rejected session is not retried for ever
  return r.json().catch(() => ({}));
}

export default function WorkoutPlanPage({ startView, profile }) {
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
  const smart = useSmartPlan(owner, today);
  const [dayOpen, setDayOpen] = useState(null);
  const [selDay, setSelDay] = useState(null);
  const [running, setRunning] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bodyTab, setBodyTab] = useState(null); // which Body section to open ("me" = the training setup)

  // keep "today" right if the tab stays open past midnight
  useEffect(() => {
    const f = () => setToday(getLocalDate());
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  useEffect(() => { saveState(owner, st); }, [owner, st]);
  useEffect(() => { try { sessionStorage.setItem("ff-wp-view", view); } catch { /* ignore */ } }, [view]);

  // ------------------------------------------------------------------------------------------------------------ the one plan
  // Staged rollout: the one-plan Smart program is on for everyone until you create the flag "smart-program" in the admin flags, then only for the people it names.
  const smartFlag = useFlag("smart-program", true);
  const customPlan = (st.plans || []).find((p) => p.id === customIdOf(st.source)) || null; // a personal plan you made, when that is the one in use
  const smartOn = smartFlag && !customPlan && smartUsable(smart.data, today) && st.source !== "classic";
  const body = smart.data && smart.data.plan && smart.data.plan.ready ? { chosen: smart.data.chosen, plan: smart.data.plan } : null;
  const weightKg = (body && body.plan.body && body.plan.body.weightKg) || st.weightKg;
  const plan = useMemo(() => {
    if (smartOn) {
      const p = smart.data.plan, program = p.training.program;
      const days = programToDays(program, { weightKg, adapt: p.adapt });
      const strip = smartStrip(program, days, st.sessions, today);
      return {
        smart: true, name: "Smart program", days, strip, week: 0, phase: smartPhase(p.adapt), program, adapt: p.adapt || null, progression: smartProgression(program),
        run: streak(st.sessions, today, days, ["rest", "recovery"]),
        goal: { done: strip.filter((c) => c.status === "done" && c.day.kind === "strength").length, planned: days.filter((d) => d.kind === "strength").length },
        find: (id) => findInDays(days, id), byId: (id) => days.find((d) => d.id === id) || null,
      };
    }
    if (customPlan) {
      const days = customToDays(customPlan, lookupExercise, weightKg); // library, wide catalogue and typed exercises all open with steps + picture
      const week = weekNumber(st.startDate, today);
      const strip = weekStrip(st.sessions, today, days);
      return {
        smart: false, custom: true, name: customPlan.name, days, strip, week, phase: { id: "custom", label: "Your own plan", tip: "Reach the top of your rep range on every set and the next session suggests a little more weight." }, program: null, adapt: null, progression: GUIDE.progression,
        run: streak(st.sessions, today, days),
        goal: { done: strip.filter((c) => c.status === "done" && c.day.kind !== "rest").length, planned: days.filter((d) => d.kind !== "rest").length },
        find: (id) => findInDays(days, id), byId: (id) => days.find((d) => d.id === id) || null,
      };
    }
    const week = weekNumber(st.startDate, today);
    const strip = weekStrip(st.sessions, today);
    return {
      smart: false, name: PLAN.name, days: DAYS, strip, week, phase: phaseFor(week), program: null, adapt: null, progression: GUIDE.progression,
      run: streak(st.sessions, today),
      goal: { done: strip.filter((c) => c.status === "done" && c.day.kind !== "rest").length, planned: DAYS.filter((d) => d.kind !== "rest").length },
      find: findExercise, byId: dayById,
    };
  }, [smartOn, customPlan, smart.data, st.sessions, st.startDate, weightKg, today]);
  const library = useMemo(() => (plan.smart ? mergeLibrary(libraryList(), plan.days) : libraryList()), [plan]);

  const wayOf = (day) => (day.ways && day.ways[st.way[day.id]] ? st.way[day.id] : "gym");
  const asWay = (day) => variantDay(day, wayOf(day));
  const setWay = (day, way) => setSt((s) => ({ ...s, way: { ...s.way, [day.id]: way } }));
  const todayCell = plan.strip.find((c) => c.isToday) || plan.strip[0];
  const todayDay = todayCell.day;
  const shownBase = (selDay && plan.byId(selDay)) || todayDay;
  const shownDay = asWay(shownBase);
  const activeDay = st.active ? st.active.day || dayById(st.active.dayId) || plan.byId(st.active.dayId) : null;
  const phaseKey = plan.adapt && plan.adapt.phase ? plan.adapt.phase.key : "";

  // a saved unfinished workout whose day no longer exists (the plan changed) is dropped instead of crashing the page
  useEffect(() => { if (st.active && !activeDay) { setSt((s) => ({ ...s, active: null })); setRunning(false); } }, [st.active, activeDay]);

  // send workouts that were not sent yet (offline, or the server was asleep). One at a time, last 14 days only.
  const syncing = useRef(false);
  useEffect(() => {
    if (syncing.current) return undefined;
    const todo = st.sessions.filter((s) => !st.synced[s.id] && s.date >= addDays(today, -14));
    if (!todo.length) return undefined;
    syncing.current = true;
    let alive = true;
    (async () => {
      const ok = {}; let newest = null; let first = null;
      for (const s of todo) {
        try {
          if (s.planId === SMART_ID) {
            const r = await sendSmart(s, today, phaseKey);
            if (r) { ok[s.id] = true; if (r.plan) newest = r.plan; if (!first && r.highlights && r.highlights.length) first = r.highlights[0]; }
          } else if (await logToExercise(s, dayById(s.dayId) || DAYS[0], weightKg)) ok[s.id] = true;
        } catch { /* try again next time */ }
      }
      syncing.current = false;
      if (!alive) return;
      if (Object.keys(ok).length) {
        setSt((x) => ({ ...x, synced: { ...x.synced, ...ok } }));
        if (newest) smart.setPlan(newest);
        if (first) notify(`${first.name}: ${first.text}`, "success");
        window.dispatchEvent(new Event("ff:refresh"));
      }
    })();
    return () => { alive = false; syncing.current = false; };
  }, [st.sessions.length, smart.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActive = useCallback((fn) => setSt((s) => (s.active ? { ...s, active: typeof fn === "function" ? fn(s.active) : fn } : s)), []);
  const swaps = st.swaps;
  const onSwap = (rootId, altId) => setSt((s) => { const sw = { ...s.swaps }; if (altId) sw[rootId] = altId; else delete sw[rootId]; return { ...s, swaps: sw }; });
  const onFav = (id) => setSt((s) => ({ ...s, favs: s.favs.includes(id) ? s.favs.filter((x) => x !== id) : [...s.favs, id] }));
  const openSheet = (ex, tab = "how", canSwap = true) => setSheet({ ex, tab, canSwap });

  const sameRun = (a, day) => a && a.dayId === day.id && ((a.day && a.day.way) || "gym") === (day.way || "gym");
  const start = (day) => {
    setSt((s) => ({ ...s, active: sameRun(s.active, day) ? s.active : newActive(day, { week: plan.week, sessions: s.sessions, swaps: s.swaps, today }) }));
    setDayOpen(null); setRunning(true);
  };
  const startAsk = async (day) => {
    if (st.active && !sameRun(st.active, day)) {
      const ok = await confirmAction(`You have an unfinished workout (${activeDay ? activeDay.title : "workout"}). Starting this one discards it.`, { title: "Start a new workout?", confirmText: "Start new", cancelText: "Keep old" });
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
    notify("Workout saved. Nice work!", "success"); // the effect above sends it to the server
  };
  const resume = () => {
    setSt((s) => (s.active?.pausedAt ? { ...s, active: { ...s.active, pausedMs: (s.active.pausedMs || 0) + (Date.now() - s.active.pausedAt), pausedAt: 0 } } : s));
    setRunning(true);
  };
  const setSource = (source) => setSt((s) => ({ ...s, source }));

  // "Not today": tells the smart plan, which slides the session along instead of leaving a hole
  const skipDay = async (day, reason) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/body-plan/session", { method: "POST", body: JSON.stringify({ date: today, today, sessionId: day.sessionId, title: day.title, way: "gym", status: "skipped", reason, phase: phaseKey, exercises: [], clientId: `wp-skip-${today}-${day.sessionId}` }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || "No connection");
      if (j.plan) smart.setPlan(j.plan);
      notify("Noted. Your week has been adjusted.", "success");
    } catch (e) { notify(`Could not save: ${e.message}`, "error"); } finally { setBusy(false); }
  };
  // One-tap suggestions (one more day, drop the moves that hurt, level up) change the saved setup, then the plan is worked out again.
  const applySuggestion = async (change) => {
    const prefs = smart.data.plan.training.prefs;
    const next = { place: prefs.place, level: prefs.level, days: prefs.days, minutes: prefs.minutes, equipment: prefs.equipment, limits: prefs.limits, focus: prefs.focus, weekdays: prefs.weekdays || [], ...(change.prefs || {}) };
    setBusy(true);
    try {
      const r = await apiFetch("/api/body-plan/apply", { method: "POST", body: JSON.stringify({ type: smart.data.chosen, training: next, date: today }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) throw new Error(j.message || "No connection");
      notify("Plan updated.", "success");
      await smart.reload();
    } catch (e) { notify(`Could not update: ${e.message}`, "error"); } finally { setBusy(false); }
  };

  const sheetEl = sheet && <ExSheet ex={sheet.ex} tab={sheet.tab} sessions={st.sessions} swaps={swaps} onSwap={onSwap} favs={st.favs} onFav={onFav} canSwap={sheet.canSwap} find={plan.find} onClose={() => setSheet(null)} />;

  // ---------------------------------------------------------------------------------------------------------- live workout
  if (running && st.active && activeDay) {
    return (
      <div className="wp">
        <SessionView day={activeDay} st={st} setActive={setActive} swaps={swaps} sessions={st.sessions} week={plan.week} weightKg={weightKg} onLeave={leave} onDiscard={discard} onSave={save} openSheet={(ex, tab) => openSheet(ex, tab)} />
        {sheetEl}
      </div>
    );
  }

  // ---------------------------------------------------------------------------------------------------------- day overview
  if (dayOpen && plan.byId(dayOpen)) {
    const base = plan.byId(dayOpen);
    const cell = plan.strip.find((c) => c.day.id === base.id);
    return (
      <div className="wp">
        <DayView day={asWay(base)} week={plan.week} swaps={swaps} done={!!cell && cell.status === "done"} onWay={(w) => setWay(base, w)}
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
          <p className="wp-muted">{plan.smart ? `Smart program · ${plan.goal.planned} lifting day${plan.goal.planned === 1 ? "" : "s"} a week` : `${plan.name} · Week ${plan.week}`}{smart.status === "cached" && typeof navigator !== "undefined" && !navigator.onLine ? " · offline copy" : ""}</p>
        </div>
      </header>

      <nav className="wp-tabs" aria-label="Workout sections" ref={tabsRef}>
        {VIEWS.map(([id, label, ic]) => <button key={id} type="button" className={view === id ? "on" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}><span aria-hidden="true">{ic}</span>{label}</button>)}
      </nav>

      {view === "today" && (
        <TodayView plan={plan} body={body} cell={plan.strip.find((c) => c.day.id === shownBase.id) || todayCell} shownDay={shownDay} selected={selDay} onPick={setSelDay} st={st} busy={busy}
          onStart={startAsk} onResume={resume} onDiscard={async () => { if (await confirmAction("This deletes everything you logged in this workout.", { title: "Discard workout?", confirmText: "Discard", cancelText: "Keep it" })) discard(); }}
          onOpen={(id) => setDayOpen(id)} go={setView} today={today} activeDay={activeDay} onWay={(w) => setWay(shownBase, w)} onSkip={skipDay} onApply={applySuggestion} />
      )}
      {view === "plan" && <PlanView plan={plan} smart={smart} smartOn={smartOn} st={st} setSt={setSt} today={today} onOpen={(id) => setDayOpen(id)} onSource={setSource} customPlan={customPlan} weightKg={weightKg} weightFromBody={!!(body && body.plan.body)} profile={profile} onSetup={() => { setBodyTab("me"); setView("body"); }} />}
      {view === "body" && <div className="wp-body"><BodyPlanPage embedded seed={smart.data} startTab={bodyTab} onSaved={() => { window.dispatchEvent(new Event("ff:refresh")); smart.reload(); }} /></div>}
      {view === "library" && <LibraryView list={library} favs={st.favs} onFav={onFav} openSheet={openSheet} />}
      {view === "history" && <HistoryView st={st} setSt={setSt} today={today} go={setView} />}
      {sheetEl}
    </div>
  );
}

// ================================================================================================================ small shared pieces
/** Gym / Home / Quick: the same day done another way. Only smart strength days have it. */
function WayChips({ day, onWay }) {
  if (!day.wayList || day.wayList.length < 2) return null;
  const note = day.ways && day.ways[day.way] && day.ways[day.way].note;
  return (
    <>
      <div className="wp-ways" role="radiogroup" aria-label="Where are you training today?">
        {day.wayList.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={day.way === id} className={day.way === id ? "on" : ""} onClick={() => onWay(id)}>{label}</button>)}
      </div>
      {note && day.way !== "gym" && <p className="wp-way-note">{note}</p>}
    </>
  );
}

// ================================================================================================================ Today
function TodayView({ plan, body, cell, shownDay, selected, onPick, st, busy, onStart, onResume, onDiscard, onOpen, go, today, activeDay, onWay, onSkip, onApply }) {
  const [asking, setAsking] = useState(false);
  const doneRec = st.sessions.find((s) => s.date === cell.date && (plan.smart ? s.planId === SMART_ID : s.dayId === shownDay.id));
  const isDone = cell.status === "done" || !!doneRec;
  const total = summarize(st.sessions);
  const isRest = shownDay.kind === "rest";
  const count = countItems(shownDay);
  const canSkip = plan.smart && cell.isToday && shownDay.kind === "strength" && !isDone;
  const anyway = plan.smart && cell.isToday && !isDone && shownDay.kind !== "strength" && plan.adapt && plan.adapt.trainAnyway ? plan.days.find((d) => d.sessionId === plan.adapt.trainAnyway.sessionId) : null;

  return (
    <div className="wp-grid">
      <div className="wp-col">
        <div className="wp-week" role="group" aria-label="This week">
          {plan.strip.map((c) => (
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
            <li><b>{count}</b><small>{shownDay.kind === "strength" ? "exercises" : "items"}</small></li>
          </ul>
          {!isDone && <WayChips day={shownDay} onWay={onWay} />}
          {cell.note && <p className="wp-way-note">{cell.note}</p>}
          <div className="wp-hero-cta">
            {isDone ? (
              <><Chip tone="ok">✓ Done{doneRec ? ` · ${doneRec.minutes} min` : ""}</Chip><button type="button" className="wp-btn glass" onClick={() => onStart(shownDay)}>Do it again</button></>
            ) : (
              <button type="button" className="wp-btn hot big" onClick={() => onStart(shownDay)}>{st.active && st.active.dayId === shownDay.id ? "Continue workout" : isRest ? "Open rest-day checklist" : shownDay.kind === "recovery" ? "Start activity" : "Start workout"}</button>
            )}
            <button type="button" className="wp-btn glass" onClick={() => onOpen(shownDay.id)}>View details</button>
          </div>
          {anyway && <button type="button" className="wp-link on-dark" onClick={() => onStart(variantDay(anyway, "gym"))}>Train anyway: {anyway.title}. {plan.adapt.trainAnyway.note}</button>}
          {canSkip && !asking && <button type="button" className="wp-link on-dark" onClick={() => setAsking(true)}>Not today</button>}
          {canSkip && asking && (
            <div className="wp-skip" role="group" aria-label="Why not today?">
              <p>That is fine. Pick a reason so the plan adjusts your week:</p>
              <div className="wp-chips on-dark">{SKIP_REASONS.map(([id, label]) => <button key={id} type="button" className="wp-skip-chip" disabled={busy} onClick={async () => { await onSkip(shownDay, id); setAsking(false); }}>{label}</button>)}</div>
            </div>
          )}
        </article>

        {plan.smart && plan.adapt && cell.isToday && shownDay.kind !== "strength" && plan.adapt.todayPlan && <p className="wp-card wp-today-note">{plan.adapt.todayPlan.text}</p>}
        <AdaptCard adapt={plan.adapt} onApply={onApply} busy={busy} />

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
          <section className="wp-card wp-bodycard"><div className="wp-row"><h3 className="wp-h">Your body goal</h3><button type="button" className="wp-link" onClick={() => go("body")}>Set it up ›</button></div><p className="wp-muted wp-small">Pick lean, athletic, muscular or balanced to get a training plan built for you, with calories, protein and steps that match it.</p></section>
        )}

        {!plan.smart && (
          <section className="wp-card">
            <h3 className="wp-h">Week {plan.week}: {plan.phase.label}</h3>
            <p>{plan.phase.tip}</p>
          </section>
        )}
      </div>

      <div className="wp-col">
        <div className="wp-stats">
          <div><small>This week</small><b>{plan.goal.done}<span>/{plan.goal.planned}</span></b></div>
          <div><small>Streak</small><b>{plan.run}<span> days</span></b></div>
          <div><small>All time</small><b>{total.workouts}<span> workouts</span></b></div>
          <div><small>Time trained</small><b>{Math.round(total.minutes / 60 * 10) / 10}<span> h</span></b></div>
        </div>

        <section className="wp-card">
          <h3 className="wp-h">More</h3>
          <div className="wp-quick">
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "progress" } }))}><span aria-hidden="true">📈</span>Progress</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "exercise" } }))}><span aria-hidden="true">🧮</span>Routines &amp; plate calculator</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "gymlog" } }))}><span aria-hidden="true">📓</span>Gym log &amp; body tracker</button>
          </div>
        </section>
        <p className="wp-muted wp-small">{today === cell.date ? "Stop if you feel sharp pain. This is a training guide, not medical advice." : ""}</p>
      </div>
    </div>
  );
}
function ProgressionBar({ items, activeId, week }) {
  return (
    <ol className="wp-phases" aria-label="Progression plan">
      {items.map((p) => {
        const on = activeId ? p.phase === activeId : (p.phase === "learn" && week <= 2) || (p.phase === "build" && week >= 3 && week <= 4) || (p.phase === "progress" && week >= 5);
        return <li key={p.weeks} className={on ? "on" : ""}><b>{p.weeks}</b><span>{p.title}</span><small>{p.text}</small></li>;
      })}
    </ol>
  );
}

// ================================================================================================================ Day overview
function DayView({ day, week, swaps, done, onWay, onBack, onStart, openSheet }) {
  const [alts, setAlts] = useState(false);
  const count = day.blocks.filter((b) => b.type === "sets").reduce((n, b) => n + b.items.length, 0);
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
        {!done && <WayChips day={day} onWay={onWay} />}
        <div className="wp-hero-cta">
          <button type="button" className="wp-btn hot big" onClick={() => onStart(day)}>{done ? "Do it again" : "Start workout"}</button>
          {count > 0 && <button type="button" className="wp-btn glass" aria-pressed={alts} onClick={() => setAlts((a) => !a)}>{alts ? "Hide alternatives" : "View alternatives"}</button>}
        </div>
      </article>

      {day.blocks.map((b) => (
        <section key={b.id} className="wp-card">
          <div className="wp-row"><h3 className="wp-h">{b.title}{b.optional ? " (optional)" : ""}</h3>{b.minutes && <Chip>{b.minutes}</Chip>}</div>
          {b.note && <p className="wp-muted wp-small">{b.note}</p>}
          {b.type === "options" ? b.options.map((o) => (
            <div key={o.id} className="wp-opt-block"><b>{o.label}</b><small>{o.note}</small><ul className="wp-rows">{o.items.map((it) => <ItemRow key={it.id} it={it} swaps={swaps} openSheet={openSheet} />)}</ul></div>
          )) : (
            <ul className="wp-rows">{b.items.map((it) => (
              <li key={it.id}>
                <ItemRow it={it} swaps={swaps} openSheet={openSheet} sets={b.type === "sets" ? it : null} week={week} />
                {alts && b.type === "sets" && it.alts.length > 0 && (
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
// Same numbers as the Macros Today card (one shared energy model). Falls back to the static guide only when no profile is loaded.
function nutritionRows(profile) {
  const T = profile ? resolveTargets(profile) : null;
  const e = T && T.ready ? T.energy : null;
  if (!e) return GUIDE.nutrition;
  const r = T.ranges;
  const rng = (x) => `${x.min}\u2013${x.max} g (goal ${x.goal} g)`;
  const water = T.waterMl;
  return [
    ["Calories", `~${Math.round(e.calorieTarget).toLocaleString()} kcal`],
    ["Protein", rng(r.protein)], ["Carbs", rng(r.carbs)], ["Fat", rng(r.fat)],
    ["Fiber", `${r.fiber.goal}+ g`],
    ["Water", water ? `~${(water / 1000).toFixed(1)} L / day` : GUIDE.nutrition[5][1]],
  ];
}

function PlanView({ plan, smart, smartOn, st, setSt, today, onOpen, onSource, customPlan, weightKg, weightFromBody, profile, onSetup }) {
  const smartFlag = useFlag("smart-program", true);
  const [edit, setEdit] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [w, setW] = useState(String(st.weightKg));
  const saveW = () => { const n = Number(w); if (n >= 30 && n <= 300) { setSt((s) => ({ ...s, weightKg: n })); setEdit(false); } else notify("Enter a weight between 30 and 300 kg.", "info"); };
  const restart = async () => { if (await confirmAction("Week 1 starts again from this week. Your logged workouts stay in History.", { title: "Restart the plan?", confirmText: "Restart", cancelText: "Cancel", danger: false })) setSt((s) => ({ ...s, startDate: today })); };
  const canSmart = smartFlag && smartUsable(smart.data, today);
  const whyNot = smart.data && smart.data.plan && !smart.data.plan.ready ? smart.data.plan.message : smart.status === "loading" ? "Loading your smart plan…" : smart.error ? `Not available right now (${smart.error})` : "Pick a body goal in the Body tab to unlock it.";
  const program = plan.program;
  const prefs = program && smart.data.plan.training.prefs;

  return (
    <div className="wp-grid">
      <div className="wp-col">
        <section className="wp-card wp-source">
          <h3 className="wp-h">Your plan</h3>
          <div className="wp-seg wide" role="radiogroup" aria-label="Which plan runs Today, History and the live workout">
            <button type="button" role="radio" aria-checked={smartOn} className={smartOn ? "on" : ""} disabled={!canSmart} onClick={() => { setShowMine(false); onSource("smart"); }}>Smart · automatic</button>
            <button type="button" role="radio" aria-checked={!!customPlan} className={customPlan ? "on" : ""} onClick={() => setShowMine(true)}>My plans</button>
            <button type="button" role="radio" aria-checked={!smartOn && !customPlan} className={!smartOn && !customPlan ? "on" : ""} onClick={() => { setShowMine(false); onSource("classic"); }}>Classic 7-day</button>
          </div>
          <p className="wp-muted wp-small">{smartOn ? "Made from your body, goal and the workouts you log. Weights and days adjust every week by themselves." : customPlan ? `You are using your own plan “${customPlan.name}”. Add or delete exercises in My plans below.` : canSmart ? "The fixed 7-day beginner plan. Switch to Smart for a plan that adjusts to your progress, or build your own under My plans." : whyNot}</p>
        </section>

        {(showMine || customPlan) && <PersonalPlans st={st} setSt={setSt} weightKg={weightKg} activeId={customPlan ? customPlan.id : ""} onUse={(id) => { setShowMine(true); onSource(sourceFor(id)); }} />}

        {customPlan ? (
          <article className="wp-hero plan">
            <div className="wp-hero-glow" aria-hidden="true" />
            <div className="wp-hero-row"><span className="wp-eyebrow">My plan</span><Chip tone="glass">Your own</Chip></div>
            <h2>{customPlan.name}</h2>
            <ul className="wp-goals"><li>✓ {plan.goal.planned} training day{plan.goal.planned === 1 ? "" : "s"} a week</li><li>✓ You choose every exercise, set and rep</li><li>✓ Weights step up when you hit the top of your rep range</li></ul>
            <div className="wp-hero-cta"><Chip tone="ok">Week {plan.week}</Chip>{!weightFromBody && <button type="button" className="wp-btn glass" onClick={() => setEdit((e) => !e)}>Body weight</button>}</div>
            {edit && (
              <div className="wp-inline">
                <label>Body weight (kg), used to estimate calories<input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></label>
                <button type="button" className="wp-btn hot" onClick={saveW}>Save</button>
              </div>
            )}
          </article>
        ) : smartOn ? (
          <article className="wp-hero plan">
            <div className="wp-hero-glow" aria-hidden="true" />
            <div className="wp-hero-row"><span className="wp-eyebrow">My plan</span><Chip tone="glass">{program.level === "advanced" ? "Experienced" : program.level === "intermediate" ? "Some experience" : "New to lifting"}</Chip></div>
            <h2>Smart program</h2>
            <ul className="wp-goals"><li>✓ {program.split}</li><li>✓ {program.daysPerWeek} lifting days, about {program.minutesPerSession} min each</li><li>✓ Trained {program.place === "home" ? "at home" : program.place === "both" ? "at the gym or at home" : "at the gym"}</li></ul>
            <div className="wp-chips on-dark"><Chip tone="glass">{plan.phase.label}</Chip><Chip tone="glass">{prefs.limits.length ? `Avoiding: ${prefs.limits.join(", ")}` : "No limits set"}</Chip></div>
            <div className="wp-hero-cta"><button type="button" className="wp-btn glass" onClick={onSetup}>Change days, place or limits</button></div>
          </article>
        ) : (
          <article className="wp-hero plan">
            <div className="wp-hero-glow" aria-hidden="true" />
            <div className="wp-hero-row"><span className="wp-eyebrow">My plan</span><Chip tone="glass">{PLAN.level}</Chip></div>
            <h2>{PLAN.name} Plan</h2>
            <ul className="wp-goals">{PLAN.goals.map((g) => <li key={g}>✓ {g}</li>)}</ul>
            <div className="wp-chips on-dark">
              <Chip tone="glass">{weightKg} kg</Chip>{profile && profile.heightCm ? <Chip tone="glass">{profile.heightCm} cm</Chip> : null}<Chip tone="glass">{PLAN.profile.steps} steps</Chip><Chip tone="glass">{nutritionRows(profile)[0][1]}</Chip>
            </div>
            <div className="wp-hero-cta">
              <Chip tone="ok">Week {plan.week} · {plan.phase.label}</Chip>
              {!weightFromBody && <button type="button" className="wp-btn glass" onClick={() => setEdit((e) => !e)}>Body weight</button>}
              <button type="button" className="wp-btn glass" onClick={restart}>Restart plan</button>
            </div>
            {edit && (
              <div className="wp-inline">
                <label>Body weight (kg), used to estimate calories<input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></label>
                <button type="button" className="wp-btn hot" onClick={saveW}>Save</button>
              </div>
            )}
          </article>
        )}

        <section className="wp-card">
          <h3 className="wp-h">Weekly schedule</h3>
          <ul className="wp-sched">
            {plan.strip.map((c) => (
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
        <section className="wp-card"><h3 className="wp-h">{smartOn ? "How your plan progresses" : customPlan ? "How your weights progress" : "Beginner progression"}</h3>{customPlan ? <ul className="wp-list"><li>Log every set. The next session suggests your weights from what you did.</li><li>Hit the top of your rep range on every set and the suggestion goes up a little (2 kg upper body, 5 kg lower body, never more than 10%).</li><li>Missed the range? Same weight, one more rep than last time.</li></ul> : <ProgressionBar items={plan.progression} activeId={smartOn ? plan.phase.id : ""} week={plan.week} />}
        </section>

        {smartOn ? (
          <>
            <details className="wp-card wp-acc" open><summary>Getting stronger every week</summary><div className="bp bp-embed"><Progress program={program} /></div></details>
            <details className="wp-card wp-acc"><summary>Cardio and active days</summary><div className="bp bp-embed"><ActiveDays program={program} /></div></details>
            <details className="wp-card wp-acc"><summary>Training safety</summary><div className="bp bp-embed"><Safety items={program.safety} /></div></details>
          </>
        ) : (
          <>
            {!customPlan && <details className="wp-card wp-acc" open>
              <summary>Key beginner principles</summary>
              <ul className="wp-list">{GUIDE.principles.map((p) => <li key={p}>{p}</li>)}</ul>
            </details>}
            <details className="wp-card wp-acc">
              <summary>Nutrition targets (daily)</summary>
              <dl className="wp-dl">{nutritionRows(profile).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              <h4>Pre-workout (30–60 min before)</h4>
              <ul className="wp-list">{GUIDE.pre.map((p) => <li key={p}>{p}</li>)}</ul>
              <h4>Post-workout (within 60 min)</h4>
              <ul className="wp-list">{GUIDE.post.map((p) => <li key={p}>{p}</li>)}</ul>
            </details>
            {!customPlan && <details className="wp-card wp-acc">
              <summary>Expected results (realistic)</summary>
              <ul className="wp-results">{GUIDE.results.map(([k, v]) => { const n = parseInt(k.replace(/\D/g, ""), 10); return <li key={k} className={plan.week >= n ? "on" : ""}><b>{k}</b><span>{v}</span></li>; })}</ul>
            </details>}
            <details className="wp-card wp-acc">
              <summary>How to use alternatives</summary>
              <ul className="wp-list">{GUIDE.quick.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="wp-muted wp-small">Tap any exercise, open Alternatives, and press Use. The swap is remembered for next time.</p>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

// ================================================================================================================ Library
function LibraryView({ list, favs, onFav, openSheet }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = list.filter((e) => (f === "all" || e.cat === f) && (!onlyFav || favs.includes(e.id)) && (!needle || e.name.toLowerCase().includes(needle) || (e.alts || []).some((a) => a.name.toLowerCase().includes(needle))));
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
                <span className="wp-item-t"><b>{e.name}</b><small>{MUSCLE_LABEL[e.cat] || e.cat}{(e.alts || []).length ? ` · ${e.alts.length} alternatives` : ""}</small></span>
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
