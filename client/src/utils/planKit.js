// Plan kit (pure: no React, no network, no storage; unit-tested in planKit.test.js).
//   * WARM / COOL: the warm-up and cool-down moves a day can hold, each with its dose and an intensity (MET) so they get a calorie number too.
//   * dayEstimate(): minutes and kcal for a whole day (warm-up + main workout + cool-down) from the sets, reps and your body weight.
//     The main-workout maths is the SAME as the gym log (utils/gymMath.js: MET x 3.5 x kg / 200 per minute, ~3 s per rep + ~60 s rest per set),
//     so a planned day and the day you actually log agree.
//   * suggestWarmCool(): picks warm-up and cool-down moves that match the muscles in the main workout.
//   * TEMPLATES: ready-made plans built the way a coach would: every training day = warm-up, main workout, cool-down.
import { entryKcal, setMinutes } from "./gymMath.js";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// ---------------------------------------------------------------------------------------------------------------- warm-up and cool-down moves
// `for` = the muscle groups (the same category names as the exercise picker) the move prepares or stretches. "all" fits any day.
const k = (id, name, dose, met, forCats, steps) => ({ id, name, dose, met, for: forCats, steps });

export const WARM = [
  k("wu-walk", "Easy walk or light cardio", "3 min", 3.8, ["all"], ["Keep a pace where you can still talk.", "Let your heart rate rise slowly.", "Stop once you feel warm."]),
  k("wu-bike", "Easy stationary bike", "3 min", 4, ["legs", "glutes", "cardio"], ["Light resistance, smooth pedalling.", "Stay seated and relaxed."]),
  k("wu-arm-circles", "Arm circles", "30 sec", 2.8, ["shoulders", "chest", "arms", "back"], ["Arms out to the sides.", "Small circles first, then bigger.", "Switch direction halfway."]),
  k("wu-shoulder-rolls", "Shoulder rolls", "30 sec", 2.5, ["shoulders", "chest", "back"], ["Roll the shoulders up, back and down.", "Slow and controlled."]),
  k("wu-scap-pushup", "Scapular push-up", "10 reps", 3, ["chest", "shoulders", "back"], ["Plank or wall position, arms straight.", "Move only the shoulder blades together and apart."]),
  k("wu-band-pullapart", "Band pull-apart (or arm sweeps)", "12 reps", 3, ["back", "shoulders", "arms"], ["Hold a light band at chest height.", "Pull it apart by squeezing the shoulder blades."]),
  k("wu-cat-cow", "Cat-cow", "30 sec", 2.5, ["back", "core"], ["On all fours.", "Round the back, then arch it, slowly with your breath."]),
  k("wu-thoracic", "Thoracic rotation", "8 / side", 2.5, ["back", "core", "shoulders"], ["On all fours, one hand behind the head.", "Rotate the elbow up toward the ceiling."]),
  k("wu-hip-circles", "Hip circles", "10 / side", 2.8, ["legs", "glutes", "core"], ["Hands on hips.", "Circle the hips slowly in both directions."]),
  k("wu-leg-swings", "Leg swings", "10 / side", 3, ["legs", "glutes", "cardio"], ["Hold a wall or rack.", "Swing the leg gently front to back, then side to side."]),
  k("wu-bw-squat", "Bodyweight squat", "12 reps", 3.5, ["legs", "glutes"], ["Feet shoulder-width apart.", "Sit back and down, chest up.", "Stand tall and squeeze the glutes."]),
  k("wu-glute-bridge", "Glute bridge", "12 reps", 3, ["glutes", "legs", "core"], ["Lie on your back, knees bent.", "Lift the hips and squeeze, then lower slowly."]),
  k("wu-lunge", "Walking lunge (bodyweight)", "8 / side", 3.8, ["legs", "glutes"], ["Step forward, lower both knees to about 90°.", "Push through the front heel to step through."]),
  k("wu-ankle-rocks", "Ankle rocks", "10 / side", 2.5, ["legs"], ["Half-kneeling, front foot flat.", "Rock the knee over the toes, heel stays down."]),
  k("wu-inchworm", "Inchworm", "6 reps", 3.5, ["core", "chest", "shoulders", "legs", "back"], ["Walk the hands out to a plank.", "Walk the feet in to the hands. Keep the legs as straight as is comfortable."]),
  k("wu-marching", "High-knee march", "1 min", 3.8, ["cardio", "legs", "core"], ["Lift the knees to hip height, swing the arms.", "Light on the feet, easy pace."]),
];

