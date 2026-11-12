// "My own plans": make a plan, add or delete its exercises day by day, switch to it, or delete the whole plan.
// The Smart program (built by the server from your progress) is a separate choice and is never edited here.
// All the rules live in utils/customPlans.js (pure and unit-tested); this file is only the screen.
import { useMemo, useState } from "react";
import { DAYS, FILTERS, MUSCLE_LABEL, libraryList } from "../../data/workoutPlan";
import { confirmAction } from "../../utils/confirm";
import { notify } from "../../utils/notify";
import { MAX_ITEMS, MAX_PLANS, addItem, addPlan, clearDay, moveItem, newPlan, planFromDays, removeItem, removePlan, renamePlan, setDayTitle, sourceFor, trainingDays, updateItem } from "../../utils/customPlans";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const catOf = (e) => (e.blockType === "sets" ? (e.targets && e.targets[0]) || "core" : e.cat || (e.targets && e.targets[0]) || "core");

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

function Picker({ have, onAdd, onClose }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const all = useMemo(() => libraryList().filter((e) => e.blockType === "sets" || e.blockType === "extra").map((e) => ({ id: e.id, name: e.name, cat: catOf(e), sets: e.sets || 3, reps: e.reps || "10-12" })), []);
  const taken = new Set(have.map((x) => x.id));
  const list = all.filter((e) => (cat === "all" || e.cat === cat) && (!q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="pp-pick">
      <div className="pp-head"><button type="button" className="secondary-button" onClick={onClose}>‹ Back to the day</button></div>
      <label className="pp-field"><span>Search exercises</span><input value={q} placeholder="Squat, row, plank…" onChange={(e) => setQ(e.target.value)} /></label>
      <div className="pp-chips">{FILTERS.map((c) => <button key={c} type="button" className={`chip${cat === c ? " active" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c === "all" ? "All" : MUSCLE_LABEL[c] || c}</button>)}</div>
      <ul className="pp-pick-list">
        {list.slice(0, 60).map((e) => (
          <li key={e.id}><button type="button" disabled={taken.has(e.id)} onClick={() => { onAdd(e); notify(`${e.name} added`, "success"); }}><span><b>{e.name}</b><small> {MUSCLE_LABEL[e.cat] || e.cat} · {e.sets} × {e.reps}</small></span><span aria-hidden="true">{taken.has(e.id) ? "✓" : "＋"}</span></button></li>
        ))}
      </ul>
      {list.length > 60 && <p className="wp-muted wp-small">Showing 60 of {list.length}. Type to narrow it down.</p>}
      {!list.length && <p className="wp-muted">No exercise matches.</p>}
    </div>
  );
}

export { sourceFor };
