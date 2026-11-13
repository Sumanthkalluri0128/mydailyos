// One place that answers: "what do we show for ANY exercise the person can pick?"
//   * sortExercises(): the order every exercise list uses (your recent / today's plan first, then muscle group in a sensible
//     push-pull-legs-core-cardio order, then A-Z). Before this each screen sorted differently (A-Z across everything).
//   * detailFor(): the library-shaped record (muscles, steps, what to avoid, rest, picture hint) for an exercise that only exists in the
//     wide gym catalogue (id "gc-...") or that the person typed themselves, so it opens the same How-to sheet, gets a picture and
//     runs in the live workout like the built-in ones.
//   * pickerList(): built-in library + the whole catalogue, one row per exercise, ready for any picker.
// Pure (no React, no network): unit-tested in exerciseDetail.test.js.

export const CAT_ORDER = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core", "full body", "cardio", "mobility", "other"];
export const catRank = (cat) => {
  const i = CAT_ORDER.indexOf(String(cat || "other").toLowerCase());
  return i < 0 ? CAT_ORDER.length : i;
};

/**
 * Sorts a COPY of `list` ({ id, name, cat }). `boost` = ids that go first, in that order (recent, then today's plan).
 * Then muscle group in CAT_ORDER, then A-Z (numbers inside names sort naturally).
 */
export function sortExercises(list, { boost = [], groupFirst = true } = {}) {
  const pri = new Map(boost.map((id, i) => [id, i]));
  const az = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" });
  return [...list].sort((a, b) => {
    const pa = pri.has(a.id) ? pri.get(a.id) : Infinity, pb = pri.has(b.id) ? pri.get(b.id) : Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;
    if (groupFirst) { const d = catRank(a.cat) - catRank(b.cat); if (d) return d; }
    return az(a, b);
  });
}

// ---------------------------------------------------------------------------------------------------------------- what an exercise is
// name -> movement slot (the same slots utils/exerciseFigure.js draws). First match wins, so the specific ones come first.
const SLOT_RULES = [
  [/triceps?.*kickback/, "tri"],
  [/leg curl|hamstring curl|nordic/, "ham"],
  [/leg extension/, "quad"],
  [/calf|tibialis/, "calf"],
  [/lunge|split squat|step-?up/, "lunge"],
  [/deadlift|romanian|\brdl\b|good morning|back extension|hyperextension|pull-?through/, "hinge"],
  [/hip thrust|glute bridge|kickback|donkey|frog pump/, "glute"],
  [/squat|leg press|hack|sissy/, "squat"],
  [/incline.*(press|push)|(press|push).*incline/, "ipress"],
  [/overhead|shoulder press|military|arnold|landmine press|push press|z press/, "vpress"],
  [/rear delt|face pull|reverse (pec|fly)|reverse fly|band pull-?apart/, "rear"],
  [/lateral raise|front raise|upright row/, "lateral"],
  [/fly|flye|pec deck|crossover/, "fly"],
  [/pushdown|skull|triceps|tricep|kickback|close-grip bench|dip\b/, "tri"],
  [/bench|chest press|push-?up|floor press/, "hpress"],
  [/pulldown|pull-?up|chin-?up|pullover/, "vpull"],
  [/\brow\b|\brows\b|shrug|pull-?apart/, "hrow"],
  [/curl|preacher|hammer/, "bicep"],
  [/crunch|sit-?up|plank|leg raise|knee raise|twist|woodchop|russian|ab wheel|rollout|dead bug|bird dog|mountain climber|hollow|v-up|bicycle|core/, "core"],
];
export const slotFor = (name) => { const n = String(name || "").toLowerCase(); for (const [re, slot] of SLOT_RULES) if (re.test(n)) return slot; return ""; };

const SLOT_MUSCLES = {
  squat: ["legs", "glutes"], quad: ["legs"], hinge: ["back", "glutes", "legs"], glute: ["glutes"], lunge: ["legs", "glutes"], ham: ["legs"], calf: ["legs"],
  hpress: ["chest", "arms"], ipress: ["chest", "shoulders"], fly: ["chest"], vpress: ["shoulders", "arms"], lateral: ["shoulders"], rear: ["shoulders", "back"],
  tri: ["arms"], vpull: ["back", "arms"], hrow: ["back", "arms"], bicep: ["arms"], core: ["core"],
};
const CAT_MUSCLES = { chest: ["chest"], back: ["back"], shoulders: ["shoulders"], arms: ["arms"], legs: ["legs"], glutes: ["glutes"], core: ["core"], "full body": ["legs", "back", "core"], cardio: ["cardio"], mobility: ["mobility"] };
const COMPOUND = new Set(["squat", "hinge", "lunge", "hpress", "ipress", "vpress", "vpull", "hrow", "glute"]);

