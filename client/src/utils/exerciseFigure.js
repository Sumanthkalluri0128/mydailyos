// Exercise figures for the Body plan. Pure geometry: NO React, NO DOM. Angles in, a list of simple shapes out.
// The web (ExercisePic.jsx) and the phone (ExercisePic.tsx, react-native-svg) both draw the same shapes, so the picture is identical.
// KEEP THE TWO COPIES OF THIS FILE IDENTICAL: client/src/utils/exerciseFigure.js and MyDailyOSMobile/src/utils/exerciseFigure.ts.
//
// What you get for an exercise (figureFor):
//   frames  : 3 key frames (start, middle, finish), each a list of shapes: body with clothes, equipment in the hands, muscles lit up
//   ghost   : the finish pose, faint, to lay behind the start so the whole range of motion is visible in one picture
//   env     : things that do not move (bench, seat, cable machine, bar, step) drawn once behind the person
//   arrow   : a dashed arrow showing where the moving joint travels
//   tween(p): the shapes at progress p (0..1) so the screens can play it as a smooth loop
// Angles: 0 = pointing up, 90 = forward (the person faces right), 180 = down, 270 = backward. Every pose is a few angles.
//
// Shape roles (the screen picks the colours): outline skin shirt shorts shoe hair hi metal dark plate pad floor cable band arrow
const W = 120, FLOOR = 90;
const L = { torso: 26, neck: 3.2, head: 6.3, a1: 14, a2: 12.5, k1: 21, k2: 20, foot: 8.5 };
const rad = (a) => (a * Math.PI) / 180;
const dir = (a) => [Math.sin(rad(a)), -Math.cos(rad(a))];
const go = (p, d, n) => [p[0] + d[0] * n, p[1] + d[1] * n];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const r2 = (x) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------- body poses (side view)
// t torso, a1 upper arm, a2 forearm, k1 thigh, k2 shin; l2 = [thigh, shin] of the far leg; far = {a1,a2} of the far arm; f = foot direction
// y = fixed hip height (lying / sitting on something), lift = raise the whole body (standing on a box)
const STAND = { t: 0, a1: 178, a2: 178, k1: 180, k2: 180 };
const SIT = { t: 0, k1: 90, k2: 180, y: 66 };
const LIE = { t: 270, k1: 40, k2: 165, y: 76, a1: 0, a2: 0 };                 // on your back, knees bent, feet flat
const PLANK = { t: 82, a1: 180, a2: 180, k1: 262, k2: 262 };                     // straight line, hands under shoulders
const J = (o) => ({ ...o });

