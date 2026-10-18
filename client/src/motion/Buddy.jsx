// A character acting out each screen — and answering when you tap it. Same API as before:
//   <Buddy scene="lift" size={80} says="Let's lift!" />,  <BuddyEmpty scene="sad" title="…">…</BuddyEmpty>
// Which character shows depends on the day of the week (chars.js); pass who="naruto" to pin one.
// Tap: the character hops, switches to a happy sticker and comments on how your day is going.
import { useEffect, useRef, useState } from "react";
import "./stickers.css";
import { CHARS, dayChar, stickerFor } from "./chars";
import { insights, say } from "./talk";
import { getCtx, refreshCtx } from "./ctxStore";
import { buzz } from "./motion";

// body = which idle motion the picture gets; dur = ms for a full cycle.
export const SCENES = {
  lift:   { label: "lifting weights",       body: "Push",   dur: 1200 },
  sad:    { label: "feeling disappointed",  body: "Slump",  dur: 3000 },
  drink:  { label: "drinking water",        body: "Bob",    dur: 1800 },
  eat:    { label: "eating",                body: "Bob",    dur: 1400 },
  scale:  { label: "stepping on the scale", body: "Wobble", dur: 1200 },
  walk:   { label: "walking",               body: "Bounce", dur: 700 },
  task:   { label: "checking off tasks",    body: "Nod",    dur: 1600 },
  plan:   { label: "planning the week",     body: "Nod",    dur: 1600 },
  chart:  { label: "showing your progress", body: "Bob",    dur: 1600 },
  health: { label: "feeling healthy",       body: "Beat",   dur: 1000 },
  chef:   { label: "cooking",               body: "Bob",    dur: 900 },
  habit:  { label: "keeping the streak",    body: "Push",   dur: 1400 },
  cheer:  { label: "celebrating",           body: "Jump",   dur: 600 },
  wave:   { label: "waving hello",          body: "Bob",    dur: 1000 },
  powerup: { label: "powering up",          body: "Jump",   dur: 650 },
  victory: { label: "celebrating a win",    body: "Jump",   dur: 560 },
  levelup: { label: "levelling up",         body: "Beat",   dur: 850 },
  fight:  { label: "ready to fight",        body: "Push",   dur: 900 },
};
export const BUDDY_SCENES = Object.keys(SCENES);

/** Picks a scene from a toast/message so each feature gets its own pose. */
export function sceneForText(text = "", type = "success") {
  if (type === "error" || type === "warning") return "sad";
  const t = text.toLowerCase();
  if (/water|ml\b|drink/.test(t)) return "drink";
  if (/food|meal|calorie|ate |eaten|recipe/.test(t)) return "eat";
  if (/exercise|workout|activity|training/.test(t)) return "lift";
  if (/weight|weigh/.test(t)) return "scale";
  if (/step|walk/.test(t)) return "walk";
  if (/task|reminder|todo/.test(t)) return "task";
  if (/habit|streak/.test(t)) return "habit";
  if (/plan/.test(t)) return "plan";
  return "cheer";
}

const SPARK = ["✨", "⭐", "💫", "❤️", "🔥"];

export default function Buddy({ scene = "wave", size = 96, says, className = "", label, who, talk = true }) {
  const c = SCENES[scene] || SCENES.wave;
  const char = who || dayChar();
  const [mood, setMood] = useState(null);       // temporary sticker after a tap
  const [bubble, setBubble] = useState("");
  const [hop, setHop] = useState(false);
  const [sparks, setSparks] = useState([]);
  const [tap, setTap] = useState(0);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const base = stickerFor(char, scene, `${scene}`);
  const pic = mood ? stickerFor(char, mood.scene, tap) : base;

  const onTap = (e) => {
    e.stopPropagation?.();
    if (!talk) return;
    buzz?.(12);
    const n = tap + 1; setTap(n);
    const ctx = getCtx(); refreshCtx();
    const ins = insights(ctx, char);
    const line = ins.length && n % 2 ? ins[(n >> 1) % ins.length] : null;
    const m = line?.mood || (["hype", "laugh", "thumbs"][n % 3]);
    setMood({ scene: { sad: "sad", party: "victory", drink: "drink", eat: "eat", lift: "lift", sleep: "sleep", think: "think", angry: "angry" }[m] || "cheer" });
    setBubble(line ? line.text : say(char, m));
    setHop(false); requestAnimationFrame(() => setHop(true));
    setSparks(Array.from({ length: 4 }, (_, i) => ({ id: `${n}-${i}`, e: SPARK[(n + i) % SPARK.length], dx: `${(i - 1.5) * 22}px`, dy: `${-30 - (i % 2) * 18}px` })));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setMood(null); setBubble(""); setHop(false); setSparks([]); }, 3600);
  };

  const buddy = (
    <span className={`bd ${hop ? "is-hop" : ""} ${className}`} style={{ width: size, height: size }} role="button" tabIndex={0}
      aria-label={label || `${CHARS[char]} is ${c.label}. Tap to chat.`} onClick={onTap} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onTap(e)}>
      <span className="bdi-body" style={{ "--bn": `bd${c.body}`, "--bt": `${c.dur}ms` }}>
        <img className="bd-img" src={pic.src} alt="" width={size} height={size} draggable="false" loading="lazy" decoding="async" />
      </span>
      {bubble && <span className="bd-bubble" role="status">{bubble}<b className="bd-ask" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("flexfit:ask", { detail: { who: char } })); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); window.dispatchEvent(new CustomEvent("flexfit:ask", { detail: { who: char } })); } }}>Ask me anything ›</b></span>}
      {sparks.map((s) => <i key={s.id} className="bd-sparkle" style={{ left: "50%", top: "30%", "--dx": s.dx, "--dy": s.dy }}>{s.e}</i>)}
    </span>
  );
  return says ? <span className="bd-row">{buddy}<span className="bd-says">{says}</span></span> : buddy;
}

/** Friendly empty state: a character instead of an emoji. */
export function BuddyEmpty({ scene = "sad", title, children, size = 120 }) {
  return (
    <div className="bd-empty">
      <Buddy scene={scene} size={size} />
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
    </div>
  );
}
