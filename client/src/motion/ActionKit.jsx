// Tactile action feedback: PressButton (idle -> busy -> done), AnimatedCheck, FocusRing.
import { useEffect, useRef, useState } from "react";
import { buzz } from "./motion";

export function PressButton({ children, busyLabel, doneLabel = "Logged ✓", onClick, className = "", ...rest }) {
  const [s, setS] = useState("idle");
  const el = useRef(null);
  const ripple = (e) => {
    const b = el.current.getBoundingClientRect(), d = Math.max(b.width, b.height) * 2;
    const r = document.createElement("span"); r.className = "fx-ripple";
    Object.assign(r.style, { width: d + "px", height: d + "px", left: e.clientX - b.left - d / 2 + "px", top: e.clientY - b.top - d / 2 + "px" });
    el.current.appendChild(r); setTimeout(() => r.remove(), 650);
  };
  const click = async (e) => {
    if (s !== "idle") return;
    buzz(10); setS("busy");
    try { await onClick?.(e); setS("done"); buzz([12, 30, 12]); setTimeout(() => setS("idle"), 1100); } catch { setS("idle"); }
  };
  return (
    <button ref={el} data-s={s} className={`fx-btn ${className}`} onPointerDown={ripple} onClick={click} aria-busy={s === "busy"} {...rest}>
      <span className="fx-state fx-idle">{children}</span>
      <span className="fx-state fx-busy"><i className="fx-spin" />{busyLabel}</span>
      <span className="fx-state fx-done">{doneLabel}</span>
    </button>
  );
}

/** <AnimatedCheck checked onChange /> + <span className={`fx-strike ${checked ? "is-done" : ""}`}>Task title</span> */
export function AnimatedCheck({ checked, onChange, label, color }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className="fx-check" style={color ? { "--fx-check-color": color } : undefined}
      onClick={() => { buzz(checked ? 8 : [10, 20, 10]); onChange?.(!checked); }}>
      <svg viewBox="0 0 16 16"><path pathLength="1" d="M3 8.5 L6.5 12 L13 4.5" /></svg>
    </button>
  );
}

/** Countdown ring driven by one CSS animation (no per-second JS). Remount with a new `runKey` to restart. */
export function FocusRing({ seconds, running, runKey = 0, size = 160, color = "#6847e8", children }) {
  const [start, setStart] = useState(false);
  useEffect(() => { if (running) { setStart(true); const t = setTimeout(() => setStart(false), 850); return () => clearTimeout(t); } }, [running, runKey]);
  return (
    <div className={`fx-focus${start ? " is-start" : ""}`} style={{ width: size, height: size, "--fx-focus-color": color }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(120,120,150,.2)" strokeWidth="7" />
        <circle key={runKey} className="fx-focus-arc" cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" pathLength="1"
          transform="rotate(-90 50 50)" style={{ animationDuration: `${seconds}s`, animationPlayState: running ? "running" : "paused" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}
