// Home hero: a calm, static card. Date + greeting, ONE character (the day's), the coach's next step and one line of the day.
// No slideshow, no auto-advance and nothing swipes. The character keeps its existing hover-only reaction (Buddy).
import "./home.css";
import Buddy from "../../motion/Buddy";
import { accent, CHARS, dayChar } from "../../motion/chars";
import { dailyLine } from "../../utils/dailyLine";

export default function HeroCard({ greeting, name, dateText, coach, streakNote, onAsk }) {
  const who = dayChar();
  return (
    <section className="hr" aria-label="Today" style={{ "--hr-accent": accent[who] }}>
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
        <p className="hr-line">“{dailyLine()}” <b>— {CHARS[who]}</b></p>
        {streakNote}
      </div>
    </section>
  );
}