export const COOL = [
  k("cd-chest", "Chest stretch (doorway)", "30 sec / side", 2.3, ["chest", "shoulders"], ["Forearm on the door frame, elbow at shoulder height.", "Lean through gently.", "Hold, it should feel comfortable, not painful."]),
  k("cd-shoulder", "Cross-body shoulder stretch", "30 sec / side", 2.3, ["shoulders", "back"], ["Pull one arm across the chest at the elbow.", "Keep the shoulder down."]),
  k("cd-triceps", "Triceps stretch", "30 sec / side", 2.3, ["arms", "shoulders"], ["Bend the elbow overhead.", "Gently press it back with the other hand."]),
  k("cd-biceps", "Biceps wall stretch", "30 sec / side", 2.3, ["arms", "chest"], ["Palm flat on a wall, fingers back.", "Turn the body away until you feel a stretch."]),
  k("cd-lat", "Lat stretch (child’s pose reach)", "30 sec / side", 2.3, ["back"], ["Kneel, push the hips back, reach one arm forward.", "Walk the hand to each side."]),
  k("cd-quad", "Standing quad stretch", "30 sec / side", 2.3, ["legs"], ["Hold the ankle, knees together.", "Tuck the pelvis under, stand tall."]),
  k("cd-ham", "Hamstring stretch", "30 sec / side", 2.3, ["legs", "glutes"], ["Heel forward, hinge at the hips with a flat back.", "Reach toward the toes."]),
  k("cd-glute", "Figure-4 glute stretch", "30 sec / side", 2.3, ["glutes", "legs"], ["Lie down, cross one ankle over the opposite knee.", "Pull the thigh toward the chest."]),
  k("cd-calf", "Calf stretch (wall)", "30 sec / side", 2.3, ["legs"], ["Step one leg back, heel on the floor.", "Lean forward gently."]),
  k("cd-hipflexor", "Half-kneeling hip flexor stretch", "30 sec / side", 2.3, ["legs", "glutes", "core"], ["Knee down, tuck the pelvis, shift forward slightly.", "Squeeze the glute of the back leg."]),
  k("cd-childs", "Child’s pose", "45 sec", 2, ["core", "back"], ["Sit back on your heels, arms long.", "Breathe into the lower back."]),
  k("cd-walk", "Easy walk to cool down", "3 min", 3, ["cardio"], ["Slow the pace each minute.", "Let your breathing settle."]),
  k("cd-breath", "Slow breathing", "1 min", 1.5, ["all"], ["In through the nose for 4 counts, out for 6.", "Let the shoulders drop."]),
];

const KIT_BY_ID = new Map([...WARM, ...COOL].map((x) => [x.id, x]));
export const kitById = (id) => KIT_BY_ID.get(id) || null;

/** "3 min" -> 3, "30 sec" -> 0.5, "10 reps" -> 0.5 (about 3 s a rep), "10 / side" or "30 sec / side" doubles it. Unreadable text counts as 1 minute. */
export function doseMinutes(dose) {
  const t = String(dose == null ? "" : dose).toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(min|m\b|sec|s\b|reps?|x)?/);
  if (!m) return 1;
  const n = parseFloat(m[1]);
  const u = m[2] || "reps";
  let min = /^m/.test(u) ? n : /^s/.test(u) ? n / 60 : (n * 3) / 60;
  if (/side|each|leg|arm/.test(t)) min *= 2;
  return Math.max(0.1, Math.round(min * 100) / 100);
}

