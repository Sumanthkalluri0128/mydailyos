// The cast. Sprites live in public/chars/<who>-<scene>.webp (cut from the sticker sheets).
export const CHARS = { zoro: "Zoro", naruto: "Naruto", luffy: "Luffy", jinwoo: "Jin-Woo", goku: "Goku", gojo: "Gojo" };
export const DAY_ORDER = ["zoro", "naruto", "luffy", "jinwoo", "goku", "gojo", "luffy"]; // Sun..Sat
const BASE = ["sad", "drink", "eat", "scale", "walk", "task", "habit", "cheer", "wave", "fight", "dance", "sleep"];
const HAS = {
  zoro: [...BASE, "lift", "plan", "chart", "health", "chef"], jinwoo: [...BASE, "lift", "plan", "chart", "health", "chef"],
  naruto: [...BASE, "lift", "plan"], luffy: [...BASE, "lift", "plan"], goku: BASE, gojo: [...BASE, "plan"],
};
const FALLBACK = { plan: "task", chart: "task", health: "drink", chef: "eat", lift: "habit", fight: "walk", dance: "cheer", sleep: "sad", habit: "cheer", cheer: "wave", wave: "task" };
export const dayChar = (d = new Date()) => DAY_ORDER[d.getDay()];
export function sprite(who, scene) {
  const ok = (HAS[who] || BASE).includes(scene) ? scene : FALLBACK[scene] || "task";
  return `${import.meta.env.BASE_URL}chars/${who}-${ok}.webp`;
}

// Baked 8-frame walk cycle (legs stride, arms swing) for each character.
export const walkStrip = (who) => `${import.meta.env.BASE_URL}chars/${who}-walkstrip.webp`;
