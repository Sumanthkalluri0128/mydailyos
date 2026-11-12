// Gym log (web): log exercises (sets x reps x weight), body weight and tape measurements, set a body goal and watch progress.
// The log is stored in this browser (utils/gymStore.js). Only each exercise (name, sets, minutes, estimated kcal) is also sent, by utils/gymSyncRunner.js, so Exercise and Home count the calories; other data leaves only through the
// Export tab, which downloads CSV / JSON files to your computer. Same maths as the phone app (utils/gymMath.js).
import { useEffect, useMemo, useState } from "react";
import "./gymlog.css";
import { libraryList, MUSCLE_LABEL, FILTERS } from "../data/workoutPlan";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import { confirmAction } from "../utils/confirm";
import * as G from "../utils/gymMath";
import { mergeCatalog } from "../utils/gymCatalog";
import { backupJson, bodyCsv, parseBackup, workoutsCsv } from "../utils/gymExport";
import { clearGym, gymId, removeBody, removeEntry, replaceGym, saveBody, saveEntry, saveGoal, saveProfile, useGymStore } from "../utils/gymStore";
import { downloadText, gymFileName, gymMime } from "../utils/gymDownload";

const KG_PER_LB = 0.45359237;
const toDisp = (kg, unit) => (unit === "lb" ? Math.round((kg / KG_PER_LB) * 10) / 10 : Math.round(kg * 10) / 10);
const fmtW = (kg, unit) => (kg === null || kg === undefined || !Number.isFinite(kg) ? "--" : `${toDisp(kg, unit)} ${unit}`);
const parseW = (text, unit) => { const n = G.parseNum(text, 0.1, 2000); return n === null ? null : Math.round((unit === "lb" ? n * KG_PER_LB : n) * 100) / 100; };
const inputStr = (kg, unit) => (kg > 0 ? String(Math.round(toDisp(kg, unit) * 100) / 100) : "");
const prettyDate = (d) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); };
const catLabel = (c) => MUSCLE_LABEL[c] || String(c).replace(/^./, (x) => x.toUpperCase());
const unitWord = (u) => (u === "sec" ? "Seconds" : u === "min" ? "Minutes" : "Reps");

