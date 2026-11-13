// "My own plans": pick a ready-made plan (every day already has a warm-up, a main workout and a cool-down) or start blank,
// then add, change or delete exercises day by day. Calories and minutes are worked out live from your sets, reps and body weight.
// The Smart program (built by the server from your progress) is a separate choice and is never edited here.
// All the rules live in utils/customPlans.js and utils/planKit.js (pure and unit-tested); this file is only the screen.
import { useMemo, useState } from "react";
import { DAYS, FILTERS, MUSCLE_LABEL, libraryList } from "../../data/workoutPlan";
import { GYM_CATALOG } from "../../utils/gymCatalog";
import { pickerList, sortExercises } from "../../utils/exerciseDetail";
import { lookupExercise } from "../../utils/exerciseLookup";
import { FigThumb } from "./bits";
import { confirmAction } from "../../utils/confirm";
import { notify } from "../../utils/notify";
import { COOL, TEMPLATES, WARM, dayEstimate, kitKcal, mainKcal, suggestWarmCool, templateDays, weekKcal } from "../../utils/planKit";
import { MAX_ITEMS, MAX_KIT, MAX_PLANS, addItem, addKit, addPlan, clearDay, copyDay, moveItem, newPlan, planFromDays, planFromTemplate, removeItem, removeKit, removePlan, renamePlan, setDayTitle, setWarmCool, sourceFor, trainingDays, updateItem, updateKit } from "../../utils/customPlans";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KEYWORDS = [[/leg|quad|calf|squat/i, "t-legs"], [/push|pull|ppl/i, "t-ppl"], [/upper|lower|split/i, "t-ul"], [/full/i, "t-fb"], [/fat|cut|loss|lean|burn/i, "t-fat"], [/glute|butt|tone/i, "t-glute"], [/home|bodyweight|no equip/i, "t-home"]];
const guessTemplate = (name) => { const hit = KEYWORDS.find(([re]) => re.test(name)); return hit ? hit[1] : null; }; // typing "leg" picks Leg day until you choose one yourself
const lib = (id, item) => lookupExercise(id, item);

