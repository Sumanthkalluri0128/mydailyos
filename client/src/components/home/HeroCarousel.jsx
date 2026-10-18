// Home hero: your anime scenes as a sliding carousel, with the greeting and the coach's next step beside the picture.
// Swipe / drag, arrow keys, thumbnails, auto-play (pauses on hover, focus, hidden tab and "calm motion"), tap the scene for a cheer.
import { useCallback, useEffect, useRef, useState } from "react";
import "./home.css";
import Buddy from "../../motion/Buddy";
import { fireConfetti, prefersReducedMotion } from "../../motion/motion";
import { SCENES, sceneAt, todayIndex } from "./scenes";

const AUTO_MS = 7000;
const calm = () => { try { return prefersReducedMotion() || document.documentElement.classList.contains("ff-calm"); } catch { return false; } };
const Fx = ({ kind }) => (
  <span className={`hr-fx fx-${kind}`} aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 8) % 96}%`, animationDelay: `${-(i * 1.7) % 9}s`, animationDuration: `${8 + (i * 5) % 7}s`, "--s": 0.6 + (i % 4) * 0.25 }} />)}
  </span>
);

export default function HeroCarousel({ greeting, name, dateText, coach, onAsk, streakNote }) {
  const [idx, setIdx] = useState(todayIndex);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState(0);
  const [cheer, setCheer] = useState(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const box = useRef(null), start = useRef(null), cheerT = useRef(0), moved = useRef(false);
  const N = SCENES.length;
  const go = useCallback((d) => setIdx((i) => (i + d + N) % N), [N]);
  const scene = sceneAt(idx);

  // auto-play
  useEffect(() => {
    if (paused || calm()) return undefined;
    const t = setTimeout(() => { if (!document.hidden) go(1); else setIdx((i) => i); }, AUTO_MS);
    return () => clearTimeout(t);
  }, [idx, paused, go]);
  // warm the next picture
  useEffect(() => { const i = new Image(); i.src = sceneAt(idx + 1).src; }, [idx]);
  useEffect(() => () => clearTimeout(cheerT.current), []);

  const onDown = (e) => { start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; moved.current = false; };
  const onMove = (e) => {
    if (e.pointerType === "mouse" && !start.current) {
      const r = box.current.getBoundingClientRect();
      setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
      return;
    }
    if (!start.current) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { moved.current = true; try { box.current.setPointerCapture(start.current.id); } catch { /* ignore */ } setDrag(dx); }
  };
  const onUp = (e) => {
    const s = start.current; start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    setDrag(0);
    if (moved.current && Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
  };
  const onClickStage = (e) => {
    if (moved.current) { moved.current = false; return; }
    fireConfetti({ from: e.currentTarget, count: 46 });
    setCheer(scene); clearTimeout(cheerT.current); cheerT.current = setTimeout(() => setCheer(null), 3400);
  };
  const onKey = (e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } };

  const thumbs = [1, 2, 3].map((o) => ({ o, s: sceneAt(idx + o) }));
  const near = (i) => { const d = Math.min((i - idx + N) % N, (idx - i + N) % N); return d <= 1; };

  return (
    <section className="hr" aria-roledescription="carousel" aria-label="Today's motivation" onMouseEnter={() => setPaused(true)} onMouseLeave={() => { setPaused(false); setTilt({ x: 0, y: 0 }); }}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} onKeyDown={onKey} data-land={scene.land ? "1" : "0"}>
      {/* blurred copy of the current picture fills the card behind the full, uncropped scene */}
      <div className="hr-bg" aria-hidden="true">{SCENES.map((s, i) => (i === idx ? <img key={s.slug} src={s.thumb} alt="" /> : null))}</div>
      <div className="hr-shade" aria-hidden="true" />

      <div className="hr-panel">
        <small className="hr-date">{dateText}</small>
        <h1 className="hr-hello">{greeting}{name ? <>, <span className="hr-name">{name}</span></> : null} <span className="hr-sun" aria-hidden="true">☀️</span></h1>
        <div className="hr-coach">
          <Buddy scene={coach?.scene || "wave"} size={84} talk />
          <div className="hr-bubble">
            <b>{coach?.title || "Your next step"}</b>
            <p>{coach?.text}</p>
            <span className="hr-bubble-actions">
              {coach?.action && <button type="button" onClick={coach.action.onClick}>{coach.action.label}</button>}
              <button type="button" className="ghost" onClick={() => onAsk?.()}>💬 Ask</button>
            </span>
          </div>
        </div>
        {streakNote}
      </div>

      <div className="hr-stage" ref={box} tabIndex={0} role="group" aria-label={`${scene.who}: ${scene.line} Slide ${idx + 1} of ${N}. Use the arrow keys to change slide.`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={onClickStage}
        data-drag={drag ? "1" : undefined} style={{ "--dx": `${drag}px`, "--px": tilt.x, "--py": tilt.y }}>
        {SCENES.map((s, i) => {
          const rel = ((i - idx + N + Math.floor(N / 2)) % N) - Math.floor(N / 2); // -8..8 relative position
          const cls = rel === 0 ? "is-active" : rel < 0 ? "is-prev" : "is-next";
          return (
            <figure key={s.slug} className={`hr-slide ${cls} ${s.land ? "land" : "port"}`} aria-hidden={rel !== 0}>
              {near(i) && <img src={s.src} alt={rel === 0 ? `${s.who} anime scene` : ""} draggable="false" loading={rel === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={rel === 0 ? "high" : "low"} />}
              {rel === 0 && <Fx kind={s.fx} />}
            </figure>
          );
        })}
        {cheer && <div className="hr-cheer" role="status" key={cheer.slug + idx}><b>{cheer.who}</b> says: “{cheer.line}”</div>}
        <button type="button" className="hr-arrow prev" aria-label="Previous scene" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
        <button type="button" className="hr-arrow next" aria-label="Next scene" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
        <span className="hr-count" aria-hidden="true">{idx + 1} / {N}</span>
      </div>

      <aside className="hr-rail" aria-label="Up next">
        {thumbs.map(({ o, s }) => (
          <button key={s.slug} type="button" className={`hr-thumb ${s.land ? "land" : "port"}`} onClick={() => setIdx((idx + o) % N)} aria-label={`Show ${s.who} scene`}>
            <img src={s.thumb} alt="" loading="lazy" decoding="async" /><span>{s.who}</span>
          </button>
        ))}
        <button type="button" className="hr-shuffle" onClick={() => setIdx(Math.floor(Math.random() * N))} aria-label="Random scene">🎲 Shuffle</button>
      </aside>

      <div className="hr-dots" role="tablist" aria-label="Choose a scene">
        {SCENES.map((s, i) => <button key={s.slug} type="button" role="tab" aria-selected={i === idx} aria-label={`${s.who}, scene ${i + 1}`} className={i === idx ? "on" : ""} onClick={() => setIdx(i)}>{i === idx && !paused && !calm() ? <i key={idx} style={{ animationDuration: `${AUTO_MS}ms` }} /> : null}</button>)}
      </div>
    </section>
  );
}