// Each variant: frames [start, finish] (+ optional mid), tool (what is held), props (fixed equipment), anchor, arrow joint, view.
const V = {
  // ---------------------------------------------------------------- legs
  squat:    { frames: [J({ ...STAND, a1: 160, a2: 15 }), J({ t: 38, a1: 160, a2: 15, k1: 100, k2: 204 })], tool: 'db-chest', arrow: 'hip' },
  squatbb:  { frames: [J({ ...STAND, a1: 150, a2: 330 }), J({ t: 40, a1: 150, a2: 330, k1: 100, k2: 204 })], tool: 'bb-back', arrow: 'hip', props: ['rack'] },
  squatbw:  { frames: [J({ ...STAND, a1: 175, a2: 175 }), J({ t: 38, a1: 95, a2: 95, k1: 100, k2: 204 })], tool: null, arrow: 'hip' },
  boxsquat: { frames: [J({ ...STAND, a1: 160, a2: 15 }), J({ t: 36, a1: 160, a2: 15, k1: 98, k2: 190 })], tool: 'db-chest', arrow: 'hip', props: ['box'] },
  chairsit: { frames: [J({ t: 30, a1: 100, a2: 100, k1: 100, k2: 190, lift: 0 }), J({ ...STAND, a1: 100, a2: 100 })], tool: null, arrow: 'hip', props: ['chair'] },
  wallsit:  { frames: [J({ ...STAND, a1: 175, a2: 175 }), J({ t: 0, a1: 175, a2: 175, k1: 90, k2: 180 })], tool: null, arrow: 'hip', props: ['wall'] },
  legpress: { frames: [J({ t: 312, a1: 330, a2: 300, k1: 30, k2: 80, y: 74 }), J({ t: 312, a1: 330, a2: 300, k1: 52, k2: 52, y: 74 })], tool: 'handle', arrow: 'ankle', props: ['legpress'], anchor: 'hip' },
  legext:   { frames: [J({ ...SIT, a1: 160, a2: 160 }), J({ ...SIT, k2: 92, a1: 160, a2: 160 })], tool: 'handle-seat', arrow: 'ankle', props: ['machine-seat'], anchor: 'hip' },
  legcurl:  { frames: [J({ ...SIT, k2: 92, a1: 160, a2: 160 }), J({ ...SIT, k2: 215, a1: 160, a2: 160 })], tool: 'handle-seat', arrow: 'ankle', props: ['machine-seat'], anchor: 'hip' },
  lyingcurl:{ frames: [J({ t: 90, a1: 180, a2: 180, k1: 270, k2: 270, y: 70, prone: 1 }), J({ t: 90, a1: 180, a2: 180, k1: 270, k2: 330, y: 70, prone: 1 })], tool: null, arrow: 'ankle', props: ['bench-flat'], anchor: 'hip' },
  lunge:    { frames: [J({ ...STAND, a1: 178, a2: 178 }), J({ t: 0, a1: 178, a2: 178, k1: 98, k2: 186, l2: [196, 252] })], tool: 'db-side', arrow: 'hip', anchor: 'foot' },
  stepup:   { frames: [J({ t: 14, a1: 178, a2: 178, k1: 78, k2: 184, l2: [180, 180] }), J({ t: 0, a1: 178, a2: 178, k1: 180, k2: 180, l2: [95, 190], lift: 15 })], tool: 'db-side', arrow: 'hip', props: ['step'], anchor: 'foot' },
  calf:     { frames: [J({ ...STAND, a1: 178, a2: 178 }), J({ ...STAND, a1: 178, a2: 178, lift: 6, up: 1 })], tool: 'db-side', arrow: 'ankle' },
  // ---------------------------------------------------------------- hinge and glutes
  rdl:      { frames: [J({ ...STAND, a1: 175, a2: 175 }), J({ t: 78, a1: 172, a2: 172, k1: 168, k2: 184 })], tool: 'db-hang', arrow: 'hand', anchor: 'foot' },
  deadlift: { frames: [J({ t: 62, a1: 175, a2: 175, k1: 130, k2: 192 }), J({ ...STAND, a1: 176, a2: 176 })], tool: 'bb-hang', arrow: 'hand', anchor: 'foot' },
  swing:    { frames: [J({ t: 70, a1: 135, a2: 120, k1: 150, k2: 190 }), J({ ...STAND, a1: 92, a2: 92 })], tool: 'kb-hang', arrow: 'hand', anchor: 'foot' },
  pullthru: { frames: [J({ t: 72, a1: 195, a2: 205, k1: 160, k2: 185 }), J({ ...STAND, a1: 190, a2: 195 })], tool: 'rope-low-behind', arrow: 'hip', props: ['pulley-low-behind'], anchor: 'foot' },
  backext:  { frames: [J({ t: 90, a1: 20, a2: 340, k1: 270, k2: 270, prone: 1, y: 60 }), J({ t: 14, a1: 20, a2: 340, k1: 270, k2: 270, prone: 1, y: 60 })], tool: null, arrow: 'neck', props: ['hyper'], anchor: 'hip' },
  hipthrust:{ frames: [J({ t: 290, a1: 150, a2: 150, k1: 85, k2: 170, y: 80, rest: 1 }), J({ t: 270, a1: 150, a2: 150, k1: 62, k2: 175, y: 73, rest: 1 })], tool: 'bb-lap', arrow: 'hip', props: ['bench-back'], anchor: 'foot' },
  bridge:   { frames: [J({ ...LIE, a1: 90, a2: 90 }), J({ t: 258, a1: 90, a2: 90, k1: 62, k2: 170, y: 68 })], tool: null, arrow: 'hip', props: ['mat'], anchor: 'foot' },
  kickback: { frames: [J({ t: 40, a1: 140, a2: 120, k1: 180, k2: 180, l2: [180, 180] }), J({ t: 40, a1: 140, a2: 120, k1: 180, k2: 180, l2: [232, 236] })], tool: 'cable-ankle', arrow: 'ankle', props: ['pulley-low'], anchor: 'foot' },
  // ---------------------------------------------------------------- push
  benchpress:{ frames: [J({ ...LIE, a1: 12, a2: 12, y: 74 }), J({ ...LIE, a1: 150, a2: 40, y: 74 })], mid: null, tool: 'bb-press', arrow: 'hand', props: ['bench-flat'], anchor: 'hip', toolFlip: 1 },
  inclinepress:{ frames: [J({ t: 315, a1: 20, a2: 20, k1: 92, k2: 180, y: 72 }), J({ t: 315, a1: 150, a2: 50, k1: 92, k2: 180, y: 72 })], tool: 'db-press', arrow: 'hand', props: ['bench-incline'], anchor: 'hip' },
  pushup:   { frames: [J({ ...PLANK, ground: ['foot', 'hand'] }), J({ t: 84, a1: 120, a2: 190, k1: 264, k2: 264, ground: ['foot', 'hand'], low: 1 })], tool: null, arrow: 'neck', anchor: 'foot' },
  inclinepu:{ frames: [J({ t: 62, a1: 160, a2: 175, k1: 242, k2: 242 }), J({ t: 66, a1: 100, a2: 190, k1: 244, k2: 244 })], tool: null, arrow: 'neck', props: ['bench-hand'], anchor: 'foot' },
  kneepu:   { frames: [J({ t: 82, a1: 180, a2: 180, k1: 262, k2: 20, ground: ['knee', 'hand'] }), J({ t: 86, a1: 120, a2: 190, k1: 264, k2: 20, ground: ['knee', 'hand'] })], tool: null, arrow: 'neck', anchor: 'knee' },
  fly:      { frames: [J({ ...LIE, a1: 90, a2: 90, y: 74 }), J({ ...LIE, a1: 0, a2: 0, y: 74 })], tool: 'db-press', arrow: 'hand', props: ['bench-flat'], anchor: 'hip' },
  // ---------------------------------------------------------------- shoulders
  vpress:   { frames: [J({ ...STAND, a1: 130, a2: 20, k1: 180 }), J({ ...STAND, a1: 10, a2: 5 })], tool: 'db-press', arrow: 'hand', anchor: 'foot' },
  vpressm:  { frames: [J({ ...SIT, a1: 130, a2: 20, y: 62 }), J({ ...SIT, a1: 10, a2: 5, y: 62 })], tool: 'handle', arrow: 'hand', props: ['machine-seat'], anchor: 'hip' },
  lateral:  { frames: [J({ ...STAND, a1: 172, a2: 172, t: 6 }), J({ ...STAND, a1: 98, a2: 104, t: 6 })], tool: 'db-hang', arrow: 'hand', anchor: 'foot' },
  rear:     { frames: [J({ t: 72, a1: 175, a2: 175, k1: 166, k2: 186 }), J({ t: 72, a1: 120, a2: 125, k1: 166, k2: 186 })], tool: 'db-hang', arrow: 'hand', anchor: 'foot' },
  facepull: { frames: [J({ ...STAND, a1: 112, a2: 98, t: 4 }), J({ ...STAND, a1: 260, a2: 40, t: 4 })], tool: 'rope-face', arrow: 'hand', props: ['pulley-face'], anchor: 'foot' },
  // ---------------------------------------------------------------- triceps and biceps
  pushdown: { frames: [J({ ...STAND, t: 8, a1: 200, a2: 330 }), J({ ...STAND, t: 8, a1: 200, a2: 178 })], tool: 'rope-down', arrow: 'hand', props: ['pulley-high'], anchor: 'foot' },
  overhead: { frames: [J({ ...STAND, t: 6, a1: 0, a2: 232 }), J({ ...STAND, t: 6, a1: 0, a2: 0 })], tool: 'db-press', arrow: 'hand', anchor: 'foot' },
  skull:    { frames: [J({ ...LIE, a1: 10, a2: 10, y: 74 }), J({ ...LIE, a1: 10, a2: 280, y: 74 })], tool: 'bb-press', arrow: 'hand', props: ['bench-flat'], anchor: 'hip' },
  dip:      { frames: [J({ t: 8, a1: 190, a2: 180, k1: 150, k2: 180, ground: ['foot'] }), J({ t: 14, a1: 130, a2: 190, k1: 150, k2: 180, ground: ['foot'] })], tool: null, arrow: 'hip', props: ['bench-hand-back'], anchor: 'foot' },
  tkick:    { frames: [J({ t: 72, a1: 215, a2: 140, k1: 166, k2: 186 }), J({ t: 72, a1: 258, a2: 258, k1: 166, k2: 186 })], tool: 'db-hang', arrow: 'hand', anchor: 'foot' },
  curl:     { frames: [J({ ...STAND, a1: 178, a2: 178 }), J({ ...STAND, a1: 176, a2: 20 })], tool: 'db-hang', arrow: 'hand', anchor: 'foot' },
  inclinecurl:{ frames: [J({ t: 332, a1: 178, a2: 178, k1: 98, k2: 180, y: 66 }), J({ t: 332, a1: 176, a2: 20, k1: 98, k2: 180, y: 66 })], tool: 'db-hang', arrow: 'hand', props: ['bench-incline'], anchor: 'hip' },
  preacher: { frames: [J({ ...SIT, y: 64, a1: 130, a2: 140 }), J({ ...SIT, y: 64, a1: 130, a2: 20 })], tool: 'handle', arrow: 'hand', props: ['preacher'], anchor: 'hip' },
  // ---------------------------------------------------------------- pull
  pulldown: { frames: [J({ ...SIT, y: 62, t: 354, a1: 5, a2: 5 }), J({ ...SIT, y: 62, t: 346, a1: 205, a2: 60 })], tool: 'bar-end', arrow: 'hand', props: ['machine-seat', 'pulley-top'], anchor: 'hip' },
  pullup:   { frames: [J({ t: 0, a1: 0, a2: 0, k1: 190, k2: 220, hang: 1, lift: 8 }), J({ t: 0, a1: 140, a2: 20, k1: 200, k2: 235, hang: 1, lift: 20 })], tool: 'bar-end', arrow: 'neck', props: ['pullbar'], anchor: 'hand' },
  inverted: { frames: [J({ t: 272, a1: 0, a2: 0, k1: 92, k2: 92, y: 60, ground: ['foot'] }), J({ t: 272, a1: 140, a2: 20, k1: 92, k2: 92, y: 60, ground: ['foot'] })], tool: 'bar-end', arrow: 'neck', props: ['lowbar'], anchor: 'foot' },
  straightarm:{ frames: [J({ ...STAND, t: 12, a1: 20, a2: 20 }), J({ ...STAND, t: 12, a1: 170, a2: 170 })], tool: 'rope-top', arrow: 'hand', props: ['pulley-top-front'], anchor: 'foot' },
  seatedrow:{ frames: [J({ ...SIT, y: 62, t: 8, a1: 90, a2: 90, k1: 100, k2: 175 }), J({ ...SIT, y: 62, t: 354, a1: 245, a2: 90, k1: 100, k2: 175 })], tool: 'handle', arrow: 'hand', props: ['row-seat'], anchor: 'hip' },
  bbrow:    { frames: [J({ t: 62, a1: 176, a2: 176, k1: 164, k2: 186 }), J({ t: 62, a1: 232, a2: 150, k1: 164, k2: 186 })], tool: 'bb-hang', arrow: 'hand', anchor: 'foot' },
  dbrow:    { frames: [J({ t: 78, a1: 176, a2: 176, k1: 176, k2: 186, rest: 1, support: 1 }), J({ t: 78, a1: 240, a2: 150, k1: 176, k2: 186, rest: 1, support: 1 })], tool: 'db-hang', arrow: 'hand', props: ['bench-support'], anchor: 'foot' },
  // ---------------------------------------------------------------- core
  plank:    { frames: [J({ t: 82, a1: 150, a2: 90, k1: 262, k2: 262, ground: ['foot', 'hand'] }), J({ t: 84, a1: 150, a2: 90, k1: 262, k2: 262, ground: ['foot', 'hand'] })], tool: null, arrow: null, anchor: 'foot' },
  crunch:   { frames: [J({ ...LIE, a1: 300, a2: 20 }), J({ ...LIE, t: 300, a1: 300, a2: 20 })], tool: null, arrow: 'neck', props: ['mat'], anchor: 'hip' },
  legraise: { frames: [J({ ...LIE, k1: 100, k2: 100, a1: 270, a2: 270 }), J({ ...LIE, k1: 5, k2: 5, a1: 270, a2: 270 })], tool: null, arrow: 'ankle', props: ['mat'], anchor: 'hip' },
  deadbug:  { frames: [J({ ...LIE, k1: 0, k2: 90, a1: 0, a2: 0, l2: [0, 90] }), J({ ...LIE, k1: 0, k2: 90, a1: 0, a2: 0, l2: [88, 90] })], tool: null, arrow: 'ankle', props: ['mat'], anchor: 'hip' },
  pallof:   { frames: [J({ ...STAND, t: 0, a1: 140, a2: 280 }), J({ ...STAND, t: 0, a1: 92, a2: 92 })], tool: 'handle', arrow: 'hand', props: ['pulley-mid-behind'], anchor: 'foot' },
  cablecrunch:{ frames: [J({ t: 5, a1: 200, a2: 330, k1: 180, k2: 270, ground: ['knee'] }), J({ t: 45, a1: 200, a2: 330, k1: 180, k2: 270, ground: ['knee'] })], tool: 'rope-top-behind', arrow: 'neck', props: ['pulley-top-back'], anchor: 'knee' },
  carry:    { frames: [J({ ...STAND, a1: 178, a2: 178 }), J({ ...STAND, a1: 178, a2: 178, k1: 170, k2: 190 })], tool: 'db-side', arrow: null, anchor: 'foot' },
};
// Poses drawn from the front (both arms and legs visible). Arm angle: 0 = hanging down, 90 = out sideways, 180 = overhead.
const FRONT = {
  lateralf: { a: [8, 92], e: [6, 6], tool: 'db-front', arrow: true },
  flyf:     { a: [88, 40], e: [30, 12], tool: 'handle-front', arrow: true, seat: true },
  pressf:   { a: [96, 172], e: [88, 8], tool: 'db-front', arrow: true },
  pulldownf:{ a: [170, 62], e: [4, 66], tool: 'bar-front', arrow: true, seat: true, bar: true },
  reartf:   { a: [8, 96], e: [6, 6], tool: 'db-front', arrow: true, bent: true },
  pullapart:{ a: [78, 98], e: [4, 4], tool: 'band-front', arrow: true, band: true },
};

