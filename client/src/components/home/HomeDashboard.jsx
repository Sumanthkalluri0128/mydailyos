// Home. One screen, each number shown exactly once:
//   hero (greeting + scene carousel + coach) → five stat cards (with ＋ shortcuts) → nutrition · macros · habits → tasks · progress · scene.
// Everything on it is tappable: cards open their page, water/steps have quick-add sheets, habits and tasks tick off with a cheer.
import { useEffect, useMemo, useRef, useState } from "react";
import "./home.css";
import "../homefocus.css";
import HeroCarousel from "./HeroCarousel";
import OverDayCard from "../OverDayCard";
import FatLossCard from "../FatLossCard";
import FixMyDay from "./FixMyDay";
import HomeSection from "../HomeSection";
import { apiFetch } from "../../config/api";
import { dayBalance, expectedEnergy, macroTargets, limitTargets } from "../../utils/energy";
import { getLocalDate } from "../../utils/date";
import { notify } from "../../utils/notify";
import { useCountUp, fireConfetti, buzz } from "../../motion/motion";
import { ALL, dayChar, stickerFor } from "../../motion/chars";
import { getCtx, onCtx, refreshCtx } from "../../motion/ctxStore";
import { SCENES, sceneAt, todayIndex } from "./scenes";

const n0 = (v) => Math.round(Number(v) || 0);
const fmt = (v) => n0(v).toLocaleString();
const greet = (h) => (h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Good night");
const MEALS = [["breakfast", "Breakfast", "🌅"], ["lunch", "Lunch", "☀️"], ["dinner", "Dinner", "🌙"], ["snacks", "Snacks", "🍎"]];

/** A different full-body character in every slot, rotating by weekday so the page feels new each day. */
function useCast() {
  return useMemo(() => {
    const day = new Date().getDay();
    const lead = dayChar();
    const rest = ALL.filter((c) => c !== lead);
    const order = [lead, ...rest.slice((day * 3) % rest.length), ...rest.slice(0, (day * 3) % rest.length)];
    return (slot, scene, seed = 0) => stickerFor(order[slot % order.length], scene, seed).src;
  }, []);
}

function Peek({ src, className = "" }) { return src ? <img className={`pk ${className}`} src={src} alt="" aria-hidden="true" draggable="false" loading="lazy" decoding="async" /> : null; }

function Sheet({ title, onClose, children }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="sh-wrap" onClick={onClose}>
      <div className="sh" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sh-head"><b>{title}</b><button type="button" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function Ring({ pct, over, children }) {
  const r = 52, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, pct));
  return (
    <div className={`rg ${over ? "is-over" : ""}`}>
      <svg viewBox="0 0 130 130" aria-hidden="true">
        <defs><linearGradient id="rgGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7a45" /><stop offset=".55" stopColor="#c04bd8" /><stop offset="1" stopColor="#6847e8" /></linearGradient></defs>
        <circle cx="65" cy="65" r={r} className="rg-track" />
        <circle cx="65" cy="65" r={r} className="rg-arc" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - f)} transform="rotate(-90 65 65)" />
      </svg>
      <div className="rg-in">{children}</div>
    </div>
  );
}