// Short, safe step-by-step guides per slot (what the How-to tab shows when the sheets have no entry for the exercise).
const SLOT_GUIDE = {
  squat: { steps: ["Set your feet about shoulder-width apart, chest up, core braced.", "Sit your hips back and down until your thighs are about parallel.", "Keep your knees in line with your toes.", "Push through the whole foot to stand tall."], avoid: "Knees caving in. Rounding the lower back." },
  hinge: { steps: ["Stand tall with a soft bend in the knees, core braced.", "Push your hips back and let the weight slide down your legs with a flat back.", "Stop when you feel the hamstrings stretch.", "Drive the hips forward to stand tall."], avoid: "Rounding the back. Turning it into a squat." },
  glute: { steps: ["Set up with your back or feet supported and your core braced.", "Drive through your heels to lift the hips.", "Squeeze the glutes for a second at the top.", "Lower slowly without dropping."], avoid: "Arching the lower back at the top." },
  lunge: { steps: ["Stand tall, core braced.", "Step into the lunge and lower until both knees are about 90 degrees.", "Keep your chest up and the front knee over the ankle.", "Push through the front heel to return."], avoid: "Front knee collapsing inward. Leaning forward." },
  quad: { steps: ["Adjust the seat so your knees line up with the machine's pivot.", "Extend the legs until almost straight, without locking out.", "Squeeze the thighs for a second.", "Lower slowly under control."], avoid: "Swinging the weight. Locking the knees hard." },
  ham: { steps: ["Adjust the pad so it sits just above the heels.", "Curl the heels toward your glutes.", "Squeeze the hamstrings for a second.", "Lower slowly under control."], avoid: "Lifting the hips off the pad." },
  calf: { steps: ["Stand with the balls of your feet on the edge of a step or platform.", "Rise as high as you can.", "Squeeze the calves for a second.", "Lower slowly past the starting line for a stretch."], avoid: "Bouncing. Short range." },
  hpress: { steps: ["Set your shoulder blades back and down, feet planted.", "Lower the weight to mid-chest with control (elbows about 45 to 60 degrees from the body).", "Press up until the arms are straight.", "Keep your wrists stacked over your elbows."], avoid: "Bouncing off the chest. Flaring the elbows wide." },
  ipress: { steps: ["Set the bench to a low incline, shoulder blades back and down.", "Lower the weight to the upper chest with control.", "Press up and slightly back until the arms are straight.", "Keep your feet planted."], avoid: "Setting the incline too steep. Lifting the hips." },
  fly: { steps: ["Start with a slight bend in your elbows, chest open.", "Open the arms wide until you feel a stretch across the chest.", "Bring the arms together in a hugging arc.", "Keep the elbow bend the same throughout."], avoid: "Going heavy. Straightening the arms." },
  vpress: { steps: ["Start with the weight at shoulder height, core and glutes tight.", "Press straight up until the arms are extended.", "Lower slowly back to the shoulders.", "Keep your ribs down."], avoid: "Arching the lower back. Flaring the elbows behind you." },
  lateral: { steps: ["Stand tall with a slight bend in the elbows.", "Raise the arms out to the sides to shoulder height.", "Pause briefly at the top.", "Lower slowly."], avoid: "Swinging the body. Shrugging the shoulders." },
  rear: { steps: ["Set up with your chest up and shoulder blades free to move.", "Pull the arms back and out, squeezing the rear shoulders and upper back.", "Pause briefly.", "Return slowly."], avoid: "Using momentum. Shrugging." },
  tri: { steps: ["Keep your upper arms still and elbows close to your body.", "Extend the elbows until the arms are straight.", "Squeeze the triceps for a second.", "Return slowly to the start."], avoid: "Moving the shoulders. Flaring the elbows." },
  vpull: { steps: ["Grip the bar slightly wider than the shoulders and set your chest up.", "Pull your elbows down toward your ribs.", "Squeeze the back at the bottom.", "Return slowly to a full stretch."], avoid: "Swinging or jerking. Pulling with only the arms." },
  hrow: { steps: ["Set your back flat and chest up, core braced.", "Pull the weight toward your lower ribs, leading with the elbows.", "Squeeze the shoulder blades together.", "Lower slowly to a full stretch."], avoid: "Rounding the back. Using momentum." },
  bicep: { steps: ["Stand or sit tall with elbows pinned to your sides.", "Curl the weight up toward the shoulders.", "Squeeze the biceps for a second.", "Lower slowly under control."], avoid: "Swinging the body. Moving the elbows." },
  core: { steps: ["Brace the abs as if about to be poked in the stomach.", "Move slowly and with control through the range.", "Breathe out on the effort.", "Keep your neck relaxed."], avoid: "Pulling on the neck. Holding your breath." },
};
const CARDIO_GUIDE = { steps: ["Warm up for 2 to 3 minutes at an easy pace.", "Settle into a steady pace where you can still talk in short sentences.", "Keep your posture tall and breathing steady.", "Finish with 2 minutes of easy movement."], avoid: "Starting too fast. Holding the handrails the whole time." };
const GENERIC = { steps: ["Set up with a stable stance and braced core.", "Move through a pain-free range with control.", "Breathe out on the effort.", "Stop the set when form slips."], avoid: "Rushing the reps. Pain that is sharp." };
const GEAR_KIND = { barbell: "free weights", dumbbell: "free weights", kettlebell: "free weights", cable: "cable", machine: "machine", bands: "band", band: "band" };

