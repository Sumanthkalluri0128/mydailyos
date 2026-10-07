// "Flex", FlexFit's little bean mascot. Every screen has its own tiny looping cartoon (pure SVG + CSS, no dependencies).
//   <Buddy scene="lift" size={80} says="Let's lift!" />      <BuddyEmpty scene="sad" title="No workout yet">…</BuddyEmpty>
// Scenes: lift sad drink eat scale walk task plan chart health chef habit cheer wave
import "./buddy.css";

// One table drives every scene. Angles are degrees (a = shoulder, b = elbow) for [rest, peak]; dur = ms for one half-swing.
const IDLE = { a: [8, 14], b: [0, 6] };
const UP = { a: [28, 90], b: [6, 92] };
export const SCENES = {
  lift:   { label: "lifting weights",       mood: "strain", L: { ...UP, hold: "dumbbell" }, R: { ...UP, hold: "dumbbell" }, dur: 750, body: "push" },
  sad:    { label: "feeling disappointed",  mood: "sad",    L: { a: [6, 9], b: [0, 0] }, R: { a: [6, 9], b: [0, 0] }, dur: 2000, body: "slump" },
  drink:  { label: "drinking water",        mood: "smile",  L: IDLE, R: { a: [55, 75], b: [70, 100], hold: "glass" }, dur: 1100, body: "bob" },
  eat:    { label: "eating an apple",       mood: "chew",   L: IDLE, R: { a: [60, 80], b: [80, 120], hold: "apple" }, dur: 900, body: "bob" },
  scale:  { label: "stepping on the scale", mood: "smile",  L: { a: [25, 40], b: [0, 0] }, R: { a: [25, 40], b: [0, 0] }, dur: 600, body: "wobble" },
  walk:   { label: "walking",               mood: "smile",  L: { a: [-22, 28], b: [0, 0] }, R: { a: [-22, 28], b: [0, 0] }, dur: 600, body: "bounce", legs: 28, swap: true },
  task:   { label: "checking off tasks",    mood: "smile",  L: IDLE, R: { a: [60, 95], b: [0, 10] }, dur: 900, body: "nod" },
  plan:   { label: "planning the week",     mood: "smile",  L: IDLE, R: { a: [60, 95], b: [0, 10] }, dur: 900, body: "nod" },
  chart:  { label: "showing your progress", mood: "wow",    L: IDLE, R: { a: [100, 115], b: [0, 0] }, dur: 900, body: "bob" },
  health: { label: "feeling healthy",       mood: "smile",  L: IDLE, R: IDLE, dur: 450, body: "beat" },
  chef:   { label: "cooking",               mood: "smile",  L: IDLE, R: { a: [50, 70], b: [40, 80] }, dur: 500, body: "bob" },
  habit:  { label: "keeping the streak",    mood: "open",   L: { a: [28, 90], b: [6, 92] }, R: { a: [28, 90], b: [6, 92] }, dur: 900, body: "push" },
  cheer:  { label: "celebrating",           mood: "open",   L: { a: [150, 172], b: [5, 15] }, R: { a: [150, 172], b: [5, 15] }, dur: 260, body: "jump" },
  wave:   { label: "waving hello",          mood: "smile",  L: IDLE, R: { a: [150, 150], b: [-25, 25] }, dur: 350, body: "bob" },
};
export const BUDDY_SCENES = Object.keys(SCENES);

/** Picks a scene from a toast/message so each feature gets its own character. */
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

const Dumbbell = () => (
  <g transform="translate(0 19)">
    <rect x="-10" y="-2" width="20" height="4" rx="2" fill="#4b5563" />
    <rect x="-14" y="-7" width="6" height="14" rx="2.5" fill="#1f2937" />
    <rect x="8" y="-7" width="6" height="14" rx="2.5" fill="#1f2937" />
  </g>
);
const Glass = () => (
  <g transform="translate(0 17)" className="bd-glass">
    <path d="M-4 0 L4 0 L6.5 18 L-6.5 18 Z" fill="#d9f0ff" stroke="#8cc9ee" strokeWidth="1.5" strokeLinejoin="round" />
    <path className="bd-water" d="M-5 7 L5 7 L6 18 L-6 18 Z" fill="#3aa0ee" />
  </g>
);
const Apple = () => (
  <g transform="translate(0 25)">
    <circle r="7.5" fill="#e5484d" />
    <path d="M0 -7 Q1 -11 4 -12" stroke="#6b4a2b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M1.5 -9 Q5 -13 8 -10 Q5 -7 1.5 -9Z" fill="#3fb26b" />
    <circle cx="-2.5" cy="-2" r="1.6" fill="#fff" opacity=".45" />
  </g>
);
const HOLD = { dumbbell: Dumbbell, glass: Glass, apple: Apple };