// ---------------------------------------------------------------------------------------------------------------- which exercise uses which pose
const BY_ID = {
  'goblet-squat': 'squat', 'kb-goblet': 'squat', 'back-squat': 'squatbb', 'smith-squat': 'squatbb', 'hack-squat': 'squatbb', 'box-squat': 'boxsquat',
  'sit-to-stand': 'chairsit', 'tempo-squat': 'squatbw', 'backpack-squat': 'squat', 'wall-sit': 'wallsit', 'leg-press': 'legpress', 'leg-ext': 'legext',
  'leg-curl-seated': 'legcurl', 'leg-curl-lying': 'lyingcurl', 'slider-curl': 'lyingcurl', 'band-leg-curl': 'lyingcurl', 'nordic': 'lyingcurl',
  'rdl-db': 'rdl', 'rdl-bb': 'rdl', 'sl-rdl': 'rdl', 'trap-deadlift': 'deadlift', 'kb-swing': 'swing', 'pull-through': 'pullthru', 'band-pull-through': 'pullthru',
  'back-ext': 'backext', 'hip-thrust-bb': 'hipthrust', 'hip-thrust-machine': 'hipthrust', 'glute-bridge': 'bridge', 'sl-glute-bridge': 'bridge', 'frog-pump': 'bridge',
  'banded-bridge': 'bridge', 'cable-kickback': 'kickback', 'hip-abduction': 'legext',
  'split-db': 'lunge', 'bulgarian': 'lunge', 'reverse-lunge': 'lunge', 'walking-lunge': 'lunge', 'step-up': 'stepup', 'smith-split': 'lunge',
  'calf-machine': 'calf', 'calf-press': 'calf', 'calf-step': 'calf',
  'chest-press-machine': 'vpressm', 'db-bench': 'benchpress', 'bb-bench': 'benchpress', 'smith-bench': 'benchpress', 'floor-press': 'benchpress', 'band-chest-press': 'benchpress',
  'pushup': 'pushup', 'pushup-handles': 'pushup', 'incline-pushup': 'inclinepu', 'knee-pushup': 'kneepu', 'feet-low-pushup': 'pushup', 'feet-high-pushup': 'pushup',
  'incline-db': 'inclinepress', 'incline-machine': 'inclinepress', 'incline-bb': 'inclinepress', 'smith-incline': 'inclinepress',
  'pec-deck': 'flyf', 'cable-fly': 'flyf', 'db-fly': 'fly', 'band-fly': 'flyf', 'palm-press': 'flyf',
  'shoulder-press-machine': 'vpressm', 'db-shoulder-press': 'vpress', 'bb-ohp': 'vpress', 'landmine-press': 'vpress', 'kb-press': 'vpress', 'pike-pushup': 'vpress', 'backpack-ohp': 'vpress', 'band-ohp': 'vpress',
  'lateral-db': 'lateralf', 'lateral-cable': 'lateralf', 'lateral-machine': 'lateralf', 'lateral-band': 'lateralf', 'lateral-bottle': 'lateralf',
  'rev-pec-deck': 'reartf', 'face-pull': 'facepull', 'rear-fly-supported': 'rear', 'rear-fly-db': 'rear', 'band-pull-apart': 'pullapart', 'prone-ytw': 'pullapart',
  'pushdown-rope': 'pushdown', 'overhead-cable-ext': 'overhead', 'skull': 'skull', 'db-overhead-ext': 'overhead', 'assisted-dip': 'dip', 'diamond-pushup': 'pushup',
  'band-pushdown': 'pushdown', 'kickback-db': 'tkick', 'kickback-bottle': 'tkick',
  'lat-pulldown': 'pulldownf', 'close-pulldown': 'pulldown', 'assisted-pullup': 'pullup', 'straight-arm': 'straightarm', 'pullup': 'pullup', 'chinup': 'pullup',
  'neg-pullup': 'pullup', 'band-assisted-pullup': 'pullup', 'band-pulldown': 'pulldownf', 'superman-pulldown': 'pulldownf', 'towel-pull': 'pullup',
  'seated-row': 'seatedrow', 'chest-row-machine': 'seatedrow', 'tbar': 'bbrow', 'bb-row': 'bbrow', 'db-row': 'dbrow', 'db-row-supported': 'dbrow', 'bag-row': 'dbrow', 'inverted-row': 'inverted', 'band-row': 'seatedrow',
  'db-curl': 'curl', 'hammer-curl': 'curl', 'cable-curl': 'curl', 'ez-curl': 'curl', 'incline-curl': 'inclinecurl', 'preacher-machine': 'preacher', 'band-curl': 'curl', 'backpack-curl': 'curl',
  'plank': 'plank', 'dead-bug': 'deadbug', 'bird-dog': 'plank', 'side-plank': 'plank', 'pallof': 'pallof', 'pallof-band': 'pallof', 'cable-crunch': 'cablecrunch',
  'captain-chair': 'legraise', 'reverse-crunch': 'legraise', 'farmer-carry': 'carry', 'bag-carry': 'carry',
};
const BY_SLOT = { squat: 'squat', quad: 'legext', hinge: 'rdl', glute: 'bridge', lunge: 'lunge', ham: 'legcurl', calf: 'calf', hpress: 'benchpress', ipress: 'inclinepress', fly: 'flyf', vpress: 'vpress', lateral: 'lateralf', rear: 'rear', tri: 'pushdown', vpull: 'pulldownf', hrow: 'seatedrow', bicep: 'curl', core: 'crunch' };