/** Sets / reps / rest to suggest when someone adds the exercise to a plan. Moderate reps (8-15): lean and strong, not bulky. */
export function defaultsFor(e) {
  const slot = e.slot || slotFor(e.name);
  const cat = String(e.cat || "").toLowerCase();
  if (e.unit === "min" || cat === "cardio") return { sets: 1, reps: "20", rest: 0, unit: "min", label: "20 min" };
  if (e.unit === "sec") return { sets: 3, reps: "30", rest: 45, unit: "sec", label: "3 × 30 s" };
  if (slot === "core") return { sets: 3, reps: "12-15", rest: 45, unit: "reps", label: "3 × 12-15" };
  if (COMPOUND.has(slot)) return { sets: 3, reps: "8-12", rest: 90, unit: "reps", label: "3 × 8-12" };
  return { sets: 3, reps: "10-15", rest: 60, unit: "reps", label: "3 × 10-15" };
}

/**
 * Library-shaped record for ANY exercise ({ id, name, cat, unit?, gear? }). A built-in library item passes through untouched,
 * so call it as `lookup(id) || detailFor(entry)`. Shape matches data/workoutPlan.js items (targets, steps, avoid, rest, slot, kind, timed...).
 */
export function detailFor(e) {
  if (!e) return null;
  if (Array.isArray(e.steps) && e.steps.length && e.targets && e.targets.length) return e;
  const cat = String(e.cat || "other").toLowerCase();
  const slot = e.slot || slotFor(e.name);
  const cardio = e.unit === "min" || cat === "cardio";
  const guide = cardio ? CARDIO_GUIDE : SLOT_GUIDE[slot] || GENERIC;
  const d = defaultsFor({ ...e, slot });
  const catM = cat === "full body" ? [] : CAT_MUSCLES[cat] || [];
  const targets = cardio ? ["cardio"] : [...new Set([...catM, ...(SLOT_MUSCLES[slot] || []), ...(catM.length || SLOT_MUSCLES[slot] ? [] : ["core"])])].slice(0, 3);
  const gear = String(e.gear || "").toLowerCase();
  return {
    id: e.id, name: e.name, cat, dose: d.label, sets: d.sets, reps: d.reps, repsMin: parseInt(d.reps, 10) || 8, repsMax: parseInt(String(d.reps).split("-")[1], 10) || parseInt(d.reps, 10) || 12,
    rest: d.rest || 60, targets, helpers: [], kind: e.kind || GEAR_KIND[gear] || "", fig: "", slot, main: false,
    bw: gear === "bodyweight" && !cardio, timed: e.unit === "sec" || e.unit === "min", perSide: /single|one-arm|lunge|split|step-up/i.test(e.name), unit: e.unit === "min" ? "min" : e.unit === "sec" ? "sec" : "",
    steps: guide.steps, avoid: guide.avoid, alts: [], optional: false, derived: true,
  };
}

/** Every exercise a picker can offer: built-in library first (richest data), then the rest of the gym catalogue. One row per exercise. */
export function pickerList(libraryItems, catalogItems) {
  const key = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const seen = new Set(), out = [];
  const lib = (libraryItems || []).filter((e) => e.blockType === "sets" || e.blockType === "extra" || e.blockType === "options" || e.blockType === undefined);
  for (const e of lib) {
    if (e.blockType === "options" && !(e.targets && e.targets[0])) continue;
    const k = key(e.name); if (!k || seen.has(k)) continue; seen.add(k);
    const cat = String(e.cat || (e.targets && e.targets[0]) || "core").toLowerCase();
    const d = defaultsFor({ ...e, cat, unit: e.unit === "min" ? "min" : e.timed || e.unit === "sec" ? "sec" : cat === "cardio" ? "min" : "reps" });
    out.push({ id: e.id, name: e.name, cat, sets: e.sets || d.sets, reps: e.reps || d.reps, unit: d.unit, gear: e.kind || "", builtin: true });
  }
  for (const c of catalogItems || []) {
    const k = key(c.name); if (!k || seen.has(k)) continue; seen.add(k);
    const cat = String(c.cat || "other").toLowerCase();
    const d = defaultsFor({ ...c, cat });
    out.push({ id: c.id, name: c.name, cat, sets: d.sets, reps: d.reps, unit: d.unit, gear: c.gear || "", builtin: false });
  }
  return out;
}
