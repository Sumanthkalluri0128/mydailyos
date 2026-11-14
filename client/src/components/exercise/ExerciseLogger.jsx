// The exercise logger, redesigned. One calm flow instead of a long page:
//   1. pick the day (a week strip showing which days you trained),
//   2. say what you did (search, recent chips, muscle chips, or just type "bench 3x10 60"),
//   3. fill the sets with big − / + steppers (your last numbers are already in),
//   4. save. The day's workout is a clean list of cards with pictures, sets and calories.
// Storage, calories and sync are the existing ones (utils/gymStore.js, utils/gymMath.js, utils/gymSyncRunner.js), so nothing is entered twice
// and the numbers match the Gym log, Exercise and Home.
import { useMemo, useRef, useState } from "react";
import { FigThumb } from "../workout/bits";
import { FILTERS, MUSCLE_LABEL, libraryList } from "../../data/workoutPlan";
import { mergeCatalog } from "../../utils/gymCatalog";
import { sortExercises } from "../../utils/exerciseDetail";
import { lookupExercise } from "../../utils/exerciseLookup";
import * as G from "../../utils/gymMath";
import { getLocalDate } from "../../utils/date";
import { notify } from "../../utils/notify";
import { confirmAction } from "../../utils/confirm";
import { gymId, removeEntry, saveEntry, useGymStore } from "../../utils/gymStore";
import "./exerciselog.css";

const KG_PER_LB = 0.45359237;
const toDisp = (kg, unit) => (unit === "lb" ? Math.round((kg / KG_PER_LB) * 10) / 10 : Math.round(kg * 10) / 10);
const fromDisp = (v, unit) => Math.round((unit === "lb" ? v * KG_PER_LB : v) * 100) / 100;
const inputStr = (kg, unit) => (kg > 0 ? String(Math.round(toDisp(kg, unit) * 100) / 100) : "");
const fmtW = (kg, unit) => (kg === null || kg === undefined || !Number.isFinite(kg) ? "--" : `${toDisp(kg, unit)} ${unit}`);
const catLabel = (c) => MUSCLE_LABEL[c] || String(c).replace(/^./, (x) => x.toUpperCase());
const unitWord = (u) => (u === "sec" ? "sec" : u === "min" ? "min" : "reps");
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const CATS = [...FILTERS.filter((c) => c !== "all"), "full body"];
const STEP = { kg: 2.5, lb: 5 };

const dayLabel = (d) => { const [y, m, day] = d.split("-").map(Number); const dt = new Date(y, m - 1, day); return { dow: dt.toLocaleDateString("en-IN", { weekday: "short" }), n: day, full: dt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }) }; };

/** "bench press 3x10 60", "squat 4 x 8 @ 80kg", "plank 3x40s" -> { name, sets, reps, kg } or null. */
export function parseQuick(text) {
  const m = String(text || "").trim().match(/^(.{2,}?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})\s*(s|sec|secs|min)?(?:\s*(?:@|at|with)?\s*(\d+(?:\.\d+)?)\s*(kg|lb|lbs)?)?$/i);
  if (!m) return null;
  const sets = Math.min(12, Math.max(1, parseInt(m[2], 10))), reps = parseInt(m[3], 10);
  return { name: m[1].trim(), sets, reps, timed: m[4] ? (/^m/i.test(m[4]) ? "min" : "sec") : "", kg: m[5] ? parseFloat(m[5]) : 0, lb: /lb/i.test(m[6] || "") };
}

