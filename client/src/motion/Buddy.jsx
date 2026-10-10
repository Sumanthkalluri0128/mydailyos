// The day's character, acting out each screen. Same API as before: <Buddy scene="lift" size={80} says="Let's lift!" />, <BuddyEmpty scene="sad" title="…">…</BuddyEmpty>.
// Which character you see depends on the day of the week (see chars.js); pass who="goku" to pin one.
import "./buddy.css";
import "./characters.css";
import { CHARS, dayChar, sprite } from "./chars";

// body = which idle motion the picture gets; dur = ms for half a cycle.
export const SCENES = {
  lift:   { label: "lifting weights",       body: "push",   dur: 600 },
  sad:    { label: "feeling disappointed",  body: "slump",  dur: 1800 },
  drink:  { label: "drinking water",        body: "bob",    dur: 900 },
  eat:    { label: "eating",                body: "bob",    dur: 700 },
  scale:  { label: "stepping on the scale", body: "wobble", dur: 600 },
  walk:   { label: "walking",               body: "bounce", dur: 300 },
  task:   { label: "checking off tasks",    body: "nod",    dur: 800 },
  plan:   { label: "planning the week",     body: "nod",    dur: 800 },
  chart:  { label: "showing your progress", body: "bob",    dur: 800 },
  health: { label: "feeling healthy",       body: "beat",   dur: 450 },
  chef:   { label: "cooking",               body: "bob",    dur: 450 },
  habit:  { label: "keeping the streak",    body: "push",   dur: 700 },
  cheer:  { label: "celebrating",           body: "jump",   dur: 260 },
  wave:   { label: "waving hello",          body: "bob",    dur: 500 },
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

export default function Buddy({ scene = "wave", size = 96, says, className = "", label, who }) {
  const c = SCENES[scene] || SCENES.wave;
  const char = who || dayChar();
  const buddy = (
    <span className={`bd bdi ${className}`} style={{ width: size, height: size, "--bt": `${c.dur * 2}ms` }} role="img" aria-label={label || `${CHARS[char]} is ${c.label}`}>
      <img className={`bdi-img bdi-${c.body}`} src={sprite(char, scene)} alt="" width={size} height={size} draggable="false" loading="lazy" decoding="async" />
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