function Card({ title, sub, right, children }) {
  return (
    <section className="gl-card">
      {title && <div className="gl-card-head"><h3>{title}</h3>{right}</div>}
      {sub && <p className="gl-muted gl-sub">{sub}</p>}
      {children}
    </section>
  );
}
const Btn = ({ children, onClick, kind = "soft", disabled, label }) => (
  <button type="button" className={`gl-btn gl-${kind}`} onClick={onClick} disabled={disabled} aria-label={label}>{children}</button>
);
const Chip = ({ active, onClick, children }) => <button type="button" className={`gl-chip ${active ? "is-on" : ""}`} aria-pressed={!!active} onClick={onClick}>{children}</button>;
function Field({ label, value, onChange, placeholder, inputMode = "decimal", type = "text" }) {
  return (
    <label className="gl-field"><span>{label}</span>
      <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
const Stat = ({ l, v, sub }) => <div className="gl-stat"><span className="gl-muted">{l}</span><b>{v}</b>{sub && <span className="gl-muted">{sub}</span>}</div>;
const Bar = ({ pct, done }) => <div className="gl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: done ? "var(--success)" : undefined }} /></div>;

function DateBar({ date, onChange }) {
  const t = getLocalDate();
  return (
    <div className="gl-datebar">
      <Btn label="Previous day" onClick={() => onChange(G.shiftDate(date, -1))}>‹</Btn>
      <button type="button" className="gl-datelabel" onClick={() => onChange(t)} aria-label="Jump to today">
        <b>{date === t ? "Today" : prettyDate(date)}</b>{date !== t && <small>Click for today</small>}
      </button>
      <Btn label="Next day" disabled={date >= t} onClick={() => onChange(G.shiftDate(date, 1))}>›</Btn>
    </div>
  );
}

/** Line chart: dots for readings, optional smoothed line, optional dashed goal line. Pure SVG; scales to the card width. */
function LineChart({ raw, trend, goal, fmt = (n) => String(Math.round(n * 10) / 10), color = "var(--primary)" }) {
  if (!raw.length) return null;
  const W = 640, H = 220, padL = 46, padR = 12, padT = 12, padB = 26;
  const xs = raw.map((p) => G.dayNum(p.date)), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const vals = [...raw.map((p) => p.value), ...(trend || []).map((p) => p.value), ...(goal ? [goal] : [])];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || Math.max(1, hi * 0.05)) * 0.12; lo -= pad; hi += pad;
  const X = (d) => padL + (x1 === x0 ? (W - padL - padR) / 2 : ((G.dayNum(d) - x0) / (x1 - x0)) * (W - padL - padR));
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = (pts) => pts.map((p) => `${X(p.date)},${Y(p.value)}`).join(" ");
  return (
    <svg className="gl-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chart of ${raw.length} readings, latest ${fmt(raw[raw.length - 1].value)}`}>
      {[lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((g, i) => (
        <g key={i}><line x1={padL} x2={W - padR} y1={Y(g)} y2={Y(g)} stroke="var(--border)" /><text x={padL - 6} y={Y(g) + 4} fontSize="11" fill="var(--text-muted)" textAnchor="end">{fmt(g)}</text></g>
      ))}
      {!!goal && <line x1={padL} x2={W - padR} y1={Y(goal)} y2={Y(goal)} stroke="var(--success)" strokeWidth="2" strokeDasharray="6 5" />}
      {trend && trend.length > 1 && <polyline points={line(trend)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />}
      {!trend && raw.length > 1 && <polyline points={line(raw)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />}
      {raw.map((p, i) => <circle key={i} cx={X(p.date)} cy={Y(p.value)} r={trend ? 3 : 4} fill={trend ? "var(--text-muted)" : color} opacity={trend ? 0.55 : 1} />)}
      <text x={padL} y={H - 6} fontSize="11" fill="var(--text-muted)">{prettyDate(raw[0].date)}</text>
      <text x={W - padR} y={H - 6} fontSize="11" fill="var(--text-muted)" textAnchor="end">{prettyDate(raw[raw.length - 1].date)}</text>
    </svg>
  );
}

// ------------------------------------------------------------------------------------------------ page
export default function GymLogPage({ onBack }) {
  const [tab, setTab] = useState("log");
  const TABS = [["log", "🏋️ Log"], ["body", "📏 Body"], ["progress", "📈 Progress"], ["export", "⬇️ Export"]];
  return (
    <div className="gl-page">
      {onBack && <button type="button" className="gl-back" onClick={onBack}>‹ Back</button>}
      <h2 className="gl-title">Gym log</h2>
      <p className="gl-muted gl-private">🔒 Body measurements and goals stay in this browser. Each exercise you log (name, sets, minutes, calories) is also sent so Exercise and Home can count it.</p>
      <div className="gl-tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`gl-tab ${tab === k ? "is-on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "log" ? <LogTab /> : tab === "body" ? <BodyTab /> : tab === "progress" ? <ProgressTab /> : <ExportTab />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ LOG
function LogTab() {
  const { entries, body, profile } = useGymStore();
  const unit = profile.unit;
  const [date, setDate] = useState(getLocalDate());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [more, setMore] = useState(false);
  const [pick, setPick] = useState(null);
  const [draft, setDraft] = useState([]);
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState(null);
  const [customUnit, setCustomUnit] = useState("reps");

  // The app's own library first, then the wider catalogue of common gym lifts, with no name listed twice.
  const lib = useMemo(() => mergeCatalog(libraryList().map((it) => ({ id: it.id, name: it.name, cat: it.cat, unit: it.unit === "min" ? "min" : it.timed || it.unit === "sec" ? "sec" : "reps" })))
    .map((e) => ({ id: e.id, name: e.name, cat: String(e.cat).toLowerCase(), unit: e.unit, gear: e.gear || "" })), []);
  const used = useMemo(() => G.exercisesUsed(entries), [entries]);
  const fmtKg = (kg) => fmtW(kg, unit);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rank = new Map(used.map((u, i) => [u.exId, i]));
    return lib.filter((e) => (cat === "all" || e.cat === cat) && (!s || e.name.toLowerCase().includes(s)))
      .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.name.localeCompare(b.name));
  }, [lib, q, cat, used]);
  const exact = list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  const choose = (p) => {
    const last = G.lastFor(entries, p.id, date);
    setPick(p); setNote(""); setEditId(null);
    setDraft(last ? last.sets.map((s) => ({ kg: inputStr(s.kg, unit), reps: String(s.reps) })) : [{ kg: "", reps: "" }, { kg: "", reps: "" }, { kg: "", reps: "" }]);
  };
  const edit = (e) => { setPick({ id: e.exId, name: e.name, cat: e.cat, unit: e.unit }); setDraft(e.sets.map((s) => ({ kg: inputStr(s.kg, unit), reps: String(s.reps) }))); setNote(e.note || ""); setEditId(e.id); };
  const cancel = () => { setPick(null); setDraft([]); setNote(""); setEditId(null); };
  const setRow = (i, patch) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const timed = pick ? G.isTimed(pick.unit) : false;
  const last = pick ? G.lastFor(entries, pick.id, date, editId || undefined) : null;

  const save = () => {
    const sets = [];
    for (const r of draft) {
      const reps = G.parseNum(r.reps, 1, 5000);
      if (!reps) continue;
      const kg = timed || !r.kg.trim() ? 0 : parseW(r.kg, unit);
      if (kg === null) { notify("A weight must be a number, or leave it blank for bodyweight.", "error"); return; }
      sets.push({ kg, reps: Math.round(reps * 10) / 10 });
    }
    if (!sets.length) { notify(`Fill in at least one set with ${unitWord(pick.unit).toLowerCase()}.`, "error"); return; }
    const entry = { id: editId || gymId("e"), date, exId: pick.id, name: pick.name, cat: pick.cat, unit: pick.unit, sets, note: note.trim() || undefined, at: editId ? entries.find((x) => x.id === editId)?.at || Date.now() : Date.now() };
    const pr = editId ? null : G.detectPRs(entries, entry)[0];
    if (!saveEntry(entry)) notify("Your browser would not save this (private mode or storage full). Download a backup.", "error");
    else notify(pr ? `New record on ${pick.name}: ${pr.kind === "weight" ? `${fmtKg(pr.value)} (was ${fmtKg(pr.prev)})` : pr.kind === "e1rm" ? `est. 1RM ${fmtKg(pr.value)}` : `${pr.value} ${pick.unit === "reps" ? "reps" : pick.unit}`}` : `${pick.name}: ${G.setsLine(entry, fmtKg)}`, "success");
    cancel();
  };
  const del = async (e) => { if (await confirmAction(`${e.name}: ${G.setsLine(e, fmtKg)}`, { title: "Delete this exercise?", confirmText: "Delete" })) removeEntry(e.id); };

  const dayList = entries.filter((e) => e.date === date).sort((a, b) => a.at - b.at);
  const ds = G.dayStats(entries, date);
  const wKnown = G.bodyKgOn(body, date), bodyKg = wKnown || G.DEFAULT_BODY_KG;
  const dayKcal = dayList.reduce((n, e) => n + G.entryKcal(e, bodyKg), 0);
  const draftSets = pick ? draft.map((r) => ({ kg: 0, reps: G.parseNum(r.reps, 1, 5000) || 0 })).filter((x) => x.reps > 0) : [];
  const draftKcal = pick && draftSets.length ? G.entryKcal({ id: "x", date, exId: pick.id, name: pick.name, cat: pick.cat, unit: pick.unit, sets: draftSets, at: 0 }, bodyKg) : 0;

  if (pick) {
    return (
      <Card title={pick.name} sub={`${catLabel(pick.cat)}${editId ? " · editing" : ""}`} right={<Btn onClick={cancel}>Cancel</Btn>}>
        {last && !editId && <p className="gl-muted">Last time ({prettyDate(last.date)}): {G.setsLine(last, fmtKg)}</p>}
        <div className="gl-sets">
          <div className="gl-sethead"><span>Set</span>{!timed && <span>{unit}</span>}<span>{unitWord(pick.unit)}</span><span /></div>
          {draft.map((r, i) => (
            <div className="gl-setrow" key={i}>
              <b>{i + 1}</b>
              {!timed && <input aria-label={`Set ${i + 1} weight`} inputMode="decimal" value={r.kg} placeholder={unit} onChange={(e) => setRow(i, { kg: e.target.value })} />}
              <input aria-label={`Set ${i + 1} ${unitWord(pick.unit)}`} inputMode="decimal" value={r.reps} placeholder={pick.unit === "reps" ? "reps" : pick.unit} onChange={(e) => setRow(i, { reps: e.target.value })} />
              <Btn kind="danger" label={`Remove set ${i + 1}`} onClick={() => setDraft((d) => (d.length > 1 ? d.filter((_, j) => j !== i) : d))}>✕</Btn>
            </div>
          ))}
        </div>
        <div className="gl-row">
          <Btn onClick={() => setDraft((d) => [...d, d.length ? { ...d[d.length - 1] } : { kg: "", reps: "" }])}>＋ Add set (copy last)</Btn>
        </div>
        {draftKcal > 0 && <p className="gl-muted">≈ {draftKcal} kcal burned{wKnown ? "" : ` (assuming ${G.DEFAULT_BODY_KG} kg: log your weight in Body for a closer number)`}</p>}
        <Field label="Note (optional)" value={note} onChange={setNote} placeholder="Felt strong, slow tempo…" inputMode="text" />
        <Btn kind="primary" onClick={save}>{editId ? "Save changes" : "Save exercise"}</Btn>
      </Card>
    );
  }
  const SHOW = 30, shown = more ? list : list.slice(0, SHOW);
  return (
    <>
      <DateBar date={date} onChange={setDate} />
      {dayList.length > 0 && (
        <Card title={date === getLocalDate() ? "Today’s workout" : "Workout"} sub={`${ds.exercises} exercise${ds.exercises === 1 ? "" : "s"} · ${ds.sets} sets${ds.volumeKg ? ` · ${fmtW(ds.volumeKg, unit)} lifted` : ""} · ≈ ${dayKcal} kcal burned${wKnown ? "" : ` (at ${G.DEFAULT_BODY_KG} kg)`}`}>
          {dayList.map((e) => (
            <div className="gl-li" key={e.id}>
              <button type="button" className="gl-li-main" onClick={() => edit(e)} aria-label={`Edit ${e.name}`}><b>{e.name}</b><span className="gl-muted">{G.setsLine(e, fmtKg)} · ≈ {G.entryKcal(e, bodyKg)} kcal{e.note ? ` · ${e.note}` : ""}</span></button>
              <Btn kind="danger" label={`Delete ${e.name}`} onClick={() => del(e)}>🗑</Btn>
            </div>
          ))}
        </Card>
      )}
      <Card title="Add an exercise" sub="Pick from the list. Your last numbers are filled in for you.">
        {used.length > 0 && !q && (
          <div className="gl-chips"><span className="gl-label">Recent</span>
            {used.slice(0, 8).map((u) => <Chip key={u.exId} onClick={() => choose(lib.find((x) => x.id === u.exId) || { id: u.exId, name: u.name, cat: u.cat, unit: u.unit })}>{u.name}</Chip>)}
          </div>
        )}
        <Field label="Search" value={q} onChange={(t) => { setQ(t); setMore(false); }} placeholder="Squat, plank, push-up…" inputMode="text" />
        <div className="gl-chips">{[...FILTERS, "full body"].map((c) => <Chip key={c} active={cat === c} onClick={() => { setCat(c); setMore(false); }}>{c === "all" ? "All" : catLabel(c)}</Chip>)}</div>
        {shown.map((e) => (
          <button key={e.id} type="button" className="gl-pickrow" onClick={() => choose(e)} aria-label={`Log ${e.name}`}>
            <span><b>{e.name}</b><span className="gl-muted"> {catLabel(e.cat)}{e.gear ? ` · ${e.gear}` : ""}</span></span><span className="gl-plus">＋</span>
          </button>
        ))}
        {list.length > SHOW && !more && <Btn onClick={() => setMore(true)}>Show all {list.length}</Btn>}
        {!list.length && <p className="gl-muted">No exercise matches “{q}”.</p>}
        {!!q.trim() && !exact && (
          <div className="gl-custom">
            <span className="gl-label">Not in the list? Add “{q.trim()}” as your own exercise</span>
            <div className="gl-chips">{[["reps", "Counted in reps"], ["sec", "Timed (seconds)"], ["min", "Timed (minutes)"]].map(([u, l]) => <Chip key={u} active={customUnit === u} onClick={() => setCustomUnit(u)}>{l}</Chip>)}</div>
            <Btn kind="primary" onClick={() => choose({ id: `custom:${q.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, name: q.trim().slice(0, 60), cat: cat === "all" ? "other" : cat, unit: customUnit })}>Use “{q.trim()}”</Btn>
          </div>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ BODY
function BodyTab() {
  const { body, profile } = useGymStore();
  const unit = profile.unit;
  const [date, setDate] = useState(getLocalDate());
  const [w, setW] = useState(""); const [bf, setBf] = useState(""); const [vals, setVals] = useState({}); const [note, setNote] = useState("");
  const [height, setHeight] = useState(profile.heightCm ? String(profile.heightCm) : "");
  const dayRec = body.find((b) => b.date === date);
  const key = dayRec ? `${dayRec.id}:${dayRec.at}:${unit}` : `none:${date}:${unit}`;
  useEffect(() => { // load the day's saved values into the form when the date (or the stored record) changes
    setW(dayRec?.weightKg ? String(Math.round(toDisp(dayRec.weightKg, unit) * 100) / 100) : ""); setBf(dayRec?.bodyFat ? String(dayRec.bodyFat) : "");
    const v = {}; if (dayRec) for (const s of G.SITES) if (dayRec.sites[s.key]) v[s.key] = String(dayRec.sites[s.key]);
    setVals(v); setNote(dayRec?.note || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const save = () => {
    const weightKg = w.trim() ? parseW(w, unit) : null;
    if (w.trim() && (weightKg === null || weightKg < 20 || weightKg > 400)) return notify("That does not look like a body weight.", "error");
    const fat = bf.trim() ? G.parseNum(bf, 2, 70) : null;
    if (bf.trim() && fat === null) return notify("Body fat should be between 2 and 70 %.", "error");
    const sites = {};
    for (const s of G.SITES) { const t = vals[s.key]; if (!t || !t.trim()) continue; const n = G.parseNum(t, 5, 300); if (n === null) return notify(`Check ${s.label.toLowerCase()}: measurements are in cm (for example 82.5).`, "error"); sites[s.key] = n; }
    if (weightKg === null && fat === null && !Object.keys(sites).length) return notify("Fill in at least one number.", "error");
    saveBody({ date, weightKg: weightKg ?? undefined, bodyFat: fat ?? undefined, sites, note: note.trim() || undefined }) ? notify("Saved. See the trend in Progress.", "success") : notify("Your browser would not save this. Download a backup.", "error");
  };
  const del = async (b) => { if (await confirmAction(prettyDate(b.date), { title: "Delete this entry?", confirmText: "Delete" })) removeBody(b.id); };
  const wPts = G.seriesOf(body, "weightKg"), latestW = wPts.length ? wPts[wPts.length - 1].value : undefined;
  const lw = G.latestOf(body, "waist")?.value, ln = G.latestOf(body, "neck")?.value, lh = G.latestOf(body, "hips")?.value;
  const loggedBf = G.latestOf(body, "bodyFat")?.value;
  const est = G.navyBodyFat({ sex: profile.sex, heightCm: profile.heightCm, waistCm: lw, neckCm: ln, hipCm: lh });
  const bmiV = G.bmi(latestW, profile.heightCm), lean = G.leanMassKg(latestW, loggedBf ?? est ?? undefined), wc = G.changeOf(wPts);
  const sorted = [...body].sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1));
  return (
    <>
      <DateBar date={date} onChange={setDate} />
      <Card title="Weigh-in" sub={`Fill in only what you measured. Weight in ${unit}, tape measurements in cm.${dayRec ? " Editing this day’s entry." : ""}`}>
        <div className="gl-grid2">
          <Field label={`Body weight (${unit})`} value={w} onChange={setW} placeholder={latestW ? String(toDisp(latestW, unit)) : unit} />
          <Field label="Body fat % (optional)" value={bf} onChange={setBf} placeholder={loggedBf ? String(loggedBf) : "%"} />
        </div>
        <h4 className="gl-h4">Tape measurements (cm)</h4>
        <div className="gl-grid2">
          {G.SITES.map((s) => <Field key={s.key} label={s.label} value={vals[s.key] || ""} onChange={(t) => setVals((v) => ({ ...v, [s.key]: t }))} placeholder={G.latestOf(body, s.key) ? String(G.latestOf(body, s.key).value) : "cm"} />)}
        </div>
        <Field label="Note (optional)" value={note} onChange={setNote} placeholder="Morning, fasted…" inputMode="text" />
        <Btn kind="primary" onClick={save}>{dayRec ? "Update this day" : "Save measurements"}</Btn>
      </Card>
      <Card title="About you" sub="Used for BMI and the body-fat estimate. Stays in this browser.">
        <span className="gl-label">Weight unit</span>
        <div className="gl-chips"><Chip active={unit === "kg"} onClick={() => saveProfile({ unit: "kg" })}>Kilograms (kg)</Chip><Chip active={unit === "lb"} onClick={() => saveProfile({ unit: "lb" })}>Pounds (lb)</Chip></div>
        <span className="gl-label">Sex (for the body-fat estimate)</span>
        <div className="gl-chips"><Chip active={profile.sex === "male"} onClick={() => saveProfile({ sex: "male" })}>Male</Chip><Chip active={profile.sex === "female"} onClick={() => saveProfile({ sex: "female" })}>Female</Chip></div>
        <Field label="Height (cm)" value={height} onChange={setHeight} placeholder="170" />
        <Btn onClick={() => { const h = G.parseNum(height, 80, 250); if (h) saveProfile({ heightCm: h }); else if (!height.trim()) saveProfile({ heightCm: undefined }); }}>Save height</Btn>
      </Card>
      {body.length > 0 && (
        <Card title="Where you are now" sub="From your latest readings.">
          <div className="gl-stats">
            {latestW !== undefined && <Stat l="Body weight" v={fmtW(latestW, unit)} sub={wc.sinceStart !== null ? `${wc.sinceStart > 0 ? "+" : ""}${toDisp(wc.sinceStart, unit)} ${unit} since first entry` : undefined} />}
            {bmiV !== null && <Stat l="BMI" v={String(bmiV)} sub="Rough guide only" />}
            {loggedBf !== undefined ? <Stat l="Body fat (logged)" v={`${loggedBf}%`} /> : est !== null ? <Stat l="Body fat (tape estimate)" v={`${est}%`} sub="US Navy method" /> : null}
            {lean !== null && <Stat l="Lean mass" v={fmtW(lean, unit)} />}
            {G.waistToHeight(lw, profile.heightCm) !== null && <Stat l="Waist ÷ height" v={String(G.waistToHeight(lw, profile.heightCm))} sub="Under 0.5 is a good aim" />}
            {G.waistToHip(lw, lh) !== null && <Stat l="Waist ÷ hips" v={String(G.waistToHip(lw, lh))} />}
          </div>
          {G.SITES.filter((s) => G.seriesOf(body, s.key).length).map((s) => { const pts = G.seriesOf(body, s.key), ch = G.changeOf(pts); return (
            <div className="gl-li" key={s.key}><b>{s.label}</b><span><b>{pts[pts.length - 1].value} cm</b>{ch.sinceStart ? <span className="gl-muted"> {ch.sinceStart > 0 ? "▲" : "▼"} {Math.abs(ch.sinceStart)} total</span> : null}</span></div>
          ); })}
        </Card>
      )}
      {sorted.length > 0 && (
        <Card title="History">
          {sorted.slice(0, 40).map((b) => (
            <div className="gl-li" key={b.id}>
              <button type="button" className="gl-li-main" onClick={() => setDate(b.date)}><b>{prettyDate(b.date)}</b><span className="gl-muted">{[b.weightKg ? fmtW(b.weightKg, unit) : "", b.bodyFat ? `${b.bodyFat}% fat` : "", Object.keys(b.sites).length ? `${Object.keys(b.sites).length} tape` : ""].filter(Boolean).join(" · ")}</span></button>
              <Btn kind="danger" label={`Delete ${prettyDate(b.date)}`} onClick={() => del(b)}>🗑</Btn>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ PROGRESS
function ProgressTab() {
  const { entries, body, goal, profile } = useGymStore();
  const unit = profile.unit, t = getLocalDate();
  const [metric, setMetric] = useState("weightKg");
  const [range, setRange] = useState(90);
  const [exId, setExId] = useState("");
  const [editing, setEditing] = useState(false);
  const [gw, setGw] = useState(""); const [gf, setGf] = useState(""); const [gd, setGd] = useState(""); const [gs, setGs] = useState({});
  const startEdit = () => {
    setGw(goal?.weightKg ? String(Math.round(toDisp(goal.weightKg, unit) * 100) / 100) : ""); setGf(goal?.bodyFat ? String(goal.bodyFat) : ""); setGd(goal?.targetDate || "");
    const v = {}; for (const s of G.SITES) if (goal?.sites[s.key]) v[s.key] = String(goal.sites[s.key]); setGs(v); setEditing(true);
  };
  const saveG = () => {
    const sites = {}; for (const s of G.SITES) { const n = G.parseNum(gs[s.key], 5, 300); if (n) sites[s.key] = n; }
    const weightKg = gw.trim() ? parseW(gw, unit) : null, bodyFat = gf.trim() ? G.parseNum(gf, 2, 70) : null;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(gd.trim()) && G.dayNum(gd.trim()) > G.dayNum(t);
    saveGoal({ startDate: goal?.startDate || t, targetDate: validDate ? gd.trim() : undefined, weightKg: weightKg || undefined, bodyFat: bodyFat || undefined, sites });
    setEditing(false); notify("Goal saved. Progress is measured from your first reading on or after the start date.", "success");
  };
  const ALL = ["weightKg", "bodyFat", ...G.SITES.map((s) => s.key)];
  const targetOf = (k) => (!goal ? undefined : k === "weightKg" ? goal.weightKg : k === "bodyFat" ? goal.bodyFat : goal.sites[k]);
  const progress = ALL.filter((k) => targetOf(k)).map((k) => G.goalProgress(body, k, targetOf(k), goal, t)).filter(Boolean);
  const fmtM = (k, v) => (k === "weightKg" ? fmtW(v, unit) : k === "bodyFat" ? `${G.round1(v)}%` : `${G.round1(v)} cm`);
  const dispRate = (k, r) => (k === "weightKg" ? `${toDisp(Math.abs(r), unit)} ${unit}` : k === "bodyFat" ? `${Math.abs(r)}%` : `${Math.abs(r)} cm`);

  const metrics = ALL.filter((k) => G.seriesOf(body, k).length);
  const m = metrics.includes(metric) ? metric : metrics[0];
  const cutoff = range ? G.shiftDate(t, -range) : "0000-00-00";
  const raw = m ? G.seriesOf(body, m).filter((p) => p.date >= cutoff) : [];
  const conv = (v) => (m === "weightKg" ? toDisp(v, unit) : v);
  const rawD = raw.map((p) => ({ ...p, value: conv(p.value) }));
  const trendD = raw.length > 2 ? G.trendOf(raw).map((p) => ({ ...p, value: conv(p.value) })) : undefined;
  const mGoal = m ? targetOf(m) : undefined;

  const week = G.weekStart(t), thisWeek = G.rangeStats(entries, week, G.shiftDate(week, 6)), lastWeek = G.rangeStats(entries, G.shiftDate(week, -7), G.shiftDate(week, -1));
  const kcalWeek = G.kcalIn(entries, body, week, G.shiftDate(week, 6)), kcalLast = G.kcalIn(entries, body, G.shiftDate(week, -7), G.shiftDate(week, -1));
  const weeks = G.weeklyDays(entries, t, 8), maxDays = Math.max(1, ...weeks.map((x) => x.days)), streak = G.loggingStreak(entries, t);
  const used = G.exercisesUsed(entries), exSel = exId && used.find((u) => u.exId === exId) ? exId : used[0]?.exId;
  const ser = exSel ? G.exerciseSeries(entries, exSel) : [], exInfo = used.find((u) => u.exId === exSel), exTimed = exInfo ? G.isTimed(exInfo.unit) : false, weighted = ser.some((p) => p.topKg > 0);
  const exPts = ser.map((p) => ({ date: p.date, value: exTimed ? p.topReps : weighted ? toDisp(p.e1rm || p.topKg, unit) : p.topReps }));
  const bestE = Math.max(0, ...ser.map((p) => p.e1rm)), bestKg = Math.max(0, ...ser.map((p) => p.topKg)), bestReps = Math.max(0, ...ser.map((p) => p.topReps)), totalVol = ser.reduce((n, p) => n + p.volumeKg, 0);
  return (
    <>
      <Card title="Your body goal" sub="Set where you want to get to. Progress is worked out here, in your browser." right={!editing ? <Btn onClick={startEdit}>{goal ? "Edit" : "Set goal"}</Btn> : null}>
        {editing ? (
          <>
            <div className="gl-grid2"><Field label={`Target weight (${unit})`} value={gw} onChange={setGw} placeholder={unit} /><Field label="Target body fat %" value={gf} onChange={setGf} placeholder="%" /></div>
            <Field label="Target date (optional)" type="date" inputMode="text" value={gd} onChange={setGd} />
            <h4 className="gl-h4">Target measurements (cm, optional)</h4>
            <div className="gl-grid2">{G.SITES.map((s) => <Field key={s.key} label={s.label} value={gs[s.key] || ""} onChange={(v) => setGs((o) => ({ ...o, [s.key]: v }))} placeholder="cm" />)}</div>
            <div className="gl-row"><Btn kind="primary" onClick={saveG}>Save goal</Btn><Btn onClick={() => setEditing(false)}>Cancel</Btn>{goal && <Btn kind="danger" onClick={() => { saveGoal(null); setEditing(false); }}>Remove goal</Btn>}</div>
          </>
        ) : !goal || !progress.length && !ALL.some((k) => targetOf(k)) ? (
          <p className="gl-muted">No goal yet. Click “Set goal” to add a target weight, body fat or measurements, then log your weigh-ins in the Body tab.</p>
        ) : (
          <>
            <p className="gl-muted">Started {prettyDate(goal.startDate)}{goal.targetDate ? ` · aiming for ${prettyDate(goal.targetDate)}` : ""}{!progress.length ? " · log a reading in the Body tab to see progress" : ""}</p>
            {progress.map((p) => (
              <div className="gl-goal" key={p.key}>
                <div className="gl-between"><b>{G.METRIC_LABEL[p.key]}</b><b style={{ color: p.reached ? "var(--success)" : undefined }}>{p.reached ? "Goal reached 🎉" : `${p.pct}%`}</b></div>
                <Bar pct={p.pct} done={p.reached} />
                <p className="gl-muted">{fmtM(p.key, p.start)} → now {fmtM(p.key, p.current)} → goal {fmtM(p.key, p.target)}</p>
                {!p.reached && <p className="gl-muted">{fmtM(p.key, Math.abs(p.remaining))} to go{p.ratePerWeek !== null ? ` · moving ${p.ratePerWeek === 0 ? "nowhere" : `${p.ratePerWeek < 0 ? "down" : "up"} ${dispRate(p.key, p.ratePerWeek)}/week`}` : " · log a few more readings over a week or more for a pace"}</p>}
                {!p.reached && p.etaDate && <p className="gl-strong">At this pace: around {prettyDate(p.etaDate)} (about {Math.max(1, Math.round(p.etaWeeks || 0))} weeks)</p>}
                {p.onTrack !== null && !p.reached && <p className={p.onTrack ? "gl-good" : "gl-warn"}>{p.onTrack ? "On track for your date" : `To hit your date you need about ${dispRate(p.key, p.neededPerWeek || 0)}/week`}</p>}
              </div>
            ))}
          </>
        )}
      </Card>
      <Card title="Body trend" sub={rawD.length ? "Dots are readings; the line smooths out day-to-day swings. Dashed green = goal." : "Log weight or measurements in the Body tab to see a chart."}>
        {metrics.length > 0 && (
          <>
            <div className="gl-chips">{metrics.map((k) => <Chip key={k} active={m === k} onClick={() => setMetric(k)}>{G.METRIC_LABEL[k]}</Chip>)}</div>
            <div className="gl-chips">{[[30, "30 days"], [90, "90 days"], [0, "All"]].map(([r, l]) => <Chip key={r} active={range === r} onClick={() => setRange(r)}>{l}</Chip>)}</div>
            {rawD.length ? <LineChart raw={rawD} trend={trendD} goal={mGoal ? conv(mGoal) : undefined} /> : <p className="gl-muted">No readings in this period.</p>}
          </>
        )}
      </Card>
      <Card title="Training" sub="From your gym log.">
        <div className="gl-stats">
          <Stat l="This week" v={`${thisWeek.days} day${thisWeek.days === 1 ? "" : "s"}`} sub={`${thisWeek.sets} sets · last week ${lastWeek.days}`} />
          <Stat l="Volume this week" v={fmtW(thisWeek.volumeKg, unit)} sub={lastWeek.volumeKg ? `last week ${fmtW(lastWeek.volumeKg, unit)}` : undefined} />
          <Stat l="Calories burned this week" v={`≈ ${kcalWeek} kcal`} sub={`last week ≈ ${kcalLast}${G.bodyKgOn(body, t) ? "" : " · at 70 kg"}`} />
          <Stat l="Logging streak" v={`${streak} day${streak === 1 ? "" : "s"}`} />
          <Stat l="Total logged" v={`${new Set(entries.map((e) => e.date)).size} workouts`} sub={`${entries.length} exercises`} />
        </div>
        <span className="gl-label">Training days per week</span>
        <div className="gl-weeks">{weeks.map((x, i) => <div key={x.start} className="gl-week" title={`Week of ${prettyDate(x.start)}: ${x.days} days`}><small>{x.days || ""}</small><i style={{ height: Math.max(3, (x.days / maxDays) * 54), background: i === weeks.length - 1 ? "var(--primary)" : "var(--primary-soft)" }} /></div>)}</div>
      </Card>
      <Card title="Exercise progress" sub={used.length ? "Estimated one-rep max over time (or best reps / time for bodyweight and timed moves)." : "Log some exercises to see your strength progress here."}>
        {used.length > 0 && (
          <>
            <div className="gl-chips">{used.slice(0, 14).map((u) => <Chip key={u.exId} active={exSel === u.exId} onClick={() => setExId(u.exId)}>{u.name}</Chip>)}</div>
            {exPts.length > 0 && <LineChart raw={exPts} color="var(--primary)" />}
            <div className="gl-stats">
              {!exTimed && bestKg > 0 && <Stat l="Heaviest set" v={fmtW(bestKg, unit)} />}
              {!exTimed && bestE > 0 && <Stat l="Best est. 1RM" v={fmtW(bestE, unit)} />}
              <Stat l={exInfo?.unit === "sec" ? "Longest hold" : exInfo?.unit === "min" ? "Longest session" : "Most reps in a set"} v={`${bestReps}${exInfo?.unit === "sec" ? " s" : exInfo?.unit === "min" ? " min" : ""}`} />
              {totalVol > 0 && <Stat l="Total volume" v={fmtW(totalVol, unit)} />}
            </div>
            <span className="gl-label">Recent sessions</span>
            {entries.filter((e) => e.exId === exSel).sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1)).slice(0, 6).map((e) => <div className="gl-li" key={e.id}><span className="gl-muted">{prettyDate(e.date)}</span><b>{G.setsLine(e, (k) => fmtW(k, unit))}</b></div>)}
          </>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ EXPORT
function ExportTab() {
  const gym = useGymStore();
  const [paste, setPaste] = useState("");
  const sets = gym.entries.reduce((n, e) => n + G.entrySetCount(e), 0);
  const go = (kind, text, what) => { try { downloadText(gymFileName(kind), text, gymMime(kind)); notify(`${what} downloaded.`, "success"); } catch { notify("Could not create the file. Try again.", "error"); } };
  const restore = async () => {
    const b = parseBackup(paste);
    if (!b) return notify("That is not a FlexFit gym backup. Paste the full text of the .json file.", "error");
    if (!(await confirmAction(`This replaces what is in this browser with the backup (${b.entries.length} exercises, ${b.body.length} body entries).`, { title: "Replace your gym log?", confirmText: "Restore" }))) return;
    replaceGym(b); setPaste(""); notify("Your gym log was restored from the backup.", "success");
  };
  const wipe = async () => { if (await confirmAction("This removes every logged exercise, measurement and goal from this browser. Download a backup first if you want to keep it.", { title: "Delete all gym log data?", confirmText: "Delete everything" })) { clearGym(); notify("The gym log is empty.", "success"); } };
  const none = !gym.entries.length && !gym.body.length;
  return (
    <>
      <Card title="Download your data" sub={`${gym.entries.length} exercises (${sets} sets) · ${gym.body.length} body entries`}>
        <p className="gl-muted">Files are made in your browser and saved to your Downloads folder.</p>
        <div className="gl-col">
          <Btn kind="primary" disabled={!gym.entries.length} onClick={() => go("workouts-csv", workoutsCsv(gym.entries, gym.body), "Your workout log")}>Workouts (CSV, one row per set)</Btn>
          <Btn kind="primary" disabled={!gym.body.length} onClick={() => go("body-csv", bodyCsv(gym.body, gym.profile), "Your body log")}>Body weight &amp; measurements (CSV)</Btn>
          <Btn kind="primary" disabled={none} onClick={() => go("backup-json", backupJson(gym), "Your backup")}>Full backup (JSON)</Btn>
        </div>
        <p className="gl-muted">Calories are estimates (MET-based, from your sets and body weight). CSV opens in Excel or Google Sheets. The JSON backup holds everything, including your goal, so you can restore it later.</p>
      </Card>
      <Card title="Restore from a backup" sub="Open your backup file, copy all of its text, paste it here.">
        <textarea className="gl-paste" aria-label="Backup text" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"app":"flexfit-gymlog", …}' rows={5} />
        <Btn kind="primary" disabled={!paste.trim()} onClick={restore}>Restore</Btn>
      </Card>
      <Card title="Privacy">
        <p className="gl-muted">Your gym log is stored only in this browser. It isn’t sent to the FlexFit server, isn’t in your account export and isn’t in server backups, so download a backup now and then. Clearing the site’s data erases it.</p>
        <Btn kind="danger" onClick={wipe}>Delete all gym log data</Btn>
      </Card>
    </>
  );
}
