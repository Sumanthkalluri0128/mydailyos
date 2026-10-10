// The cast. Sprites are 3D renders in public/chars/<who>-<pose>.webp, cut from the 3D sheet by tools/3d-sprites/build_sprites.py.
// A scene (what the character is doing) maps to one of those poses; several scenes can share a pose.
const V = "?v=16"; // bump when sprites change so browsers never mix old art with new code
export const CHARS = { goku: "Goku" };
export const DAY_ORDER = ["goku", "goku", "goku", "goku", "goku", "goku", "goku"]; // Sun..Sat (one character for now)

const POSE = {
  goku: {
    blink: "stand", idle: "stand", health: "stand", scale: "stand", wave: "stand", walk: "stand",
    task: "thumbsup", chart: "thumbsup", plan: "crossed",
    cheer: "jump", dance: "joy", victory: "cheer", climb: "cheer", rope: "cheer",
    eat: "ramen", chef: "ramen", drink: "drink", sleep: "sleep", study: "read", habit: "meditate",
    lift: "barbell", workout: "barbell", pushup: "pushup", plank: "pushup", squat: "crouch", sad: "crouch",
    run: "sprint", swim: "dash", cycle: "nimbus", dash: "dash",
    fight: "stance", punch: "punch", kick: "kick", flypunch: "flypunch", powerup: "kame", kame: "kame", levelup: "ssj", ssj: "ssj",
  },
};
export const dayChar = (d = new Date()) => DAY_ORDER[d.getDay()];
export function sprite(who, scene) {
  const set = POSE[who] || POSE.goku;
  return `${import.meta.env.BASE_URL}chars/${who in POSE ? who : "goku"}-${set[scene] || set.task || "stand"}.webp${V}`;
}

// Baked 16-frame cycles (walk: feet take turns lifting; run: leaning sprint; climb: hand-over-hand reach), built from the 3D poses.
export const walkStrip = (who) => `${import.meta.env.BASE_URL}chars/${who}-walkstrip.webp${V}`;
export const runStrip = (who) => `${import.meta.env.BASE_URL}chars/${who}-runstrip.webp${V}`;
export const climbStrip = (who) => `${import.meta.env.BASE_URL}chars/${who}-climbstrip.webp${V}`;
// Where the rope sits inside each character's climb frames (fraction of the frame width), so the on-screen rope lines up with it.
export const ROPE_X = { goku: 0.5 };