/** The tool in the hands, from what the exercise is. Equipment you can see is the quickest way to tell exercises apart. */
function toolKind(ex) {
  const id = String((ex && ex.id) || ''), name = String((ex && ex.name) || '').toLowerCase(), kind = String((ex && ex.kind) || '');
  if (/band/.test(id) || kind === 'band' || /band/.test(name)) return 'band';
  if (/kb-|kettlebell/.test(id + name)) return 'kb';
  if (/backpack|bag|bottle|water can/.test(id + name)) return 'bag';
  if (/^(bb-|rdl-bb|tbar|trap|back-squat|incline-bb|ez-|skull|smith|hip-thrust-bb)/.test(id) || /barbell|bar\b/.test(name) && kind === 'free weights' && !/dumbbell/.test(name)) return 'bb';
  if (kind === 'free weights') return 'db';
  if (kind === 'cable') return 'cable';
  if (kind === 'machine') return 'machine';
  return 'none';
}

// ---------------------------------------------------------------------------------------------------------------- solving a pose into joints
function solve(p) {
  const hip = [0, 0];
  const neck = go(hip, dir(p.t), L.torso);
  const head = go(neck, dir(p.t), L.neck + L.head);
  const sh = go(hip, dir(p.t), L.torso - 2);                        // shoulder joint sits a little below the neck
  const elbow = go(sh, dir(p.a1), L.a1), hand = go(elbow, dir(p.a2), L.a2);
  const knee = go(hip, dir(p.k1), L.k1), ankle = go(knee, dir(p.k2), L.k2);
  const fdir = p.f !== undefined ? p.f : p.k2 > 120 && p.k2 < 260 ? 90 : p.k2 >= 260 ? 180 : 90;   // the foot points forward; toes down when the leg is straight out behind
  const toe = go(ankle, dir(p.prone ? 180 : p.hang ? 130 : p.up ? 120 : fdir), L.foot * (p.prone ? 0.55 : 1));
  const l2 = p.l2 || [p.k1, p.k2];
  const knee2 = go(hip, dir(l2[0]), L.k1), ankle2 = go(knee2, dir(l2[1]), L.k2);
  const toe2 = go(ankle2, dir(p.f !== undefined ? p.f : l2[1] > 120 && l2[1] < 260 ? 90 : 180), L.foot);
  const far = p.far || {};
  const elbow2 = go(sh, dir(far.a1 !== undefined ? far.a1 : p.a1), L.a1), hand2 = go(elbow2, dir(far.a2 !== undefined ? far.a2 : p.a2), L.a2);
  return { hip, neck, head, sh, elbow, hand, knee, ankle, toe, knee2, ankle2, toe2, elbow2, hand2, t: p.t };
}

/** Put the solved body in the picture: feet (and hands or knees) on the floor unless the pose fixes the hip height. */
function place(j, p, ax) {
  const contact = p.ground || ['foot'];
  const ys = [];
  if (contact.includes('foot')) ys.push(j.ankle[1] + 3, j.ankle2[1] + 3, j.toe[1] + 1.5);
  if (contact.includes('hand')) ys.push(j.hand[1] + 2.6);
  if (contact.includes('knee')) ys.push(j.knee[1] + 4.2);
  const dy = p.y !== undefined ? p.y - j.hip[1] : FLOOR - Math.max(...ys) - (p.lift || 0);
  let dx = 0;
  if (ax === 'hip') dx = 60 - j.hip[0];
  else if (ax === 'hand') dx = 62 - j.hand[0];
  else if (ax === 'knee') dx = 56 - j.knee[0];
  else dx = 52 - j.ankle[0];
  const mv = (q) => [q[0] + dx, q[1] + dy];
  const out = {};
  for (const k of Object.keys(j)) out[k] = Array.isArray(j[k]) ? mv(j[k]) : j[k];
  out.floorY = FLOOR - (p.lift || 0) * 0;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- drawing helpers (shapes)
const S = {
  line: (a, b, w, role, o = {}) => ({ k: 'line', x1: r2(a[0]), y1: r2(a[1]), x2: r2(b[0]), y2: r2(b[1]), w, role, ...o }),
  circle: (c, r, role, o = {}) => ({ k: 'circle', cx: r2(c[0]), cy: r2(c[1]), r, role, ...o }),
  poly: (pts, role, o = {}) => ({ k: 'poly', pts: pts.map((p) => [r2(p[0]), r2(p[1])]), role, ...o }),
  path: (d, role, o = {}) => ({ k: 'path', d, role, ...o }),
  rect: (x, y, w, h, role, o = {}) => ({ k: 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), role, rx: o.rx === undefined ? 1.2 : o.rx, ...o }),
};
const limb = (a, b, w, role, out) => { out.push(S.line(a, b, w + 2.2, 'outline'), S.line(a, b, w, role)); };
const normal = (t) => { const d = dir(t); return [-d[1] * -1, d[0] * -1]; };   // not used directly; see front()
// "front" of the body: the way the person faces when the torso points at angle t (upright facing right -> (1, 0))
const front = (t) => [Math.cos(rad(t)), Math.sin(rad(t))];