export const kitMinutes = (item) => doseMinutes(item && item.dose);
export function kitKcal(item, bodyKg = 70) {
  const lib = KIT_BY_ID.get(item && item.id);
  const met = lib ? lib.met : 3; // a move you typed yourself counts as light activity
  return Math.round(met * 3.5 * num(bodyKg, 70) / 200 * kitMinutes(item));
}

// ---------------------------------------------------------------------------------------------------------------- the main workout
const unitOf = (u) => (u === "min" || u === "sec" ? u : "reps");
/** Middle of a rep range: "8-12" -> 10, "30" -> 30. */
function repsMid(raw) {
  const m = String(raw == null ? "" : raw).match(/(\d{1,3})\s*(?:[-–]\s*(\d{1,3}))?/);
  if (!m) return 10;
  const lo = parseInt(m[1], 10), hi = m[2] ? parseInt(m[2], 10) : lo;
  return Math.max(1, Math.round((lo + hi) / 2));
}
const entryOf = (item, lib) => {
  const l = lib || {};
  const unit = unitOf(item.unit || l.unit);
  const reps = repsMid(item.reps);
  return { cat: item.cat || l.cat || "", name: item.name, unit, sets: Array.from({ length: Math.max(1, num(item.sets, 3)) }, () => ({ kg: 0, reps })) };
};
export const mainKcal = (item, bodyKg = 70, lib) => entryKcal(entryOf(item, lib), num(bodyKg, 70));
export function mainMinutes(item, lib) {
  const e = entryOf(item, lib);
  return Math.round(e.sets.reduce((n, s) => n + setMinutes(e.unit, s), 0) * 10) / 10;
}

/**
 * Minutes and kcal for one plan day. `lookup(id, item)` returns the library record (for the unit and category) or null.
 * Calories are an estimate (MET based). Real burn depends on effort, rest and fitness.
 */
export function dayEstimate(day, bodyKg = 70, lookup = () => null) {
  const d = day || {};
  const warm = d.warm || [], cool = d.cool || [], main = d.items || [];
  const wMin = warm.reduce((n, x) => n + kitMinutes(x), 0), cMin = cool.reduce((n, x) => n + kitMinutes(x), 0);
  const mMin = main.reduce((n, x) => n + mainMinutes(x, lookup(x.id, x)), 0);
  const wK = warm.reduce((n, x) => n + kitKcal(x, bodyKg), 0), cK = cool.reduce((n, x) => n + kitKcal(x, bodyKg), 0);
  const mK = main.reduce((n, x) => n + mainKcal(x, bodyKg, lookup(x.id, x)), 0);
  const r = (v) => Math.round(v);
  return {
    warmMin: r(wMin), mainMin: r(mMin), coolMin: r(cMin), totalMin: r(wMin + mMin + cMin),
    warmKcal: r(wK), mainKcal: r(mK), coolKcal: r(cK), totalKcal: r(wK + mK + cK),
  };
}
export const weekKcal = (plan, bodyKg, lookup) => (plan ? plan.days.filter((d) => d.items.length).reduce((n, d) => n + dayEstimate(d, bodyKg, lookup).totalKcal, 0) : 0);

// ---------------------------------------------------------------------------------------------------------------- warm-up and cool-down that fit the main workout
const GROUPS = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core", "cardio"];
function groupsOf(main, lookup = () => null) {
  const g = new Set();
  for (const it of main || []) {
    const lib = lookup(it.id, it) || {};
    const cat = String(it.cat || lib.cat || "").toLowerCase();
    if (cat === "full body") { ["legs", "back", "chest", "shoulders", "core"].forEach((x) => g.add(x)); continue; }
    if (GROUPS.includes(cat)) g.add(cat);
    for (const t of lib.targets || []) if (GROUPS.includes(t)) g.add(t);
  }
  return GROUPS.filter((x) => g.has(x));
}