export default function ExerciseLogger({ timeForm = null }) {
  const { entries, body, profile } = useGymStore();
  const unit = profile.unit;
  const today = getLocalDate();
  const [mode, setMode] = useState("sets");         // "sets" (gym, holds, cardio with minutes) | "time" (yoga, sports...)
  const [date, setDate] = useState(today);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");               // "" = no list; the list shows only when searching or a muscle is chosen
  const [more, setMore] = useState(false);
  const [pick, setPick] = useState(null);
  const [draft, setDraft] = useState([]);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [editId, setEditId] = useState(null);
  const [customUnit, setCustomUnit] = useState("reps");
  const sheetRef = useRef(null);

  const lib = useMemo(() => mergeCatalog(libraryList().map((it) => ({ id: it.id, name: it.name, cat: it.cat, unit: it.unit === "min" ? "min" : it.timed || it.unit === "sec" ? "sec" : String(it.cat).toLowerCase() === "cardio" ? "min" : "reps" })))
    .map((e) => ({ id: e.id, name: e.name, cat: String(e.cat).toLowerCase(), unit: e.unit, gear: e.gear || "" })), []);
  const used = useMemo(() => G.exercisesUsed(entries), [entries]);
  const needle = q.trim().toLowerCase();
  const quick = useMemo(() => parseQuick(q), [q]);
  const words = (quick ? quick.name : needle).split(/\s+/).filter(Boolean);
  const hits = useMemo(() => {
    if (!words.length && !cat) return [];
    const found = lib.filter((e) => (!cat || e.cat === cat) && words.every((w) => e.name.toLowerCase().includes(w)));
    return sortExercises(found, { boost: used.map((u) => u.exId) });
  }, [lib, cat, used, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const SHOW = 12, shown = more ? hits : hits.slice(0, SHOW);
  const exact = hits.some((e) => e.name.toLowerCase() === needle);

  // ---- body weight for calories
  const wKnown = G.bodyKgOn(body, date), bodyKg = wKnown || G.DEFAULT_BODY_KG;
  const dayList = entries.filter((e) => e.date === date).sort((a, b) => a.at - b.at);
  const bwOf = useMemo(() => G.bodyKgFn(body), [body]); // a set with no weight = body weight, taken from the weight you logged on or before that day (so old entries recalculate too)
  const ds = G.dayStats(entries, date, bwOf);
  const dayKcal = dayList.reduce((n, e) => n + G.entryKcal(e, bodyKg), 0);
  const dayMin = Math.round(dayList.reduce((n, e) => n + G.entryMinutes(e), 0));

  // ---- the week strip: 7 days ending today (or the week of the chosen date if it is older)
  const strip = useMemo(() => {
    const after = G.shiftDate(date, 3);
    const end = date >= G.shiftDate(today, -6) ? today : after > today ? today : after; // keep the chosen day inside the strip
    return Array.from({ length: 7 }, (_, i) => G.shiftDate(end, i - 6));
  }, [date, today]);
  const stripInfo = (d) => { const l = entries.filter((e) => e.date === d); return { n: l.length, kcal: l.reduce((n, e) => n + G.entryKcal(e, G.bodyKgOn(body, d) || G.DEFAULT_BODY_KG), 0) }; };

  // ---- the sheet
  const open = (p, e) => {
    const last = G.lastFor(entries, p.id, date, e ? e.id : undefined);
    const blank = p.unit === "min" ? [{ kg: "", reps: "", pace: "", incline: "" }] : [{ kg: "", reps: "" }, { kg: "", reps: "" }, { kg: "", reps: "" }];
    setPick(p); setEditId(e ? e.id : null); setNote(e ? e.note || "" : ""); setShowNote(!!(e && e.note));
    const src = e || last;
    setDraft(src ? src.sets.map((s) => ({ kg: inputStr(s.kg, unit), reps: String(s.reps), pace: s.pace ? G.fmtPace(s.pace) : "", incline: s.incline ? String(s.incline) : "" })) : blank);
    setQ(""); setCat(""); setMore(false);
    requestAnimationFrame(() => sheetRef.current && sheetRef.current.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  const choose = (p) => open(p, null);
  const edit = (e) => open({ id: e.exId, name: e.name, cat: e.cat, unit: e.unit }, e);
  const cancel = () => { setPick(null); setDraft([]); setNote(""); setShowNote(false); setEditId(null); };
  const setRow = (i, patch) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const bump = (i, field, dir) => setRow(i, { [field]: (() => {
    const cur = parseFloat(String(draft[i][field]).replace(",", ".")) || 0;
    const step = field === "kg" ? STEP[unit] || 2.5 : pick.unit === "sec" ? 5 : 1;
    return String(Math.max(0, Math.round((cur + dir * step) * 100) / 100) || "");
  })() });
  const timed = pick ? G.isTimed(pick.unit) : false;
  const isRun = pick && pick.unit === "min";
  const last = pick ? G.lastFor(entries, pick.id, date, editId || undefined) : null;
  const lib0 = pick ? lookupExercise(pick.id, pick) : null;

  const draftSets = pick ? draft.map((r) => ({ kg: timed ? 0 : G.parseNum(r.kg, 0, 2000) ? fromDisp(G.parseNum(r.kg, 0, 2000), unit) : 0, reps: G.parseNum(r.reps, 1, 5000) || 0, ...(isRun && G.parsePace(r.pace) ? { pace: G.parsePace(r.pace), ...(G.parseNum(r.incline, 0.1, 40) ? { incline: G.parseNum(r.incline, 0.1, 40) } : {}) } : {}) })).filter((x) => x.reps > 0) : [];
  const draftEntry = pick ? { id: "x", date, exId: pick.id, name: pick.name, cat: pick.cat, unit: pick.unit, sets: draftSets, at: 0 } : null;
  const draftKcal = pick && draftSets.length ? G.entryKcal(draftEntry, bodyKg) : 0;
  const draftVol = pick && !timed && draftSets.length ? G.entryVolume(draftEntry, bodyKg) : 0;
  const draftHasBw = pick && !timed && draftSets.some((s) => !(s.kg > 0));
  const draftKm = isRun && draftSets.length ? G.entryKm(draftEntry) : 0;

  const finish = (entry, pr) => {
    if (!saveEntry(entry)) { notify("Your browser would not save this (private mode or storage full). Download a backup.", "error"); return; }
    notify(pr ? `New record on ${entry.name}: ${pr.kind === "weight" ? `${fmtW(pr.value, unit)} (was ${fmtW(pr.prev, unit)})` : pr.kind === "e1rm" ? `est. 1RM ${fmtW(pr.value, unit)}` : `${pr.value} ${entry.unit === "reps" ? "reps" : entry.unit}`}` : `${entry.name}: ${G.setsLine(entry, (k) => fmtW(k, unit))}`, "success");
  };
  const save = () => {
    const sets = [];
    for (const r of draft) {
      const reps = G.parseNum(r.reps, 1, 5000);
      if (!reps) continue;
      let kg = 0;
      if (!timed && r.kg.trim()) { const n = G.parseNum(r.kg, 0.1, 2000); if (n === null) { notify("A weight must be a number, or leave it blank for bodyweight.", "error"); return; } kg = fromDisp(n, unit); }
      const set = { kg, reps: Math.round(reps * 10) / 10 };
      if (isRun && (r.pace || "").trim()) {
        const pace = G.parsePace(r.pace);
        if (pace === null) { notify("Type the average pace per km like 6:30 (6 min 30 s). It must be between 2:00 and 30:00.", "error"); return; }
        set.pace = pace;
        if ((r.incline || "").trim()) {
          const inc = G.parseNum(r.incline, 0, 40);
          if (inc === null) { notify("Incline is a percent between 0 and 40, like 3. Leave it blank for flat.", "error"); return; }
          if (inc > 0) set.incline = Math.round(inc * 10) / 10;
        }
      }
      sets.push(set);
    }
    if (!sets.length) { notify(`Fill in at least one set with ${unitWord(pick.unit)}.`, "error"); return; }
    const entry = { id: editId || gymId("e"), date, exId: pick.id, name: pick.name, cat: pick.cat, unit: pick.unit, sets, note: note.trim() || undefined, at: editId ? (entries.find((x) => x.id === editId) || {}).at || Date.now() : Date.now() };
    finish(entry, editId ? null : G.detectPRs(entries, entry)[0]);
    cancel();
  };
  /** "bench 3x10 60" -> logs it straight away after one tap on the suggestion. */
  const logQuick = (e) => {
    const u = quick.timed || e.unit;
    const kg = u === "reps" && quick.kg ? fromDisp(quick.kg, quick.lb ? "lb" : unit) : 0;
    const entry = { id: gymId("e"), date, exId: e.id, name: e.name, cat: e.cat, unit: u, sets: Array.from({ length: quick.sets }, () => ({ kg, reps: quick.reps })), at: Date.now() };
    finish(entry, G.detectPRs(entries, entry)[0]);
    setQ("");
  };
  const del = async (e) => { if (await confirmAction(`${e.name}: ${G.setsLine(e, (k) => fmtW(k, unit))}`, { title: "Delete this exercise?", confirmText: "Delete" })) removeEntry(e.id); };

  // ------------------------------------------------------------------------------------------------ views
  const tabs = (
    <div className="xl-mode" role="tablist" aria-label="How do you want to log?">
      <button type="button" role="tab" aria-selected={mode === "sets"} className={mode === "sets" ? "on" : ""} onClick={() => setMode("sets")}>🏋️ Sets &amp; reps</button>
      <button type="button" role="tab" aria-selected={mode === "time"} className={mode === "time" ? "on" : ""} onClick={() => setMode("time")}>⏱ By time</button>
    </div>
  );

  if (mode === "time") return <div className="xl">{tabs}<div className="xl-time">{timeForm || <p className="xl-muted">Logging by time is not available here.</p>}</div></div>;

  if (pick) {
    return (
      <div className="xl" ref={sheetRef}>
        {tabs}
        <section className="xl-sheet" aria-label={`Log ${pick.name}`}>
          <header className="xl-sheet-h">
            <FigThumb ex={(lib0 && lib0.id ? lib0 : pick)} size={64} />
            <div className="xl-sheet-t"><h3>{pick.name}</h3><span className="xl-muted">{catLabel(pick.cat)}{editId ? " · editing" : ""} · {dayLabel(date).full}</span></div>
            <button type="button" className="xl-x" onClick={cancel} aria-label="Cancel">✕</button>
          </header>
          {last && !editId && (
            <button type="button" className="xl-last" onClick={() => setDraft(last.sets.map((s) => ({ kg: inputStr(s.kg, unit), reps: String(s.reps), pace: s.pace ? G.fmtPace(s.pace) : "", incline: s.incline ? String(s.incline) : "" })))}>
              <span>Last time · {G.setsLine(last, (k) => fmtW(k, unit))}</span><b>Use these</b>
            </button>
          )}
          <div className="xl-sets">
            {draft.map((r, i) => (
              <div className="xl-set" key={i}>
                <span className="xl-set-n">{i + 1}</span>
                {!timed && (
                  <div className="xl-num"><span>{unit} <small>· empty = body weight</small></span>
                    <div><button type="button" aria-label={`Set ${i + 1}: less weight`} onClick={() => bump(i, "kg", -1)}>−</button>
                      <input aria-label={`Set ${i + 1} weight`} inputMode="decimal" value={r.kg} placeholder="BW" onChange={(e) => setRow(i, { kg: e.target.value })} />
                      <button type="button" aria-label={`Set ${i + 1}: more weight`} onClick={() => bump(i, "kg", 1)}>＋</button></div>
                  </div>
                )}
                <div className="xl-num"><span>{pick.unit === "reps" ? "reps" : unitWord(pick.unit)}</span>
                  <div><button type="button" aria-label={`Set ${i + 1}: fewer`} onClick={() => bump(i, "reps", -1)}>−</button>
                    <input aria-label={`Set ${i + 1} ${unitWord(pick.unit)}`} inputMode="decimal" value={r.reps} placeholder="0" onChange={(e) => setRow(i, { reps: e.target.value })} />
                    <button type="button" aria-label={`Set ${i + 1}: more`} onClick={() => bump(i, "reps", 1)}>＋</button></div>
                </div>
                {isRun && <div className="xl-num"><span>pace /km</span><div><input aria-label={`Set ${i + 1} average pace per km`} className="xl-pace" inputMode="text" value={r.pace || ""} placeholder="6:30" onChange={(e) => setRow(i, { pace: e.target.value })} /></div></div>}
                {isRun && <div className="xl-num"><span>incline %</span><div><input aria-label={`Set ${i + 1} treadmill incline percent`} className="xl-pace" inputMode="decimal" value={r.incline || ""} placeholder="0" onChange={(e) => setRow(i, { incline: e.target.value })} /></div></div>}
                <button type="button" className="xl-del" aria-label={`Remove set ${i + 1}`} disabled={draft.length < 2} onClick={() => setDraft((d) => (d.length > 1 ? d.filter((_, j) => j !== i) : d))}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="xl-addset" onClick={() => setDraft((d) => [...d, d.length ? { ...d[d.length - 1] } : { kg: "", reps: "", pace: "", incline: "" }])}>＋ Add set <small>(copies the last one)</small></button>
          {isRun && <p className="xl-muted">Treadmill: enter minutes and average pace per km (like 6:30). Add the incline % if you use one. Calories come from your speed and incline.{draftKm > 0 ? ` About ${draftKm} km.` : ""}</p>}
          {showNote
            ? <label className="xl-note"><span>Note</span><input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Felt strong, slow tempo…" /></label>
            : <button type="button" className="xl-link" onClick={() => setShowNote(true)}>＋ Add a note</button>}
          <div className="xl-live" aria-live="polite">
            <span><b>{draftSets.length}</b> set{draftSets.length === 1 ? "" : "s"}</span>
            {draftVol > 0 && <span><b>{fmtW(draftVol, unit)}</b> lifted</span>}
            <span><b>≈ {draftKcal}</b> kcal</span>
          </div>
          {draftHasBw && draftVol > 0 && <p className="xl-muted">Sets with no weight count as body weight ({fmtW(bodyKg, unit)}{wKnown ? "" : ", your profile weight"}), so they add to what you lifted.</p>}
          {!wKnown && draftKcal > 0 && <p className="xl-muted">Calories assume {G.DEFAULT_BODY_KG} kg. Log your weight in Body for a closer number.</p>}
          <div className="xl-save"><button type="button" className="xl-btn ghost" onClick={cancel}>Cancel</button><button type="button" className="xl-btn" onClick={save}>{editId ? "Save changes" : "Save exercise"}</button></div>
        </section>
      </div>
    );
  }

  const isToday = date === today;
  const quickMatch = quick && hits[0];
  return (
    <div className="xl">
      {tabs}

      <div className="xl-strip" role="group" aria-label="Pick a day">
        <button type="button" className="xl-nav" aria-label="Earlier days" onClick={() => setDate(G.shiftDate(date, -7))}>‹</button>
        {strip.map((d) => { const l = dayLabel(d), inf = stripInfo(d); return (
          <button key={d} type="button" className={`xl-day${d === date ? " on" : ""}${d === today ? " today" : ""}`} aria-pressed={d === date} aria-label={`${l.full}${inf.n ? `, ${inf.n} exercises` : ""}`} disabled={d > today} onClick={() => setDate(d)}>
            <small>{l.dow}</small><b>{l.n}</b><i className={inf.n ? "dot" : ""} />
          </button>
        ); })}
        <button type="button" className="xl-nav" aria-label="Later days" disabled={strip[6] >= today} onClick={() => setDate(G.shiftDate(date, 7) > today ? today : G.shiftDate(date, 7))}>›</button>
      </div>

      <div className="xl-hero">
        <div><span>{isToday ? "Today" : dayLabel(date).full}</span><b>{dayKcal}<small> kcal</small></b></div>
        <ul><li><b>{ds.exercises}</b> exercise{ds.exercises === 1 ? "" : "s"}</li><li><b>{ds.sets}</b> sets</li><li><b>{dayMin}</b> min</li>{ds.volumeKg > 0 && <li><b>{fmtW(ds.volumeKg, unit)}</b> lifted</li>}</ul>
      </div>

      <div className="xl-find">
        <label className="xl-search"><span className="sr-only">What did you train?</span>
          <span aria-hidden="true">🔎</span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setMore(false); }} placeholder="What did you train? Squat, plank… or “bench 3x10 60”" inputMode="text" />
          {q && <button type="button" aria-label="Clear" onClick={() => setQ("")}>✕</button>}
        </label>
        {quick && quickMatch && (
          <button type="button" className="xl-quick" onClick={() => logQuick(quickMatch)}>
            <span>⚡ Log now</span><b>{quickMatch.name}</b><small>{quick.sets} × {quick.reps}{quick.timed ? quick.timed === "min" ? " min" : " s" : ""}{quick.kg ? ` @ ${quick.kg} ${quick.lb ? "lb" : unit}` : ""}</small>
          </button>
        )}
        {!needle && used.length > 0 && (
          <div className="xl-chips" aria-label="Recent exercises"><span className="xl-lab">Recent</span>
            {used.slice(0, 8).map((u) => <button key={u.exId} type="button" className="xl-chip recent" onClick={() => choose(lib.find((x) => x.id === u.exId) || { id: u.exId, name: u.name, cat: u.cat, unit: u.unit })}>{u.name}</button>)}
          </div>
        )}
        <div className="xl-chips scroll" aria-label="Muscle group">
          {CATS.map((c) => <button key={c} type="button" className={`xl-chip${cat === c ? " on" : ""}`} aria-pressed={cat === c} onClick={() => { setCat(cat === c ? "" : c); setMore(false); }}>{catLabel(c)}</button>)}
        </div>

        {(needle || cat) && (
          <ul className="xl-results">
            {shown.map((e) => (
              <li key={e.id}>
                <button type="button" className="xl-res" onClick={() => choose(e)} aria-label={`Log ${e.name}`}>
                  <FigThumb ex={lookupExercise(e.id, e) || e} size={48} />
                  <span><b>{e.name}</b><small>{catLabel(e.cat)}{e.gear ? ` · ${e.gear}` : ""}{e.unit !== "reps" ? ` · ${e.unit === "sec" ? "timed" : "minutes"}` : ""}</small></span>
                  <i aria-hidden="true">＋</i>
                </button>
              </li>
            ))}
            {hits.length > SHOW && !more && <li><button type="button" className="xl-more" onClick={() => setMore(true)}>Show all {hits.length}</button></li>}
            {!hits.length && <li className="xl-muted">No exercise matches “{q}”.</li>}
          </ul>
        )}
        {!!needle && !quick && !exact && (
          <div className="xl-custom">
            <span className="xl-lab">Not in the list? Add “{q.trim()}” as your own exercise</span>
            <div className="xl-chips">{[["reps", "Counted in reps"], ["sec", "Timed (seconds)"], ["min", "Timed (minutes)"]].map(([u, l]) => <button key={u} type="button" className={`xl-chip${customUnit === u ? " on" : ""}`} aria-pressed={customUnit === u} onClick={() => setCustomUnit(u)}>{l}</button>)}</div>
            <button type="button" className="xl-btn" onClick={() => choose({ id: `custom:${slugOf(q.trim())}`, name: q.trim().slice(0, 60), cat: cat || "other", unit: customUnit })}>Use “{q.trim()}”</button>
          </div>
        )}
      </div>

      <div className="xl-list">
        <h3>{isToday ? "Today’s workout" : "Workout"}</h3>
        {dayList.length === 0 ? <p className="xl-empty">Nothing logged {isToday ? "yet today" : "on this day"}. Search above or tap a recent exercise to start.</p> : dayList.map((e) => {
          const l = lookupExercise(e.exId, e);
          return (
            <article className="xl-card" key={e.id}>
              <button type="button" className="xl-card-main" onClick={() => edit(e)} aria-label={`Edit ${e.name}`}>
                <FigThumb ex={l && l.id ? l : { id: e.exId, name: e.name, cat: e.cat }} size={52} />
                <div>
                  <b>{e.name}</b>
                  <div className="xl-sets-line">{e.sets.filter((s) => s.reps > 0).map((s, i) => <span key={i}>{e.unit === "reps" ? `${s.reps} × ${s.kg ? `${toDisp(s.kg, unit)}${unit}` : "BW"}` : `${s.reps}${e.unit === "sec" ? "s" : " min"}${s.pace ? ` @ ${G.fmtPace(s.pace)}/km` : ""}${s.pace && s.incline > 0 ? ` ↑${s.incline}%` : ""}`}</span>)}</div>
                  <small>{G.entryKm(e) > 0 ? `${G.entryKm(e)} km · ` : ""}≈ {G.entryKcal(e, bodyKg)} kcal{e.note ? ` · ${e.note}` : ""}</small>
                </div>
              </button>
              <button type="button" className="xl-del" aria-label={`Delete ${e.name}`} onClick={() => del(e)}>🗑</button>
            </article>
          );
        })}
        {dayList.length > 0 && !wKnown && <p className="xl-muted">Calories assume {G.DEFAULT_BODY_KG} kg. Log your weight in Body for a closer number.</p>}
      </div>
    </div>
  );
}