function bodyShapes(j, p, hi, opts = {}) {
  const out = [];
  const faint = opts.ghost ? 0.3 : 1;
  const tdir = dir(p.t), fr = front(p.t);
  // far arm and far leg first (behind), lighter
  const farSkin = 'skinFar';
  limb(j.hip, j.knee2, 9.2, 'shortsFar', out); limb(j.knee2, j.ankle2, 6.6, farSkin, out);
  out.push(S.line(j.ankle2, j.toe2, 4.6, 'shoeFar'));
  limb(j.sh, j.elbow2, 5.6, 'shirtFar', out); limb(j.elbow2, j.hand2, 4.6, farSkin, out);
  // torso: a shaped body (hips, waist, chest, shoulders) as one polygon, shirt colour
  const at = (u, back, frontOff) => { const c = go(j.hip, tdir, L.torso * u); return [go(c, fr, frontOff), go(c, fr, -back)]; };
  const stops = [[0.02, 5.4, 5.6], [0.3, 4.8, 5.0], [0.62, 6.0, 7.0], [0.9, 5.2, 5.6], [1.0, 3.6, 3.8]];
  const frontPts = stops.map(([u, b, f]) => at(u, b, f)[0]);
  const backPts = stops.map(([u, b, f]) => at(u, b, f)[1]).reverse();
  out.push(S.poly([...frontPts, ...backPts], 'outline', { grow: 2.2 }));
  out.push(S.poly([...frontPts, ...backPts], 'shirt'));
  // near leg: shorts on the upper thigh, skin below, shoe
  limb(j.hip, j.knee, 10, 'skin', out);
  out.push(S.line(j.hip, mix(j.hip, j.knee, 0.62), 10, 'shorts'));
  limb(j.knee, j.ankle, 7.2, 'skin', out);
  out.push(S.line(j.ankle, j.toe, 5.2, 'outline'), S.line(j.ankle, j.toe, 3.4, 'shoe'));
  // neck and head with hair on the back and top
  out.push(S.line(go(j.neck, tdir, -2.5), go(j.neck, tdir, L.neck + 1), 4.4, 'outline'), S.line(go(j.neck, tdir, -2.5), go(j.neck, tdir, L.neck + 1), 3, 'skin'));
  const hc = go(j.neck, tdir, L.neck + L.head - 0.5);
  out.push(S.circle(hc, L.head + 1.1, 'outline'), S.circle(hc, L.head, 'skin'));
  // hair: the back and top of the head, as a polygon (an arc would not scale with the picture)
  const hair = [];
  for (let i = 0; i <= 9; i += 1) { const ang = rad(-100 + i * 20); const up = Math.cos(ang), bk = Math.sin(ang); hair.push([hc[0] + (tdir[0] * up - fr[0] * bk) * (L.head + 0.2), hc[1] + (tdir[1] * up - fr[1] * bk) * (L.head + 0.2)]); }
  hair.push(go(hc, tdir, L.head * 0.15));
  out.push(S.poly(hair, 'hair'));
  // near arm over the torso: sleeve, skin forearm, hand
  limb(j.sh, j.elbow, 6.4, 'skin', out);
  out.push(S.line(j.sh, mix(j.sh, j.elbow, 0.5), 6.4, 'shirt'));
  limb(j.elbow, j.hand, 5.2, 'skin', out);
  out.push(S.circle(j.hand, 2.9, 'outline'), S.circle(j.hand, 2.2, 'skin'));
  // muscles that work: lit up (drawn on top of skin and clothes)
  const over = [];
  const u = (a, b, t) => mix(a, b, t);
  const seg = (a, b, w) => over.push(S.line(a, b, w, 'hi'));
  const along = (u0, u1, off, w) => seg(go(go(j.hip, tdir, L.torso * u0), fr, off), go(go(j.hip, tdir, L.torso * u1), fr, off), w);
  for (const g of hi) {
    if (g === 'chest') along(0.58, 0.92, 3.2, 6.6);
    else if (g === 'back') along(0.4, 0.92, -3.4, 6.4);
    else if (g === 'core') along(0.08, 0.46, 2.6, 6.2);
    else if (g === 'shoulders') over.push(S.circle(go(j.sh, fr, 0.5), 5.4, 'hi'));
    else if (g === 'arms') { seg(u(j.sh, j.elbow, 0.08), j.elbow, 5.4); seg(j.elbow, u(j.elbow, j.hand, 0.8), 4.4); }
    else if (g === 'legs') { seg(u(j.hip, j.knee, 0.12), j.knee, 8.6); seg(j.knee, u(j.knee, j.ankle, 0.9), 6); }
    else if (g === 'glutes') over.push(S.circle(go(j.hip, fr, -2.6), 6.4, 'hi'));
  }
  out.push(...over.map((s) => ({ ...s, hiShape: 1 })));
  if (faint !== 1) return out.map((s) => ({ ...s, o: faint }));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- equipment held in the hands
function toolShapes(kindName, tool, j, p) {
  if (!tool) return [];
  const out = [];
  const h = j.hand;
  const fdir = Math.atan2(j.hand[1] - j.elbow[1], j.hand[0] - j.elbow[0]);
  const perp = [-Math.sin(fdir), Math.cos(fdir)];
  const at = (c, d, n) => [c[0] + d[0] * n, c[1] + d[1] * n];
  const db = (c) => { out.push(S.line(at(c, perp, -4.2), at(c, perp, 4.2), 2.2, 'dark'), S.line(at(c, perp, -4.6), at(c, perp, -4.6), 0.01, 'dark')); out.push(S.rect(c[0] - 1.5, c[1] - 4.8, 3, 9.6, 'plate', { rx: 1, rot: [Math.round((fdir * 180) / Math.PI), c[0], c[1]] })); };
  const dbAt = (c) => { const a = at(c, perp, -3.6), b = at(c, perp, 3.6); out.push(S.line(a, b, 2.4, 'dark'), S.circle(a, 2.6, 'plate'), S.circle(b, 2.6, 'plate')); };
  const kb = (c) => { out.push(S.circle(at(c, [0, 1], 5.2), 4.6, 'outline'), S.circle(at(c, [0, 1], 5.2), 3.9, 'plate')); out.push(S.path(`M ${r2(c[0] - 2.6)} ${r2(c[1] + 2)} Q ${r2(c[0])} ${r2(c[1] - 4)} ${r2(c[0] + 2.6)} ${r2(c[1] + 2)}`, 'dark', { stroke: 1.5 })); };
  const plateEnd = (c, r) => { out.push(S.circle(c, r + 0.9, 'outline'), S.circle(c, r, 'plate'), S.circle(c, r * 0.28, 'metal')); };
  const bag = (c) => { out.push(S.rect(c[0] - 4, c[1] - 1, 8, 10, 'outline', { rx: 2.5 }), S.rect(c[0] - 3.2, c[1] - 0.2, 6.4, 8.4, 'plate', { rx: 2 })); };
  const handle = (c) => { out.push(S.circle(c, 2.5, 'outline'), S.circle(c, 1.8, 'metal')); };
  const dbHang = kindName === 'db' ? dbAt : kindName === 'kb' ? kb : kindName === 'bag' ? bag : kindName === 'bb' ? (c) => plateEnd(c, 7.4) : handle;
  switch (tool) {
    case 'db-hang': case 'db-side': dbHang(h); break;
    case 'db-chest': case 'db-press': (kindName === 'bb' ? (c) => plateEnd(c, 6.4) : dbHang)(h); break;
    case 'bb-press': case 'bb-hang': case 'bb-lap':
      if (kindName === 'bb' || kindName === 'machine') plateEnd(h, 7.2); else dbHang(h);   // a barbell seen end-on is a plate; dumbbells, kettlebells and bags look like themselves
      if (tool === 'bb-lap') plateEnd(j.hip, 7.2);
      break;
    case 'bb-back': plateEnd(go(j.neck, front(p.t), -3.5), 7.4); break;
    case 'kb-hang': kb(h); break;
    case 'handle': case 'handle-seat': handle(h); break;
    case 'bar-end': out.push(S.circle(h, 2.6, 'outline'), S.circle(h, 1.9, 'metal')); break;
    case 'rope-down': case 'rope-face': case 'rope-top': case 'rope-top-behind': case 'rope-low-behind': handle(h); break;
    case 'cable-ankle': out.push(S.circle(j.ankle2, 2.6, 'dark')); break;
    default: break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- equipment that stays put
function envShapes(names, fr, kindName) {
  const f0 = fr[0], f1 = fr[fr.length - 1];
  const out = [];
  const floorTo = (p) => S.line(p, [p[0], FLOOR + 1], 2.2, 'metal');
  for (const n of names || []) {
    if (n === 'bench-flat' || n === 'bench-incline' || n === 'bench-back' || n === 'bench-support' || n === 'bench-hand' || n === 'bench-hand-back') {
      const j = f0;
      if (n === 'bench-flat') {
        const a = go(j.hip, dir(f0.t), -10), b = go(j.hip, dir(f0.t), L.torso + 9), off = front(f0.t);
        const pa = go(a, off, -8.2), pb = go(b, off, -8.2);
        out.push(S.line(pa, pb, 6.2, 'outline'), S.line(pa, pb, 4.6, 'pad'), floorTo(mix(pa, pb, 0.12)), floorTo(mix(pa, pb, 0.88)));
      } else if (n === 'bench-incline') {
        const a = go(j.hip, dir(f0.t), -2), b = go(j.hip, dir(f0.t), L.torso + 4), off = front(f0.t);
        const pa = go(a, off, -8), pb = go(b, off, -8);
        const seat = [j.hip[0] - 8, j.hip[1] + 8.6];
        out.push(S.line(pa, pb, 6, 'outline'), S.line(pa, pb, 4.4, 'pad'), S.line(seat, [j.hip[0] + 10, seat[1]], 5.6, 'outline'), S.line(seat, [j.hip[0] + 10, seat[1]], 4, 'pad'), floorTo([seat[0] + 2, seat[1]]), floorTo([j.hip[0] + 8, seat[1]]));
      } else if (n === 'bench-back') {
        const x = f0.hip[0] - 15;
        out.push(S.rect(x - 7, f0.hip[1] - 12, 14, 8, 'pad', { rx: 2 }), S.rect(x - 8, f0.hip[1] - 4, 16, FLOOR - f0.hip[1] + 4, 'metal', { rx: 1.5, o: 0.9 }));
      } else if (n === 'bench-support') {
        const x = f0.hand[0], y = f0.hand[1] + 3;
        out.push(S.rect(x - 8, y, 24, 5.4, 'pad', { rx: 2 }), floorTo([x - 5, y + 5]), floorTo([x + 13, y + 5]));
      } else if (n === 'bench-hand') {
        const x = f0.hand[0], y = f0.hand[1] + 2.8;
        out.push(S.rect(x - 9, y, 22, 5.2, 'pad', { rx: 2 }), floorTo([x - 5, y + 5]), floorTo([x + 9, y + 5]));
      } else if (n === 'bench-hand-back') {
        const x = f0.hand[0], y = f0.hand[1] + 2.8;
        out.push(S.rect(x - 12, y, 24, 5.2, 'pad', { rx: 2 }), floorTo([x - 8, y + 5]), floorTo([x + 8, y + 5]));
      }
    } else if (n === 'mat') {
      out.push(S.rect(8, FLOOR + 0.2, 104, 2.8, 'pad', { rx: 1.4 }));
    } else if (n === 'machine-seat' || n === 'row-seat' || n === 'preacher') {
      const j = f0, hip = j.hip;
      const seatY = hip[1] + 8.4;
      out.push(S.rect(hip[0] - 9, seatY, 16, 5, 'pad', { rx: 2 }), S.rect(hip[0] - 3.2, seatY + 5, 5, FLOOR - seatY - 4, 'metal', { rx: 1 }));
      if (n !== 'row-seat') out.push(S.line(go(hip, dir(j.t), -3), go(go(hip, dir(j.t), L.torso + 4), front(j.t), -8.4), 5.6, 'outline'), S.line(go(go(hip, dir(j.t), 2), front(j.t), -7.6), go(go(hip, dir(j.t), L.torso + 2), front(j.t), -7.6), 4.2, 'pad'));
      const sx = Math.min(hip[0], f0.hand[0], f1.hand[0]) - 20;
      stack(out, sx, hip[1] - 22);
      if (n === 'preacher') out.push(S.poly([[f0.sh[0] + 4, f0.sh[1] + 7], [f0.sh[0] + 14, f0.sh[1] + 16], [f0.sh[0] + 14, FLOOR + 1], [f0.sh[0] + 4, FLOOR + 1]], 'pad'));
    } else if (n === 'legpress') {
      const hip = f0.hip, j = f0;
      const seatA = go(hip, dir(312), -6), seatB = go(hip, dir(312), L.torso + 4);
      const offB = front(312);
      const b1 = go(seatA, offB, -9), b2 = go(seatB, offB, -9);
      out.push(S.line(b1, b2, 6, 'outline'), S.line(b1, b2, 4.4, 'pad'));
      const railA = [hip[0] - 6, hip[1] + 12], railB = [hip[0] + 56, hip[1] - 44];
      out.push(S.line(railA, railB, 3.6, 'outline'), S.line(railA, railB, 2.4, 'metal'), floorTo([railA[0] + 4, railA[1] + 2]));
      // platforms at both ends of the push (start faint, finish solid)
      for (const [fx, a] of [[f0, 0.35], [f1, 1]]) { const d = dir(fx.k2 || 50); const c = go(fx.ankle, [d[0], d[1]], 4); out.push(S.line(go(c, [-d[1], d[0]], -12), go(c, [-d[1], d[0]], 12), 4.2, 'metal', { o: a })); }
      stack(out, hip[0] + 38, hip[1] + 6, true);
    } else if (n === 'rack') {
      const x = f0.sh[0] - 11;
      out.push(S.line([x, FLOOR + 1], [x, 12], 3.4, 'outline'), S.line([x, FLOOR + 1], [x, 12], 2.2, 'metal'), S.line([x - 3, 30], [x + 4, 30], 2, 'metal'));
    } else if (n === 'box' || n === 'chair') {
      const hipEnd = f1.hip;
      const x = (n === 'box' ? f1.hip[0] - 18 : f0.hip[0] - 14), y = (n === 'box' ? f1.hip[1] + 4 : f0.hip[1] + 8);
      out.push(S.rect(x, y, 24, 5, 'pad', { rx: 2 }), floorTo([x + 3, y + 5]), floorTo([x + 20, y + 5]));
      if (n === 'chair') out.push(S.line([x + 1, y], [x + 1, y - 22], 4, 'outline'), S.line([x + 1, y], [x + 1, y - 22], 2.6, 'pad'));
      void hipEnd;
    } else if (n === 'step') {
      const x = f0.ankle[0] + 2, h = 15 - 0.5;
      out.push(S.rect(x - 8, FLOOR - h, 24, h + 1.6, 'pad', { rx: 2 }));
    } else if (n === 'wall') {
      out.push(S.line([f0.hip[0] - 12, 8], [f0.hip[0] - 12, FLOOR + 1], 4, 'outline'), S.line([f0.hip[0] - 12, 8], [f0.hip[0] - 12, FLOOR + 1], 2.8, 'pad'));
    } else if (n === 'pullbar') {
      const hx = f0.hand[0];
      out.push(S.line([hx - 14, FLOOR + 1], [hx - 14, 6], 3.4, 'outline'), S.line([hx - 14, FLOOR + 1], [hx - 14, 6], 2.2, 'metal'), S.line([hx - 14, 6], [hx, 6], 3.4, 'outline'), S.line([hx - 14, 6], [hx, 6], 2.2, 'metal'));
    } else if (n === 'lowbar') {
      const hx = f0.hand[0];
      out.push(S.line([hx + 6, FLOOR + 1], [hx + 6, f0.hand[1] - 1], 3.4, 'outline'), S.line([hx + 6, FLOOR + 1], [hx + 6, f0.hand[1] - 1], 2.2, 'metal'), S.line([hx - 14, FLOOR + 1], [hx - 14, f0.hand[1] - 1], 2.2, 'metal'), S.line([hx - 14, f0.hand[1] - 1], [hx + 6, f0.hand[1] - 1], 3, 'metal'));
    } else if (n === 'hyper') {
      const x = f0.hip[0];
      out.push(S.rect(x - 4, f0.hip[1] + 6, 17, 5, 'pad', { rx: 2 }), floorTo([x + 2, f0.hip[1] + 11]), floorTo([x + 17, f0.hip[1] + 11]), S.rect(x + 12, f0.hip[1] + 8, 6, 4, 'metal', { rx: 1 }));
    } else if (/^pulley-/.test(n)) {
      const hx = f0.hand[0], hy = f0.hand[1];
      let p0;
      if (n === 'pulley-high') p0 = [hx + 2, 8]; else if (n === 'pulley-top' || n === 'pulley-top-front') p0 = [hx + (n === 'pulley-top' ? 2 : 10), 8];
      else if (n === 'pulley-top-back') p0 = [hx - 14, 8]; else if (n === 'pulley-face') p0 = [hx + 28, hy - 2]; else if (n === 'pulley-mid-behind') p0 = [hx - 28, hy];
      else if (n === 'pulley-low') p0 = [f0.ankle[0] - 24, FLOOR - 4]; else if (n === 'pulley-low-behind') p0 = [f0.hip[0] - 28, FLOOR - 4];
      else p0 = [hx, 8];
      const towerX = p0[0] + (p0[0] > f0.hip[0] ? 6 : -6);
      out.push(S.rect(towerX - 3, 4, 6, FLOOR - 2, 'metal', { rx: 1.5, o: 0.55 }));
      stack(out, towerX + (towerX > f0.hip[0] ? 6 : -14), 30, false, 8);
      out.push(S.circle(p0, 3.2, 'outline'), S.circle(p0, 2.4, 'metal'));
      out.push({ k: 'cable', from: p0, to: 'hand' });
    } else if (n === 'pulley-ankle') {
      // reserved
    }
  }
  void kindName;
  return out;
}
function stack(out, x, y, tilted, w = 12) {
  y = Math.min(y, FLOOR - 30);
  for (let i = 0; i < 6; i += 1) out.push(S.rect(x, y + i * 4.6, w, 3.8, i < 2 ? 'plate' : 'metal', { rx: 0.8, o: i < 2 ? 1 : 0.8 }));
  out.push(S.line([x + w / 2, y - 6], [x + w / 2, y + 28], 1.6, 'metal'));
  void tilted;
}

// ---------------------------------------------------------------------------------------------------------------- front view (lateral raise, fly, press, pulldown)
function frontShapes(spec, prog, hi, ghost) {
  const out = [];
  const cx = 60, hipY = 58, shY = 32;
  const ang = lerp(spec.a[0], spec.a[1], prog), el = lerp(spec.e[0], spec.e[1], prog);
  const stance = 7.5;
  const side = (sgn) => {
    const sh = [cx + sgn * 10.5, shY];
    // arm: 0 hangs down, 90 out sideways, 180 overhead. Elbow bend folds the forearm toward the body or upward.
    const up = rad(ang);
    const v1 = [sgn * Math.sin(up), Math.cos(up)];
    const e = [sh[0] + v1[0] * L.a1, sh[1] + v1[1] * L.a1];
    const fa = rad(ang + (spec.pressBend || 0) - sgn * 0) + 0;
    let v2;
    if (spec.pushForearm) v2 = [sgn * Math.sin(rad(ang * 0.0)), -1];
    else v2 = [sgn * Math.sin(rad(ang - el * sgn * 0 )), Math.cos(rad(ang - el))];
    const bend = spec.a[1] > 150 && spec.e[1] < 20 ? 1 : 0;
    // press: forearm vertical (pointing up) from the elbow; fly/lateral/pulldown: forearm continues with a bend toward the front/center
    let hand;
    if (spec.tool === 'db-front' && spec.a[1] > 150) hand = [e[0] + sgn * (1 + 7 * (1 - prog)) , e[1] - L.a2 * (1)];
    else if (spec.bar) hand = [e[0] + sgn * 0.5, e[1] + (prog < 0.5 ? -L.a2 : -L.a2 * 0.2) * (prog < 0.5 ? 1 : 1)];
    else hand = [e[0] + v2[0] * L.a2 * sgn * sgn, e[1] + v2[1] * L.a2];
    void bend; void fa;
    return { sh, e, hand };
  };
  const R = side(1), Lf = side(-1);
  // legs and hips
  const hipL = [cx - 4.5, hipY], hipR = [cx + 4.5, hipY];
  const kneeL = [cx - stance, hipY + 21], kneeR = [cx + stance, hipY + 21];
  const ankL = [cx - stance - 1, FLOOR - 3], ankR = [cx + stance + 1, FLOOR - 3];
  for (const [h, k, a] of [[hipL, kneeL, ankL], [hipR, kneeR, ankR]]) {
    limb(h, k, 9.2, 'skin', out); out.push(S.line(h, mix(h, k, 0.6), 9.2, 'shorts')); limb(k, a, 6.8, 'skin', out);
    out.push(S.line([a[0] - 2, a[1] + 1], [a[0] + (a[0] < cx ? -4 : 4), a[1] + 1], 4.8, 'outline'), S.line([a[0] - 2, a[1] + 1], [a[0] + (a[0] < cx ? -4 : 4), a[1] + 1], 3.2, 'shoe'));
  }
  // torso (front): shoulders wide, waist narrow
  const tor = [[cx - 12.5, shY - 1], [cx + 12.5, shY - 1], [cx + 10.5, shY + 10], [cx + 8.2, hipY + 2], [cx - 8.2, hipY + 2], [cx - 10.5, shY + 10]];
  out.push(S.poly(tor, 'outline', { grow: 2.2 }), S.poly(tor, 'shirt'));
  // arms
  for (const A of [Lf, R]) { limb(A.sh, A.e, 6.4, 'skin', out); out.push(S.line(A.sh, mix(A.sh, A.e, 0.5), 6.4, 'shirt')); limb(A.e, A.hand, 5.2, 'skin', out); out.push(S.circle(A.hand, 2.9, 'outline'), S.circle(A.hand, 2.2, 'skin')); }
  // head
  out.push(S.line([cx, shY - 2], [cx, shY - 6], 4.6, 'outline'), S.line([cx, shY - 2], [cx, shY - 6], 3.2, 'skin'));
  out.push(S.circle([cx, shY - 12], L.head + 1.1, 'outline'), S.circle([cx, shY - 12], L.head, 'skin'));
  out.push(S.poly([[cx - L.head, shY - 12], [cx - L.head * 0.8, shY - 17], [cx, shY - 19.2], [cx + L.head * 0.8, shY - 17], [cx + L.head, shY - 12], [cx + L.head * 0.6, shY - 14.6], [cx - L.head * 0.6, shY - 14.6]], 'hair'));
  // muscles
  const over = [];
  for (const g of hi) {
    if (g === 'shoulders') for (const A of [Lf, R]) over.push(S.circle(A.sh, 5.6, 'hi'));
    else if (g === 'chest') over.push(S.poly([[cx - 9, shY + 1], [cx + 9, shY + 1], [cx + 8, shY + 11], [cx - 8, shY + 11]], 'hi'));
    else if (g === 'back') over.push(S.poly([[cx - 11, shY + 3], [cx + 11, shY + 3], [cx + 7, shY + 22], [cx - 7, shY + 22]], 'hi'));
    else if (g === 'arms') for (const A of [Lf, R]) over.push(S.line(A.sh, A.e, 5.4, 'hi'), S.line(A.e, A.hand, 4.2, 'hi'));
    else if (g === 'core') over.push(S.poly([[cx - 7, shY + 13], [cx + 7, shY + 13], [cx + 6.5, hipY], [cx - 6.5, hipY]], 'hi'));
    else if (g === 'legs') for (const [h, k, a] of [[hipL, kneeL, ankL], [hipR, kneeR, ankR]]) over.push(S.line(h, k, 8.2, 'hi'), S.line(k, a, 5.8, 'hi'));
  }
  out.push(...over.map((s) => ({ ...s, hiShape: 1 })));
  // equipment
  const eq = [];
  if (spec.tool === 'db-front') for (const A of [Lf, R]) { const a = [A.hand[0], A.hand[1] - 3.6], b = [A.hand[0], A.hand[1] + 3.6]; eq.push(S.line(a, b, 2.4, 'dark'), S.circle(a, 2.6, 'plate'), S.circle(b, 2.6, 'plate')); }
  if (spec.tool === 'handle-front') for (const A of [Lf, R]) eq.push(S.circle(A.hand, 2.6, 'metal'));
  if (spec.tool === 'bar-front') eq.push(S.line(Lf.hand, R.hand, 2.8, 'outline'), S.line(Lf.hand, R.hand, 1.8, 'metal'), S.line(Lf.hand, [Lf.hand[0], 4], 1.2, 'cable'), S.line(R.hand, [R.hand[0], 4], 1.2, 'cable'));
  if (spec.tool === 'band-front') eq.push(S.path(`M ${r2(Lf.hand[0])} ${r2(Lf.hand[1])} Q ${cx} ${r2(Lf.hand[1] + 6)} ${r2(R.hand[0])} ${r2(R.hand[1])}`, 'band', { stroke: 2 }));
  if (spec.seat) out.unshift(S.rect(cx - 11, hipY + 5, 22, 4, 'pad', { rx: 2 }));
  out.push(...eq);
  if (ghost) return out.map((s) => ({ ...s, o: 0.28 }));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- put it all together
const MUSCLE_NAMES = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', legs: 'Legs', glutes: 'Glutes' };
const lerpPose = (a, b, t) => {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (typeof x === 'number' && typeof y === 'number') o[k] = lerp(x, y, t);
    else if (Array.isArray(x) && Array.isArray(y) && typeof x[0] === 'number') o[k] = x.map((v, i) => lerp(v, y[i], t));
    else o[k] = t < 0.5 ? (x !== undefined ? x : y) : (y !== undefined ? y : x);
  }
  return o;
};
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Which pose key an exercise uses. */
export function poseKeyFor(ex) {
  if (!ex) return null;
  return BY_ID[ex.id] || BY_SLOT[ex.slot] || null;
}

/**
 * @param ex {id, slot, name, kind, targets}
 * @returns { key, view, frames:[shapes x3], ghost, env, arrow, tween(p), labels:[3], muscles:[names] } or null when there is no picture for it
 */
export function figureFor(ex) {
  const key = poseKeyFor(ex);
  if (!key) return null;
  const hi = (ex.targets || []).filter((g) => MUSCLE_NAMES[g]);
  const muscles = hi.map((g) => MUSCLE_NAMES[g]);
  const labels = ['Start', 'Middle', 'Finish'];
  if (FRONT[key]) {
    const spec = FRONT[key];
    const at = (p) => frontShapes(spec, ease(p), hi, false);
    const arrow = { from: [spec.a[0] < 20 ? 78 : 76, 40], to: [spec.a[1] > 150 ? 80 : 90, spec.a[1] > 150 ? 12 : 36] };
    return { key, view: 'front', frames: [at(0), at(0.5), at(1)], ghost: frontShapes(spec, 1, [], true), env: [], arrow: null, tween: (p) => frontShapes(spec, ease(p), hi, false), labels, muscles, viewBox: [0, 0, W, 100], _arrow: arrow };
  }
  const v = V[key];
  const tool = v.tool ? v.tool : null;
  const kindName = toolKind(ex);
  const toolName = kindName === 'band' && tool && !/pulley|rope/.test(tool) ? tool : tool;
  const poses = v.frames.map((f) => ({ ...f }));
  const mid = v.mid || lerpPose(poses[0], poses[1], 0.5);
  const all = [poses[0], mid, poses[1]];
  const ax = v.anchor || 'foot';
  const solved = all.map((p) => place(solve(p), p, ax));
  // keep the whole picture inside the frame: shift to centre, shrink if too wide
  const xs = [];
  solved.forEach((j) => { ['hip', 'neck', 'head', 'hand', 'knee', 'ankle', 'toe', 'knee2', 'ankle2', 'toe2', 'hand2'].forEach((k) => xs.push(j[k][0])); });
  const env0 = envShapes(v.props, solved, kindName);
  env0.forEach((s) => { if (s.x !== undefined) { xs.push(s.x, s.x + (s.w || 0)); } if (s.x1 !== undefined) xs.push(s.x1, s.x2); if (s.cx !== undefined) xs.push(s.cx - s.r, s.cx + s.r); });
  const minX = Math.min(...xs) - 6, maxX = Math.max(...xs) + 6;
  const shift = 60 - (minX + maxX) / 2;
  const width = maxX - minX;
  const tops = solved.map((j) => j.head[1] - L.head - 2);
  const scaleV = Math.min(...tops) < 1 ? (FLOOR - 1) / (FLOOR - Math.min(...tops)) : 1;
  const scale = Math.min(width > 112 ? 112 / width : 1, scaleV);
  const tf = (s) => scale === 1 && shift === 0 ? s : transformShape(s, shift, scale);
  const build = (j, p, ghost) => [...bodyShapes(j, p, ghost ? [] : hi, { ghost }), ...(ghost ? [] : toolShapes(kindName, toolName, j, p))].map(tf);
  const cableTo = (s, j) => (s.k === 'cable' ? S.line(s.from, j.hand, 1.3, 'cable') : s);
  const envFor = (j) => env0.map((s) => tf(cableTo(s, j)));
  const ghost = [...bodyShapes(solved[2], all[2], [], { ghost: true })].map(tf);
  const frames = solved.map((j, i) => build(j, all[i], false));
  const envStatic = env0.filter((s) => s.k !== 'cable').map(tf);
  const cables = (j) => env0.filter((s) => s.k === 'cable').map((s) => tf(S.line(s.from, j.hand, 1.3, 'cable')));
  const jointOf = { hand: 'hand', hip: 'hip', neck: 'neck', ankle: 'ankle', knee: 'knee', elbow: 'elbow' };
  let arrow = null;
  if (v.arrow && jointOf[v.arrow]) {
    const a = solved[0][jointOf[v.arrow]], b = solved[2][jointOf[v.arrow]];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 5) arrow = { from: tfPt(a, shift, scale), to: tfPt(b, shift, scale), bow: v.arrow === 'hand' || v.arrow === 'ankle' ? 6 : 4 };
  }
  const tween = (p) => {
    const e = ease(Math.min(1, Math.max(0, p)));
    const pose = lerpPose(all[0], all[2], e);
    const j = place(solve(pose), pose, ax);
    // keep frame 0 / 2 environment placement consistent: reuse the static env, redraw only the cable
    return { body: build(j, pose, false), cables: cables(j) };
  };
  void envFor; void cableTo;
  return { key, view: 'side', frames, cables: solved.map(cables), ghost, env: envStatic, arrow, tween, labels, muscles, viewBox: [0, 0, W, 100] };
}
function tfPt(p, shift, scale) { return [60 + (p[0] + shift - 60) * scale, FLOOR + (p[1] - FLOOR) * scale]; }
function transformShape(s, shift, scale) {
  const X = (x) => r2(60 + (x + shift - 60) * scale), Y = (y) => r2(FLOOR + (y - FLOOR) * scale);
  const o = { ...s };
  if (s.k === 'line') { o.x1 = X(s.x1); o.x2 = X(s.x2); o.y1 = Y(s.y1); o.y2 = Y(s.y2); o.w = r2(s.w * scale); }
  else if (s.k === 'circle') { o.cx = X(s.cx); o.cy = Y(s.cy); o.r = r2(s.r * scale); }
  else if (s.k === 'poly') o.pts = s.pts.map(([x, y]) => [X(x), Y(y)]);
  else if (s.k === 'rect') { o.x = X(s.x); o.y = Y(s.y); o.w = r2(s.w * scale); o.h = r2(s.h * scale); if (s.rot) o.rot = [s.rot[0], X(s.rot[1]), Y(s.rot[2])]; }
  else if (s.k === 'path') o.d = s.d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${X(parseFloat(x))} ${Y(parseFloat(y))}`);
  return o;
}

/** A tiny SVG string, used by the tests and for quick previews (the screens draw the shapes themselves with their own colours). */
export const ROLE_COLORS = {
  light: { outline: '#2b3440', skin: '#f1c9a5', skinFar: '#dcae88', shirt: '#4f8cff', shirtFar: '#3b6fd0', shorts: '#2f3b52', shortsFar: '#243044', shoe: '#e8eef7', shoeFar: '#c5ceda', hair: '#3a2a22', hi: '#ff5a4f', metal: '#9aa7b8', dark: '#4a5565', plate: '#5b6677', pad: '#6d7b91', floor: '#c9d2de', cable: '#7b8798', band: '#e6455a', arrow: '#ff8a00', bg: '#f4f7fb' },
  dark: { outline: '#0b0f14', skin: '#e8b995', skinFar: '#b98a68', shirt: '#5a95ff', shirtFar: '#3f6fc4', shorts: '#202a3b', shortsFar: '#18202d', shoe: '#dfe7f2', shoeFar: '#a9b3c1', hair: '#241a15', hi: '#ff6a5f', metal: '#8794a6', dark: '#38424f', plate: '#6a778a', pad: '#56627a', floor: '#2b3442', cable: '#8a96a8', band: '#ff5a6f', arrow: '#ffa21f', bg: '#151b24' },
};
export function shapeToSvg(s, c) {
  const fill = (role) => c[role] || '#888';
  const op = s.o !== undefined ? ` opacity="${s.o}"` : '';
  const hiOp = s.hiShape ? ' opacity="0.72"' : op;
  if (s.k === 'line') return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${fill(s.role)}" stroke-width="${s.w}" stroke-linecap="round"${s.hiShape ? hiOp : op}/>`;
  if (s.k === 'circle') return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${fill(s.role)}"${s.hiShape ? hiOp : op}/>`;
  if (s.k === 'poly') return `<polygon points="${s.pts.map((p) => p.join(',')).join(' ')}" fill="${s.grow ? 'none' : fill(s.role)}" ${s.grow ? `stroke="${fill(s.role)}" stroke-width="${s.grow}" stroke-linejoin="round"` : ''}${s.hiShape ? hiOp : op}/>`;
  if (s.k === 'rect') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="${fill(s.role)}"${s.rot ? ` transform="rotate(${s.rot[0]} ${s.rot[1]} ${s.rot[2]})"` : ''}${op}/>`;
  if (s.k === 'path') return s.stroke ? `<path d="${s.d}" fill="none" stroke="${fill(s.role)}" stroke-width="${s.stroke}" stroke-linecap="round"${op}/>` : `<path d="${s.d}" fill="${fill(s.role)}"${op}/>`;
  return '';
}
export function figureToSvg(fig, frameIndex, theme = 'light', withGhost = false) {
  const c = ROLE_COLORS[theme];
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" width="360" height="300"><rect width="120" height="100" fill="${c.bg}"/><line x1="4" y1="${FLOOR + 1.6}" x2="116" y2="${FLOOR + 1.6}" stroke="${c.floor}" stroke-width="2" stroke-linecap="round"/>`];
  fig.env.forEach((s) => parts.push(shapeToSvg(s, c)));
  if (withGhost) fig.ghost.forEach((s) => parts.push(shapeToSvg(s, c)));
  (fig.cables ? fig.cables[frameIndex] : []).forEach((s) => parts.push(shapeToSvg(s, c)));
  fig.frames[frameIndex].forEach((s) => parts.push(shapeToSvg(s, c)));
  if (fig.arrow && frameIndex === 0) {
    const { from, to, bow } = fig.arrow;
    const mx = (from[0] + to[0]) / 2 + bow, my = (from[1] + to[1]) / 2 - bow * 0.4;
    parts.push(`<path d="M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}" fill="none" stroke="${c.arrow}" stroke-width="1.6" stroke-dasharray="3 2.4" stroke-linecap="round"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
export const ALL_POSE_KEYS = [...Object.keys(V), ...Object.keys(FRONT)];
export { MUSCLE_NAMES };