/** Warm-up and cool-down items ({ id, name, dose }) that match the muscles in `main`. Always starts with an easy raise-the-heart-rate move and ends with slow breathing. */
export function suggestWarmCool(main, lookup = () => null) {
  const groups = groupsOf(main, lookup);
  const only = groups.length === 1 && groups[0] === "cardio";
  const pick = (list, cap, skip = []) => {
    const out = [];
    for (const g of groups.length ? groups : ["all"]) for (const x of list) if (!skip.includes(x.id) && x.for.includes(g) && !out.includes(x) && out.length < cap) out.push(x);
    return out;
  };
  const lowerOnly = groups.length > 0 && groups.every((g) => ["legs", "glutes", "core", "cardio"].includes(g));
  const lead = lowerOnly && !only && main.some((m) => /bike|cycl/i.test(m.name)) ? WARM[1] : WARM[0];
  const warmMoves = pick(WARM.slice(2), only ? 2 : 4);
  const warm = [lead, ...warmMoves];
  const coolMoves = pick(COOL.filter((x) => x.id !== "cd-walk" && x.id !== "cd-breath"), only ? 2 : 5);
  const cool = [...(groups.includes("cardio") ? [KIT_BY_ID.get("cd-walk")] : []), ...coolMoves, KIT_BY_ID.get("cd-breath")];
  const out = (l) => l.map((x) => ({ id: x.id, name: x.name, dose: x.dose }));
  return { warm: out(warm), cool: out(cool) };
}

// ---------------------------------------------------------------------------------------------------------------- ready-made plans
// m(name, category, sets, reps, unit?) -> a main-workout item. The id is the exercise catalogue id (gc-<slug>), the library finds it by id or by name.
const m = (name, cat, sets, reps, unit = "reps") => ({ id: `gc-${slug(name)}`, name, cat, sets, reps: String(reps), unit });
const day = (dow, title, main) => ({ dow, title, main });

