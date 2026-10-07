// Evolving streak flame. Usage: <StreakFlame streak={stats.currentStreak} />
import { useEffect, useMemo, useRef, useState } from "react";
import { buzz, fireConfetti } from "./motion";

export const FLAME_TIERS = [
  { min: 0,   scale: 0.8, speed: 0,   outer: "#8b8b99", inner: "#b8b8c4", glow: "rgba(0,0,0,0)",       glowo: 0,   spark: "#ccc",    sparks: 0 },
  { min: 1,   scale: 0.8, speed: 0.7, outer: "#ff8a1f", inner: "#ffd36b", glow: "rgba(255,140,40,.4)", glowo: 0.4, spark: "#ffd36b", sparks: 0 },
  { min: 3,   scale: 0.95, speed: 0.9, outer: "#ff6a1a", inner: "#ffc247", glow: "rgba(255,120,30,.5)", glowo: 0.55, spark: "#ffd36b", sparks: 0 },
  { min: 7,   scale: 1.1, speed: 1.1, outer: "#ff4d1a", inner: "#ffb02e", glow: "rgba(255,90,30,.55)", glowo: 0.7, spark: "#ffcf5a", sparks: 2 },
  { min: 14,  scale: 1.25, speed: 1.3, outer: "#ff3b3b", inner: "#ff9d2e", glow: "rgba(255,60,60,.55)", glowo: 0.8, spark: "#ffb347", sparks: 4 },
  { min: 30,  scale: 1.4, speed: 1.5, outer: "#d63aff", inner: "#ff8ad8", glow: "rgba(190,70,255,.6)", glowo: 0.9, spark: "#f0a8ff", sparks: 5 },
  { min: 100, scale: 1.55, speed: 1.8, outer: "#2d8cff", inner: "#d6f0ff", glow: "rgba(80,170,255,.7)", glowo: 1,   spark: "#bfe6ff", sparks: 6 },
];
export const tierOf = (n) => FLAME_TIERS.reduce((t, x, i) => (n >= x.min ? i : t), 0);

export default function StreakFlame({ streak = 0, label = "day streak", compact = false, bare = false }) {
  const k = compact ? 0.4 : 1;
  const ti = tierOf(streak), T = FLAME_TIERS[ti];
  const prev = useRef(streak);
  const [bump, setBump] = useState(0);        // increments to retrigger the bump animation
  const [burst, setBurst] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (streak > prev.current) {
      setBump((b) => b + 1); setBurst(true); buzz(streak % 7 === 0 ? [20, 40, 40] : 15);
      if (tierOf(streak) > tierOf(prev.current)) fireConfetti({ from: ref.current, count: compact ? 40 : 90 }); // tier-up = bigger moment
      const t = setTimeout(() => setBurst(false), 900);
      prev.current = streak; return () => clearTimeout(t);
    }
    prev.current = streak;
  }, [streak]);
  const bursts = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ a: `${i * 36}deg`, r: `${(28 + (i % 3) * 10) * k}px` })), []);
  return (
    <div className="streak-flame" ref={ref} style={{ display: "inline-flex", alignItems: "center", gap: compact ? 6 : 10 }} aria-label={`${streak} ${label}`}>
      <div key={bump} className={`flame${streak === 0 ? " is-out" : ""}${bump ? " is-bump" : ""}`}
        style={{ "--fs": T.scale * k, "--fspeed": T.speed || 1, "--fglow": T.glow, "--fglowo": T.glowo, "--fspark": T.spark }}>
        <span className="flame-glow" />
        <svg viewBox="0 0 64 80" aria-hidden="true">
          <path className="flame-body" fill={T.outer} d="M32 2C34 18 52 28 52 50C52 66 43 78 32 78C21 78 12 66 12 50C12 40 18 34 22 28C24 36 28 38 30 36C28 24 28 12 32 2Z" />
          <path className="flame-inner" fill={T.inner} d="M32 36C34 46 42 50 42 60C42 69 37 75 32 75C27 75 22 69 22 60C22 52 28 48 32 36Z" />
        </svg>
        {Array.from({ length: T.sparks }, (_, i) => (
          <i key={i} className="flame-spark" style={{ "--d": `${i * 0.37}s`, "--x": `${(i % 2 ? 1 : -1) * (6 + i * 3)}px`, left: `${40 + i * 4}%` }} />
        ))}
        {burst && bursts.map((b, i) => <i key={i} className="flame-burst" style={{ "--a": b.a, "--r": b.r }} />)}
      </div>
      {!bare && (
        <div>
          <strong style={{ fontSize: compact ? 15 : 28, lineHeight: 1 }}><span key={streak} className="fx-roll">{streak}</span></strong>
          <div style={{ fontSize: compact ? 11 : 12, opacity: 0.7 }}>{label}</div>
        </div>
      )}
    </div>
  );
}
