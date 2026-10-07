// Drop-in replacement for components/GoalRings.jsx: rings sweep in on load, and pop + confetti + draw a check when a goal closes.
import { useEffect, useRef, useState } from "react";
import { buzz, fireConfetti, useCelebrateOnce, useCountUp } from "./motion";

function Ring({ label, value, target, unit, color, icon, onDone }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const done = target > 0 && value >= target;
  const [shown, setShown] = useState(0);      // start empty so the sweep plays on mount
  const [pop, setPop] = useState(false);
  const box = useRef(null);
  const n = useCountUp(Math.round(value));
  useEffect(() => { const r = requestAnimationFrame(() => setShown(pct)); return () => cancelAnimationFrame(r); }, [pct]);
  useCelebrateOnce(label, done, () => {
    setPop(true); buzz([18, 40, 18]); fireConfetti({ from: box.current, count: 60 });
    setTimeout(() => setPop(false), 1200); onDone?.();
  });
  return (
    <div className="ring-item" aria-label={`${label}: ${Math.round(value)} of ${target} ${unit}`}>
      <div ref={box} className={`fxr${done ? " is-done" : ""}${pop ? " is-pop" : ""}`} style={{ "--ring-color": color }}>
        <svg viewBox="0 0 76 76" width="76" height="76">
          <circle cx="38" cy="38" r="30" className="ring-track" />
          <circle className="fxr-fill" cx="38" cy="38" r="30" fill="none" strokeWidth="8" strokeLinecap="round" stroke={color}
            pathLength="1" strokeDasharray="1" strokeDashoffset={1 - shown} transform="rotate(-90 38 38)" />
          <text x="38" y="44" textAnchor="middle" className="ring-icon fxr-icon">{icon}</text>
          <path className="fxr-check" d="M26 39 L34 47 L50 30" pathLength="1" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <strong>{n.toLocaleString()}<small> / {Number(target).toLocaleString()}</small></strong>
      <span>{label} ({unit})</span>
    </div>
  );
}

export default function GoalRings({ summary, water, activity, goals }) {
  const rings = [
    { label: "Calories", icon: "🍽️", color: "#6847e8", value: summary.calories, target: goals?.calorieTarget ?? 1800, unit: "kcal" },
    { label: "Protein", icon: "🥩", color: "#e8476f", value: summary.protein, target: goals?.proteinTarget ?? 140, unit: "g" },
    { label: "Water", icon: "💧", color: "#2587d9", value: water.totalMl, target: goals?.waterTargetMl ?? 3000, unit: "ml" },
    { label: "Exercise", icon: "🔥", color: "#20a46b", value: activity.totalMinutes, target: goals?.exerciseMinutesTarget ?? 30, unit: "min" },
  ];
  const all = rings.every((r) => r.target > 0 && r.value >= r.target);
  const [glow, setGlow] = useState(false);
  useCelebrateOnce("all-rings", all, () => {
    setTimeout(() => { fireConfetti({ count: 160, spread: Math.PI * 1.6 }); buzz([30, 60, 30, 60, 90]); setGlow(true); setTimeout(() => setGlow(false), 1500); }, 700); // after the last ring's own pop
  });
  return (
    <section className={`goal-rings${glow ? " is-all-closed" : ""}`} aria-label="Today's goals">
      {rings.map((r) => <Ring key={r.label} {...r} />)}
    </section>
  );
}