export const TEMPLATES = [
  {
    id: "t-legs", icon: "🦵", name: "Leg day", level: "All levels", blurb: "Quads, hamstrings, glutes and calves in two sessions: one quad-led, one hip and hamstring-led.",
    days: [
      day(1, "Quads & calves", [m("Back Squat", "legs", 4, "6-10"), m("Leg Press (45°)", "legs", 3, "10-12"), m("Bulgarian Split Squat", "legs", 3, "8-10"), m("Leg Extension Machine", "legs", 3, "12-15"), m("Standing Calf Raise Machine", "legs", 4, "12-15"), m("Plank", "core", 3, "30-45", "sec")]),
      day(4, "Hamstrings & glutes", [m("Romanian Deadlift (Barbell)", "legs", 4, "8-10"), m("Barbell Hip Thrust", "glutes", 3, "8-12"), m("Lying Leg Curl", "legs", 3, "10-12"), m("Dumbbell Walking Lunge", "legs", 3, "10-12"), m("Seated Calf Raise", "legs", 3, "15-20"), m("Hanging Knee Raise", "core", 3, "10-12")]),
    ],
  },
  {
    id: "t-ppl", icon: "💪", name: "Push / Pull / Legs", level: "Intermediate", blurb: "The classic 3-day split. Run it twice a week for 6 days, or once with rest days between.",
    days: [
      day(1, "Push", [m("Flat Barbell Bench Press", "chest", 4, "6-10"), m("Seated Dumbbell Shoulder Press", "shoulders", 3, "8-12"), m("Incline Dumbbell Press", "chest", 3, "8-12"), m("Dumbbell Lateral Raise", "shoulders", 3, "12-15"), m("Triceps Rope Pushdown", "arms", 3, "10-12"), m("Overhead Dumbbell Triceps Extension", "arms", 2, "10-12")]),
      day(3, "Pull", [m("Barbell Row", "back", 4, "6-10"), m("Wide-Grip Lat Pulldown", "back", 3, "8-12"), m("Seated Cable Row", "back", 3, "10-12"), m("Face Pull", "back", 3, "12-15"), m("Dumbbell Biceps Curl", "arms", 3, "10-12"), m("Hammer Curl", "arms", 2, "10-12")]),
      day(5, "Legs", [m("Back Squat", "legs", 4, "6-10"), m("Romanian Deadlift (Barbell)", "legs", 3, "8-10"), m("Leg Press (45°)", "legs", 3, "10-12"), m("Lying Leg Curl", "legs", 3, "10-12"), m("Standing Calf Raise Machine", "legs", 4, "12-15"), m("Plank", "core", 3, "30-45", "sec")]),
    ],
  },
  {
    id: "t-ul", icon: "🏋️", name: "Upper / Lower split", level: "Intermediate", blurb: "4 days a week. Each muscle is trained twice, with a rest day between the same sessions.",
    days: [
      day(1, "Upper A", [m("Flat Barbell Bench Press", "chest", 4, "6-10"), m("Barbell Row", "back", 4, "6-10"), m("Seated Dumbbell Shoulder Press", "shoulders", 3, "8-12"), m("Wide-Grip Lat Pulldown", "back", 3, "8-12"), m("Dumbbell Biceps Curl", "arms", 2, "10-12"), m("Triceps Rope Pushdown", "arms", 2, "10-12")]),
      day(2, "Lower A", [m("Back Squat", "legs", 4, "6-10"), m("Romanian Deadlift (Barbell)", "legs", 3, "8-10"), m("Leg Press (45°)", "legs", 3, "10-12"), m("Lying Leg Curl", "legs", 3, "10-12"), m("Standing Calf Raise Machine", "legs", 3, "12-15"), m("Plank", "core", 3, "30-45", "sec")]),
      day(4, "Upper B", [m("Incline Dumbbell Press", "chest", 3, "8-12"), m("Seated Cable Row", "back", 3, "10-12"), m("Dumbbell Lateral Raise", "shoulders", 3, "12-15"), m("Pec Deck Fly", "chest", 2, "12-15"), m("Hammer Curl", "arms", 3, "10-12"), m("Overhead Dumbbell Triceps Extension", "arms", 3, "10-12")]),
      day(5, "Lower B", [m("Goblet Squat", "legs", 3, "10-12"), m("Barbell Hip Thrust", "glutes", 3, "8-12"), m("Dumbbell Walking Lunge", "legs", 3, "10-12"), m("Seated Leg Curl", "legs", 3, "10-12"), m("Seated Calf Raise", "legs", 3, "15-20"), m("Hanging Knee Raise", "core", 3, "10-12")]),
    ],
  },
  {
    id: "t-fb", icon: "⚡", name: "Full body, 3 days", level: "Beginner", blurb: "Three whole-body sessions with a rest day between each. The best start if you are new or coming back.",
    days: [
      day(1, "Full body A", [m("Goblet Squat", "legs", 3, "10-12"), m("Dumbbell Bench Press", "chest", 3, "8-12"), m("Seated Cable Row", "back", 3, "10-12"), m("Seated Dumbbell Shoulder Press", "shoulders", 2, "10-12"), m("Plank", "core", 2, "20-30", "sec")]),
      day(3, "Full body B", [m("Dumbbell Romanian Deadlift", "legs", 3, "10-12"), m("Incline Push-Up", "chest", 3, "8-12"), m("Wide-Grip Lat Pulldown", "back", 3, "10-12"), m("Dumbbell Lateral Raise", "shoulders", 2, "12-15"), m("Dead Bug", "core", 2, "10")]),
      day(5, "Full body C", [m("Leg Press (45°)", "legs", 3, "10-12"), m("Chest Press Machine", "chest", 3, "10-12"), m("One-Arm Dumbbell Row", "back", 3, "10-12"), m("Glute Bridge (Bodyweight)", "glutes", 3, "12-15"), m("Bird Dog", "core", 2, "10")]),
    ],
  },
  {
    id: "t-fat", icon: "🔥", name: "Fat-loss mix", level: "Beginner to intermediate", blurb: "Two full-body strength days to keep muscle, plus interval and steady cardio for the calorie burn.",
    days: [
      day(1, "Strength A", [m("Goblet Squat", "legs", 3, "12-15"), m("Dumbbell Bench Press", "chest", 3, "10-12"), m("Seated Cable Row", "back", 3, "10-12"), m("Dumbbell Romanian Deadlift", "legs", 3, "10-12"), m("Plank", "core", 3, "30-40", "sec")]),
      day(2, "Interval cardio", [m("Treadmill Walk", "cardio", 1, 5, "min"), m("Treadmill Run", "cardio", 6, 2, "min")]),
      day(4, "Strength B", [m("Leg Press (45°)", "legs", 3, "12-15"), m("Incline Dumbbell Press", "chest", 3, "10-12"), m("Wide-Grip Lat Pulldown", "back", 3, "10-12"), m("Barbell Hip Thrust", "glutes", 3, "10-12"), m("Mountain Climber", "core", 3, "20")]),
      day(6, "Steady cardio", [m("Incline Treadmill Walk", "cardio", 1, 30, "min")]),
    ],
  },
  {
    id: "t-glute", icon: "🍑", name: "Glutes & tone", level: "All levels", blurb: "Three days that build the glutes and legs first, with upper-body and core work to balance them.",
    days: [
      day(1, "Glutes & hamstrings", [m("Barbell Hip Thrust", "glutes", 4, "8-12"), m("Romanian Deadlift (Barbell)", "legs", 3, "8-10"), m("Cable Pull-Through", "glutes", 3, "12-15"), m("Lying Leg Curl", "legs", 3, "10-12"), m("Banded Lateral Walk", "glutes", 3, "15")]),
      day(3, "Upper & core", [m("Incline Dumbbell Press", "chest", 3, "10-12"), m("Seated Cable Row", "back", 3, "10-12"), m("Seated Dumbbell Shoulder Press", "shoulders", 3, "10-12"), m("Dumbbell Lateral Raise", "shoulders", 2, "12-15"), m("Plank", "core", 3, "30-45", "sec"), m("Bicycle Crunch", "core", 3, "20")]),
      day(5, "Quads & glutes", [m("Back Squat", "legs", 4, "8-10"), m("Bulgarian Split Squat", "legs", 3, "8-10"), m("Single-Leg Hip Thrust", "glutes", 3, "10-12"), m("Cable Glute Kickback", "glutes", 3, "12-15"), m("Standing Calf Raise Machine", "legs", 3, "12-15")]),
    ],
  },
  {
    id: "t-home", icon: "🏠", name: "Home, no equipment", level: "Beginner", blurb: "Bodyweight only. Three sessions you can do in a living room, plus a light cardio day.",
    days: [
      day(1, "Lower body", [m("Bodyweight Squat", "legs", 3, "12-15"), m("Glute Bridge (Bodyweight)", "glutes", 3, "12-15"), m("Wall Sit", "legs", 3, "30-45", "sec"), m("Donkey Kick", "glutes", 2, "12-15"), m("Single-Leg Calf Raise", "legs", 3, "12-15")]),
      day(3, "Upper body & core", [m("Push-Up", "chest", 3, "6-12"), m("Pike Push-Up", "shoulders", 3, "6-10"), m("Superman", "back", 3, "12"), m("Bench Dip", "arms", 3, "8-12"), m("Plank", "core", 3, "20-40", "sec")]),
      day(5, "Full body", [m("Bodyweight Squat", "legs", 3, "15"), m("Incline Push-Up", "chest", 3, "10-12"), m("Mountain Climber", "core", 3, "20"), m("Burpee", "cardio", 3, "8"), m("Dead Bug", "core", 2, "10")]),
      day(6, "Easy cardio", [m("Outdoor Walk", "cardio", 1, 30, "min")]),
    ],
  },
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || null;

/** A template's days with a matching warm-up and cool-down added to every training day. Plain data: customPlans.planFromTemplate() turns it into a plan. */
export function templateDays(t, lookup = () => null) {
  return (t ? t.days : []).map((d) => ({ dow: d.dow, title: d.title, items: d.main.map((x) => ({ ...x })), ...suggestWarmCool(d.main, lookup) }));
}
