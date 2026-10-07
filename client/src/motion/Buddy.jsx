// The day's character, acting out each screen. Same API as before: <Buddy scene="lift" size={80} says="Let's lift!" />, <BuddyEmpty scene="sad" title="…">…</BuddyEmpty>.
// Characters are skeleton-rigged (rig.js): hands/feet are pinned to bars, ropes and floor so the whole body moves together.
// They stay still and only move while hovered (tapped on touch screens). Pass who="naruto" to pin one; scene can also be any rig activity:
// pullup, rope, climb, pushup, situp, lift, run, hike, jump, stretch, fight, meditate, sleep, drink, eat, study, victory, dance, wave, sad, idle.
import "./buddy.css";
import "./characters.css";
import { CHARS, dayChar } from "./chars";
import { ACTS } from "./rig";
import RigBuddy from "./RigBuddy";

// scene (what the screen is about) -> rig activity
export const SCENES = {
  lift:   { label: "lifting weights",       act: "lift" },
  sad:    { label: "feeling disappointed",  act: "sad" },
  drink:  { label: "drinking water",        act: "drink" },
  eat:    { label: "eating",                act: "eat" },
  scale:  { label: "stepping on the scale", act: "idle" },
  walk:   { label: "hiking",                act: "hike" },
  task:   { label: "checking off tasks",    act: "study" },
  plan:   { label: "planning the week",     act: "study" },
  chart:  { label: "showing your progress", act: "victory" },
  health: { label: "feeling healthy",       act: "stretch" },
  chef:   { label: "cooking",               act: "eat" },
  habit:  { label: "keeping the streak",    act: "pushup" },
  cheer:  { label: "celebrating",           act: "victory" },
  wave:   { label: "waving hello",          act: "wave" },
};
export const BUDDY_SCENES = [...Object.keys(SCENES), ...Object.keys(ACTS).filter((a) => !SCENES[a])];

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
  const sc = SCENES[scene];
  const act = sc ? sc.act : ACTS[scene] ? scene : "wave";
  const char = who || dayChar();
  const buddy = <RigBuddy who={char} act={act} size={size} className={className} label={label ?? `${CHARS[char]} is ${sc ? sc.label : ACTS[act].label}`} />;
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
