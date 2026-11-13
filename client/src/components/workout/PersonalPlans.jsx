// "My own plans": make a plan, add or delete its exercises day by day, switch to it, or delete the whole plan.
// The Smart program (built by the server from your progress) is a separate choice and is never edited here.
// All the rules live in utils/customPlans.js (pure and unit-tested); this file is only the screen.
import { useMemo, useState } from "react";
import { DAYS, FILTERS, MUSCLE_LABEL, libraryList } from "../../data/workoutPlan";
import { GYM_CATALOG } from "../../utils/gymCatalog";
import { pickerList, sortExercises } from "../../utils/exerciseDetail";
import { lookupExercise } from "../../utils/exerciseLookup";
import { FigThumb } from "./bits";
import { confirmAction } from "../../utils/confirm";
import { notify } from "../../utils/notify";
import { MAX_ITEMS, MAX_PLANS, addItem, addPlan, clearDay, moveItem, newPlan, planFromDays, removeItem, removePlan, renamePlan, setDayTitle, sourceFor, trainingDays, updateItem } from "../../utils/customPlans";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PersonalPlans({ st, setSt, activeId, onUse }) {
  const plans = st.plans || [];
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [fromClassic, setFromClassic] = useState(false);
  const editing = plans.find((p) => p.id === editId) || null;
  const setPlans = (fn) => setSt((s) => ({ ...s, plans: fn(s.plans || []) }));

  const create = () => {
    if (plans.length >= MAX_PLANS) { notify(`You can keep up to ${MAX_PLANS} plans. Delete one first.`, "info"); return; }
    const p = fromClassic ? planFromDays(name || "My plan", DAYS) : newPlan(name || "My plan");
    setPlans((list) => addPlan(list, p));
    setName(""); setFromClassic(false); setEditId(p.id);
  };
  const del = async (p) => {
    if (!(await confirmAction(`“${p.name}” will be deleted. Workouts you already logged stay in History.`, { title: "Delete this plan?", confirmText: "Delete", cancelText: "Keep it" }))) return;
    setPlans((list) => removePlan(list, p.id));
    if (editId === p.id) setEditId(null);
    if (activeId === p.id) setSt((s) => ({ ...s, source: "auto" })); // the plan you were using is gone: back to Smart (or Classic if Smart is not ready)
  };

  if (editing) return <Editor plan={editing} setPlans={setPlans} onDone={() => setEditId(null)} onUse={() => { onUse(editing.id); setEditId(null); }} active={activeId === editing.id} />;

  return (
    <section className="wp-card pp-card">
      <h3 className="wp-h">My own plans</h3>
      <p className="wp-muted wp-small">Build your own week, pick the exercises for each day, and delete what you do not need. Weights step up by themselves when you reach the top of your rep range. The Smart program stays separate and adjusts from your progress.</p>
      {plans.length === 0 && <p className="wp-muted">No plans yet. Make your first one below.</p>}
      <ul className="pp-list">
        {plans.map((p) => (
          <li key={p.id} className={`pp-row${activeId === p.id ? " on" : ""}`}>
            <div className="pp-row-t"><b>{p.name}</b><small>{trainingDays(p).length} training day{trainingDays(p).length === 1 ? "" : "s"}{activeId === p.id ? " · in use" : ""}</small></div>
            <div className="pp-row-a">
              {activeId !== p.id && <button type="button" className="secondary-button" onClick={() => onUse(p.id)}>Use</button>}
              <button type="button" className="secondary-button" onClick={() => setEditId(p.id)}>Edit</button>
              <button type="button" className="secondary-button pp-del" aria-label={`Delete ${p.name}`} onClick={() => del(p)}>🗑</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="pp-new">
        <label className="pp-field"><span>New plan name</span><input value={name} maxLength={40} placeholder="Push / Pull / Legs" onChange={(e) => setName(e.target.value)} /></label>
        <label className="pp-check"><input type="checkbox" checked={fromClassic} onChange={(e) => setFromClassic(e.target.checked)} /> Start from a copy of the Classic 7-day plan</label>
        <button type="button" className="primary-button" onClick={create}>＋ Create plan</button>
      </div>
    </section>
  );
}

function Editor({ plan, setPlans, onDone, onUse, active }) {
  const [dow, setDow] = useState(() => (plan.days.find((d) => d.items.length) || plan.days[0]).dow);
  const [pick, setPick] = useState(false);
  const day = plan.days.find((d) => d.dow === dow) || plan.days[0];
  const upd = (fn, ...a) => setPlans((list) => fn(list, plan.id, ...a));
  const clear = async () => { if (day.items.length && !(await confirmAction(`Remove every exercise from ${SHORT[dow - 1]}? It becomes a rest day.`, { title: "Clear this day?", confirmText: "Clear", cancelText: "Cancel" }))) return; upd(clearDay, dow); };

  return (
    <section className="wp-card pp-card">
      <div className="pp-head">
        <button type="button" className="secondary-button" onClick={onDone}>‹ Plans</button>
        <input className="pp-name" aria-label="Plan name" value={plan.name} maxLength={40} onChange={(e) => setPlans((list) => renamePlan(list, plan.id, e.target.value))} />
      </div>
      <div className="wp-seg wide pp-days" role="tablist" aria-label="Day of the week">
        {plan.days.map((d) => <button key={d.dow} type="button" role="tab" aria-selected={d.dow === dow} className={d.dow === dow ? "on" : ""} onClick={() => { setDow(d.dow); setPick(false); }}>{SHORT[d.dow - 1]}{d.items.length ? ` · ${d.items.length}` : ""}</button>)}
      </div>

      {!pick ? (
        <>
          <label className="pp-field"><span>Name for this day (optional)</span><input value={day.title} maxLength={30} placeholder="Push, Legs, Upper…" onChange={(e) => upd(setDayTitle, dow, e.target.value)} /></label>
          {day.items.length === 0 ? <p className="wp-muted">Rest day. Add an exercise to make this a training day.</p> : (
            <ul className="pp-items">
              {day.items.map((it, i) => (
                <li key={it.id} className="pp-item">
                  <b>{it.name}</b>
                  <div className="pp-item-f">
                    <label>Sets<input inputMode="numeric" value={it.sets} aria-label={`${it.name} sets`} onChange={(e) => upd(updateItem, dow, it.id, { sets: e.target.value })} /></label>
                    <label>Reps<input value={it.reps} aria-label={`${it.name} reps`} onChange={(e) => upd(updateItem, dow, it.id, { reps: e.target.value })} /></label>
                    <button type="button" className="secondary-button" aria-label={`Move ${it.name} up`} disabled={i === 0} onClick={() => upd(moveItem, dow, it.id, -1)}>↑</button>
                    <button type="button" className="secondary-button" aria-label={`Move ${it.name} down`} disabled={i === day.items.length - 1} onClick={() => upd(moveItem, dow, it.id, 1)}>↓</button>
                    <button type="button" className="secondary-button pp-del" aria-label={`Delete ${it.name}`} onClick={() => upd(removeItem, dow, it.id)}>🗑</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="pp-actions">
            <button type="button" className="primary-button" disabled={day.items.length >= MAX_ITEMS} onClick={() => setPick(true)}>＋ Add exercise</button>
            {day.items.length > 0 && <button type="button" className="secondary-button" onClick={clear}>Make rest day</button>}
            {!active && <button type="button" className="secondary-button" onClick={onUse}>Use this plan</button>}
          </div>
        </>
      ) : <Picker have={day.items} onAdd={(it) => upd(addItem, dow, it)} onClose={() => setPick(false)} />}
    </section>
  );
}

const PAGE = 30;
const PICK_CATS = ["all", ...FILTERS.filter((c) => c !== "all"), "full body"];
const catName = (c) => (c === "all" ? "All" : c === "full body" ? "Full body" : MUSCLE_LABEL[c] || c);
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
let PICK_ALL = null; // built once: ~250 exercises (built-in library + wide gym catalogue), sorted by muscle group
const allPickable = () => PICK_ALL || (PICK_ALL = sortExercises(pickerList(libraryList(), GYM_CATALOG), {}));

function Picker({ have, onAdd, onClose }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState(null);   // id of the row whose steps are showing
  const [pages, setPages] = useState(1);
  const all = useMemo(allPickable, []);
  const taken = new Set(have.map((x) => x.id));
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => all.filter((e) => (cat === "all" || e.cat === cat) && (!needle || e.name.toLowerCase().includes(needle))), [all, cat, needle]);
  const shown = list.slice(0, PAGE * pages);
  const exact = list.some((e) => e.name.toLowerCase() === needle);
  const add = (e) => { onAdd({ id: e.id, name: e.name, cat: e.cat, sets: e.sets, reps: e.reps }); notify(`${e.name} added. Steps and picture come with it.`, "success"); };
  const addOwn = () => { const name = q.trim().slice(0, 60); add({ id: `custom:${slugOf(name)}`, name, cat: cat === "all" ? "other" : cat, sets: 3, reps: "10-12" }); setQ(""); };
  return (
    <div className="pp-pick">
      <div className="pp-head"><button type="button" className="secondary-button" onClick={onClose}>‹ Back to the day</button><span className="wp-muted wp-small">{all.length} exercises</span></div>
      <label className="pp-field"><span>Search exercises</span><input value={q} placeholder="Squat, row, plank…" onChange={(e) => { setQ(e.target.value); setPages(1); }} /></label>
      <div className="pp-chips">{PICK_CATS.map((c) => <button key={c} type="button" className={`chip${cat === c ? " active" : ""}`} aria-pressed={cat === c} onClick={() => { setCat(c); setPages(1); }}>{catName(c)}</button>)}</div>
      <ul className="pp-pick-list">
        {shown.map((e) => {
          const on = taken.has(e.id), d = open === e.id ? lookupExercise(e.id, e) : null;
          return (
            <li key={e.id} className={`pp-pick-row${on ? " on" : ""}`}>
              <div className="pp-pick-main">
                <button type="button" className="pp-pick-info" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <FigThumb ex={lookupExercise(e.id, e) || e} size={52} />
                  <span><b>{e.name}</b><small> {catName(e.cat)} · {e.unit === "min" ? `${e.reps} min` : e.unit === "sec" ? `${e.sets} × ${e.reps}s` : `${e.sets} × ${e.reps}`}{e.gear ? ` · ${e.gear}` : ""}</small></span>
                </button>
                <button type="button" className="pp-pick-add" disabled={on} aria-label={on ? `${e.name} is already on this day` : `Add ${e.name}`} onClick={() => add(e)}>{on ? "✓" : "＋"}</button>
              </div>
              {d && <ol className="pp-steps">{(d.steps || []).map((t, i) => <li key={i}>{t}</li>)}{d.avoid ? <li className="avoid">Avoid: {d.avoid}</li> : null}</ol>}
            </li>
          );
        })}
      </ul>
      {list.length > shown.length && <button type="button" className="secondary-button" onClick={() => setPages((n) => n + 1)}>Show {Math.min(PAGE, list.length - shown.length)} more ({list.length - shown.length} left)</button>}
      {!list.length && <p className="wp-muted">No exercise matches “{q}”.</p>}
      {needle && !exact && <button type="button" className="primary-button" onClick={addOwn}>＋ Add “{q.trim()}” as my own exercise</button>}
    </div>
  );
}

export { sourceFor };
