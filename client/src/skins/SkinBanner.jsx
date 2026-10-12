// The themed banner at the top of the dashboard: today's character, greeting, a motivational note, and the
// shuffle / lock buttons. What it looks like depends on today's skin (see skins.js and skins.css).
import "./skins.css";
import Buddy from "../motion/Buddy";
import { sprite } from "../motion/chars";
import { useSkin } from "./skinStore";

// Twelve drifting bits (petals, embers, sparkles...). Fixed values so the picture is the same on every render.
const BITS = Array.from({ length: 12 }, (_, i) => ({ x: (i * 83 + 7) % 100, s: 6 + ((i * 5) % 9), d: 7 + ((i * 3) % 7), t: -((i * 1.7) % 9) }));
const SIGNS = ["Better Habits", "Stronger You", "New Levels"];
const TRAIL = ["goku", "naruto", "luffy", "zoro"];

export default function SkinBanner({ title, dateText, children }) {
  const { skin, mode, shuffle, togglePin } = useSkin();
  return (
    <>
      <section className="sk-banner" data-decor={skin.decor} aria-label={`${skin.name} theme`}>
        <div className="sk-art" aria-hidden="true">
          {skin.decor !== "none" && BITS.map((b, i) => (
            <i key={i} className="sk-bit" style={{ left: `${b.x}%`, "--sz": `${b.s}px`, "--dur": `${b.d}s`, animationDelay: `${b.t}s` }} />
          ))}
        </div>

        <div className="sk-copy">
          <p className="sk-date">{dateText}</p>
          <h2>{title}</h2>
          <p className="sk-sub">{skin.sub}</p>
          <span className="sk-chip">{skin.name}</span>
        </div>

        <div className="sk-hero">
          <Buddy who={skin.char} scene={skin.scene} size={156} label={`${skin.name} character`} />
        </div>

        {skin.strip ? (
          <ul className="sk-signs" aria-hidden="true">{SIGNS.map((t) => <li key={t}>{t}</li>)}</ul>
        ) : (
          <aside className="sk-note"><span>{skin.quote}</span></aside>
        )}

        <div className="sk-tools">
          {children}
          <button type="button" className="sk-tool" onClick={shuffle} aria-label="Shuffle today's theme" title="Shuffle today's theme">🎲</button>
          <button type="button" className={`sk-tool${mode === "pin" ? " is-on" : ""}`} onClick={togglePin} aria-pressed={mode === "pin"}
            aria-label={mode === "pin" ? "Unlock theme (go back to a new theme every day)" : "Keep this theme every day"}
            title={mode === "pin" ? "Locked. Tap to get a new theme every day" : "Keep this theme every day"}>{mode === "pin" ? "📌" : "📍"}</button>
        </div>
      </section>

      {skin.strip && (
        <div className="sk-trail" aria-hidden="true">
          <b>{skin.quote}</b>
          <div className="sk-path">
            {TRAIL.map((who, i) => (
              <span key={who} className="sk-walker" style={{ left: `${5 + i * 21}%`, animationDelay: `${-i * 0.45}s` }}>
                <img src={sprite(who, "walk")} alt="" width="54" height="54" loading="lazy" decoding="async" draggable="false" />
                <em>{["Lv 1", "Lv 5", "Lv 10", "Lv 20"][i]}</em>
              </span>
            ))}
            <span className="sk-chest">🎁</span>
          </div>
        </div>
      )}
    </>
  );
}
