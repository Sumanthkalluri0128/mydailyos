// Home hero: greeting + the coach's next step over a slow crossfading background of scenes.
// The line of the day is part of the scene images, so there is no separate quote box.
// The slideshow pauses while the tab is hidden and is off for reduced-motion / calm mode.
import { useEffect, useState } from "react";
import "./home.css";
import Buddy from "../../motion/Buddy";
import { accent, dayChar } from "../../motion/chars";
import { HERO_SLIDES, HERO_INTERVAL_MS } from "./heroSlides";

function useSlide(n) {
  const [i, setI] = useState(() => (n ? new Date().getDate() % n : 0));
  useEffect(() => {
    if (n < 2) return undefined;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("ff-calm");
    if (still) return undefined;
    let t;
    const stop = () => { clearInterval(t); t = undefined; };
    const start = () => { stop(); t = setInterval(() => setI((x) => (x + 1) % n), HERO_INTERVAL_MS); };
    const onVis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [n]);
  return i;
}

export default function HeroCard({ greeting, name, dateText, coach, streakNote, onAsk }) {
  const who = dayChar();
  const cur = useSlide(HERO_SLIDES.length);
  return (
    <section className="hr" aria-label="Today" style={{ "--hr-accent": accent[who] }}>
      {HERO_SLIDES.length > 0 && (
        <>
          <div className="hr-bg" aria-hidden="true">
            {HERO_SLIDES.map((src, k) => <img key={src} className={k === cur ? "on" : ""} src={src} alt="" draggable="false" loading={k === cur ? "eager" : "lazy"} decoding="async" />)}
          </div>
          <div className="hr-shade" aria-hidden="true" />
        </>
      )}
      <div className="hr-panel">
        <small className="hr-date">{dateText}</small>
        <h1 className="hr-hello">{greeting}{name ? <>, <span className="hr-name">{name}</span></> : null} <span className="hr-sun" aria-hidden="true">☀️</span></h1>
        <div className="hr-coach" data-tour="coach">
          <span role="button" tabIndex={0} aria-label="Ask your coach" onClick={() => onAsk?.()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAsk?.(); } }}><Buddy scene={coach?.scene || "wave"} size={84} who={who} talk /></span>
          <div className="hr-bubble">
            <b>{coach?.title || "Your next step"}</b>
            <p>{coach?.text}</p>
            <span className="hr-bubble-actions">
              {coach?.action && <button type="button" onClick={coach.action.onClick}>{coach.action.label}</button>}
            </span>
          </div>
        </div>
        {streakNote}
      </div>
    </section>
  );
}