function Gauge({ label, value, target, tone, icon, unit = "g", onClick }) {
  const r = 40, c = 2 * Math.PI * r, arc = c * 0.75, f = target ? Math.max(0, Math.min(1, value / target)) : 0;
  const shown = useCountUp(n0(value), 700);
  return (
    <button type="button" className={`gg tone-${tone}`} onClick={onClick} aria-label={`${label}: ${n0(value)} of ${n0(target)} ${unit}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="gg-track" strokeDasharray={`${arc} ${c}`} transform="rotate(135 50 50)" />
        <circle cx="50" cy="50" r={r} className="gg-fill" strokeDasharray={`${arc * f} ${c}`} transform="rotate(135 50 50)" />
      </svg>
      <span className="gg-in"><i aria-hidden="true">{icon}</i><strong>{shown}{unit}</strong><small>/{n0(target)}{unit}</small></span>
      <em>{label}</em>
    </button>
  );
}

function Bar({ label, icon, value, target, unit = "g", tone, limit, onClick }) {
  const f = target ? Math.min(1, value / target) : 0;
  return (
    <div className={`mb tone-${tone} ${limit && value > target ? "is-over" : ""}`}>
      <span>{icon} {label}{limit ? <small> (keep under)</small> : null}</span>
      <strong>{n0(value)} / {n0(target)}{unit}</strong>
      <i><b style={{ width: `${f * 100}%` }} /></i>
    </div>
  );
}

function Spark({ points }) {
  if (!points || points.length < 2) return <svg className="sp" viewBox="0 0 120 34" aria-hidden="true"><path d="M2 24 C 30 18, 60 28, 118 10" className="sp-line dim" /></svg>;
  const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  const xy = points.map((v, i) => [2 + (i / (points.length - 1)) * 116, 30 - ((v - lo) / span) * 26]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return <svg className="sp" viewBox="0 0 120 34" aria-hidden="true"><path d={`${d} L118 34 L2 34 Z`} className="sp-area" /><path d={d} className="sp-line" /><circle cx={lx} cy={ly} r="3" className="sp-dot" /></svg>;
}

export default function HomeDashboard({ profile, summary, activity, water, waterTarget, latestWeight, weightHistory, tasks, setTasks, habits, habitLogs, setHabitLogs, goTo, onAsk, syncTick, onChanged }) {
  const cast = useCast();
  const today = getLocalDate();
  const hour = new Date().getHours();
  const name = (profile?.name || "").split(" ")[0];

  // ---- one shared energy model (same numbers as mobile + server)
  const e = expectedEnergy(profile);
  const bal = dayBalance(profile, { eaten: summary?.calories, workout: Number(activity?.workoutCalories ?? 0), steps: Number(activity?.stepCalories || 0) });
  const macros = e ? macroTargets(e.calorieTarget, e.weightKg, e.direction, profile?.goals?.proteinTarget) : { protein: profile?.goals?.proteinTarget ?? 140, carbs: 250, fat: 70, fiber: 30 };
  const lim = limitTargets(bal.target || 2000);
  const over = bal.budget > 0 && bal.remaining < 0;
  const stepsT = profile?.goals?.stepsTarget ?? 10000;
  const exT = profile?.goals?.exerciseMinutesTarget ?? 30;
  const tw = profile?.goals?.targetWeightKg;
  const left = useCountUp(Math.abs(n0(bal.remaining)), 900);
  const waterL = useCountUp(n0(water?.totalMl), 800) / 1000;
  const stepsN = useCountUp(n0(activity?.steps), 800);
  const minsN = useCountUp(n0(activity?.totalMinutes), 700);

  const [sheet, setSheet] = useState(null);       // "water" | "steps" | "fix" | null

  // ---- coach: the one most important next step (same engine as Ask FlexFit)
  const [next, setNext] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/assistant/ask", { method: "POST", body: JSON.stringify({ question: "What should I do next?", today, hour }) })
      .then((r) => r.json()).then((d) => { if (alive && d?.success) setNext({ text: d.top || d.text.split("\n")[0], actions: d.actions || [] }); }).catch(() => {});
    return () => { alive = false; };
  }, [syncTick, summary?.calories, water?.totalMl]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = (a) => { if (/fix my day/i.test(a.label || "")) setSheet("fix"); else if (a.page) goTo(a.page); else if (a.ask) onAsk?.({ question: a.ask }); };
  const fallbackCoach = over ? "You're over today. Keep the rest light and take a walk after dinner."
    : !(summary?.meals?.breakfast > 0) && hour < 11 ? "Log breakfast to start the day strong!" : "Log what you eat as you go. I'll tell you what matters most.";
  const coach = { scene: over ? "sad" : "wave", title: hour < 12 ? "Fuel your morning" : "Your next step", text: next?.text || fallbackCoach, action: next?.actions?.[0] && { label: next.actions[0].label, onClick: () => act(next.actions[0]) } };

  // ---- quick-add sheets
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const addWater = async (ml) => {
    if (busy || !(ml > 0)) return; setBusy(true);
    try {
      const r = await apiFetch("/api/water", { method: "POST", body: JSON.stringify({ date: today, amountMl: ml }) });
      if (r.ok) { notify(`Added ${ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`} of water. 💧`, "success"); buzz(14); setSheet(null); setCustom(""); onChanged?.(); } else notify("Could not add water.", "error");
    } catch { notify("Could not add water.", "error"); } finally { setBusy(false); }
  };
  const addSteps = async (k) => {
    if (busy || !(k > 0)) return; setBusy(true);
    try {
      const total = n0(activity?.steps) + Math.round(k);
      const r = await apiFetch("/api/health", { method: "POST", body: JSON.stringify({ type: "steps", date: today, value: total, source: "manual" }) });
      if (r.ok) { notify(`Added ${Math.round(k).toLocaleString()} steps. 👟`, "success"); buzz(14); setSheet(null); setCustom(""); onChanged?.(); } else notify("Could not add steps.", "error");
    } catch { notify("Could not add steps.", "error"); } finally { setBusy(false); }
  };
  const openLog = (meal) => { try { sessionStorage.setItem("ff_log_meal", meal); } catch { /* ignore */ } goTo("foodLogger"); };

  // ---- habits + tasks
  const logFor = (h) => habitLogs.find((l) => l.habitId === h._id);
  const toggleHabit = async (h, ev) => {
    const done = logFor(h)?.completed || false;
    try {
      const r = await apiFetch("/api/habits/logs", { method: "POST", body: JSON.stringify({ habitId: h._id, date: today, completedValue: done ? 0 : h.target }) });
      const d = await r.json();
      if (d.success) { setHabitLogs((p) => (p.some((l) => l.habitId === h._id) ? p.map((l) => (l.habitId === h._id ? d.log : l)) : [...p, d.log])); if (!done) { fireConfetti({ from: ev.currentTarget, count: 40 }); buzz(12); } refreshCtx(true); }
    } catch { notify("Could not update the habit.", "error"); }
  };
  const toggleTask = async (t, ev) => {
    try {
      const r = await apiFetch(`/api/tasks/${t._id}/toggle`, { method: "PATCH" });
      const d = await r.json();
      if (d.success) { setTasks((p) => p.map((x) => (x._id === t._id ? { ...x, completed: d.task.completed } : x))); if (d.task.completed) { fireConfetti({ from: ev.currentTarget, count: 40 }); buzz(12); } refreshCtx(true); }
    } catch { notify("Could not update the task.", "error"); }
  };
  const [newTask, setNewTask] = useState("");
  const addTask = async (ev) => {
    ev.preventDefault();
    const title = newTask.trim(); if (!title) return;
    try {
      const r = await apiFetch("/api/tasks", { method: "POST", body: JSON.stringify({ title, date: today }) });
      const d = await r.json();
      if (d.success) { setTasks((p) => [...p, d.task]); setNewTask(""); notify("Task added.", "success"); } else notify(d.message || "Could not add the task.", "error");
    } catch { notify("Could not add the task.", "error"); }
  };
  const habitsDone = habits.filter((h) => logFor(h)?.completed).length;
  const tasksDone = tasks.filter((t) => t.completed).length;

  // ---- journey (level + quests)
  const [ctx, setCtx] = useState(getCtx());
  useEffect(() => { const off = onCtx(setCtx); refreshCtx(true); return off; }, [syncTick]);
  const lv = ctx?.level, q = ctx?.today;

  // ---- scene banner (second use of the pictures): a different scene every few seconds, tap to flip
  const [bn, setBn] = useState(() => (todayIndex() + 8) % SCENES.length);
  const bnRef = useRef(null);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setBn((i) => (i + 1) % SCENES.length); }, 9000); return () => clearInterval(t); }, []);
  const banner = sceneAt(bn);

  const wpts = useMemo(() => [...(weightHistory || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-14).map((w) => Number(w.weightKg)).filter(Number.isFinite), [weightHistory]);
  const wLeft = latestWeight != null && tw ? Math.abs(latestWeight - tw) : null;

  const open = (page) => (ev) => { if (ev.key && ev.key !== "Enter" && ev.key !== " ") return; if (ev.key) ev.preventDefault(); goTo(page); };

  return (
    <div className="hd">
      <HeroCarousel greeting={greet(hour)} name={name} dateText={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase()} coach={coach} onAsk={onAsk} />

      {/* ---------- stat cards: each number appears once, in its own card ---------- */}
      <section className="hd-stats" aria-label="Today at a glance">
        <article className="sc sc-cal" role="button" tabIndex={0} onClick={open("foodLogger")} onKeyDown={open("foodLogger")} aria-label={`Calories: ${fmt(Math.abs(bal.remaining))} ${over ? "over" : "left"}. Open food log`}>
          <Ring pct={bal.budget ? bal.eaten / bal.budget : 0} over={over}>
            <i aria-hidden="true">🔥</i><strong>{bal.budget ? left.toLocaleString() : "—"}</strong><span>{!bal.budget ? "Add body details" : over ? "kcal over" : "kcal left"}</span>
          </Ring>
          <ul className="sc-cal-list">
            <li><span className="ic g">🍴</span><div><small>Eaten</small><b>{fmt(bal.eaten)} kcal</b></div></li>
            <li><span className="ic b">🎯</span><div><small>Budget</small><b>{bal.budget ? fmt(bal.budget) : "—"} kcal</b></div></li>
            <li><span className="ic o">⚡</span><div><small>Activity</small><b>{fmt(bal.burned)} kcal</b></div></li>
          </ul>
          <span className="sc-cal-acts">
            <button type="button" className="sc-act" onClick={(e) => { e.stopPropagation(); goTo("foodLogger"); }}>＋ Log food</button>
            {over && <button type="button" className="sc-act warn" onClick={(e) => { e.stopPropagation(); setSheet("fix"); }}>Fix my day</button>}
          </span>
        </article>

        <article className="sc sc-water" role="button" tabIndex={0} onClick={open("water")} onKeyDown={open("water")}>
          <span className="ic b big">💧</span>
          <button type="button" className="sc-plus" aria-label="Add water" onClick={(e) => { e.stopPropagation(); setCustom(""); setSheet("water"); }}>＋</button>
          <div className="sc-val"><strong>{waterL.toFixed(2)} L</strong><small>of {(waterTarget / 1000).toFixed(1)} L</small></div>
          <i className="sc-bar"><b style={{ width: `${Math.min(100, ((water?.totalMl || 0) / (waterTarget || 1)) * 100)}%` }} /></i>
          <Peek src={cast(1, "drink")} />
        </article>

        <article className="sc sc-steps" role="button" tabIndex={0} onClick={open("health")} onKeyDown={open("health")}>
          <span className="ic o big">👟</span>
          <button type="button" className="sc-plus" aria-label="Add steps" onClick={(e) => { e.stopPropagation(); setCustom(""); setSheet("steps"); }}>＋</button>
          <div className="sc-val"><strong>{stepsN.toLocaleString()}</strong><small>steps</small></div>
          <i className="sc-bar"><b style={{ width: `${Math.min(100, ((activity?.steps || 0) / stepsT) * 100)}%` }} /></i>
          <small className="sc-goal">Goal: {fmt(stepsT)}</small>
          <Peek src={cast(2, "walk")} />
        </article>

        <article className="sc sc-ex" role="button" tabIndex={0} onClick={open("exercise")} onKeyDown={open("exercise")}>
          <span className="ic p big">🏋️</span>
          <div className="sc-val"><strong>{minsN} min</strong><small>Exercise</small></div>
          <i className="sc-bar"><b style={{ width: `${Math.min(100, ((activity?.totalMinutes || 0) / exT) * 100)}%` }} /></i>
          <small className="sc-goal">Goal: {exT} min</small>
          <Peek src={cast(3, "lift")} />
        </article>

        <article className="sc sc-w" role="button" tabIndex={0} onClick={open("weight")} onKeyDown={open("weight")}>
          <span className="ic v big">⚖️</span>
          <div className="sc-val"><strong>{latestWeight != null ? `${Number(latestWeight).toFixed(1)} kg` : "Add"}</strong>{tw ? <small>Target: {Number(tw).toFixed(1)} kg</small> : <small>Set a target in Profile</small>}</div>
          <Spark points={wpts} />
          {wLeft != null && <small className="sc-goal">{wLeft.toFixed(1)} kg to go</small>}
          <Peek src={cast(4, "scale")} />
        </article>
      </section>

      <OverDayCard onPlan={() => goTo("planner")} />

      {/* ---------- nutrition · macros · habits ---------- */}
      <section className="hd-mid">
        <div className="pn pn-nut">
          <header><span className="pn-ic v">🍽️</span><div><h2>Today's Nutrition</h2><p>Track everything you eat today.</p></div><button type="button" className="pn-btn" onClick={() => goTo("foodLogger")}>+ Add Food</button></header>
          <ul className="meals">
            {MEALS.map(([id, label, icon]) => {
              const k = n0(summary?.meals?.[id]);
              return (
                <li key={id}>
                  <button type="button" className="meal-row" onClick={() => openLog(id)} aria-label={`Add ${label}`}>
                    <span className="meal-ic" aria-hidden="true">{icon}</span>
                    <span className="meal-t"><b>{label}</b><small>{k > 0 ? "Food added" : "No food added"}</small></span>
                    <span className="meal-k">{k} kcal</span><span className="meal-plus" aria-hidden="true">+</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Peek src={cast(9, "chef")} className="pk-corner" />
        </div>

        <div className="pn pn-mac">
          <header><span className="pn-ic v">📊</span><div><h2>Macros Today</h2></div><button type="button" className="pn-btn ghost" onClick={() => goTo("progress")}>See Details</button></header>
          <div className="gauges">
            <Gauge label="Protein" icon="🥩" tone="protein" value={summary?.protein} target={macros.protein} onClick={() => goTo("foodLogger")} />
            <Gauge label="Carbs" icon="🌾" tone="carbs" value={summary?.carbohydrates} target={macros.carbs} onClick={() => goTo("foodLogger")} />
            <Gauge label="Fat" icon="🥑" tone="fat" value={summary?.fat} target={macros.fat} onClick={() => goTo("foodLogger")} />
          </div>
          <div className="mbs">
            <Bar label="Fibre" icon="🥬" tone="fibre" value={summary?.fiber || 0} target={macros.fiber} />
            <Bar label="Sugar" icon="🍬" tone="sugar" value={summary?.sugar || 0} target={lim.sugar} limit />
            {n0(summary?.sodium) > 0 && <Bar label="Sodium" icon="🧂" tone="sodium" value={summary.sodium} target={lim.sodiumMg} unit="mg" limit />}
          </div>
        </div>

        <div className="pn pn-hab">
          <header><span className="pn-ic b">🎯</span><div><h2>Today's Habits</h2><p>{habits.length ? `${habitsDone} of ${habits.length} done` : "Keep your daily habits consistent."}</p></div><button type="button" className="pn-btn ghost" onClick={() => goTo("habit")}>+ Habit</button></header>
          {habits.length === 0 ? <p className="empty">No habits yet. Add one and tick it off every day.</p> : (
            <ul className="chk">
              {habits.map((h) => {
                const l = logFor(h), done = !!l?.completed, v = l?.completedValue || 0;
                return (
                  <li key={h._id}>
                    <button type="button" className={`cb ${done ? "on" : ""}`} onClick={(ev) => toggleHabit(h, ev)} aria-pressed={done} aria-label={`${h.name}: ${done ? "done" : "not done"}`}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg></button>
                    <div className="chk-t"><span>{h.name}</span><i><b style={{ width: `${Math.min(100, (v / (h.target || 1)) * 100)}%` }} /></i></div>
                    <small>{v}/{h.target}{h.unit && h.unit !== "times" ? ` ${h.unit}` : ""}</small>
                  </li>
                );
              })}
            </ul>
          )}
          <Peek src={cast(10, "habit")} className="pk-corner" />
        </div>
      </section>

      {/* ---------- tasks · progress · scene ---------- */}
      <section className="hd-low">
        <div className="pn pn-task">
          <header><span className="pn-ic v">📋</span><div><h2>Today's Tasks</h2><p>{tasks.length ? `${tasksDone} of ${tasks.length} done` : "Stay on top of your day."}</p></div><button type="button" className="pn-btn ghost" onClick={() => goTo("task")}>All</button></header>
          {tasks.length === 0 ? <p className="empty"><b>No tasks for today.</b><br />Add a task to stay productive!</p> : (
            <ul className="chk">
              {tasks.slice(0, 5).map((t) => (
                <li key={t._id} className={t.completed ? "is-done" : ""}>
                  <button type="button" className={`cb ${t.completed ? "on" : ""}`} onClick={(ev) => toggleTask(t, ev)} aria-pressed={!!t.completed} aria-label={`${t.title}: ${t.completed ? "done" : "not done"}`}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg></button>
                  <div className="chk-t"><span>{t.title}</span></div>
                </li>
              ))}
              {tasks.length > 5 && <li className="more"><button type="button" onClick={() => goTo("task")}>+ {tasks.length - 5} more</button></li>}
            </ul>
          )}
          <form className="addrow" onSubmit={addTask}><input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task…" maxLength={120} aria-label="New task" /><button type="submit" disabled={!newTask.trim()}>+ Task</button></form>
          <Peek src={cast(11, "task")} className="pk-corner" />
        </div>

        <div className="pn pn-prog" role="button" tabIndex={0} onClick={() => goTo("goals")} onKeyDown={open("goals")} aria-label="Open Goals and Journey">
          <span className="pg-crown" aria-hidden="true">👑</span>
          <div className="pg-main">
            <h2>Your Progress</h2>
            <b className="pg-lv">{lv ? `Level ${lv.level} · ${lv.rank}` : "Level 1 · Rookie"}</b>
            <i className="pg-bar"><b style={{ width: `${Math.max(4, lv?.pct ?? 0)}%` }} /></i>
            <small>{q?.total ? `${q.done}/${q.total} quests done today` : "Set up your profile for daily quests"}</small>
            {q?.quests?.length > 0 && (
              <ul className="pg-q">{q.quests.slice(0, 4).map((x) => <li key={x.id || x.title} className={x.done ? "done" : ""}><span aria-hidden="true">{x.done ? "✔" : "○"}</span>{x.title}</li>)}</ul>
            )}
          </div>
          <Peek src={cast(12, "levelup")} className="pk-corner big" />
        </div>

        <div className="pn pn-scene" ref={bnRef} onClick={() => setBn((i) => (i + 1) % SCENES.length)} role="button" tabIndex={0} aria-label={`${banner.who} scene. Tap for the next one`} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && setBn((i) => (i + 1) % SCENES.length)}>
          <img className="bgb" src={banner.thumb} alt="" aria-hidden="true" />
          {SCENES.map((s, i) => (i === bn ? <img key={s.slug} className={`fg ${s.land ? "land" : "port"}`} src={s.src} alt={`${s.who}: ${s.line}`} loading="lazy" decoding="async" draggable="false" /> : null))}
        </div>
      </section>

      <HomeSection id="plan" icon="🧭" title="Plan & insights" summary="Your north star, reward milestones and weekly fat-loss score">
        <FatLossCard onOpen={() => goTo("goals")} syncTick={syncTick} />
      </HomeSection>

      {sheet === "fix" && (
        <Sheet title="Fix my day" onClose={() => setSheet(null)}>
          <FixMyDay over={Math.max(0, -n0(bal.remaining))} hour={hour} onChanged={onChanged} onPlan={() => goTo("planner")} onClose={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === "water" && (
        <Sheet title="Add water" onClose={() => setSheet(null)}>
          <div className="sh-chips">{[150, 250, 330, 500, 750, 1000].map((ml) => <button key={ml} type="button" disabled={busy} onClick={() => addWater(ml)}><span aria-hidden="true">💧</span>{ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`}</button>)}</div>
          <form className="sh-custom" onSubmit={(ev) => { ev.preventDefault(); addWater(Number(custom)); }}><input type="number" inputMode="numeric" min="1" max="5000" placeholder="Other amount (ml)" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom amount in millilitres" /><button type="submit" disabled={busy || !(Number(custom) > 0)}>Add</button></form>
        </Sheet>
      )}
      {sheet === "steps" && (
        <Sheet title="Add steps" onClose={() => setSheet(null)}>
          <p className="sh-note">You have {fmt(activity?.steps)} steps today. These are added on top.</p>
          <div className="sh-chips">{[500, 1000, 2000, 3000, 5000, 8000].map((k) => <button key={k} type="button" disabled={busy} onClick={() => addSteps(k)}><span aria-hidden="true">👟</span>+{k.toLocaleString()}</button>)}</div>
          <form className="sh-custom" onSubmit={(ev) => { ev.preventDefault(); addSteps(Number(custom)); }}><input type="number" inputMode="numeric" min="1" max="100000" placeholder="Other amount (steps)" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom number of steps" /><button type="submit" disabled={busy || !(Number(custom) > 0)}>Add</button></form>
        </Sheet>
      )}
    </div>
  );
}
