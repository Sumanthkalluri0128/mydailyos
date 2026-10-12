// Daily themes ("skins"). Four for women, four for men, each led by a male anime character
// (Goku, Naruto, Luffy, Gojo, Zoro). One skin is picked per day; it changes at local midnight.
// Pure data + pure functions only (no DOM), so it can be unit-tested with `node --test`.

/** Build one palette. Order: bg, surface, soft surface, text, muted text, border, primary, primary tint, chip. */
const pal = (bg, surface, soft, text, muted, border, primary, psoft, chip, shadow = "rgba(40, 30, 70, 0.10)") =>
  ({ bg, surface, soft, text, muted, border, primary, psoft, chip, shadow });

export const SKINS = [
  // ---------------------------------------------------------------- women
  {
    id: "f-cozy", sex: "female", name: "Calm & Cozy", tag: "Soft pastel, clean and aesthetic",
    char: "goku", scene: "wave", decor: "fall",
    sub: "A healthier, happier you is a brighter you!",
    quote: "Progress, not perfection 💜",
    g: ["#b83fc9", "#e0589f", "#f08bb5"], b: ["#ffb6d9", "#d6b8ff", "#ffd9b8"],
    light: {
      ...pal("#fdf1f8", "#ffffff", "#fff8fc", "#3b2a4a", "#6b5a7a", "#f1d8ea", "#b03fc0", "#f8e4fa", "#fbe9f4"),
      banner: "linear-gradient(120deg,#ffd9ec 0%,#f6d4f7 45%,#dcd2ff 100%)", ink: "#3b2a4a",
    },
    dark: {
      ...pal("#1b1220", "#251a2b", "#2d2034", "#f6eaf8", "#c9b5d1", "#40304a", "#e08af0", "#3b2446", "#322338", "rgba(0,0,0,.4)"),
      banner: "linear-gradient(120deg,#4a2250 0%,#3b2457 50%,#2a2a5c 100%)", ink: "#fbeefd",
    },
  },
  {
    id: "f-scenic", sex: "female", name: "Scenic & Peaceful", tag: "Nature, mountains and motivation",
    char: "naruto", scene: "wave", decor: "rise",
    sub: "Small steps today, big changes tomorrow!",
    quote: "Breathe in. Move forward. 🏔️",
    g: ["#5a6fe0", "#8a63d2", "#ee8f6a"], b: ["#ffc38a", "#9bb8ff", "#c4a8ff"],
    light: {
      ...pal("#eef3ff", "#ffffff", "#f7f9ff", "#1f2a4d", "#566082", "#d9e1f7", "#4f63d8", "#e8ecff", "#e9eefc"),
      banner: "linear-gradient(180deg,#bcd2ff 0%,#e3d6ff 48%,#ffd6bd 100%)", ink: "#1f2a4d",
    },
    dark: {
      ...pal("#0f1424", "#182037", "#1e2744", "#ecf0ff", "#a9b3d6", "#2c3558", "#8b9cff", "#26305a", "#222c4a", "rgba(0,0,0,.4)"),
      banner: "linear-gradient(180deg,#1f2d5e 0%,#3b3270 55%,#7a4a63 100%)", ink: "#f2f4ff",
    },
  },
  {
    id: "f-fun", sex: "female", name: "Energetic & Fun", tag: "Bright, playful and workout motivated",
    char: "luffy", scene: "cheer", decor: "twinkle",
    sub: "Let's make today a stronger day!",
    quote: "Today is YOUR day! 🌟",
    g: ["#d93b2f", "#f0762c", "#f2a81d"], b: ["#ffd84d", "#6fd3ff", "#ff8a7a"],
    light: {
      ...pal("#eef9ff", "#ffffff", "#f7fcff", "#1d2b3a", "#4f6173", "#d3e8f4", "#d03a2e", "#ffe7e3", "#e6f3fb"),
      banner: "linear-gradient(180deg,#8fd8ff 0%,#c9efff 55%,#fff3c4 100%)", ink: "#10304a",
    },
    dark: {
      ...pal("#0e1a24", "#162634", "#1c303f", "#eaf6ff", "#a7bccb", "#27404f", "#ff7468", "#3a2420", "#203443", "rgba(0,0,0,.4)"),
      banner: "linear-gradient(180deg,#14507a 0%,#1d6f95 55%,#8a6a1f 100%)", ink: "#f2fbff",
    },
  },
  {
    id: "f-minimal", sex: "female", name: "Minimal Productive", tag: "Clean, modern and focused",
    char: "gojo", scene: "plan", decor: "none",
    sub: "Stay consistent, stay proud!",
    quote: "Discipline today creates the results you'll be proud of tomorrow.",
    g: ["#5b4fd6", "#7a63e8", "#9a7df0"], b: ["#d9d6f5", "#e7e4fa", "#cfe3f3"],
    light: {
      ...pal("#f4f5fb", "#ffffff", "#fafaff", "#1f2233", "#5b6075", "#e4e6f1", "#5b4fd6", "#ecebfb", "#eceef7"),
      banner: "linear-gradient(120deg,#ffffff 0%,#eceafa 60%,#dfe7f6 100%)", ink: "#1f2233",
    },
    dark: {
      ...pal("#101119", "#191b27", "#20222f", "#eef0f8", "#a9aebf", "#2c2f40", "#9b8cff", "#2a2650", "#232536", "rgba(0,0,0,.4)"),
      banner: "linear-gradient(120deg,#1d2033 0%,#262a45 60%,#2c3550 100%)", ink: "#f2f3fb",
    },
  },

  // ---------------------------------------------------------------- men
  {
    id: "m-dark", sex: "male", name: "Dark Anime", tag: "Bold, neon and powerful",
    char: "gojo", scene: "powerup", decor: "rise", force: "dark",
    sub: "Discipline. Progress. No excuses.",
    quote: "No limits. Just progress. 💜",
    g: ["#6d3df0", "#a63df0", "#e24fd0"], b: ["#6d3df0", "#e24fd0", "#2d6cf0"],
    light: null,
    dark: {
      ...pal("#0a0816", "#15122a", "#1c1838", "#f0eeff", "#b3add6", "#2b2650", "#a98bff", "#2a2150", "#201b40", "rgba(0,0,0,.55)"),
      banner: "radial-gradient(circle at 78% 30%,#5b2bd0 0%,#2a1766 38%,#0e0b24 80%)", ink: "#f6f4ff",
    },
  },
  {
    id: "m-gym", sex: "male", name: "Anime Gym", tag: "Gym, strength and transformation",
    char: "goku", scene: "workout", decor: "rise", force: "dark",
    sub: "Train today for a stronger tomorrow.",
    quote: "Break your limits. 🔥",
    g: ["#c2410c", "#ea580c", "#b91c1c"], b: ["#ea580c", "#b91c1c", "#f59e0b"],
    light: null,
    dark: {
      ...pal("#120b08", "#1f1410", "#281a14", "#fff1e8", "#d3b8a8", "#3d2a20", "#ff8a3d", "#40240f", "#2f1f17", "rgba(0,0,0,.55)"),
      banner: "radial-gradient(circle at 80% 35%,#a8400f 0%,#52210c 40%,#170e0a 85%)", ink: "#fff4ec",
    },
  },
  {
    id: "m-adventure", sex: "male", name: "Adventure Journey", tag: "Gamified progress and milestones",
    char: "naruto", scene: "walk", decor: "fall", strip: true,
    sub: "Every step makes you stronger!",
    quote: "Level up every day!",
    g: ["#2f6fdc", "#3a8fd8", "#e08a1e"], b: ["#9ed0ff", "#ffd28a", "#b9e4a8"],
    light: {
      ...pal("#eef6ff", "#ffffff", "#f7fbff", "#1c2a3d", "#4d6076", "#d4e3f2", "#2a68d6", "#e4eeff", "#e6f0fa"),
      banner: "linear-gradient(180deg,#8cc8ff 0%,#cfe9ff 55%,#f6e7bd 100%)", ink: "#12304d",
    },
    dark: {
      ...pal("#0d1622", "#152233", "#1b2b40", "#eaf3ff", "#a6b9cc", "#273a52", "#7fb2ff", "#1f3354", "#1f3047", "rgba(0,0,0,.45)"),
      banner: "linear-gradient(180deg,#143c66 0%,#1d5a85 55%,#7a5a22 100%)", ink: "#f1f8ff",
    },
  },
  {
    id: "m-minimal", sex: "male", name: "Minimal Modern", tag: "Clean, focused and high-performance",
    char: "zoro", scene: "idle", decor: "none",
    sub: "Focus today. Bigger results tomorrow.",
    quote: "Same routine. Bigger results.",
    g: ["#117a52", "#17956a", "#2aa77a"], b: ["#d4eadf", "#e2efe8", "#d6e6ef"],
    light: {
      ...pal("#f2f6f4", "#ffffff", "#f9fbfa", "#1a2622", "#53625c", "#dde7e2", "#117a52", "#e2f4eb", "#e8efeb"),
      banner: "linear-gradient(120deg,#ffffff 0%,#e6f3ec 60%,#d9ece2 100%)", ink: "#1a2622",
    },
    dark: {
      ...pal("#0d1311", "#151d1a", "#1b2521", "#ecf6f1", "#a5b8af", "#26332e", "#4fd1a1", "#173a2d", "#1e2a25", "rgba(0,0,0,.45)"),
      banner: "linear-gradient(120deg,#152620 0%,#1b3329 60%,#20382f 100%)", ink: "#f0faf5",
    },
  },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/** Which skins a person can see. Sex comes from their profile; unknown / other sees all eight. */
export function poolFor(sex) {
  if (sex === "female") return SKINS.filter((s) => s.sex === "female");
  if (sex === "male") return SKINS.filter((s) => s.sex === "male");
  return SKINS;
}

// ---- seeded randomness -------------------------------------------------------------------------
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Whole days since 1970 for a local "YYYY-MM-DD" string (timezone-proof). */
export function dayNumber(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}

/**
 * The skin for a given day: random-looking, but the same all day on every device.
 * Days are grouped into rounds of N (N = number of skins in the pool); each round is a seeded shuffle,
 * so every theme shows up once per round and the same theme never appears two days running.
 */
export function pickSkin({ sex, date, salt = "" }) {
  const pool = poolFor(sex);
  const n = pool.length;
  const day = dayNumber(date);
  const round = Math.floor(day / n);
  const shuffled = (r) => {
    const idx = pool.map((_, i) => i);
    const rnd = mulberry32(fnv(`${r}|${salt}|${n}`));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx;
  };
  const order = shuffled(round);
  // Never start a round with the skin that ended the last one (swapping the first two never touches the last slot when n > 2).
  if (n > 2 && order[0] === shuffled(round - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return pool[order[day - round * n]];
}

/** A different skin from `currentId`, for the "shuffle" button. */
export function shuffleSkin({ sex, currentId, rnd = Math.random }) {
  const pool = poolFor(sex).filter((s) => s.id !== currentId);
  return pool[Math.floor(rnd() * pool.length)] || SKIN_BY_ID[currentId] || SKINS[0];
}

// ---- stylesheet (generated so the palettes above stay the single source) ---------------------------
function block(selector, v, scheme) {
  return `${selector}{color-scheme:${scheme};--md-bg:${v.bg};--topbar-bg:color-mix(in srgb,${v.surface} 88%,transparent);`
    + `--bg:${v.bg};--surface:${v.surface};--surface-soft:${v.soft};--text:${v.text};--text-muted:${v.muted};--md-muted:${v.muted};`
    + `--border:${v.border};--primary:${v.primary};--primary-soft:${v.psoft};--shadow:${v.shadow};--chip-bg:${v.chip};`
    + `--primary-soft-hover-bg:color-mix(in srgb,${v.primary} 20%,${v.surface});`
    + `--primary-soft-hover-border:color-mix(in srgb,${v.primary} 40%,${v.surface});`
    + `--primary-soft-hover-text:${v.primary};`
    + `--md-primary:${v.primary};--md-primary-dark:${v.primary};--md-primary-soft:${v.psoft};`
    + `--md-card:${v.surface};--md-shadow:0 12px 35px ${v.shadow};--md-shadow-hover:0 18px 45px ${v.shadow};`
    + `--sk-banner:${v.banner};--sk-ink:${v.ink};}`;
}
export function skinCss() {
  return SKINS.map((s) => {
    const sel = `html[data-ff-skin="${s.id}"][data-theme`;
    const common = `html[data-ff-skin="${s.id}"]{--sk-g1:${s.g[0]};--sk-g2:${s.g[1]};--sk-g3:${s.g[2]};--sk-b1:${s.b[0]};--sk-b2:${s.b[1]};--sk-b3:${s.b[2]};}`;
    const light = s.light ? block(`${sel}="light"]`, s.light, "light") : "";
    return common + light + block(`${sel}="dark"]`, s.dark, "dark");
  }).join("\n");
}
