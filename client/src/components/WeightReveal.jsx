// ONE component for every body-weight value on the web. Blurred by default on every load; click/tap to reveal with a dissolve,
// a number roll-up, an accent-colour glow pulse and a tiny character reaction; blurs again after ~8 s, when the tab is hidden
// or when you leave the page. While hidden only decoy digits are in the page (the real value is never rendered).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./weightreveal.css";
import { accent, dayChar, stickerFor } from "../motion/chars";
import { buzz } from "../motion/motion";
import { a11yText, decoy, hasNumber, hideWeight, isWeightRevealed, rollText, runs, subscribeWeight, toggleWeight } from "../utils/weightReveal";

export const useWeightRevealed = () => useSyncExternalStore(subscribeWeight, isWeightRevealed, () => false);

/** `text` is the whole string containing the weight (digits get blurred); `prefix` is plain text shown before it; `from` is the value the roll-up starts from. */
export default function WeightReveal({ text, prefix = "", from, compact = false, reaction = true, className = "", as: Tag = "span" }) {
  const revealed = useWeightRevealed();
  const who = useMemo(() => dayChar(), []);
  const [t, setT] = useState(revealed ? 1 : 0);   // 0 hidden .. 1 shown: drives blur, fade and the number roll
  const raf = useRef(0), cur = useRef(t);
  const [glowKey, setGlowKey] = useState(0);
  const [face, setFace] = useState(false);
  const faceT = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const start = performance.now(), from0 = cur.current, to = revealed ? 1 : 0, dur = revealed ? 750 : 320;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur), v = from0 + (to - from0) * (1 - Math.pow(1 - k, 3));
      cur.current = v; setT(Math.round(v * 50) / 50);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    if (revealed) setGlowKey((n) => n + 1);
    return () => cancelAnimationFrame(raf.current);
  }, [revealed]);
  useEffect(() => {
    const vis = () => { if (document.hidden) hideWeight(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); clearTimeout(faceT.current); hideWeight(); };   // leaving the page blurs again
  }, []);

  const onClick = (e) => {
    e.stopPropagation();   // a weight inside a clickable card reveals; it does not also open the card
    buzz?.(10);
    const shown = toggleWeight();
    if (shown && reaction) { setFace(true); clearTimeout(faceT.current); faceT.current = setTimeout(() => setFace(false), 1700); } else setFace(false);
  };
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); };

  if (!hasNumber(text)) return <Tag className={className}>{prefix}{text}</Tag>;
  const shown = t > 0 ? rollText(text, t, from) : decoy(text);
  const blur = 10 * (1 - t);
  return (
    <button type="button" className={`wr ${compact ? "compact" : ""} ${glowKey ? "glow" : ""} ${className}`} key={undefined} onClick={onClick} onKeyDown={onKey}
      aria-pressed={revealed} aria-label={revealed ? `${prefix}${a11yText(text, true)}. Hide weight` : "Show weight"}
      style={{ "--wr-accent": accent[who] }} data-state={revealed ? "shown" : "hidden"}>
      <i className="wr-glow" key={glowKey} aria-hidden="true" />
      <span className="wr-t" aria-hidden="true">
        {prefix}
        {runs(shown).map((r, i) => (r.num ? <span key={i} className="wr-n" style={{ filter: blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : undefined, opacity: t < 1 ? 0.35 + 0.65 * t : 1 }}>{r.t}</span> : r.t))}
      </span>
      {face && <img className="wr-face" src={stickerFor(who, "wave", 1).src} alt="" aria-hidden="true" draggable="false" />}
      <span className="wr-sr" aria-live="polite">{revealed ? `${prefix}${text}` : ""}</span>
    </button>
  );
}
