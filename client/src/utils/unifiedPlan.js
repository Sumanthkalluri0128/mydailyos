// ONE training plan for the whole Workout & Body page.
//
// There used to be two plans that never met: the fixed "7-Day Lean & Toned" plan on Today / My plan, and the "Smart program" the server
// builds from your body, goal and logged sessions (Body tab). This file turns the smart program into the same day shape the fixed plan
// uses (data/workoutPlan.js), so Today, My plan, the day overview, the live workout, History and the exercise sheet all run on whichever
// plan is active, and every exercise is listed exactly once.
//
// Pure (no React, no network): unit-tested in unifiedPlan.test.js.
import { MUSCLE_LABEL, SMART_ID } from "../data/workoutPlan.js";
import { addDays, estimateKcal, mondayOf } from "./workoutStore.js";

export { SMART_ID };
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : "");
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const num = (x, d = 0) => { const v = Number(x); return Number.isFinite(v) ? v : d; };

/** A tick-off line (warm-up, cool-down, active-day idea). Same shape as the fixed plan's `item()`. */
const tick = (id, name, dose = "", o = {}) => ({ id, name, dose, targets: o.targets || ["mobility"], fig: o.fig || "", slot: "", steps: o.steps || [], avoid: "", alts: [], kind: "" });

// ---------------------------------------------------------------------------------------------------------------- exercises
/** The picture-and-alternatives list for one exercise: every swap the server offers, each once, never the exercise itself. */
export function altsOf(e) {
  const sw = e.swaps || {};
  const raw = [
    ...(sw.busy || []).map((x) => ({ ...x, note: x.why || x.hint || "" })),
    ...(sw.dumbbellOnly ? [{ ...sw.dumbbellOnly, note: "Only dumbbells and a bench" }] : []),
    ...(sw.home ? [{ ...sw.home, note: "No equipment (home)" }] : []),
    ...(sw.easier ? [{ ...sw.easier, note: "Too hard? An easier version" }] : []),
    ...(sw.harder ? [{ ...sw.harder, note: "Too easy? A harder version" }] : []),
  ];
  const seen = new Set([e.id]);
  const out = [];
  for (const x of raw) {
    if (!x || !x.id || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({ id: x.id, name: cap(x.name), note: x.note || x.hint || "", fig: x.id, alt: true, parent: e.id, kind: x.kind || e.kind || "", cue: x.cue || "" });
  }
  return out;
}

const repsText = (e) => { const lo = num(e.repsLo, 8), hi = num(e.repsHi, lo); return lo === hi ? String(lo) : `${lo}-${hi}`; };

/** A server exercise as a fixed-plan strength exercise. `sets` already includes the adaptive change for today (setsToday). */
export function toStrength(e) {
  const f = e.form || {};
  const timed = e.unit === "seconds";
  return {
    id: e.id, name: cap(e.name), sets: Math.max(1, num(e.setsToday || e.sets, 3)), reps: repsText(e), repsMin: num(e.repsLo, 8), repsMax: num(e.repsHi, num(e.repsLo, 12)),
    rest: num(e.restSec, 75), targets: e.targets || [], helpers: e.helpers || [], kind: e.kind || "", fig: e.id, slot: e.slot || "",
    main: false, bw: e.kind === "bodyweight", timed, perSide: !!e.perSide, unit: timed ? "seconds" : "",
    steps: [e.cue, f.setup && `Set up: ${f.setup}`, f.move && `Move: ${f.move}`, f.breathe && `Breathe: ${f.breathe}`].filter(Boolean),
    avoid: f.avoid || "", optional: false,
    next: e.next || null, effort: e.effortToday || e.effort || "", weightHint: e.weightHint || "", progress: e.progress || "",
    match: e.match || "", matchNote: e.matchNote || "", replaces: e.replaces ? e.replaces.name : "",
    alts: altsOf(e),
  };
}

const wayBlocks = (sid, way, s) => {
  if (way === "quick") {
    const q = s.quick || { exercises: [] };
    return [
      { id: "quick", type: "check", title: `Quick circuit: ${q.rounds || 2} rounds`, minutes: `${q.minutes || 20} min`, note: q.format || "", items: (q.exercises || []).map((e) => ({ ...tick(`${sid}-q-${e.id}`, cap(e.name), e.reps || "", { targets: [], steps: [e.cue].filter(Boolean) }), fig: e.id, slot: e.slot || "" })) },
    ];
  }
  const list = way === "home" && s.homeBackup ? s.homeBackup.exercises : s.exercises;
  const blocks = [];
  if ((s.warmup || []).length) blocks.push({ id: "warm", type: "check", title: "Warm-up", minutes: "about 8 min", items: s.warmup.map((t, i) => tick(`${sid}-w${i}`, t)) });
  blocks.push({ id: "main", type: "sets", title: "Main workout", items: list.map(toStrength) });
  if ((s.cooldown || []).length) blocks.push({ id: "cool", type: "check", title: "Cool-down", minutes: "3–5 min", items: s.cooldown.map((t, i) => tick(`${sid}-c${i}`, t)) });
  return blocks;
}

// ---------------------------------------------------------------------------------------------------------------- days
/**
 * The 7 days of this week as fixed-plan days. Only the day's own `blocks` differ per way (gym / home / quick): `ways` holds each one.
 * @param program  plan.training.program from GET /api/body-plan (already adapted)
 */
export function programToDays(program, { weightKg = 70, adapt = null } = {}) {
  const sessions = new Map((program.sessions || []).map((s) => [s.id, s]));
  const homeOnly = program.place === "home";
  const used = new Set();
  return (program.week || []).map((w, i) => {
    const base = { n: i + 1, dow: i + 1, short: SHORT[i], source: SMART_ID, shifted: !!w.shifted, note: w.statusNote || "", date: w.date || "" };
    // A slot that already passed (missed, skipped, or before you started) keeps its old label, but its session has slid to a later day.
    // Listing it again is what made every lift appear twice: show it as a slot with no exercises instead.
    if (w.kind === "train" && ["notdone", "past", "skipped"].includes(w.status)) {
      const why = w.status === "skipped" ? "Skipped" : w.status === "notdone" ? "Not done" : "Before you started";
      const day = {
        ...base, id: `sm-${w.status}-${SHORT[i]}`, title: why, kind: "rest", level: "Rest", minutes: "0", focus: w.statusNote || (w.status === "skipped" ? "Rest was the right call." : `${w.label} slides to your next free day, so nothing is lost.`), muscles: ["mobility"], missed: true,
        blocks: [{ id: "moved", type: "check", title: why, items: [tick(`moved-${SHORT[i]}`, `${w.label} is not listed here again: it moves to your next free day.`)] }],
      };
      day.kcal = 0;
      return day;
    }
    const s = w.kind === "train" ? sessions.get(w.sessionId) : null;
    if (s) {
      const sid = used.has(s.id) ? `${s.id}${SHORT[i]}` : s.id; // (the same session twice in one week would share an id)
      used.add(s.id);
      const ways = { gym: { blocks: wayBlocks(sid, "gym", s), minutes: num(s.minutes) } };
      if (!homeOnly && s.homeBackup) ways.home = { blocks: wayBlocks(sid, "home", s), minutes: num(s.homeBackup.minutes, s.minutes), note: s.homeBackup.note || "" };
      if (s.quick) ways.quick = { blocks: wayBlocks(sid, "quick", s), minutes: num(s.quick.minutes, 20), note: s.quick.format || "" };
      const muscles = (s.focus || []).filter((m) => MUSCLE_LABEL[m]);
      const day = {
        ...base, id: `sm-${sid}`, sessionId: sid, title: s.title + (s.light ? " (light)" : ""), kind: "strength", level: LEVEL[program.level] || "Beginner",
        minutes: String(ways.gym.minutes), focus: muscles.map((m) => MUSCLE_LABEL[m]).join(", "), muscles, blocks: ways.gym.blocks, ways,
        wayList: [["gym", homeOnly ? "🏠 Home" : "🏋️ Gym"], ...(ways.home ? [["home", "🏠 Home match"]] : []), ...(ways.quick ? [["quick", "⏱️ Quick 20"]] : [])],
      };
      day.kcal = estimateKcal(day, ways.gym.minutes, weightKg);
      return day;
    }
    if (w.kind === "active") {
      const menu = (program.active && program.active.menu) || [];
      const mins = num(w.minutes, 30);
      const day = {
        ...base, id: `sm-active-${SHORT[i]}`, title: "Easy cardio", kind: "recovery", level: "Light", minutes: String(mins), focus: "Easy cardio, mobility", muscles: ["cardio"],
        blocks: [
          { id: "activity", type: "check", title: "Pick one activity", minutes: `${mins} min`, items: menu.slice(0, 4).map((m) => tick(`act-${m.id}`, m.name, `about ${m.kcal30} kcal in 30 min`, { targets: ["cardio"], steps: [m.tip].filter(Boolean) })) },
          ...(program.active && program.active.minimumDay ? [{ id: "minimum", type: "check", title: program.active.minimumDay.title, items: [tick("act-min", program.active.minimumDay.detail)] }] : []),
        ],
      };
      day.kcal = estimateKcal(day, mins, weightKg);
      return day;
    }
    const day = {
      ...base, id: `sm-rest-${SHORT[i]}`, title: "Rest & reset", kind: "rest", level: "Rest", minutes: "10–20", focus: "Recovery, sleep, food", muscles: ["mobility"],
      blocks: [{ id: "reset", type: "check", title: "Rest day", items: [tick("rest-1", (program.active && program.active.restDay) || "Rest well today. Stretch, eat, sleep."), tick("rest-2", "Light walk (optional)", "5–10 min")] }],
    };
    day.kcal = estimateKcal(day, 15, weightKg);
    return day;
  });
}

/** The day as it is done in the chosen way ("gym" | "home" | "quick"). A way the day does not have falls back to the gym list. */
export function variantDay(day, way) {
  if (!day || !day.ways) return day;
  const w = day.ways[way] || day.ways.gym;
  const used = day.ways[way] ? way : "gym";
  const minutes = String(w.minutes);
  const v = { ...day, blocks: w.blocks, minutes, way: used };
  v.kcal = Math.round(day.kcal * (w.minutes / Math.max(1, num(day.ways.gym.minutes, w.minutes))));
  return v;
}

// ---------------------------------------------------------------------------------------------------------------- week strip
/** Server status -> the strip's statuses (done | today | missed | upcoming | rest-past). */
export function stripStatus(status, kind, date, today) {
  if (status === "done" || status === "partial" || status === "extra") return "done";
  if (date === today) return "today";
  if (status === "skipped" || status === "notdone") return "missed";
  if (date < today) return kind === "strength" ? (status === "past" ? "rest-past" : "missed") : "rest-past";
  return "upcoming";
}

/** The 7 cells of the week strip, from the smart program. A workout saved here but not yet known to the server still counts. */
export function smartStrip(program, days, sessions, today) {
  const monday = mondayOf(today);
  return days.map((d, i) => {
    const w = (program.week || [])[i] || {};
    const date = w.date || addDays(monday, i);
    let status = stripStatus(w.status, d.kind, date, today);
    if (status !== "done" && (sessions || []).some((s) => s.date === date && s.planId === SMART_ID)) status = "done";
    return { day: d, date, status, isToday: date === today, note: d.note, shifted: d.shifted };
  });
}

/** True when the plan can drive the page: the server says it is ready and it was worked out for THIS week (an old saved copy is not used). */
export function smartUsable(data, today) {
  const plan = data && data.plan;
  if (!plan || !plan.ready || !plan.training || !plan.training.program || !(plan.training.program.week || []).length) return false;
  const asOf = plan.adapt && plan.adapt.today;
  return !asOf || mondayOf(asOf) === mondayOf(today);
}

// ---------------------------------------------------------------------------------------------------------------- phase and progression
export function smartPhase(adapt) {
  if (!adapt || !adapt.phase) return { id: "build", label: "Build", tip: "Add a rep or a little weight each week." };
  return { id: adapt.phase.key, label: adapt.phase.name, tip: adapt.phase.why };
}

/** The progression list in the fixed plan's shape: { weeks, phase, title, text }. */
export function smartProgression(program) {
  const p = program && program.progression;
  if (!p || !p.phases) return [];
  const key = (x) => (/easy/i.test(x.name) ? "easy" : /learn/i.test(x.name) ? "learn" : "build");
  return p.phases.map((x) => ({ weeks: `Week${/ /.test(x.weeks) ? "s" : ""} ${x.weeks.replace(" to ", "–")}`, phase: key(x), title: x.name, text: x.note }));
}

// ---------------------------------------------------------------------------------------------------------------- saving a session to the server
const FEEL = { easy: "easy", good: "good", challenging: "hard", hard: "hard" };

/**
 * The body of POST /api/body-plan/session for a finished workout record (see workoutStore.finishActive).
 * The server counts it in the day's exercise totals itself, so the workout must NOT also be logged as a separate exercise.
 */
export function sessionPayload(rec, { today, phase = "", way = "gym" } = {}) {
  const exercises = (rec.exercises || []).map((e) => ({
    id: e.id, name: e.name, slot: e.slot || "",
    sets: (e.sets || []).filter((s) => s.done !== false).map((s) => (e.timed ? { seconds: num(s.r), reps: 0, weightKg: 0 } : { reps: num(s.r), weightKg: num(s.w), seconds: 0 })),
  })).filter((e) => e.sets.length);
  const status = rec.status === "partial" ? "partial" : "done";
  return {
    date: rec.date, today: today || rec.date, sessionId: rec.sessionId || "", title: String(rec.title || "Workout").slice(0, 80), way: rec.way || way, status,
    feel: FEEL[rec.feel] || "", pain: rec.pain || [], phase: ["", "learn", "build", "easy", "back"].includes(phase) ? phase : "", minutes: rec.minutes || 0,
    notes: rec.notes || "", exercises, clientId: `wp-${rec.id}`,
  };
}

/** Everything the library should show: the fixed plan's list plus every exercise (and swap) of the smart program, each name once. */
export function mergeLibrary(base, days) {
  const seen = new Map(base.map((e) => [slug(e.name), e]));
  for (const d of days || []) {
    for (const way of Object.values(d.ways || { gym: { blocks: d.blocks } })) {
      for (const b of way.blocks) {
        if (b.type !== "sets") continue;
        for (const it of b.items) {
          const key = slug(it.name);
          if (!seen.has(key)) seen.set(key, { ...it, cat: (it.targets && it.targets[0]) || "core", days: [d.id] });
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** An exercise or tick-off item of the smart plan by id (the exercise sheet needs the original when it opens one of its alternatives). */
export function findInDays(days, id) {
  for (const d of days || []) {
    for (const way of Object.values(d.ways || { gym: { blocks: d.blocks } })) {
      for (const b of way.blocks) {
        for (const it of b.type === "options" ? b.options.flatMap((o) => o.items) : b.items) if (it.id === id) return it;
      }
    }
  }
  return null;
}
