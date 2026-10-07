// The cast. One character "hosts" each day of the week; the stage pairs today's character with a random rival.
// Sprites live in public/chars/<who>-<scene>.webp (cut from the character sheets). Naruto and Luffy have 7 poses; missing ones fall back below.
export const CHARS = { zoro: "Zoro", naruto: "Naruto", luffy: "Luffy", jinwoo: "Jin-Woo" };
export const DAY_ORDER = ["zoro", "naruto", "luffy", "jinwoo", "zoro", "naruto", "luffy"]; // Sun..Sat
const FULL = ["lift", "sad", "drink", "eat", "scale", "walk", "task", "plan", "chart", "health", "chef", "habit", "cheer", "wave"];
const SHORT = ["lift", "sad", "drink", "eat", "scale", "walk", "task"];
const HAS = { zoro: FULL, jinwoo: FULL, naruto: SHORT, luffy: SHORT };
const FALLBACK = { plan: "task", chart: "task", health: "drink", chef: "eat", habit: "lift", cheer: "task", wave: "task" };

export const dayChar = (d = new Date()) => DAY_ORDER[d.getDay()];
export function sprite(who, scene) {
  const ok = (HAS[who] || SHORT).includes(scene) ? scene : FALLBACK[scene] || "task";
  return `${import.meta.env.BASE_URL}chars/${who}-${ok}.webp`;
}