export default function PersonalPlans({ st, setSt, activeId, onUse, weightKg }) {
  const kg = Number(weightKg) > 0 ? Number(weightKg) : 70;
  const plans = st.plans || [];
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("t-fb");        // a template id, "blank", or "classic"
  const [chosen, setChosen] = useState(false);   // true once the person taps a card themselves
  const editing = plans.find((p) => p.id === editId) || null;
  const setPlans = (fn) => setSt((s) => ({ ...s, plans: fn(s.plans || []) }));

  // per-session averages for the template cards (computed once per body weight)
  const cards = useMemo(() => TEMPLATES.map((t) => {
    const days = templateDays(t, lib), est = days.map((d) => dayEstimate(d, kg, lib));
    const avg = (k) => Math.round(est.reduce((n, e) => n + e[k], 0) / Math.max(1, est.length));
    return { t, days: days.length, min: avg("totalMin"), kcal: avg("totalKcal") };
  }), [kg]);

  const onName = (v) => { setName(v); if (!chosen) { const g = guessTemplate(v); if (g) setTpl(g); } };
  const pickTpl = (id) => { setTpl(id); setChosen(true); };
  const create = () => {
    if (plans.length >= MAX_PLANS) { notify(`You can keep up to ${MAX_PLANS} plans. Delete one first.`, "info"); return; }
    const t = TEMPLATES.find((x) => x.id === tpl);
    const nm = name.trim() || (t ? t.name : "My plan");
    const p = t ? planFromTemplate(t.id, nm, lib) : tpl === "classic" ? planFromDays(nm, DAYS) : newPlan(nm);
    setPlans((list) => addPlan(list, p));
    setName(""); setChosen(false); setTpl("t-fb"); setEditId(p.id);
    if (t) notify(`${t.name} is ready. Change anything you like.`, "success");
  };
  const del = async (p) => {
    if (!(await confirmAction(`“${p.name}” will be deleted. Workouts you already logged stay in History.`, { title: "Delete this plan?", confirmText: "Delete", cancelText: "Keep it" }))) return;
    setPlans((list) => removePlan(list, p.id));
    if (editId === p.id) setEditId(null);
    if (activeId === p.id) setSt((s) => ({ ...s, source: "auto" })); // the plan you were using is gone: back to Smart (or Classic if Smart is not ready)
  };

  if (editing) return <Editor plan={editing} kg={kg} setPlans={setPlans} onDone={() => setEditId(null)} onUse={() => { onUse(editing.id); setEditId(null); }} active={activeId === editing.id} />;

  const selected = TEMPLATES.find((x) => x.id === tpl);
  return (
    <section className="wp-card pp-card">
      <h3 className="wp-h">My own plans</h3>
      <p className="wp-muted wp-small">Pick a ready-made plan or start blank. Every training day has a warm-up, a main workout and a cool-down, and you can change all of it. Weights step up by themselves when you reach the top of your rep range. The Smart program stays separate and adjusts from your progress.</p>
      {plans.length === 0 && <p className="wp-muted">No plans yet. Choose one below to start.</p>}
      <ul className="pp-list">
        {plans.map((p) => {
          const n = trainingDays(p).length;
          return (
            <li key={p.id} className={`pp-row${activeId === p.id ? " on" : ""}`}>
              <div className="pp-row-t"><b>{p.name}</b><small>{n} training day{n === 1 ? "" : "s"}{n ? ` · about ${weekKcal(p, kg, lib)} kcal a week` : ""}{activeId === p.id ? " · in use" : ""}</small></div>
              <div className="pp-row-a">
                {activeId !== p.id && <button type="button" className="secondary-button" onClick={() => onUse(p.id)}>Use</button>}
                <button type="button" className="secondary-button" onClick={() => setEditId(p.id)}>Edit</button>
                <button type="button" className="secondary-button pp-del" aria-label={`Delete ${p.name}`} onClick={() => del(p)}>🗑</button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="pp-new">
        <h4 className="pp2-h">Create a plan</h4>
        <label className="pp-field"><span>Plan name</span><input value={name} maxLength={40} placeholder={selected ? selected.name : "My plan"} onChange={(e) => onName(e.target.value)} /></label>
        <div className="pp2-tpls" role="radiogroup" aria-label="Start from">
          {cards.map(({ t, days, min, kcal }) => (
            <button key={t.id} type="button" role="radio" aria-checked={tpl === t.id} className={`pp2-tpl${tpl === t.id ? " on" : ""}`} onClick={() => pickTpl(t.id)}>
              <span className="pp2-tpl-ic" aria-hidden="true">{t.icon}</span>
              <b>{t.name}</b>
              <small>{t.level}</small>
              <span className="pp2-tpl-b">{t.blurb}</span>
              <span className="pp2-tpl-m">{days} days · ~{min} min · ~{kcal} kcal a session</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={tpl === "blank"} className={`pp2-tpl${tpl === "blank" ? " on" : ""}`} onClick={() => pickTpl("blank")}>
            <span className="pp2-tpl-ic" aria-hidden="true">📝</span><b>Blank plan</b><small>Your own</small><span className="pp2-tpl-b">Start empty and add every exercise yourself. A warm-up and cool-down are suggested when you add your first exercise to a day.</span>
          </button>
          <button type="button" role="radio" aria-checked={tpl === "classic"} className={`pp2-tpl${tpl === "classic" ? " on" : ""}`} onClick={() => pickTpl("classic")}>
            <span className="pp2-tpl-ic" aria-hidden="true">📅</span><b>Copy of Classic 7-day</b><small>Beginner</small><span className="pp2-tpl-b">The fixed beginner plan as an editable copy, with its own warm-ups and cool-downs.</span>
          </button>
        </div>
        <button type="button" className="primary-button" onClick={create}>＋ Create {selected ? selected.name : tpl === "classic" ? "copy of Classic" : "blank plan"}</button>
      </div>
    </section>
  );
}

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

function Estimate({ est }) {
  const parts = [["warm", "Warm-up", est.warmMin, est.warmKcal], ["main", "Main workout", est.mainMin, est.mainKcal], ["cool", "Cool-down", est.coolMin, est.coolKcal]];
  const total = Math.max(1, est.totalMin);
  return (
    <div className="pp2-est" aria-label={`About ${est.totalMin} minutes and ${est.totalKcal} kilocalories`}>
      <div className="pp2-est-top"><span>⏱ <b>{fmtMin(est.totalMin)}</b></span><span>🔥 <b>≈ {est.totalKcal} kcal</b></span></div>
      <div className="pp2-bar" aria-hidden="true">{parts.map(([k,, m]) => <i key={k} className={`pp2-seg-${k}`} style={{ flexGrow: Math.max(0.04, m / total) }} />)}</div>
      <div className="pp2-legend">{parts.map(([k, l, m, c]) => <span key={k}><i className={`pp2-dot pp2-seg-${k}`} />{l} {m} min · {c} kcal</span>)}</div>
    </div>
  );
}

function Editor({ plan, kg, setPlans, onDone, onUse, active }) {
  const [dow, setDow] = useState(() => (plan.days.find((d) => d.items.length) || plan.days[0]).dow);
  const [pick, setPick] = useState(null); // null | "main" | "warm" | "cool"
  const day = plan.days.find((d) => d.dow === dow) || plan.days[0];
  const upd = (fn, ...a) => setPlans((list) => fn(list, plan.id, ...a));
  const est = dayEstimate(day, kg, lib);
  const clear = async () => { if (day.items.length && !(await confirmAction(`Remove every exercise from ${SHORT[dow - 1]}? It becomes a rest day.`, { title: "Clear this day?", confirmText: "Clear", cancelText: "Cancel" }))) return; upd(clearDay, dow); };
  const auto = () => { upd(setWarmCool, dow, suggestWarmCool(day.items, lib)); notify("Warm-up and cool-down matched to this day’s muscles.", "success"); };
  const onAddMain = (it) => {
    const first = day.items.length === 0 && day.warm.length === 0 && day.cool.length === 0; // first exercise on an empty day: suggest a warm-up and cool-down too
    upd(addItem, dow, it);
    if (first) upd(setWarmCool, dow, suggestWarmCool([it], lib));
  };
  const copyTo = (to) => { if (!to) return; upd(copyDay, Number(day.dow), Number(to)); setDow(Number(to)); notify(`Copied to ${SHORT[Number(to) - 1]}.`, "success"); };

  return (
    <section className="wp-card pp-card">
      <div className="pp-head">
        <button type="button" className="secondary-button" onClick={onDone}>‹ Plans</button>
        <input className="pp-name" aria-label="Plan name" value={plan.name} maxLength={40} onChange={(e) => setPlans((list) => renamePlan(list, plan.id, e.target.value))} />
      </div>
      <div className="wp-seg wide pp-days" role="tablist" aria-label="Day of the week">
        {plan.days.map((d) => <button key={d.dow} type="button" role="tab" aria-selected={d.dow === dow} className={d.dow === dow ? "on" : ""} onClick={() => { setDow(d.dow); setPick(null); }}>{SHORT[d.dow - 1]}{d.items.length ? ` · ${d.items.length}` : ""}</button>)}
      </div>

      {pick === "main" ? <Picker have={day.items} onAdd={onAddMain} onClose={() => setPick(null)} />
        : pick ? <KitPicker section={pick} have={day[pick]} onAdd={(k) => upd(addKit, dow, pick, k)} onClose={() => setPick(null)} />
        : (
          <>
            <label className="pp-field"><span>Name for this day (optional)</span><input value={day.title} maxLength={30} placeholder="Push, Legs, Upper…" onChange={(e) => upd(setDayTitle, dow, e.target.value)} /></label>
            {day.items.length > 0 && <Estimate est={est} />}
            {day.items.length === 0 && day.warm.length === 0 && day.cool.length === 0 && <p className="wp-muted">Rest day. Add an exercise to make this a training day. A warm-up and cool-down are suggested for you.</p>}

            <Section icon="🔥" title="Warm-up" sub={day.warm.length ? `${est.warmMin} min · ${est.warmKcal} kcal` : "Raise your heart rate and loosen the joints you will use."}>
              {day.warm.map((k) => <KitRow key={k.id} k={k} kg={kg} onDose={(v) => upd(updateKit, dow, "warm", k.id, v)} onDel={() => upd(removeKit, dow, "warm", k.id)} />)}
              <button type="button" className="pp2-add" disabled={day.warm.length >= MAX_KIT} onClick={() => setPick("warm")}>＋ Add warm-up move</button>
            </Section>

            <Section icon="🏋️" title="Main workout" sub={day.items.length ? `${est.mainMin} min · ${est.mainKcal} kcal` : "Pick the exercises. Sets and reps decide the calories."}>
              {day.items.map((it, i) => {
                const l = lib(it.id, it) || {};
                return (
                  <div key={it.id} className="pp2-ex">
                    <div className="pp2-ex-top">
                      <FigThumb ex={l.id ? l : it} size={44} />
                      <div className="pp2-ex-n"><b>{it.name}</b><small>≈ {mainKcal(it, kg, l)} kcal</small></div>
                      <div className="pp2-ex-mv">
                        <button type="button" className="secondary-button" aria-label={`Move ${it.name} up`} disabled={i === 0} onClick={() => upd(moveItem, dow, it.id, -1)}>↑</button>
                        <button type="button" className="secondary-button" aria-label={`Move ${it.name} down`} disabled={i === day.items.length - 1} onClick={() => upd(moveItem, dow, it.id, 1)}>↓</button>
                        <button type="button" className="secondary-button pp-del" aria-label={`Delete ${it.name}`} onClick={() => upd(removeItem, dow, it.id)}>🗑</button>
                      </div>
                    </div>
                    <div className="pp2-ex-f">
                      <div className="pp2-step" role="group" aria-label={`${it.name} sets`}>
                        <span>Sets</span>
                        <button type="button" aria-label="Fewer sets" disabled={it.sets <= 1} onClick={() => upd(updateItem, dow, it.id, { sets: it.sets - 1 })}>−</button>
                        <b>{it.sets}</b>
                        <button type="button" aria-label="More sets" disabled={it.sets >= 10} onClick={() => upd(updateItem, dow, it.id, { sets: it.sets + 1 })}>＋</button>
                      </div>
                      <label className="pp2-reps"><span>{it.unit === "min" ? "Minutes" : it.unit === "sec" ? "Seconds" : "Reps"}</span><input value={it.reps} aria-label={`${it.name} reps`} onChange={(e) => upd(updateItem, dow, it.id, { reps: e.target.value })} /></label>
                    </div>
                  </div>
                );
              })}
              <button type="button" className="pp2-add main" disabled={day.items.length >= MAX_ITEMS} onClick={() => setPick("main")}>＋ Add exercise</button>
            </Section>

            <Section icon="🧘" title="Cool-down" sub={day.cool.length ? `${est.coolMin} min · ${est.coolKcal} kcal` : "Bring your heart rate down and stretch what you trained."}>
              {day.cool.map((k) => <KitRow key={k.id} k={k} kg={kg} onDose={(v) => upd(updateKit, dow, "cool", k.id, v)} onDel={() => upd(removeKit, dow, "cool", k.id)} />)}
              <button type="button" className="pp2-add" disabled={day.cool.length >= MAX_KIT} onClick={() => setPick("cool")}>＋ Add stretch</button>
            </Section>

            <p className="wp-muted wp-small">Calories are an estimate from your sets, reps and body weight ({Math.round(kg)} kg). Lifting burns less than most machines claim; your real burn depends on effort and rest.</p>
            <div className="pp-actions">
              {day.items.length > 0 && <button type="button" className="secondary-button" onClick={auto}>✨ Match warm-up &amp; cool-down</button>}
              {day.items.length > 0 && (
                <label className="pp2-copy"><span className="sr-only">Copy this day to</span>
                  <select value="" onChange={(e) => copyTo(e.target.value)} aria-label="Copy this day to another day"><option value="">Copy day to…</option>{plan.days.filter((d) => d.dow !== dow).map((d) => <option key={d.dow} value={d.dow}>{SHORT[d.dow - 1]}{d.items.length ? " (replaces it)" : ""}</option>)}</select>
                </label>
              )}
              {day.items.length > 0 && <button type="button" className="secondary-button" onClick={clear}>Make rest day</button>}
              {!active && <button type="button" className="primary-button" onClick={onUse}>Use this plan</button>}
            </div>
          </>
        )}
    </section>
  );
}

function Section({ icon, title, sub, children }) {
  return (
    <div className="pp2-sec">
      <div className="pp2-sec-h"><span aria-hidden="true">{icon}</span><div><b>{title}</b><small>{sub}</small></div></div>
      <div className="pp2-sec-b">{children}</div>
    </div>
  );
}

function KitRow({ k, kg, onDose, onDel }) {
  return (
    <div className="pp2-kit">
      <div className="pp2-kit-n"><b>{k.name}</b><small>≈ {kitKcal(k, kg)} kcal</small></div>
      <input value={k.dose} maxLength={24} aria-label={`${k.name} amount`} onChange={(e) => onDose(e.target.value)} />
      <button type="button" className="secondary-button pp-del" aria-label={`Delete ${k.name}`} onClick={onDel}>🗑</button>
    </div>
  );
}

function KitPicker({ section, have, onAdd, onClose }) {
  const list = section === "cool" ? COOL : WARM;
  const taken = new Set(have.map((x) => x.id));
  return (
    <div className="pp-pick">
      <div className="pp-head"><button type="button" className="secondary-button" onClick={onClose}>‹ Back to the day</button><span className="wp-muted wp-small">{section === "cool" ? "Cool-down" : "Warm-up"} moves</span></div>
      <ul className="pp-pick-list">
        {list.map((k) => {
          const on = taken.has(k.id);
          return (
            <li key={k.id} className={`pp-pick-row${on ? " on" : ""}`}>
              <div className="pp-pick-main">
                <span className="pp2-kit-pick"><b>{k.name}</b><small>{k.dose} · ≈ {kitKcal(k, 70)} kcal</small><small className="pp2-steps-line">{k.steps[0]}</small></span>
                <button type="button" className="pp-pick-add" disabled={on} aria-label={on ? `${k.name} is already added` : `Add ${k.name}`} onClick={() => { onAdd({ id: k.id, name: k.name, dose: k.dose }); notify(`${k.name} added.`, "success"); }}>{on ? "✓" : "＋"}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
  const add = (e) => { onAdd({ id: e.id, name: e.name, cat: e.cat, unit: e.unit, sets: e.sets, reps: e.reps }); notify(`${e.name} added. Steps and picture come with it.`, "success"); };
  const addOwn = () => { const name = q.trim().slice(0, 60); add({ id: `custom:${slugOf(name)}`, name, cat: cat === "all" ? "other" : cat, unit: cat === "cardio" ? "min" : "reps", sets: cat === "cardio" ? 1 : 3, reps: cat === "cardio" ? "20" : "10-12" }); setQ(""); };
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
export { Editor as PlanEditor };
