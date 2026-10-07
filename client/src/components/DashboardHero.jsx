import { useEffect, useId, useRef, useState } from "react";
import StreakFlame from "../motion/StreakFlame";
import Buddy from "../motion/Buddy";
import { buzz, fireConfetti, useCelebrateOnce } from "../motion/motion";
import { apiFetch } from "../config/api";
import { dayBalance } from "../utils/energy";
import { coachLine } from "../utils/coach";

const greeting = (h) => (h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Good night");
const n = (v) => Math.round(Number(v) || 0).toLocaleString();

function Ring({ size, stroke, pct, color, gradient, children, label, celebrate = false }) {
  const id = useId();
  const box = useRef(null);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(1, pct));
  const [shown, setShown] = useState(0); // start empty so the sweep plays on mount
  const [pop, setPop] = useState(false);
  useEffect(() => { const f = requestAnimationFrame(() => setShown(fill)); return () => cancelAnimationFrame(f); }, [fill]);
  useCelebrateOnce(label, celebrate && fill >= 1, () => {
    setPop(true); buzz([18, 40, 18]); fireConfetti({ from: box.current, count: 60 });
    setTimeout(() => setPop(false), 1300);
  });
  return (
    <div ref={box} className={pop ? "ring is-pop" : "ring"} style={{ width: size, height: size, "--ring-color": color }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {gradient && (
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={gradient[0]} />
              <stop offset="1" stopColor={gradient[1]} />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeLinecap="round" strokeWidth={stroke}
          stroke={gradient ? `url(#${id})` : color}
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-fill"
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/**
 * The whole "how is my day going" answer in one card, every number shown exactly once:
 * coach line · calories ring (eaten / budget / activity) · water, steps, exercise rings · one-tap actions.
 */
export default function DashboardHero({ profile, today, summary, activity, water, waterTarget, goTo, onChanged, streak }) {
  const [adding, setAdding] = useState(false);
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
  const coach = coachLine({
    hour, eatenKcal: bal.eaten, budgetKcal: bal.budget,
    meals: { breakfast: summary.meals.breakfast > 0, lunch: summary.meals.lunch > 0, dinner: summary.meals.dinner > 0 },
    waterMl: water.totalMl, waterTarget, steps, stepsTarget, exerciseMin, exerciseTarget, streak,
  });
  // Which character greets you: disappointed if the day is ending with no workout, cheering when the goal is met.
  const waterLow = waterTarget > 0 && water.totalMl / waterTarget < 0.4;
  const buddyScene = exerciseTarget > 0 && exerciseMin >= exerciseTarget ? "cheer"
    : hour >= 17 && exerciseMin === 0 ? "sad"
    : hour >= 12 && waterLow ? "drink"
    : hour < 11 && !(summary.meals.breakfast > 0) ? "eat"
    : exerciseMin > 0 ? "lift" : "wave";
  const first = (profile?.name || "").trim().split(" ")[0];
  const dateText = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const minis = [
    { key: "water", icon: "💧", label: "Water", value: water.totalMl, target: waterTarget, text: `${(water.totalMl / 1000).toFixed(2)} L`, color: "var(--water)", page: "water" },
    { key: "steps", icon: "👟", label: "Steps", value: steps, target: stepsTarget, text: n(steps), color: "var(--steps)", page: "health" },
    { key: "exercise", icon: "🏃", label: "Exercise", value: exerciseMin, target: exerciseTarget, text: `${exerciseMin} min`, color: "var(--primary)", page: "exercise" },
  ];

  // Jackpot: all three rings closed (fires once per day, after the last ring's own pop).
  const allDone = minis.every((m) => m.target > 0 && m.value >= m.target);
  useCelebrateOnce("all-rings", allDone, () => {
    setTimeout(() => { fireConfetti({ count: 160, spread: Math.PI * 1.6 }); buzz([30, 60, 30, 60, 90]); }, 700);
  });

  const [waterOk, setWaterOk] = useState(false);
  const quickWater = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const res = await apiFetch("/api/water", { method: "POST", body: JSON.stringify({ date: today, amountMl: 250 }) });
      if (res.ok) {
        buzz([12, 30, 12]); setWaterOk(true); setTimeout(() => setWaterOk(false), 1100);
        onChanged?.();
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="hero2" aria-label="Today at a glance">
      <header className="hero2-head">
        <p className="date">{dateText}</p>
        <h2>{greeting(hour)}{first ? `, ${first}` : ""}</h2>
        {streak && (
          <button type="button" className="streak-chip" onClick={() => goTo("progress")} aria-label={streak.current > 0 ? `${streak.current} day streak` : "Start a streak"}>
            {streak.current > 0 ? <StreakFlame streak={streak.current} compact bare /> : <span>🌱</span>}<strong>{streak.current}</strong>
          </button>
        )}
      </header>

      <div className={`coach coach-${coach.tone}`} role="status">
        <span className="coach-buddy"><Buddy scene={buddyScene} size={62} /></span>
        <div>
          <strong>{coach.title}</strong>
          <span>{coach.text}</span>
        </div>
      </div>

      <div className="hero2-main">
        <button type="button" className="ring-btn" onClick={() => goTo("foodLogger")}
          aria-label={`${n(Math.abs(bal.remaining))} kcal ${over ? "over your budget" : "left to eat"} today. Open food log`}>
          <Ring size={176} stroke={17} pct={bal.budget > 0 ? bal.eaten / bal.budget : 0} color="var(--danger, #d64545)" gradient={over ? null : ["#f7b955", "#e8672a"]} label="Calories">
            <strong className={over ? "ring-big over" : "ring-big"}>{n(Math.abs(bal.remaining))}</strong>
            <span>{over ? "kcal over" : "kcal left"}</span>
          </Ring>
        </button>

        <dl className="hero2-stats">
          <div><dt>Eaten</dt><dd>{n(bal.eaten)} <small>kcal</small></dd></div>
          <div><dt>Budget</dt><dd>{n(bal.budget)} <small>kcal</small></dd>{bal.bonus > 0 && <em>+{n(bal.bonus)} earned by activity</em>}</div>
          <div><dt>Activity</dt><dd className="steps-ink">{n(bal.burned)} <small>kcal</small></dd></div>
        </dl>
      </div>

      <div className="hero2-minis">
        {minis.map((m) => {
          const done = m.target > 0 && m.value >= m.target;
          return (
            <button key={m.key} type="button" className="mini" onClick={() => goTo(m.page)} aria-label={`${m.label}: ${m.text}${done ? ", goal reached" : ""}`}>
              <Ring size={78} stroke={8} pct={m.target > 0 ? m.value / m.target : 0} color={m.color} label={m.label} celebrate>
                <span className="mini-icon">{done ? "✅" : m.icon}</span>
              </Ring>
              <strong>{m.text}</strong>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      <div className="quick" role="group" aria-label="Quick actions">
        <button type="button" onClick={() => goTo("foodLogger")}><Buddy scene="eat" size={40} label="" />Food</button>
        <button type="button" className={waterOk ? "fx-pulse" : undefined} onClick={quickWater} disabled={adding}><Buddy scene={waterOk ? "cheer" : "drink"} size={40} label="" />{waterOk ? "Added" : "+250 ml"}</button>
        <button type="button" onClick={() => goTo("exercise")}><Buddy scene="lift" size={40} label="" />Workout</button>
        <button type="button" onClick={() => goTo("health")}><Buddy scene="walk" size={40} label="" />Steps</button>
      </div>
    </section>
  );
}
