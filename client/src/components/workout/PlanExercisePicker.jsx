// The exercise list for the workout planner: the same library the Exercise log uses (search, muscle chips, your own exercise),
// so planning a workout feels like logging one. Rows hold sets / reps / kg; the parent keeps the plain-text form
// ("Squat 3x8 @60") that the plan already stores, so nothing on the server changes.
import { useMemo, useState } from "react";
import { FILTERS, MUSCLE_LABEL, libraryList } from "../../data/workoutPlan";
import { mergeCatalog } from "../../utils/gymCatalog";
import { sortExercises } from "../../utils/exerciseDetail";
import { exercisesToText, parseExercises } from "../../utils/workoutPlanView";

const CATS = [...FILTERS.filter((c) => c !== "all"), "full body"];
const catLabel = (c) => MUSCLE_LABEL[c] || String(c).replace(/^./, (x) => x.toUpperCase());
const SHOW = 12;
const num = (v, max) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

export default function PlanExercisePicker({ value, onChange }) {
  const [rows, setRows] = useState(() => parseExercises(value).map((e) => ({ name: e.name, sets: String(e.sets || ""), reps: String(e.reps || ""), kg: String(e.kg || "") })));
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [more, setMore] = useState(false);

  const lib = useMemo(() => mergeCatalog(libraryList().map((it) => ({ id: it.id, name: it.name, cat: it.cat, unit: it.unit === "min" ? "min" : it.timed || it.unit === "sec" ? "sec" : String(it.cat).toLowerCase() === "cardio" ? "min" : "reps" })))
    .map((e) => ({ id: e.id, name: e.name, cat: String(e.cat).toLowerCase(), unit: e.unit, gear: e.gear || "" })), []);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = useMemo(() => (!words.length && !cat ? [] : sortExercises(lib.filter((e) => (!cat || e.cat === cat) && words.every((w) => e.name.toLowerCase().includes(w))), {})), [lib, cat, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = more ? hits : hits.slice(0, SHOW);
  const exact = hits.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  const push = (next) => { setRows(next); onChange(exercisesToText(next.map((r) => ({ name: r.name, sets: num(r.sets, 20), reps: num(r.reps, 200), kg: Number(r.kg) > 0 ? Math.min(1000, Number(r.kg)) : 0 })))); };
  const add = (e) => {
    const timed = e.unit === "min" || e.unit === "sec";
    push([...rows, { name: e.name.slice(0, 60), sets: timed && e.unit === "min" ? "1" : "3", reps: e.unit === "min" ? "20" : e.unit === "sec" ? "30" : "10", kg: "" }]);
    setQ(""); setCat(""); setMore(false);
  };
  const edit = (i, k, v) => push(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const remove = (i) => push(rows.filter((_, j) => j !== i));

  return (
    <div className="wpx">
      <span className="wpx-lab">Exercises (optional)</span>
      {rows.length > 0 && (
        <ul className="wpx-rows">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`}>
              <b>{r.name}</b>
              <label>Sets<input type="number" inputMode="numeric" min="0" max="20" value={r.sets} onChange={(e) => edit(i, "sets", e.target.value)} /></label>
              <label>Reps<input type="number" inputMode="numeric" min="0" max="200" value={r.reps} onChange={(e) => edit(i, "reps", e.target.value)} /></label>
              <label>kg<input type="number" inputMode="decimal" min="0" max="1000" value={r.kg} onChange={(e) => edit(i, "kg", e.target.value)} /></label>
              <button type="button" className="gl-btn gl-danger" aria-label={`Remove ${r.name}`} onClick={() => remove(i)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <label className="wpx-search"><span className="sr-only">Search exercises</span>
        <span aria-hidden="true">🔎</span>
        <input value={q} placeholder="Add an exercise: squat, plank, bench…" onChange={(e) => { setQ(e.target.value); setMore(false); }} />
        {q && <button type="button" aria-label="Clear" onClick={() => setQ("")}>✕</button>}
      </label>
      <div className="wpx-chips" aria-label="Muscle group">
        {CATS.map((c) => <button type="button" key={c} className={`gl-chip${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => { setCat(cat === c ? "" : c); setMore(false); }}>{catLabel(c)}</button>)}
      </div>
      {(words.length > 0 || cat) && (
        <ul className="wpx-results">
          {shown.map((e) => (
            <li key={e.id}><button type="button" onClick={() => add(e)} aria-label={`Add ${e.name}`}><span><b>{e.name}</b><small>{catLabel(e.cat)}{e.gear ? ` · ${e.gear}` : ""}{e.unit !== "reps" ? ` · ${e.unit === "sec" ? "timed" : "minutes"}` : ""}</small></span><i aria-hidden="true">＋</i></button></li>
          ))}
          {hits.length > SHOW && !more && <li><button type="button" onClick={() => setMore(true)}>Show all {hits.length}</button></li>}
          {!hits.length && <li className="wpx-none">No exercise matches “{q}”.</li>}
        </ul>
      )}
      {q.trim() && !exact && <button type="button" className="gl-btn gl-soft" onClick={() => add({ name: q.trim(), unit: "reps" })}>Use “{q.trim().slice(0, 60)}” as my own exercise</button>}
    </div>
  );
}
