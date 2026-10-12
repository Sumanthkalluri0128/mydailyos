// The dashboard top section, laid out like the reference designs:
//   banner (scene + greeting + character + note)  ->  4 stat tiles overlapping its bottom edge  ->  cards in the order the theme lists.
// Every number is real and shown once (calories left, water, steps, exercise in the tiles; macros, weight and goals in their cards).
import { useEffect, useRef, useState } from "react";
import "./skins.css";
import Buddy from "../motion/Buddy";
import StreakFlame from "../motion/StreakFlame";
import { sprite } from "../motion/chars";
import { buzz, fireConfetti, useCelebrateOnce } from "../motion/motion";
import { apiFetch } from "../config/api";
import { dayBalance, expectedEnergy, macroTargets, limitTargets } from "../utils/energy";
import Scene from "./scenes";
import { useSkin } from "./skinStore";

const greeting = (h) => (h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Good night");
const n = (v) => Math.round(Number(v) || 0).toLocaleString();

/* ---------------- banner ---------------- */
function Banner({ skin, title, mode, shuffle, togglePin, streak, goTo }) {
  // The scene pictures already contain the character, so the separate sprite and the paper note only show without a picture.
  const [photo, setPhoto] = useState(null);
  useEffect(() => { setPhoto(null); }, [skin.id]);
  const hasPhoto = photo === true;
  return (
    <section className={`sk-banner${hasPhoto ? " has-photo" : ""}`} data-scene={skin.id} aria-label={`${skin.name} theme`}>
      <div className="sk-art" aria-hidden="true"><Scene id={skin.family} photo={skin.image} onPhoto={setPhoto} /></div>
      <div className="sk-copy">
        <h2>{title}<span aria-hidden="true"> {skin.emoji || "💜"}</span></h2>
        <p className="sk-sub">{skin.sub}</p>
        <span className="sk-chip">{skin.name} · {skin.tag}</span>
      </div>
      {!hasPhoto && <div className="sk-hero"><Buddy who={skin.char} scene={skin.scene} size={210} label={`${skin.name} character`} /></div>}
      {!hasPhoto && skin.family === "m-adventure" && <ul className="sk-signs" aria-hidden="true">{["Better Habits", "Stronger You", "New Levels"].map((t) => <li key={t}>{t}</li>)}</ul>}
      {!hasPhoto && skin.bannerNote && <aside className="sk-note"><span>{skin.bannerNote}</span></aside>}
      <div className="sk-tools">
        {streak && (
          <button type="button" className="streak-chip" onClick={() => goTo("progress")} aria-label={streak.current > 0 ? `${streak.current} day streak` : "Start a streak"}>
            {streak.current > 0 ? <StreakFlame streak={streak.current} compact bare /> : <span>🌱</span>}<strong>{streak.current}</strong>
          </button>
        )}
        <button type="button" className="sk-tool" onClick={shuffle} aria-label="Shuffle today's theme" title="Shuffle today's theme">🎲</button>
        <button type="button" className={`sk-tool${mode === "pin" ? " is-on" : ""}`} onClick={togglePin} aria-pressed={mode === "pin"}
          aria-label={mode === "pin" ? "Unlock theme (new theme every day)" : "Keep this theme every day"}
          title={mode === "pin" ? "Locked. Tap to get a new theme every day" : "Keep this theme every day"}>{mode === "pin" ? "📌" : "📍"}</button>
      </div>
    </section>
  );
}

/* ---------------- stat tiles ---------------- */
function Tiles({ tiles, goTo }) {
  return (
    <div className="sk-tiles">
      {tiles.map((t) => (
        <button key={t.key} type="button" className="sk-tile" onClick={() => goTo(t.page)} aria-label={`${t.label}: ${t.value} ${t.unit}${t.done ? ", goal reached" : ""}`}>
          <span className="sk-tile-ic" aria-hidden="true">{t.done ? "✅" : t.icon}</span>
          <span className="sk-tile-tx"><strong>{t.value}</strong><span>{t.unit}</span></span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- cards ---------------- */
function Card({ title, action, children, className = "" }) {
  return (
    <section className={`sk-card ${className}`}>
      <header><h3>{title}</h3>{action}</header>
      {children}
    </section>
  );
}

function Macros({ title, profile, summary, goTo, link }) {
  const e = expectedEnergy(profile);
  const m = e ? macroTargets(e.calorieTarget, e.weightKg, e.direction, profile?.goals?.proteinTarget) : { protein: profile?.goals?.proteinTarget ?? 140, carbs: 250, fat: 70, fiber: 30 };
  const lim = limitTargets(e ? e.calorieTarget : 2000);
  const rows = [
    ["🥩", "Protein", summary.protein, m.protein, "var(--protein)"],
    ["🍞", "Carbs", summary.carbohydrates, m.carbs, "#e8a23a"],
    ["🥑", "Fat", summary.fat, m.fat, "#d6577a"],
    ["🌾", "Fibre", summary.fiber || 0, m.fiber, "#7a9e3b"],
    ["🍬", "Sugar", summary.sugar || 0, lim.sugar, "#b57edc"],
  ];
  return (
    <Card title={title} action={link && <button type="button" className="sk-link" onClick={() => goTo("foodLogger")}>View Details</button>}>
      <ul className="sk-macros">
        {rows.map(([ic, label, v, t, c]) => (
          <li key={label}>
            <span className="sk-m-ic" aria-hidden="true">{ic}</span><span className="sk-m-l">{label}</span>
            <strong>{Math.round(v || 0)} / {Math.round(t)} g</strong>
            <i className="sk-m-bar"><b style={{ width: `${Math.min(100, t > 0 ? ((v || 0) / t) * 100 : 0)}%`, background: c }} /></i>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WeightCard({ weight, goTo }) {
  const pts = (weight.history || []).map((l) => Number(l.weightKg)).filter(Number.isFinite).slice(-30);
  const cur = Number.isFinite(weight.latest) ? weight.latest : pts[pts.length - 1];
  const W = 320, H = 96;
  let path = "", area = "", end = null;
  if (pts.length >= 2) {
    const lo = Math.min(...pts), hi = Math.max(...pts), sp = Math.max(hi - lo, 0.5);
    const xy = pts.map((v, i) => [10 + (i / (pts.length - 1)) * (W - 60), 12 + (1 - (v - lo) / sp) * (H - 34)]);
    path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    area = `${path} L${xy[xy.length - 1][0].toFixed(1)},${H} L${xy[0][0].toFixed(1)},${H} Z`;
    end = xy[xy.length - 1];
  }
  return (
    <Card title="Weight Progress" action={<button type="button" className="sk-link" onClick={() => goTo("weight")}>Log weight</button>}>
      <p className="sk-weight"><strong>{Number.isFinite(cur) ? cur.toFixed(1) : "--"}</strong><span> kg</span></p>
      <div className="sk-chart">
        {end ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Weight over your last entries">
            <defs><linearGradient id="skw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" /><stop offset="1" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
            <path d={area} fill="url(#skw)" /><path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : <p className="sk-empty">Log your weight on two days to see your line.</p>}
        {end && <span className="sk-badge" style={{ left: `${(end[0] / W) * 100}%`, top: `${(end[1] / H) * 100}%` }}>{cur.toFixed(1)} kg</span>}
      </div>
      <p className="sk-cap">{weight.hasGoal
        ? (weight.direction === "Maintain" ? "Maintaining your weight" : `${weight.remaining.toFixed(1)} kg to ${weight.direction.toLowerCase()} · target ${weight.target.toFixed(1)} kg`)
        : "Set a target weight in Profile to track your goal"}</p>
    </Card>
  );
}

function Checklist({ title, variant, d, goTo }) {
  const [planDone, setPlanDone] = useState(() => { try { return localStorage.getItem(`ff_plan_${d.today}`) === "1"; } catch { return false; } });
  const hi = Math.max(2, Math.round(d.waterTarget / 1000)), lo = Math.max(1, hi - 1);
  const water = { t: `Drink ${lo}-${hi}L water`, done: d.waterMl >= d.waterTarget, page: "water" };
  const workout = { t: "Do a workout", done: d.exerciseMin > 0, page: "exercise" };
  const steps = { t: `Walk ${n(d.stepsTarget)} steps`, done: d.steps >= d.stepsTarget, page: "health" };
  const items = variant === "goals"
    ? [water, { t: "Eat enough protein", done: d.protein >= d.proteinTarget * 0.9, page: "foodLogger" }, workout, steps, { t: "Log all meals", done: d.mealsAll, page: "foodLogger" }]
    : [{ t: "Plan meals for tomorrow", done: planDone, page: "planner", mark: true }, water, workout, steps, { t: "Log food", done: d.calories > 0, page: "foodLogger" }];
  return (
    <Card title={title}>
      <ul className="sk-checks">
        {items.map((it) => (
          <li key={it.t}>
            <button type="button" className={it.done ? "is-done" : ""} onClick={() => {
              if (it.mark) { try { localStorage.setItem(`ff_plan_${d.today}`, "1"); } catch { /* ignore */ } setPlanDone(true); }
              goTo(it.page);
            }}>
              <i aria-hidden="true">{it.done ? "✓" : ""}</i><span>{it.t}</span><span className="sr-only">{it.done ? " (done)" : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Quick({ goTo, quickWater, adding, waterOk }) {
  const acts = [
    ["Log Food", "goku", "eat", () => goTo("foodLogger")],
    [waterOk ? "Added!" : "Log Water", "naruto", "drink", () => quickWater(250)],
    ["Log Workout", "zoro", "workout", () => goTo("exercise")],
    ["Add Steps", "luffy", "walk", () => goTo("health")],
  ];
  return (
    <Card title="Quick Actions" className="sk-wide">
      <div className="sk-quick">
        {acts.map(([label, who, scene, fn]) => (
          <button key={label} type="button" disabled={adding && label.includes("Water")} onClick={fn}>
            <img src={sprite(who, scene)} alt="" width="84" height="84" loading="lazy" decoding="async" draggable="false" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Motto({ skin }) {
  return (
    <section className="sk-card sk-motto" aria-label="Motivation">
      <p>{skin.family === "m-dark" ? <>No limits.<br />Just progress. <span>💜</span></> : <>Same<br />Routine.<br />Bigger<br />Results.</>}</p>
      <img src={sprite(skin.char, skin.family === "m-dark" ? "powerup" : "idle")} alt="" width="150" height="150" loading="lazy" decoding="async" draggable="false" />
    </section>
  );
}

function Trail({ skin }) {
  const crew = [["goku", "Lv 1"], ["naruto", "Lv 5"], ["luffy", "Lv 10"], ["zoro", "Lv 20"]];
  return (
    <section className="sk-card sk-wide sk-trail" aria-label="Your journey">
      <b>Level up every day!</b>
      <div className="sk-path">
        {crew.map(([who, lv], i) => (
          <span key={who} className="sk-walker" style={{ left: `${6 + i * 22}%`, animationDelay: `${-i * 0.45}s` }}>
            <img src={sprite(who, "walk")} alt="" width="64" height="64" loading="lazy" decoding="async" draggable="false" /><em>{lv}</em>
          </span>
        ))}
        <span className="sk-chest" aria-hidden="true">🎁</span>
      </div>
    </section>
  );
}

/* ---------------- the whole section ---------------- */
export default function SkinDashboard({ profile, today, summary, activity, water, waterTarget, goTo, onChanged, streak, weight }) {
  const { skin, mode, shuffle, togglePin } = useSkin();
  const [adding, setAdding] = useState(false);
  const [waterOk, setWaterOk] = useState(false);
  const busy = useRef(false);

  const goals = profile?.goals || {};
  const stepsTarget = goals.stepsTarget ?? 10000;
  const exerciseTarget = goals.exerciseMinutesTarget ?? 30;
  const steps = Number(activity.steps || 0);
  const exerciseMin = Number(activity.totalMinutes || 0);
  const stepKcal = Number(activity.stepCalories || 0);
  const workoutKcal = Number(activity.workoutCalories ?? Math.max(0, Number(activity.caloriesBurned || 0) - stepKcal));
  const bal = dayBalance(profile, { eaten: summary.calories, workout: workoutKcal, steps: stepKcal });
  const over = bal.remaining < 0;
  const hour = new Date().getHours();
  const first = (profile?.name || "").trim().split(" ")[0];
  const e = expectedEnergy(profile);
  const proteinTarget = (e ? macroTargets(e.calorieTarget, e.weightKg, e.direction, goals.proteinTarget).protein : goals.proteinTarget) ?? 140;

  const tiles = [
    { key: "kcal", icon: "🔥", value: n(Math.abs(bal.remaining)), unit: over ? "kcal over" : "kcal left", label: "Calories", page: "foodLogger", done: false },
    { key: "water", icon: "💧", value: (water.totalMl / 1000).toFixed(1) + " L", unit: "Water", label: "Water", page: "water", done: waterTarget > 0 && water.totalMl >= waterTarget },
    { key: "steps", icon: "👟", value: n(steps), unit: "Steps", label: "Steps", page: "health", done: stepsTarget > 0 && steps >= stepsTarget },
    { key: "ex", icon: "🏃", value: `${exerciseMin} min`, unit: "Exercise", label: "Exercise", page: "exercise", done: exerciseTarget > 0 && exerciseMin >= exerciseTarget },
  ];
  // Jackpot: water, steps and exercise all closed (fires once per day).
  useCelebrateOnce("all-rings", tiles.slice(1).every((t) => t.done), () => { setTimeout(() => { fireConfetti({ count: 160, spread: Math.PI * 1.6 }); buzz([30, 60, 30, 60, 90]); }, 500); });

  const quickWater = async (amountMl = 250) => {
    if (busy.current) return;
    busy.current = true; setAdding(true);
    try {
      const res = await apiFetch("/api/water", { method: "POST", body: JSON.stringify({ date: today, amountMl }) });
      if (res.ok) { buzz([12, 30, 12]); setWaterOk(true); setTimeout(() => setWaterOk(false), 1100); onChanged?.(); }
    } finally { busy.current = false; setAdding(false); }
  };

  const checklist = {
    today, waterMl: water.totalMl, waterTarget, steps, stepsTarget, exerciseMin, calories: summary.calories || 0,
    protein: summary.protein || 0, proteinTarget, mealsAll: summary.meals?.breakfast > 0 && summary.meals?.lunch > 0 && summary.meals?.dinner > 0,
  };
  const render = (item) => {
    const spec = typeof item === "string" ? { k: item } : item;
    switch (spec.k) {
      case "nutrition": return <Macros key="nutrition" title="Today's Nutrition" profile={profile} summary={summary} goTo={goTo} link />;
      case "macros": return <Macros key="macros" title="Macros Today" profile={profile} summary={summary} goTo={goTo} />;
      case "weight": return <WeightCard key="weight" weight={weight} goTo={goTo} />;
      case "goals": return <Checklist key="goals" title="Today's Goals" variant="goals" d={checklist} goTo={goTo} />;
      case "tasks": return <Checklist key="tasks" title="Today's Tasks" variant="tasks" d={checklist} goTo={goTo} />;
      case "quick": return <Quick key="quick" goTo={goTo} quickWater={quickWater} adding={adding} waterOk={waterOk} />;
      case "motto": return <Motto key="motto" skin={skin} />;
      case "trail": return <Trail key="trail" skin={skin} />;
      default: return null;
    }
  };
  // "goals" in Adventure Journey is the task-style list (Plan meals / Drink / Workout / Steps / Log food), titled "Today's Goals".
  const rows = (skin.layout || []).map((row) => (Array.isArray(row) ? row : [row]));
  const goalsAsTasks = skin.family === "m-adventure";

  return (
    <div className="sk-dash">
      <Banner skin={skin} title={`${greeting(hour)}${first ? `, ${first}` : ""}!`} mode={mode} shuffle={shuffle} togglePin={togglePin} streak={streak} goTo={goTo} />
      <Tiles tiles={tiles} goTo={goTo} />
      {rows.map((row, i) => (
        <div key={i} className={`sk-row sk-row-${row.length}`}>
          {row.map((it) => (goalsAsTasks && it === "goals"
            ? <Checklist key="goals" title="Today's Goals" variant="tasks" d={checklist} goTo={goTo} />
            : render(it)))}
        </div>
      ))}
    </div>
  );
}
