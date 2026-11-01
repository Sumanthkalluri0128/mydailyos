// Body plan: the training half. A setup form (where, level, days, time, equipment, anything that hurts, focus), the body analysis, and the
// weekly program with an alternative for every situation (machine busy, no gym today, no time, rest day). All numbers come from the
// server (lib/trainingPlan.js); this file only shows them. Used by BodyPlanPage.
import { useState } from "react";
import ExercisePic from "../components/ExercisePic";

export function Section({ title, children }) {
  return (
    <details className="bp-card bp-section">
      <summary>{title}</summary>
      <div className="bp-body">{children}</div>
    </details>
  );
}
export const Lines = ({ items }) => <ul className="bp-lines">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;

const DAY_CLASS = { train: "train", active: "active", rest: "rest" };
const GROUP = { chest: "Chest", back: "Back", shoulders: "Shoulders", arms: "Arms", core: "Core", legs: "Legs", glutes: "Glutes" };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const rest = (sec) => (sec >= 90 ? `${Math.round((sec / 60) * 10) / 10} min` : `${sec} s`);

function Chips({ label, hint, items, value, multi, onChange, star, max }) {
  const on = (id) => (multi ? value.includes(id) : value === id);
  const click = (id) => {
    if (!multi) return onChange(id);
    const has = value.includes(id);
    if (has) return onChange(value.filter((v) => v !== id));
    if (max && value.length >= max) return onChange([...value.slice(1), id]);
    return onChange([...value, id]);
  };
  return (
    <div className="bp-q">
      <b>{label}</b>{hint && <small className="bp-muted"> {hint}</small>}
      <div className="bp-chips" role={multi ? "group" : "radiogroup"} aria-label={label}>
        {items.map((it) => (
          <button key={it.id} type="button" role={multi ? "checkbox" : "radio"} aria-checked={on(it.id)} className={`bp-chip${on(it.id) ? " on" : ""}`} onClick={() => click(it.id)}>
            {it.label}{star === it.id ? " ★" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The setup questions. `prefs` is the editable copy, `onChange` previews the plan with the new answers. */
export function TrainingSetup({ options, prefs, serverPrefs, onChange }) {
  if (!options || !prefs) return null;
  const set = (k, v) => onChange({ ...prefs, [k]: v });
  const home = prefs.place !== "gym";
  return (
    <div>
      {serverPrefs && !serverPrefs.setupDone && <p className="bp-note">Tell us how you train and the plan below fits you exactly. Until then it assumes you are new to lifting and train at a gym.</p>}
      <Chips label="Where do you train?" items={options.places} value={prefs.place} onChange={(v) => set("place", v)} />
      <Chips label="Your experience" items={options.levels} value={prefs.level} onChange={(v) => set("level", v)} />
      <Chips label="Days a week" hint="★ is the best fit for your goal" items={options.days.map((d) => ({ id: d, label: `${d}` }))} value={prefs.days} onChange={(v) => set("days", v)} star={serverPrefs ? serverPrefs.recommendedDays : null} />
      <Chips label="Minutes a session" items={options.minutes.map((d) => ({ id: d, label: `${d}` }))} value={prefs.minutes} onChange={(v) => set("minutes", v)} />
      {home && <Chips label="What do you have at home?" hint="Nothing is fine too. A backpack and water bottles count." items={options.equipment} value={prefs.equipment} multi onChange={(v) => set("equipment", v)} />}
      <Chips label="Anything that hurts or limits you?" hint="Those moves are removed and replaced." items={options.limits} value={prefs.limits} multi onChange={(v) => set("limits", v)} />
      <Chips label="Bring up a muscle?" hint="Pick up to 3" items={options.focus} value={prefs.focus} multi max={3} onChange={(v) => set("focus", v)} />
      {serverPrefs && serverPrefs.notes.map((n, i) => <p key={i} className="bp-note">{n}</p>)}
    </div>
  );
}

export function Analysis({ a }) {
  const fr = a.frame;
  return (
    <div>
      <p className="bp-lead">{a.headline}</p>
      <div className="bp-stats">
        <div className="bp-stat"><small>Lean mass</small><b>{fr.leanMassKg} kg</b></div>
        <div className="bp-stat"><small>Fat mass</small><b>{fr.fatMassKg} kg</b></div>
        <div className="bp-stat"><small>Muscle index (FFMI)</small><b>{fr.ffmi}{fr.ffmiBand ? ` · ${fr.ffmiBand}` : ""}</b></div>
        <div className="bp-stat"><small>Body fat</small><b>{fr.bodyFatPct}% ({fr.bodyFatSource === "tape" ? "tape" : "estimate"})</b></div>
      </div>
      <p className="bp-muted">{fr.ffmiNote}</p>
      <h4 className="bp-h">Your proportions</h4>
      {a.proportions.map((p) => <p key={p.id} className="bp-micro"><b>{p.label}{p.value !== null ? `: ${p.value}` : ""}</b>{p.goal ? <span className="bp-muted"> (aim ≈ {p.goal})</span> : null}<br /><span className="bp-muted">{p.read}</span></p>)}
      <h4 className="bp-h">Muscles to bring up</h4>
      {a.focus.map((f) => <p key={f.group} className="bp-micro"><b>{cap(f.group)}</b><br /><span className="bp-muted">{f.why}</span></p>)}
      <h4 className="bp-h">What your body changed in the plan</h4>
      {a.adjustments.map((x, i) => <p key={i} className="bp-micro"><b>{x.area}:</b> {x.change}<br /><span className="bp-muted">Why: {x.why}</span></p>)}
      <h4 className="bp-h">What to expect</h4>
      <Lines items={[
        a.expectation.timeline, a.expectation.strength,
        a.expectation.muscleKgPerMonth[1] > 0 ? `Muscle gain: roughly ${a.expectation.muscleKgPerMonth[0]} to ${a.expectation.muscleKgPerMonth[1]} kg a month at your level and goal.` : "Muscle gain is small while eating less. Holding your muscle is the win.",
        `Sleep ${a.recovery.sleepHours} hours and take ${a.recovery.fullRestDaysPerWeek} full rest day${a.recovery.fullRestDaysPerWeek > 1 ? "s" : ""} a week. ${a.recovery.note}`,
        a.expectation.caution,
      ]} />
      {a.warnings.map((w, i) => <p key={i} className="bp-note">{w}</p>)}
    </div>
  );
}

function Swap({ s }) {
  return <li><b>{s.name}</b> <span className="bp-pill">{s.kind}</span><br /><span className="bp-muted">{s.hint}</span></li>;
}

const FEEL = [["easy", "😌 Easy"], ["good", "🙂 Good"], ["hard", "😮‍💨 Hard"]];
const PAIN = [["knee", "Knee"], ["back", "Back"], ["shoulder", "Shoulder"], ["wrist", "Wrist"], ["elbow", "Elbow"], ["dizzy", "Dizzy or chest pressure"]];
const REASONS = [["tired", "Tired"], ["busy", "No time"], ["sick", "Unwell"], ["pain", "Sore or hurt"], ["travel", "Travelling"]];
const ACTION_TEXT = { start: "Find your weight", addRep: "+1 rep", addWeight: "Heavier", harder: "Harder version", recover: "Recover", ease: "Lighter", };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function FormGuide({ f }) {
  if (!f) return null;
  return (
    <div className="bp-form">
      <p><b>Set up</b> {f.setup}</p>
      <p><b>Move</b> {f.move}</p>
      <p><b>Breathe</b> {f.breathe}</p>
      <p className="avoid"><b>Avoid</b> {f.avoid}</p>
    </div>
  );
}

/** One exercise: the picture, today's target (from what you did last time), the set logger, how to do it, and the swaps. */
function Exercise({ e, n, showSwaps, log, setLog, canLog }) {
  const sw = e.swaps;
  const t = e.next;
  const sets = e.setsToday || e.sets;
  const rows = log || [];
  const setRow = (i, k, v) => setLog(e.id, rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const unit = e.unit === "seconds" ? "sec" : "reps";
  return (
    <li className="bp-ex">
      <div className="bp-ex-top"><span className="bp-n">{n}</span><b>{e.name}</b></div>
      <ExercisePic ex={e} />
      {e.sets ? <div className="bp-badges"><span>{sets} sets</span><span>{e.reps}</span><span>rest {rest(e.restSec)}</span></div> : <div className="bp-badges"><span>{e.reps}</span></div>}
      {t && (
        <div className={`bp-target bp-t-${t.action}`}>
          <b>{ACTION_TEXT[t.action] || "Today"}{t.weightKg ? ` · ${t.weightKg} kg` : ""}{t.action !== "start" ? ` · ${t.reps} ${unit}` : ""}</b>
          <span>{t.note}</span>
          {t.last && <small>Last time: {t.last.reps} {unit}{t.last.weightKg ? ` at ${t.last.weightKg} kg` : ""}</small>}
        </div>
      )}
      {e.effortToday && <p className="bp-muted">{e.effortToday}</p>}
      <p className="bp-cue">{e.cue}</p>
      <FormGuide f={e.form} />
      {canLog && rows.length > 0 && (
        <div className="bp-log" role="group" aria-label={`Log ${e.name}`}>
          {rows.map((r, i) => (
            <div key={i} className="bp-log-row">
              <span>Set {i + 1}</span>
              {e.unit !== "seconds" && <label><input type="number" inputMode="decimal" min="0" step="0.5" value={r.weightKg} onChange={(ev) => setRow(i, "weightKg", ev.target.value)} aria-label={`Set ${i + 1} weight in kg`} /> kg</label>}
              <label><input type="number" inputMode="numeric" min="0" step="1" value={r.reps} onChange={(ev) => setRow(i, "reps", ev.target.value)} aria-label={`Set ${i + 1} ${unit}`} /> {unit}</label>
            </div>
          ))}
          <button type="button" className="bp-link" onClick={() => setLog(e.id, [...rows, { ...(rows[rows.length - 1] || { weightKg: "", reps: "" }) }].slice(0, 8))}>+ Add a set</button>
        </div>
      )}
      <details>
        <summary>How heavy, and what if the machine is busy</summary>
        <p className="bp-muted">{e.weightHint}</p>
        <p className="bp-muted">{e.progress}</p>
        {showSwaps && sw && (
          <>
            {sw.busy.length > 0 && <><h5 className="bp-h5">Machine busy or missing</h5><ul className="bp-lines">{sw.busy.map((x) => <Swap key={x.id} s={x} />)}</ul></>}
            {sw.dumbbellOnly && <><h5 className="bp-h5">Only dumbbells and a bench</h5><ul className="bp-lines"><Swap s={sw.dumbbellOnly} /></ul></>}
            {sw.home && <><h5 className="bp-h5">No equipment (home)</h5><ul className="bp-lines"><Swap s={sw.home} /></ul></>}
            {(sw.easier || sw.harder) && <p className="bp-muted">{sw.easier ? `Too hard? Try: ${sw.easier.name}. ` : ""}{sw.harder ? `Too easy? Try: ${sw.harder.name}.` : ""}</p>}
          </>
        )}
      </details>
    </li>
  );
}

const STATUS_ICON = { done: "✅", partial: "◐", extra: "✅", today: "💪", planned: "💪", spare: "·", skipped: "—", notdone: "○" };

/** "This week": how you are doing, what changed and why, and what you can accept with one tap. */
export function AdaptCard({ adapt, onApply, busy }) {
  if (!adapt) return null;
  const b = adapt.body;
  return (
    <div className="bp-card bp-adapt">
      <h3 className="bp-h0">{adapt.status.headline}</h3>
      <p className="bp-lead">{adapt.status.detail}</p>
      <p className="bp-note"><b>{adapt.phase.name}.</b> {adapt.phase.why}</p>
      <p className="bp-muted">{adapt.todayPlan.text}</p>
      {adapt.changes.length > 0 && (
        <details open>
          <summary>What changed this week, and why</summary>
          <ul className="bp-lines">{adapt.changes.map((c) => <li key={c.id}><b>{c.title}.</b> <span className="bp-muted">{c.detail}</span></li>)}</ul>
        </details>
      )}
      {adapt.suggestions.map((sg) => (
        <div key={sg.id} className={`bp-sugg${sg.level === "alert" ? " alert" : ""}`}>
          <b>{sg.title}</b><p className="bp-muted">{sg.detail} <i>{sg.why}</i></p>
          {sg.apply && <button type="button" className="bp-btn ghost" disabled={busy} onClick={() => onApply(sg.apply)}>Yes, update my plan</button>}
        </div>
      ))}
      <details>
        <summary>Is it working?</summary>
        <p className="bp-muted">{b.detail}</p>
        {b.ratePerWeekKg !== null && <p className="bp-muted">Weight trend: {b.ratePerWeekKg > 0 ? "+" : ""}{b.ratePerWeekKg} kg a week{b.waistChangeCm !== null ? ` · waist ${b.waistChangeCm > 0 ? "+" : ""}${b.waistChangeCm} cm over 5 weeks` : ""}{b.liftsTracked ? ` · ${b.liftsProgressing} of ${b.liftsTracked} lifts moving up` : ""}</p>}
        <p className="bp-muted">Cardio this week: {adapt.cardio.doneMin} of {adapt.cardio.targetMin} minutes (builds toward {adapt.cardio.fullTargetMin}).</p>
      </details>
    </div>
  );
}

const WAYS = [["gym", "🏋️ Gym"], ["home", "🏠 Home"], ["quick", "⏱️ Quick"]];

/** The Workout tab. Pick a day (today is already chosen), pick where you are, follow the list, log your sets, finish. */
export function Workout({ program, adapt, onLog, onApplySuggestion, busy }) {
  const today = (new Date().getDay() + 6) % 7;               // Monday = 0
  const [day, setDay] = useState(() => { const i = program.week.findIndex((x) => x.status === "today" || x.status === "planned"); return i >= 0 && program.week[today].status !== "today" ? i : today; });
  const [way, setWay] = useState("gym");
  const [logs, setLogs] = useState({});
  const [feel, setFeel] = useState("good");
  const [pain, setPain] = useState([]);
  const [skip, setSkip] = useState(false);
  const d = program.week[day] || program.week[0];
  const s = program.sessions.find((x) => x.id === d.sessionId);
  const ways = WAYS.filter(([id]) => id !== "home" || (s && s.homeBackup));
  const list = !s ? [] : way === "home" && s.homeBackup ? s.homeBackup.exercises : way === "quick" ? s.quick.exercises : s.exercises;
  const todayStr = ymd(new Date());
  const isFuture = d.date && d.date > todayStr;
  const finished = d.status === "done" || d.status === "extra" || d.status === "partial";
  const canLog = !!s && !finished && !isFuture;
  const setLog = (id, rows) => setLogs((x) => ({ ...x, [id]: rows }));
  const rowsFor = (e) => logs[e.id] || Array.from({ length: e.setsToday || e.sets || 1 }, () => ({ weightKg: e.next && e.next.weightKg ? e.next.weightKg : "", reps: e.next && e.next.action !== "start" ? e.next.reps : "" }));
  const submit = async (status) => {
    const exercises = list.map((e) => ({ id: e.id, name: e.name, slot: e.slot, sets: rowsFor(e).map((r) => ({ reps: e.unit === "seconds" ? 0 : Number(r.reps) || 0, seconds: e.unit === "seconds" ? Number(r.reps) || 0 : 0, weightKg: Number(r.weightKg) || 0 })).filter((r) => r.reps > 0 || r.seconds > 0) })).filter((e) => e.sets.length);
    const done = exercises.length;
    const st = status === "skipped" ? "skipped" : done >= Math.ceil(list.length * 0.6) ? "done" : "partial";
    const ok = await onLog({ date: d.date && d.date <= todayStr ? d.date : todayStr, today: todayStr, sessionId: d.sessionId, title: s ? s.title : "", way, status: st, feel: st === "skipped" ? "" : feel, pain: st === "skipped" ? [] : pain, phase: adapt ? adapt.phase.key : "", minutes: s ? (way === "quick" ? s.quick.minutes : s.minutes) : 0, exercises: st === "skipped" ? [] : exercises });
    if (ok) { setLogs({}); setPain([]); setSkip(false); }
  };
  const skipWith = async (reason) => {
    const ok = await onLog({ date: todayStr, today: todayStr, sessionId: d.sessionId, title: s ? s.title : "", way, status: "skipped", reason, phase: adapt ? adapt.phase.key : "", exercises: [] });
    if (ok) setSkip(false);
  };
  return (
    <>
      <AdaptCard adapt={adapt} onApply={onApplySuggestion} busy={busy} />
      <div className="bp-card">
        <div className="bp-week" role="list" aria-label="Your week">
          {program.week.map((x, i) => (
            <button key={x.day} type="button" role="listitem" className={`bp-wk ${DAY_CLASS[x.kind]}${i === day ? " sel" : ""}${x.status ? ` st-${x.status}` : ""}`} onClick={() => setDay(i)} aria-label={`${x.day}: ${x.label}${x.status ? `, ${x.status}` : ""}`}>
              <small>{i === today ? "Today" : x.day}</small><b>{STATUS_ICON[x.status] && x.kind === "train" ? STATUS_ICON[x.status] : x.kind === "train" ? "💪" : x.kind === "active" ? "🚶" : "😴"}</b>
            </button>
          ))}
        </div>
        <p className="bp-legend">✅ done &nbsp; 💪 planned &nbsp; ○ not done (it slides along) &nbsp; 🚶 easy cardio &nbsp; 😴 rest</p>
        {d.statusNote && <p className="bp-note">{d.statusNote}</p>}

        {!s && (
          <div>
            <h3 className="bp-h0">{d.kind === "active" ? "Easy cardio day" : "Rest day"}</h3>
            <p className="bp-lead">{program.active.restDay}</p>
            <p className="bp-note"><b>{program.active.minimumDay.title}.</b> {program.active.minimumDay.detail}</p>
            <h4 className="bp-h">Ideas for today</h4>
            <ul className="bp-lines">{program.active.menu.slice(0, 4).map((m) => <li key={m.id}><b>{m.name}</b> · about {m.kcal30} kcal in 30 min<br /><span className="bp-muted">{m.tip}</span></li>)}</ul>
          </div>
        )}

        {s && (
          <>
            <h3 className="bp-h0">{s.title}{finished ? " ✅" : ""}</h3>
            <p className="bp-muted">{way === "quick" ? `${s.quick.minutes} minutes. ${s.quick.format}` : way === "home" ? `${s.homeBackup.minutes} minutes. ${s.homeBackup.note}` : `About ${s.minutes} minutes. Do them in this order.`}</p>
            <div className="bp-tabs" role="tablist" aria-label="Where are you today?">
              {ways.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={way === id} className={`bp-tab${way === id ? " on" : ""}`} onClick={() => setWay(id)}>{label}</button>)}
            </div>
            {way === "gym" && <details className="bp-det"><summary>Warm-up (about 8 minutes)</summary><Lines items={s.warmup} /></details>}
            <ol className="bp-exlist">{list.map((e, i) => <Exercise key={e.id} e={e} n={i + 1} showSwaps={way === "gym"} log={canLog ? rowsFor(e) : null} setLog={setLog} canLog={canLog} />)}</ol>
            {way === "gym" && <details className="bp-det"><summary>Cool-down</summary><Lines items={s.cooldown} /></details>}
            {way === "gym" && <details className="bp-det"><summary>Gym is busy?</summary><Lines items={program.busyGym} /></details>}

            {canLog && (
              <div className="bp-finish">
                <h4 className="bp-h">How did it feel?</h4>
                <div className="bp-chips" role="radiogroup" aria-label="How did it feel">{FEEL.map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={feel === id} className={`bp-chip${feel === id ? " on" : ""}`} onClick={() => setFeel(id)}>{l}</button>)}</div>
                <h4 className="bp-h">Anything sore or odd? <small className="bp-muted">(optional)</small></h4>
                <div className="bp-chips" role="group" aria-label="Pain or discomfort">{PAIN.map(([id, l]) => <button key={id} type="button" role="checkbox" aria-checked={pain.includes(id)} className={`bp-chip${pain.includes(id) ? " on" : ""}`} onClick={() => setPain((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}>{l}</button>)}</div>
                <button type="button" className="bp-btn" disabled={busy} onClick={() => submit("done")}>{busy ? "Saving…" : "✔ Finish and log this session"}</button>
                {!skip ? <button type="button" className="bp-link" onClick={() => setSkip(true)}>Not today</button> : (
                  <div><p className="bp-muted">That is fine. Pick a reason so the plan adjusts the week:</p><div className="bp-chips">{REASONS.map(([id, l]) => <button key={id} type="button" className="bp-chip" disabled={busy} onClick={() => skipWith(id)}>{l}</button>)}</div></div>
                )}
              </div>
            )}
            {isFuture && <p className="bp-muted">This session is planned for {d.day}. You can log it on the day.</p>}
          </>
        )}
      </div>
    </>
  );
}

export function ActiveDays({ program }) {
  const a = program.active, c = program.cardio;
  return (
    <div>
      <p className="bp-muted">{a.restDay}</p>
      <p className="bp-note"><b>{a.minimumDay.title}.</b> {a.minimumDay.detail}</p>
      <h4 className="bp-h">Choose an activity</h4>
      <p className="bp-muted">Calories are for 30 minutes at your weight. A guide, not a promise.</p>
      <ul className="bp-lines">{a.menu.map((m) => <li key={m.id}><b>{m.name}</b> · about {m.kcal30} kcal <span className="bp-pill">{m.intensity}</span><br /><span className="bp-muted">{m.tip}</span></li>)}</ul>
      <h4 className="bp-h">Cardio plan</h4>
      <Lines items={[
        `Easy cardio: ${c.easy.perWeek} sessions of ${c.easy.minutes} minutes a week (about ${c.weeklyEasyMinutes} minutes)${c.startMinutes < c.weeklyEasyMinutes ? `. Start at ${c.startMinutes} and add 10 minutes a week.` : "."}`,
        `Easy pace: ${c.easy.talkTest} Roughly ${c.easy.zoneBpm[0]} to ${c.easy.zoneBpm[1]} beats a minute (maximum about ${c.maxHeartRateBpm}).`,
        c.intervals ? `Intervals: ${c.intervals.perWeek} a week. ${c.intervals.format}` : c.intervalsNote,
        `Steps: ${c.steps.toLocaleString()} a day.`,
        ...c.notes,
      ].filter(Boolean)} />
    </div>
  );
}

export function Progress({ program }) {
  const p = program.progression;
  return (
    <div>
      <p className="bp-muted"><b>{p.method}</b></p>
      <Lines items={p.rules} />
      <h4 className="bp-h">Your first {p.deloadEveryWeeks} weeks</h4>
      <Lines items={p.phases.map((x) => `Week ${x.weeks}: ${x.name}. ${x.note}`)} />
      <h4 className="bp-h">At home, with no heavier weights</h4>
      <Lines items={p.homeLadder} />
      <h4 className="bp-h">If you stall</h4>
      <Lines items={p.whenStuck} />
      <p className="bp-muted">{p.track}</p>
      <h4 className="bp-h">Weekly sets per muscle</h4>
      <p className="bp-muted">Hard sets a week against a sensible range for your level. Helper muscles count half.</p>
      {program.volume.map((v) => (
        <div key={v.group} className="bp-vol">
          <span>{GROUP[v.group]}</span>
          <div className="bp-bar" aria-hidden="true"><i className={v.status} style={{ width: `${Math.min(100, (v.weeklySets / Math.max(1, v.target[1])) * 100)}%` }} /></div>
          <small>{v.weeklySets} <span className="bp-muted">(aim {v.target[0]} to {v.target[1]})</span></small>
        </div>
      ))}
    </div>
  );
}

export function Safety({ items }) {
  return <>{items.map((s) => <p key={s.id} className={`bp-micro${s.level === "notice" ? " bp-notice" : ""}`}><b>{s.title}</b><br /><span className="bp-muted">{s.detail}</span></p>)}</>;
}