function Arm({ side, pose, dur, delay = 0 }) {
  const left = side === "L";
  const Hold = HOLD[pose.hold];
  const style = { "--s": left ? 1 : -1, "--a0": `${pose.a[0]}deg`, "--a1": `${pose.a[1]}deg`, "--b0": `${pose.b[0]}deg`, "--b1": `${pose.b[1]}deg`, "--dur": `${dur * 2}ms`, "--dl": `${-delay}ms` };
  return (
    <g transform={`translate(${left ? 41 : 79} 70)`}>
      <g className="bd-arm" style={style}>
        <g className="bd-ua">
          <line className="bd-limb" x1="0" y1="0" x2="0" y2="18" />
          <g transform="translate(0 18)">
            <g className="bd-fa">
              <line className="bd-limb" x1="0" y1="0" x2="0" y2="18" />
              {Hold && <Hold />}
              <circle className="bd-hand" cx="0" cy="19" r="5.5" />
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

const Leg = ({ x, swing, dur, delay = 0, move }) => (
  <g transform={`translate(${x} 90)`}>
    <g className={move ? "bd-leg is-moving" : "bd-leg"} style={{ "--l0": `${-swing}deg`, "--l1": `${swing}deg`, "--dur": `${dur * 2}ms`, "--dl": `${-delay}ms` }}>
      <rect className="bd-foot" x="-5" y="0" width="10" height="15" rx="5" />
    </g>
  </g>
);

function Face({ mood }) {
  return (
    <g className={`bd-face bd-m-${mood}`}>
      <g className="bd-eyes">
        {[51, 69].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="57" rx="6.4" ry="8" fill="#fff" />
            <ellipse className="bd-pupil bd-iris" cx={x + 0.4} cy="58" rx="4.7" ry="6.4" />
            <ellipse cx={x + 0.4} cy="59" rx="2.2" ry="3.4" fill="#1f2340" />
            <circle className="bd-shine" cx={x - 1.4} cy="54.6" r="2" fill="#fff" />
            <circle className="bd-shine bd-shine2" cx={x + 2.4} cy="61" r="1.1" fill="#fff" />
          </g>
        ))}
      </g>
      <ellipse cx="43" cy="68" rx="4" ry="2.4" fill="#ff8fb1" opacity=".6" /><ellipse cx="77" cy="68" rx="4" ry="2.4" fill="#ff8fb1" opacity=".6" />
      <path className="bd-brow bd-brow-strain" d="M43 48 L56 52 M77 48 L64 52" />
      <path className="bd-brow bd-brow-sad" d="M43 53 L56 48 M77 53 L64 48" />
      <path className="bd-mo bd-mo-smile" d="M54 71 Q60 77 66 71" />
      <path className="bd-mo bd-mo-chew" d="M54 71 Q60 77 66 71" />
      <path className="bd-mo bd-mo-sad" d="M54 76 Q60 70 66 76" />
      <path className="bd-mo-fill bd-mo-open" d="M52 70 Q60 84 68 70 Z" />
      <rect className="bd-mo-fill bd-mo-strain" x="54" y="71" width="12" height="5" rx="2" />
      <ellipse className="bd-mo-fill bd-mo-wow" cx="60" cy="73" rx="3" ry="4" />
    </g>
  );
}

// Spiky anime hair with a fringe; sways gently. Colour comes from the scene (--bd-hair), so every screen has its own character.
const Hair = () => (
  <g className="bd-hair">
    <path className="bd-hair-fill" d="M37 58 C35 44 38 38 42 34 L37 19 L51 30 L58 11 L64 29 L77 15 L77 34 C82 38 85 46 83 58 L77 48 L72 57 L66 46 L60 56 L54 46 L48 57 L43 48 Z" />
    <path d="M52 30 Q56 24 58 17" stroke="#fff" strokeOpacity=".35" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </g>
);

