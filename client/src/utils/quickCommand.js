// Quick-add command parser for the Ctrl/Cmd+K palette. Pure. Never guesses: anything unclear returns null.
//   "water 250" | "w 250" | "weight 70.5" | "workout 30" | "workout 30 yoga" | "food rice" | "go progress"
const PAGES = { home: "dashboard", food: "foodLogger", log: "foodLogger", plan: "planner", planner: "planner", recipes: "recipes", foods: "food", water: "water", exercise: "exercise", weight: "weight", health: "health", goals: "goals", habits: "habit", tasks: "task", progress: "progress", profile: "profile" };
const num = (s) => { const n = Number(String(s).replace(",", ".")); return Number.isFinite(n) ? n : null; };

export function parseCommand(input) {
  const text = String(input || "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  const [head, ...rest] = text.split(" ");
  const h = head.toLowerCase();
  const arg = rest.join(" ");
  if (["water", "w", "drink"].includes(h)) {
    const m = arg.match(/^(\d+(?:[.,]\d+)?)\s*(ml|l|litre|liter|liters|litres|glass|glasses)?$/i); if (!m) return null;
    let n = num(m[1]); const u = (m[2] || "").toLowerCase();
    if (u === "l" || u.startsWith("lit")) n *= 1000; else if (u.startsWith("glass")) n *= 250; else if (!u && n <= 10) n *= 1000;   // "water 2" means litres
    n = Math.round(n); return n >= 10 && n <= 5000 ? { kind: "water", ml: n } : null;
  }
  if (["weight", "wt", "kg"].includes(h)) { const n = num(arg.replace(/kg$/i, "").trim()); return n && n >= 20 && n <= 400 ? { kind: "weight", kg: Math.round(n * 10) / 10 } : null; }
  if (["workout", "exercise", "ex"].includes(h)) {
    const m = arg.match(/^(\d+)\s*(?:min|mins|m)?\s*(.*)$/i); if (!m) return null;
    const mins = Number(m[1]); return mins >= 1 && mins <= 600 ? { kind: "workout", minutes: mins, name: m[2].trim() } : null;
  }
  if (["food", "eat", "ate", "log"].includes(h)) return arg ? { kind: "food", query: arg } : { kind: "goto", page: "foodLogger" };
  if (["go", "open", "goto"].includes(h)) { const p = PAGES[arg.toLowerCase()]; return p ? { kind: "goto", page: p } : null; }
  return null;
}
export const pageFor = (word) => PAGES[String(word || "").toLowerCase()] || null;
export const PAGE_WORDS = PAGES;
