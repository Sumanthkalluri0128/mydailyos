// A small "start -> finish" picture for an exercise, drawn as a stick figure (no image files to download, works offline).
// How it works, in plain words:
//   1. POSES says how the body looks at the START and at the END of each movement (by "slot", e.g. squat, row, curl).
//   2. A pose is just a few angles. 0 = pointing up, 90 = pointing forward, 180 = pointing down, 270 = pointing backward.
//   3. drawPose() turns the angles into lines. The feet are put on the floor and the figure is centred for you.
// Want a real photo instead? Give the exercise an `image` URL on the server and it is shown in place of the drawing.
const FLOOR = 92;                                   // y of the floor in the 100 x 100 picture
const LEN = { torso: 24, arm1: 14, arm2: 13, thigh: 20, shin: 19, head: 5.5 };

// t torso, a1 upper arm, a2 forearm, k1 thigh, k2 shin (the 2nd leg, l2, is drawn fainter behind).
// y: fixed hip height (sitting or lying).  lift: raise the body off the floor.  seat: draw a bench/seat.  tool: weight in the hands.
const STAND = { t: 0, a1: 168, a2: 158, k1: 180, k2: 180 };      // arms hang a little forward so they show beside the body
const LIE = { t: 270, k1: 45, k2: 160, y: 86, seat: 30 };       // on your back, knees bent
const SIT = { t: 0, k1: 90, k2: 180, y: 68, seat: 20 };         // on a seat, feet down
const POSES = {
  squat:   [{ ...STAND, a1: 150, a2: 60, tool: 1 }, { t: 25, a1: 150, a2: 60, k1: 100, k2: 200, tool: 1 }],
  hinge:   [{ ...STAND, tool: 1 }, { t: 75, a1: 150, a2: 150, k1: 172, k2: 188, tool: 1 }],
  lunge:   [{ ...STAND, tool: 1 }, { t: 0, a1: 180, a2: 180, k1: 100, k2: 185, l2: [200, 250], tool: 1 }],
  glute:   [{ ...LIE, a1: 75, a2: 75 }, { t: 255, k1: 75, k2: 165, a1: 75, a2: 75, y: 79 }],
  quad:    [{ ...SIT, a1: 160, a2: 160 }, { ...SIT, k2: 95, a1: 160, a2: 160 }],
  ham:     [{ ...SIT, k2: 95, a1: 160, a2: 160 }, { ...SIT, k2: 205, a1: 160, a2: 160 }],
  calf:    [{ ...STAND, tool: 1 }, { ...STAND, lift: 7, tool: 1 }],
  hpress:  [{ ...LIE, a1: 180, a2: 0, tool: 1 }, { ...LIE, a1: 0, a2: 0, tool: 1 }],
  ipress:  [{ ...LIE, t: 315, y: 80, a1: 190, a2: 10, tool: 1 }, { ...LIE, t: 315, y: 80, a1: 20, a2: 20, tool: 1 }],
  fly:     [{ ...STAND, a1: 265, a2: 265 }, { ...STAND, a1: 90, a2: 90 }],
  vpress:  [{ ...STAND, a1: 160, a2: 20, tool: 1 }, { ...STAND, a1: 5, a2: 5, tool: 1 }],
  lateral: [{ ...STAND, tool: 1 }, { ...STAND, a1: 95, a2: 100, tool: 1 }],
  rear:    [{ t: 70, a1: 160, a2: 160, k1: 172, k2: 188, tool: 1 }, { t: 70, a1: 240, a2: 240, k1: 172, k2: 188, tool: 1 }],
  tri:     [{ ...STAND, a1: 170, a2: 60 }, { ...STAND, a1: 170, a2: 165 }],
  vpull:   [{ ...SIT, a1: 5, a2: 5 }, { ...SIT, a1: 150, a2: 20 }],
  hrow:    [{ ...SIT, a1: 90, a2: 90 }, { ...SIT, a1: 240, a2: 90 }],
  bicep:   [{ ...STAND, tool: 1 }, { ...STAND, a2: 25, tool: 1 }],
  core:    [{ ...LIE, a1: 300, a2: 20 }, { ...LIE, t: 300, a1: 300, a2: 20 }],
};