// Props that live behind / in front of the character, per scene.
const Cloud = () => (
  <g>
    <g className="bd-cloud" fill="#9aa3b5"><ellipse cx="60" cy="20" rx="21" ry="8" /><circle cx="49" cy="16" r="8" /><circle cx="63" cy="12" r="10" /><circle cx="74" cy="19" r="6.5" /></g>
    {[50, 60, 70].map((x, i) => <line key={x} className="bd-rain" x1={x} y1="30" x2={x - 1.5} y2="36" style={{ "--d": `${i * 0.3}s` }} />)}
  </g>
);
const Sweat = () => <path className="bd-sweat" d="M85 46 q3.5 5 0 8 q-3.5 -3 0 -8z" />;
const Tear = () => <ellipse className="bd-tear" cx="46" cy="64" rx="1.8" ry="2.6" />;
const Headband = () => <path d="M38.6 49 Q60 43 81.4 49" stroke="#ef4444" strokeWidth="5" fill="none" strokeLinecap="round" />;
const Toque = () => (
  <g fill="#fff" stroke="#e1e4f0" strokeWidth="1.2">
    <circle cx="50" cy="36" r="8" /><circle cx="60" cy="31" r="9.5" /><circle cx="70" cy="36" r="8" /><rect x="47" y="38" width="26" height="9" rx="2.5" />
  </g>
);
const Clip = () => (
  <g>
    <rect x="84" y="38" width="31" height="48" rx="4" fill="#fff" stroke="#c7cbe0" strokeWidth="2" /><rect x="92" y="34" width="15" height="7" rx="2" fill="#6b7280" />
    {[52, 64, 76].map((y, i) => (
      <g key={y}>
        <path className="bd-tick" pathLength="1" d={`M88 ${y} l3 3 l5 -6`} style={{ "--d": `${0.4 + i * 0.7}s` }} />
        <line x1="101" y1={y + 1} x2="110" y2={y + 1} stroke="#cbd0e3" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    ))}
  </g>
);
const Calendar = () => (
  <g>
    <rect x="82" y="40" width="33" height="42" rx="5" fill="#fff" stroke="#c7cbe0" strokeWidth="2" /><path d="M82 45 a5 5 0 0 1 5 -5 h23 a5 5 0 0 1 5 5 v5 h-33z" fill="#ef4444" />
    {[91, 98.5, 106].flatMap((x) => [60, 68, 76].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#cbd0e3" />))}
    <circle className="bd-pick" cx="98.5" cy="68" r="3.4" fill="#20a46b" />
  </g>
);
const Bars = () => (
  <g>
    {[[85, 18], [97, 30], [109, 44]].map(([x, h], i) => <rect key={x} className="bd-bar" x={x - 4.5} y={98 - h} width="9" height={h} rx="2.5" style={{ "--d": `${i * 0.25}s` }} />)}
  </g>
);
const Heart = () => <path className="bd-heart" d="M98 30 c-9 -8 -17 1 -9 9 l9 8 l9 -8 c8 -8 0 -17 -9 -9z" />;
const Flame = () => <g transform="translate(84 24) scale(.45)"><path className="bd-fl" d="M32 2C34 18 52 28 52 50C52 66 43 78 32 78C21 78 12 66 12 50C12 40 18 34 22 28C24 36 28 38 30 36C28 24 28 12 32 2Z" /></g>;
const Pot = () => (
  <g>
    {[88, 98, 107].map((x, i) => <circle key={x} className="bd-steam" cx={x} cy="76" r="3" style={{ "--d": `${i * 0.5}s` }} />)}
    <rect x="80" y="82" width="34" height="5" rx="2.5" fill="#6b7280" /><path d="M83 87 h28 v11 a6 6 0 0 1 -6 6 h-16 a6 6 0 0 1 -6 -6z" fill="#9ca3af" />
  </g>
);
const Platform = () => (
  <g>
    <rect x="24" y="100" width="72" height="11" rx="5.5" fill="#b8bfd6" />
    <circle cx="85" cy="105.5" r="5" fill="#fff" />
    <line className="bd-needle" x1="85" y1="105.5" x2="85" y2="101.5" />
  </g>
);
const Ground = () => <g className="bd-ground" fill="#cdd2e6">{[6, 36, 66, 96, 126].map((x) => <rect key={x} x={x} y="108" width="14" height="3" rx="1.5" />)}</g>;
const CONFETTI = [[14, 30, "#ffb020"], [102, 24, "#e8476f"], [24, 12, "#2587d9"], [92, 8, "#20a46b"], [8, 62, "#e8476f"], [112, 58, "#ffb020"]];
const Confetti = () => <g>{CONFETTI.map(([x, y, c], i) => <rect key={i} className="bd-conf" x={x} y={y} width="6" height="3.5" rx="1" fill={c} style={{ "--d": `${i * 0.13}s` }} />)}</g>;

const BACK = { scale: Platform, walk: Ground, task: Clip, plan: Calendar, chart: Bars, health: Heart, chef: Pot, habit: Flame, cheer: Confetti, sad: Cloud };
const HEAD = { lift: Headband, chef: Toque };
const FACE_EXTRA = { lift: Sweat, sad: Tear };

export default function Buddy({ scene = "wave", size = 96, says, className = "", label }) {
  const c = SCENES[scene] || SCENES.wave;
  const Back = BACK[scene], Head = HEAD[scene], Extra = FACE_EXTRA[scene];
  const buddy = (
    <span className={`bd bd-${scene} ${className}`} style={{ width: size, height: size }} role="img" aria-label={label || `${c.name || "Flex"} is ${c.label}`}>
      <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
        {scene !== "scale" && <ellipse className="bd-shadow" cx="60" cy="108" rx="26" ry="4" />}
        {Back && <Back />}
        <g className={`bd-all bd-b-${c.body}`} style={{ "--bt": `${c.dur * 2}ms` }}>
          <Leg x={52} swing={c.legs || 0} dur={c.dur} move={!!c.legs} />
          <Leg x={68} swing={c.legs ? -c.legs : 0} dur={c.dur} move={!!c.legs} />
          <rect className="bd-body" x="38" y="40" width="44" height="54" rx="22" />
          <Face mood={c.mood} />
          <Hair />
          {Head && <Head />}
          {Extra && <Extra />}
          <Arm side="L" pose={c.L} dur={c.dur} delay={c.swap ? c.dur : 0} />
          <Arm side="R" pose={c.R} dur={c.dur} />
        </g>
      </svg>
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