const toXY = ([x, y], angle, len) => [x + len * Math.sin((angle * Math.PI) / 180), y - len * Math.cos((angle * Math.PI) / 180)];

/** Angles in, points out: hip, neck, head, elbow, hand and both legs' knee + ankle. */
function drawPose(p) {
  const hip = [0, 0];
  const neck = toXY(hip, p.t, LEN.torso);
  const elbow = toXY(neck, p.a1, LEN.arm1), hand = toXY(elbow, p.a2, LEN.arm2);
  const knee = toXY(hip, p.k1, LEN.thigh), ankle = toXY(knee, p.k2, LEN.shin);
  const knee2 = p.l2 ? toXY(hip, p.l2[0], LEN.thigh) : null, ankle2 = knee2 ? toXY(knee2, p.l2[1], LEN.shin) : null;
  const head = toXY(neck, p.t, LEN.head + 3);
  const all = [hip, neck, elbow, hand, knee, ankle, head, ...(knee2 ? [knee2, ankle2] : [])];
  const lowestFoot = Math.max(ankle[1], ankle2 ? ankle2[1] : -99);
  const dy = (p.y ?? FLOOR - lowestFoot - (p.lift || 0));                 // feet on the floor unless the pose fixes the hip height
  const dx = 50 - (Math.min(...all.map((a) => a[0])) + Math.max(...all.map((a) => a[0]))) / 2;   // centre left-right
  const mv = ([x, y]) => [x + dx, y + dy];
  return { hip: mv(hip), neck: mv(neck), elbow: mv(elbow), hand: mv(hand), knee: mv(knee), ankle: mv(ankle), head: mv(head), knee2: knee2 && mv(knee2), ankle2: ankle2 && mv(ankle2) };
}

const line = (a, b, key, cls = "") => <line key={key} className={`bp-pic-bone ${cls}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;

function Frame({ pose, label }) {
  const j = drawPose(pose);
  return (
    <figure className="bp-pic-frame">
      <svg viewBox="0 0 100 100" role="img" aria-label={label}>
        <line className="bp-pic-floor" x1="6" y1={FLOOR + 2} x2="94" y2={FLOOR + 2} />
        {pose.seat ? <line className="bp-pic-seat" x1={j.hip[0] - pose.seat} y1={j.hip[1] + 5} x2={j.hip[0] + pose.seat * 0.4} y2={j.hip[1] + 5} /> : null}
        {j.knee2 && [line(j.hip, j.knee2, "t2", "back"), line(j.knee2, j.ankle2, "s2", "back")]}
        {[line(j.hip, j.knee, "t1"), line(j.knee, j.ankle, "s1")]}
        {line(j.hip, j.neck, "torso")}
        {[line(j.neck, j.elbow, "arm1"), line(j.elbow, j.hand, "arm2")]}
        <circle className="bp-pic-head" cx={j.head[0]} cy={j.head[1]} r={LEN.head} />
        {pose.tool ? <circle className="bp-pic-weight" cx={j.hand[0]} cy={j.hand[1]} r="4.2" /> : null}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function ExercisePic({ slot, image, name }) {
  if (image) return <img className="bp-pic-photo" src={image} alt={name || "Exercise"} loading="lazy" />;
  const pair = POSES[slot];
  if (!pair) return null;
  return <div className="bp-pic" aria-label={`${name || "Exercise"}: start and finish`}><Frame pose={pair[0]} label="Start" /><span className="bp-pic-arrow" aria-hidden="true">→</span><Frame pose={pair[1]} label="Finish" /></div>;
}
