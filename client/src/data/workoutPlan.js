// The "7-Day Lean & Toned Plan (Beginner Edition)" as data, plus every alternative from the four alternatives sheets.
// Pure data + tiny builders. No React, no network, so it works offline and is easy to unit-test.
//
// Conventions
//   * `fig` is an exercise id that utils/exerciseFigure.js already has a picture for (see BY_ID there); `slot` is the fallback pose.
//   * `targets` use the figure muscle names: chest, back, shoulders, arms, core, legs, glutes.
//   * `main: true` marks the compound lifts that get one extra set in weeks 5+ (the plan's "add one extra set on main lifts").
//   * `alts` are the "pick ONE" alternatives from the sheets. They inherit sets / reps / targets from the original.

import { EXTRAS } from "./libraryExtra.js";
import { sortExercises } from "../utils/exerciseDetail.js";

export const PLAN_ID = "lean-toned-7";
export const SMART_ID = "smart"; // the server-built program (utils/unifiedPlan.js)
export const PLAN = {
  id: PLAN_ID,
  name: "7-Day Lean & Toned",
  level: "Beginner",
  goals: ["Build base strength", "Lose body fat", "Improve fitness", "Learn proper form"],
  profile: { weightKg: 78, heightCm: 173, age: 26, steps: "8,000–10,000 / day", calories: "~2,000–2,200 kcal" },
};

export const MUSCLE_LABEL = { chest: "Chest", back: "Back", shoulders: "Shoulders", arms: "Arms", core: "Core", legs: "Legs", glutes: "Glutes", mobility: "Mobility", cardio: "Cardio" };
export const FILTERS = ["all", "chest", "back", "shoulders", "arms", "legs", "glutes", "core", "cardio", "mobility"];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Alternative: "Name|note" strings keep the data below short.
const alts = (parentId, list, base = {}) => list.map((s, i) => {
  const [name, note = "", fig] = s.split("|");
  return { id: `${parentId}--${slug(name)}`, name, note, fig: fig || base.fig, alt: true, parent: parentId, _i: i };
});

// A strength exercise.
const ex = (id, name, sets, reps, o = {}) => {
  const [lo, hi] = String(reps).split("-").map((n) => parseInt(n, 10));
  const e = {
    id, name, sets, reps: String(reps), repsMin: lo || 8, repsMax: hi || lo || 12, rest: o.rest || 75,
    targets: o.targets || [], helpers: o.helpers || [], kind: o.kind || "", fig: o.fig || "", slot: o.slot || "",
    main: !!o.main, bw: !!o.bw, timed: !!o.timed, perSide: !!o.perSide, unit: o.unit || "",
    steps: o.steps || [], avoid: o.avoid || "", optional: !!o.optional,
  };
  e.alts = alts(id, o.alts || [], e);
  return e;
};

// A tick-off item (warm-up, cool-down, mobility, circuit move).
const item = (id, name, dose, o = {}) => ({ id, name, dose, targets: o.targets || ["mobility"], fig: o.fig || "", slot: o.slot || "", steps: o.steps || [], avoid: o.avoid || "", alts: alts(id, o.alts || [], { fig: o.fig || "" }), kind: "" });

const UPPER_ALTS = {
  incline: ["Wall Push-up|Easiest. Stand an arm's length from the wall.|incline-pushup", "Chest Press Machine|Fixed path, easy to control.|chest-press-machine", "DB Floor Press|Lie on the floor, press light dumbbells.|floor-press", "Knee Push-up|Same push-up shape from your knees.|knee-pushup"],
};

// ---------------------------------------------------------------------------------------------------------------- warm-ups / cool-downs
const WARM_CARDIO = (id, dose) => item(id, "Easy Cardio", dose, { fig: "", alts: ["Brisk Walk (Outdoors)|Easy pace, swing the arms", "Stationary Bike|Light resistance", "Elliptical (Cross Trainer)|Smooth and easy", "Rowing (Light Pace)|Long, relaxed strokes"], steps: ["Keep a pace where you can still talk.", "Raise your heart rate gradually.", "Stop once your body feels warm."] });
const ARM_CIRCLES = (id) => item(id, "Arm Circles", "20 sec", { alts: ["Arm Swings (Front-Back)", "Cross-Body Arm Swings", "Hand Circles (Wrists)", "Shoulder Taps (Alternate)"], steps: ["Arms out to the sides.", "Start with small circles, then grow them.", "Do 20 sec each direction."] });
const SHOULDER_ROLLS = (id) => item(id, "Shoulder Rolls", "20 sec", { alts: ["Shoulder Shrugs (Up & Down)", "Scapular Retraction (Squeeze Back)", "Shoulder Circles (Forward & Back)", "Arm Crosses (Chest Open)"], steps: ["Roll shoulders up, back and down.", "Slow and controlled.", "Switch direction halfway."] });
const SCAP_PUSHUP = (id, dose = "10 reps") => item(id, "Scapular Push-up", dose, { alts: ["Wall Scapular Push-up", "Quadruped Scapular Protraction", "Band Scapular Retraction", "Seated Scapular Squeeze"], steps: ["Plank or wall position, arms straight.", "Move only the shoulder blades together and apart.", "8–12 slow reps."] });
const HIP_CIRCLES = (id) => item(id, "Hip Circles", "20 sec / side", { alts: ["Hip Hinge (Wall Touch)", "Pelvic Tilts (Standing)", "Hip CARs (Controlled Rotations)", "March in Place (High Knees – Low)"], steps: ["Hands on hips.", "Circle the hips slowly.", "10 in each direction."] });
const LEG_SWINGS = (id) => item(id, "Leg Swings", "10 / side", { alts: ["Leg March (High Knee)", "Butt Kick (Mild)", "Lateral Leg Raise (Bodyweight)", "Hip Opener (Knee Out)"], steps: ["Hold a wall or rack for support.", "Swing the leg gently front and back.", "Then 10 side to side."] });
const BW_SQUAT_WARM = (id) => item(id, "Bodyweight Squat", "10 reps", { fig: "tempo-squat", alts: ["Half Squat (Short Range)", "Box Squat (To Chair)", "Sit-to-Stand (Chair)", "Goblet Squat (Light Weight)"], steps: ["Feet shoulder-width apart.", "Sit back, chest up.", "Stand tall, squeeze the glutes."] });
const BRISK = (id) => item(id, "Brisk Walk", "3 min", { alts: ["Stationary Bike", "Elliptical (Cross Trainer)", "March in Place (High Knees – Low)", "Rowing (Light Pace)"], steps: ["Pick up the pace until you feel warm.", "Swing the arms naturally."] });

const CD = (id, name, dose, alt, steps) => item(id, name, dose, { alts: alt, steps });
const CHEST_STRETCH = (id) => CD(id, "Chest Stretch", "20 sec / side", ["Doorway Stretch", "Corner Stretch", "Wall Chest Stretch", "Pec Stretch (Arm Behind Back)"], ["Open the chest and shoulders against a wall.", "Hold 20–30 sec each side.", "It should feel comfortable, not painful."]);
const SHOULDER_STRETCH = (id) => CD(id, "Shoulder Stretch", "20 sec / side", ["Overhead Shoulder Stretch", "Cross-Body Stretch (with Towel)", "Sleeper Stretch (Gentle)", "Wall Shoulder Stretch"], ["Pull one arm across the chest at the elbow.", "Hold 20–30 sec each side."]);
const TRICEPS_STRETCH = (id) => CD(id, "Triceps Stretch", "20 sec / side", ["Towel Triceps Stretch", "Cross-Body Triceps Pull", "Wall Triceps Stretch", "Overhead Triceps with Band"], ["Bend the elbow overhead.", "Gently pull at the elbow.", "Hold 20–30 sec each side."]);
const QUAD_STRETCH = (id) => CD(id, "Quad Stretch", "20 sec / side", ["Side-Lying Quad Stretch", "Kneeling Quad Stretch (Half Knee)", "Standing Quad (with Support)", "Couch Stretch (Advanced)"], ["Stand tall, hold your ankle.", "Keep the knees together.", "Hold 20–30 sec each side."]);
const HAM_STRETCH = (id) => CD(id, "Hamstring Stretch", "20 sec / side", ["Standing Hamstring (Hinge)", "Straight-Leg Reach (Sitting)", "Towel Hamstring Stretch (Lying)", "Wall Hamstring (Leg on Wall)"], ["Keep the back straight.", "Reach toward the toes.", "Hold 20–30 sec."]);
const GLUTE_STRETCH = (id) => CD(id, "Glute Stretch", "20 sec / side", ["Figure-4 Stretch (Lying)", "Seated Figure-4 Stretch", "Pigeon Stretch (Gentle)", "Knee-to-Chest (Single Leg)"], ["Lie down, cross one ankle over the opposite knee.", "Pull toward the chest.", "Hold 20–30 sec each side."]);
const CALF_STRETCH = (id) => CD(id, "Calf Stretch", "20 sec / side", ["Straight-Knee Calf (Wall)", "Bent-Knee Calf (Wall)", "Stair Calf Stretch (Heel Drop)", "Calf Stretch (with Towel)"], ["Step one leg back, heel on the ground.", "Lean forward gently.", "Hold 20–30 sec each side."]);
const LAT_STRETCH = (id) => CD(id, "Lat Stretch", "20 sec / side", ["Doorway Lat Stretch", "Wall Lat Stretch (Arms Up)", "Side Bend Stretch (Standing)", "Bar Hang (Gentle, 10–20s)"], ["Kneel, push the hips back, chest toward the floor.", "Hold 20–30 sec."]);
const FULL_BODY = (id) => CD(id, "Full-Body Stretch", "5 min", ["World's Greatest Stretch (Dynamic)", "Standing Reach & Side Bend", "Hamstring + Calf Flow", "Child's Pose with Side Reach"], ["Move slowly through every muscle group.", "Breathe slow and deep."]);

// ---------------------------------------------------------------------------------------------------------------- the seven days
export const DAYS = [
  {
    id: "d1", n: 1, dow: 1, short: "Mon", title: "Upper A", kind: "strength", level: "Beginner", minutes: "45–60", kcal: 350,
    focus: "Chest, Back, Shoulders, Arms", muscles: ["chest", "back", "shoulders", "arms"],
    blocks: [
      { id: "warm", type: "check", title: "Warm-up", minutes: "5–8 min", items: [WARM_CARDIO("d1w1", "3 min"), ARM_CIRCLES("d1w2"), SHOULDER_ROLLS("d1w3"), SCAP_PUSHUP("d1w4")] },
      { id: "main", type: "sets", title: "Main workout", items: [
        ex("incline-pushup", "Incline Push-up", 3, "8-12", { targets: ["chest", "arms"], helpers: ["shoulders", "core"], fig: "incline-pushup", main: true, bw: true, alts: UPPER_ALTS.incline,
          steps: ["Hands on a bench or rail, body in one straight line.", "Lower your chest to the edge with elbows about 45° from the body.", "Press back up without sagging at the hips.", "Breathe in on the way down, out as you push."], avoid: "Flaring the elbows out wide or letting the hips drop." }),
        ex("seated-cable-row", "Seated Cable Row", 3, "10-12", { targets: ["back", "arms"], helpers: ["shoulders"], fig: "seated-row", kind: "cable", main: true,
          alts: ["Chest-Supported Machine Row|Chest on the pad takes the strain off your lower back.|chest-row-machine", "Resistance Band Row|Anchor the band at chest height.|band-row", "One-Arm DB Row|Hand and knee on a bench.|db-row", "Supported T-Bar Row|Chest on the pad.|tbar"],
          steps: ["Sit tall with a slight bend in the knees, feet on the plate.", "Pull the handle to your belly and squeeze your shoulder blades together.", "Pause for one second, then return slowly.", "Keep your chest up. Don't rock back."], avoid: "Leaning far back to move the weight." }),
        ex("db-shoulder-press", "DB Shoulder Press", 3, "8-12", { targets: ["shoulders", "arms"], helpers: ["core"], fig: "db-shoulder-press", kind: "free weights", main: true,
          alts: ["Machine Shoulder Press|Guided path.|shoulder-press-machine", "Neutral-Grip DB Press|Palms facing each other, kinder on the shoulders.|db-shoulder-press", "Landmine Press|Angled press, easier on the joint.|landmine-press", "Seated Band Press|Sit on a band, press up.|band-ohp"],
          steps: ["Sit with your back supported, dumbbells at shoulder height.", "Press up until your arms are almost straight.", "Lower slowly to ear level.", "Exhale on the press."], avoid: "Arching the lower back." }),
        ex("lateral-raise", "Lateral Raise", 2, "12-15", { targets: ["shoulders"], fig: "lateral-db", kind: "free weights", rest: 60,
          alts: ["Cable Lateral Raise|Constant tension.|lateral-cable", "Machine Lateral Raise|Guided path.|lateral-machine", "Leaning DB Lateral Raise|Hold a rack and lean away.|lateral-db", "Band Lateral Raise|Stand on a band.|lateral-band"],
          steps: ["Stand tall with light dumbbells at your sides.", "Raise the arms out to shoulder height with soft elbows.", "Pause, then lower for 2–3 seconds.", "Use light weight and no swinging."], avoid: "Shrugging the shoulders up to your ears." }),
        ex("db-biceps-curl", "DB Biceps Curl", 2, "10-12", { targets: ["arms"], fig: "db-curl", kind: "free weights", rest: 60,
          alts: ["Hammer Curl|Palms face in.|hammer-curl", "Cable Curl (Low Pulley)|Steady tension.|cable-curl", "Preacher Curl (Machine)|No cheating possible.|preacher-machine", "Resistance Band Curl|Stand on the band.|band-curl"],
          steps: ["Stand with elbows tucked at your sides.", "Curl the dumbbells up without moving the elbows.", "Squeeze at the top, then lower for 2–3 seconds."], avoid: "Swinging the torso." }),
        ex("triceps-pushdown", "Triceps Pushdown", 2, "10-12", { targets: ["arms"], fig: "pushdown-rope", kind: "cable", rest: 60,
          alts: ["Band Pressdown|Anchor the band overhead.|band-pushdown", "Overhead Cable Extension|Stretches the long head.|overhead-cable-ext", "Close-Grip Machine Press|Hands close together.|chest-press-machine", "Assisted Dip (If Comfortable)|Use the assist machine.|assisted-dip"],
          steps: ["Stand close to the cable, elbows pinned to your sides.", "Press the handle down until your arms are straight.", "Let it rise slowly to elbow height."], avoid: "Letting the elbows drift forward." }),
      ] },
      { id: "core", type: "sets", title: "Core", optional: true, items: [
        ex("dead-bug", "Dead Bug", 2, "10", { targets: ["core"], fig: "dead-bug", perSide: true, rest: 45, optional: true, bw: true,
          alts: ["Heel Taps|Lie on your back, tap heels down alternately.", "Bird Dog|On all fours, opposite arm and leg.|plank", "Bent-Knee March|Knees at 90°, march slowly.", "Short Lever Dead Bug|Bend the knees to make it easier."],
          steps: ["Lie on your back, arms up, knees over hips.", "Lower the opposite arm and leg slowly.", "Keep your lower back flat to the floor.", "Return and switch sides."], avoid: "Letting the lower back arch off the floor." }),
      ] },
      { id: "cool", type: "check", title: "Cool-down", minutes: "5 min", items: [CHEST_STRETCH("d1c1"), SHOULDER_STRETCH("d1c2"), TRICEPS_STRETCH("d1c3")] },
    ],
  },
  {
    id: "d2", n: 2, dow: 2, short: "Tue", title: "Lower A", kind: "strength", level: "Beginner", minutes: "45–55", kcal: 330,
    focus: "Quads, Glutes, Hamstrings, Calves", muscles: ["legs", "glutes"],
    blocks: [
      { id: "warm", type: "check", title: "Warm-up", minutes: "5–8 min", items: [BRISK("d2w1"), HIP_CIRCLES("d2w2"), LEG_SWINGS("d2w3"), BW_SQUAT_WARM("d2w4")] },
      { id: "main", type: "sets", title: "Main workout", items: [
        ex("bodyweight-squat", "Bodyweight Squat", 3, "12-15", { targets: ["legs", "glutes"], helpers: ["core"], fig: "tempo-squat", main: true, bw: true,
          alts: ["Box / Chair Squat|Sit back to touch the box.|box-squat", "Supported Squat|Hold a rack or TRX.|squat", "Goblet Squat (Light)|Hold one light dumbbell at the chest.|goblet-squat"],
          steps: ["Feet shoulder-width apart, toes slightly out.", "Sit back and down, chest up.", "Go as low as is comfortable and pain-free.", "Knees track in line with the toes. Push up through your whole foot."], avoid: "Knees caving inward or heels lifting." }),
        ex("leg-press", "Leg Press (Light)", 3, "10-12", { targets: ["legs", "glutes"], fig: "leg-press", kind: "machine", main: true,
          alts: ["Box Squat (To Bench)|Controlled sit-back.|box-squat", "Goblet Squat to Box|Light weight, touch the box.|goblet-squat", "Supported Split Squat|Hold support, stay pain-free.|lunge"],
          steps: ["Feet shoulder-width on the platform, back flat on the pad.", "Lower until your knees are around 90°.", "Press through the heels without locking the knees.", "Start light and keep the pace slow."], avoid: "Letting the lower back round off the pad." }),
        ex("romanian-deadlift", "Romanian Deadlift (Light DB / Bar)", 3, "10-12", { targets: ["legs", "glutes", "back"], fig: "rdl-db", kind: "free weights", main: true,
          alts: ["Dumbbell RDL|Light weight, same hinge.|rdl-db", "Kettlebell Deadlift (From Raised Blocks)|Shortens the range.|trap-deadlift", "Cable Pull-Through|Hinge against a cable.|pull-through", "Glute Bridge|If the hinge isn't learned yet.|glute-bridge"],
          steps: ["Stand tall with the weights in front of your thighs.", "Push your hips back, keeping a slight knee bend and a neutral spine.", "Lower until you feel the hamstrings stretch.", "Drive the hips forward to stand."], avoid: "Rounding the lower back." }),
        ex("glute-bridge", "Glute Bridge", 3, "12-15", { targets: ["glutes", "legs"], helpers: ["core"], fig: "glute-bridge", bw: true,
          alts: ["Floor Glute Bridge (Bodyweight)|The base version.|glute-bridge", "Banded Glute Bridge|Band above the knees.|banded-bridge", "Hip Thrust (On Bench, Light)|Upper back on a bench.|hip-thrust-machine", "Cable Pull-Through (Glute Focused)|Squeeze at the top.|pull-through"],
          steps: ["Lie on your back, knees bent, feet flat.", "Drive through the heels and lift the hips.", "Squeeze the glutes for 1–2 seconds at the top.", "Lower slowly with no jerking."], avoid: "Over-arching the lower back at the top." }),
        ex("calf-raise", "Calf Raise", 3, "15-20", { targets: ["legs"], fig: "calf-step", rest: 60, bw: true,
          alts: ["Seated Calf Raise (Machine)|Knee bent, targets the soleus.|calf-machine", "Standing Calf Raise (With Support)|Hold a rail for balance.|calf-step", "Leg Press Calf Raise|Use the leg press platform.|calf-press"],
          steps: ["Stand on a step with your heels hanging off the edge.", "Rise up as high as you can.", "Pause and squeeze at the top.", "Lower the heels slowly below the step."], avoid: "Bouncing at the bottom." }),
      ] },
      { id: "core", type: "sets", title: "Core", optional: true, items: [
        ex("plank", "Plank", 2, "20-30", { targets: ["core"], fig: "plank", timed: true, unit: "sec", rest: 45, optional: true, bw: true,
          alts: ["Elevated Plank|Hands on a bench or box.", "Dead Bug|Lying, controlled.|dead-bug", "Bird Dog|Opposite arm and leg.|plank", "Side Plank (From Knees)|Beginner version.|plank"],
          steps: ["Forearms on the floor, elbows under shoulders.", "Body in one straight line from head to heels.", "Brace the abs and squeeze the glutes.", "Breathe normally. Stop when your form slips."], avoid: "Sagging hips or a raised bottom." }),
      ] },
      { id: "cool", type: "check", title: "Cool-down", minutes: "5 min", items: [QUAD_STRETCH("d2c1"), HAM_STRETCH("d2c2"), GLUTE_STRETCH("d2c3")] },
    ],
  },
  {
    id: "d3", n: 3, dow: 3, short: "Wed", title: "Active Recovery", kind: "recovery", level: "Light", minutes: "30–40", kcal: 150,
    focus: "Recovery, Mobility, Light Cardio", muscles: ["mobility"],
    blocks: [
      { id: "activity", type: "check", title: "Activity plan", minutes: "20–30 min", items: [
        item("d3a1", "Brisk Walk or Cycle / Elliptical", "20–30 min", { alts: ["Stationary Bike|Easy resistance", "Elliptical (Cross Trainer)|Smooth pace", "Swimming (Easy)|Relaxed laps", "Walk With a Friend|Keep it conversational"], steps: ["Keep the effort light, you can chat easily.", "Aim for a gentle sweat, not exhaustion."] }),
      ] },
      { id: "mobility", type: "check", title: "Mobility routine", minutes: "5–10 min", items: [
        item("d3m1", "Cat-Cow", "× 10", { slot: "core", alts: ["Seated Cat-Cow", "Standing Cat-Cow (Hands on Thighs)", "Child's Pose to Cobra Flow"], steps: ["On all fours, hands under shoulders.", "Arch and round the spine slowly, with the breath."] }),
        item("d3m2", "Thoracic Rotation", "10 / side", { alts: ["Open Book (Lying)", "Thread the Needle", "Seated Trunk Rotation"], steps: ["On all fours, hand behind the head.", "Rotate the elbow toward the ceiling and follow it with your eyes."] }),
        item("d3m3", "Hip Opener", "10 / side", { alts: ["90/90 Hip Stretch", "Lizard Pose (Gentle)", "Frog Stretch (Gentle)"], steps: ["Open the hip slowly through a comfortable range.", "No forcing."] }),
        item("d3m4", "Ankle Mobility", "10 / side", { alts: ["Ankle Circles", "Wall Ankle Dorsiflexion", "Heel-Toe Rocks"], steps: ["Knee over toes, heel stays down.", "Rock gently forward and back."] }),
      ] },
      { id: "core", type: "sets", title: "Core", optional: true, items: [
        ex("bird-dog", "Bird Dog", 2, "10", { targets: ["core", "back"], fig: "plank", perSide: true, rest: 45, optional: true, bw: true,
          alts: ["Dead Bug|Lying version.|dead-bug", "Quadruped Leg Extension|Legs only.|plank", "Plank Shoulder Tap (Slow)|Harder, stay still.|plank"],
          steps: ["On all fours, back flat.", "Reach the opposite arm and leg out long.", "Hold 1–2 seconds without twisting.", "Switch sides."], avoid: "Rotating the hips." }),
        ex("side-plank", "Side Plank", 2, "20", { targets: ["core"], fig: "plank", timed: true, unit: "sec", perSide: true, rest: 45, optional: true, bw: true,
          alts: ["Modified Side Plank (Knee Down)", "Forearm Plank|Front version.|plank", "High Plank (Front)|Hands under shoulders.|plank"],
          steps: ["Lie on your side, forearm under the shoulder.", "Lift the hips so the body is in a line.", "Hold 20 sec each side."], avoid: "Letting the hips sag." }),
      ] },
      { id: "recover", type: "check", title: "Recovery focus", items: [
        item("d3r1", "Steps today", "8,000–12,000", { alts: [], steps: ["Spread the walking through the day."] }),
        item("d3r2", "Hydration", "4–5 L water", { alts: [], steps: ["Sip steadily. Pale-yellow urine is a good sign."] }),
        item("d3r3", "Light stretching & better sleep", "evening", { alts: [], steps: ["Ten calm minutes before bed.", "Aim for 7–9 hours."] }),
      ] },
    ],
  },
  {
    id: "d4", n: 4, dow: 4, short: "Thu", title: "Upper B", kind: "strength", level: "Beginner", minutes: "45–60", kcal: 350,
    focus: "Chest (light), Back, Rear Delts, Arms", muscles: ["chest", "back", "shoulders", "arms"],
    blocks: [
      { id: "warm", type: "check", title: "Warm-up", minutes: "5–8 min", items: [WARM_CARDIO("d4w1", "3 min"),
        item("d4w2", "Band Pull-Apart", "15 reps", { fig: "band-pull-apart", alts: ["Towel Pull-Apart (Without Band)", "Reverse Fly (Light DB)", "Face Pull (Band/Cable)", "Wall Slide (Scapular Control)"], steps: ["Hold the band at chest height.", "Pull it apart, squeezing the shoulder blades.", "10–15 slow reps."] }),
        item("d4w3", "Arm Swings", "20 sec", { alts: ["Arm Circles", "Cross-Body Arm Swings", "Hand Circles (Wrists)"], steps: ["Swing the arms gently across and out.", "Keep the neck relaxed."] }),
        item("d4w4", "Wall Push-up", "10 reps", { fig: "incline-pushup", alts: ["Wall Scapular Push-up", "Incline Push-up", "Knee Push-up"], steps: ["Hands on the wall, body straight.", "Lean in and push away with control."] })] },
      { id: "main", type: "sets", title: "Main workout", items: [
        ex("machine-chest-press", "Machine Chest Press", 3, "10-12", { targets: ["chest", "arms"], fig: "chest-press-machine", kind: "machine", main: true,
          alts: ["DB Floor Press|On the floor, shoulder-friendly.|floor-press", "Incline Push-up|Bodyweight option.|incline-pushup", "DB Bench Press|Light dumbbells.|db-bench", "Cable Chest Press|Smooth tension.|cable-fly"],
          steps: ["Set the seat so the handles are at mid-chest.", "Press forward until your arms are almost straight.", "Return slowly until you feel a light chest stretch.", "Keep the shoulders down and back."], avoid: "Shrugging or locking the elbows hard." }),
        ex("lat-pulldown", "Lat Pulldown", 3, "10-12", { targets: ["back", "arms"], fig: "lat-pulldown", kind: "cable", main: true,
          alts: ["Assisted Pull-up|Machine takes some bodyweight.|assisted-pullup", "Neutral-Grip Pulldown|Palms face each other.|close-pulldown", "Resistance Band Pulldown|Anchor the band overhead.|band-pulldown", "Straight-Arm Pulldown|Arms straight.|straight-arm"],
          steps: ["Sit with your thighs under the pads.", "Grab the bar slightly wider than your shoulders.", "Pull the bar to your upper chest.", "Squeeze the back and control the return."], avoid: "Pulling the bar behind the neck or leaning far back." }),
        ex("seated-db-shoulder-press", "Seated DB Shoulder Press", 3, "10-12", { targets: ["shoulders", "arms"], fig: "db-shoulder-press", kind: "free weights",
          alts: ["Machine Shoulder Press|Guided path.|shoulder-press-machine", "Arnold Press (Light DB)|Rotating press.|db-shoulder-press", "Landmine Press|Angled path.|landmine-press", "Seated Band Press|Band under you.|band-ohp"],
          steps: ["Sit with your back supported.", "Press the dumbbells overhead.", "Lower slowly to ear level."], avoid: "Arching the back." }),
        ex("face-pull", "Face Pull (Cable / Band)", 2, "12-15", { targets: ["shoulders", "back"], fig: "face-pull", kind: "cable", rest: 60,
          alts: ["Reverse Pec Deck|Machine rear-delt work.|rev-pec-deck", "Band Pull-Apart|Anywhere, anytime.|band-pull-apart", "Rear-Delt Fly (Light DB)|Bent-over, light.|rear-fly-db", "Cable Rear-Delt Row|Elbows flare out.|seated-row"],
          steps: ["Set the cable at face height with a rope.", "Pull toward your face, elbows high and wide.", "Squeeze the rear delts and shoulder blades.", "Return slowly."], avoid: "Going heavy. This is a posture move." }),
        ex("hammer-curl", "Hammer Curl", 2, "10-12", { targets: ["arms"], fig: "hammer-curl", kind: "free weights", rest: 60,
          alts: ["DB Biceps Curl (Supinated)|Palms up.|db-curl", "Cable Hammer Curl (Rope)|Constant tension.|cable-curl", "Cross-Body Hammer Curl|Curl across the body.|hammer-curl", "Band Hammer Curl|Stand on the band.|band-curl"],
          steps: ["Hold the dumbbells with palms facing each other.", "Curl up keeping the elbows by your sides.", "Lower slowly."], avoid: "Swinging the weight." }),
        ex("overhead-triceps-extension", "Overhead Triceps Extension", 2, "10-12", { targets: ["arms"], fig: "db-overhead-ext", kind: "free weights", rest: 60,
          alts: ["Rope Pushdown|Cable, elbows pinned.|pushdown-rope", "Band Overhead Extension|Anchor the band low.|overhead-cable-ext", "Single DB Overhead Extension|Both hands on one dumbbell.|db-overhead-ext", "Close-Grip Push-up (If Comfortable)|Hands narrow.|pushup"],
          steps: ["Hold one dumbbell overhead with both hands.", "Bend at the elbows to lower it behind your head.", "Extend back up without flaring the elbows."], avoid: "Arching the lower back." }),
      ] },
      { id: "core", type: "sets", title: "Core", optional: true, items: [
        ex("russian-twist", "Russian Twist", 2, "12", { targets: ["core"], slot: "core", perSide: true, rest: 45, optional: true, bw: true,
          alts: ["Pallof Press (Anti-Rotation)|Resist the twist.|pallof", "Seated Band Rotation|Band anchored to the side.", "Bicycle Crunch (Slow & Controlled)|Lying version.", "Standing Cable Rotation|Control the turn."],
          steps: ["Sit with knees bent, lean back slightly.", "Rotate your torso side to side with control.", "Keep the chest tall."], avoid: "Yanking the arms instead of turning the trunk." }),
      ] },
      { id: "cool", type: "check", title: "Cool-down", minutes: "5 min", items: [CHEST_STRETCH("d4c1"), LAT_STRETCH("d4c2"), SHOULDER_STRETCH("d4c3")] },
    ],
  },
  {
    id: "d5", n: 5, dow: 5, short: "Fri", title: "Lower B", kind: "strength", level: "Beginner", minutes: "45–55", kcal: 340,
    focus: "Posterior Chain, Glutes, Quads", muscles: ["legs", "glutes"],
    blocks: [
      { id: "warm", type: "check", title: "Warm-up", minutes: "5–8 min", items: [BRISK("d5w1"),
        item("d5w2", "Bodyweight Lunge", "10 / side", { fig: "reverse-lunge", alts: ["Supported Reverse Lunge", "Bodyweight Split Squat", "Step-Back Lunge"], steps: ["Step forward and lower the back knee.", "Push back to standing.", "Keep the torso upright."] }),
        HIP_CIRCLES("d5w3"),
        item("d5w4", "Glute Bridge", "10 reps", { fig: "glute-bridge", alts: ["Banded Glute Bridge", "Hip Thrust (Bench, Light)", "Pelvic Tilts"], steps: ["Lie on your back, feet flat.", "Lift the hips and squeeze."] })] },
      { id: "main", type: "sets", title: "Main workout", items: [
        ex("goblet-squat", "Goblet Squat", 3, "10-12", { targets: ["legs", "glutes"], helpers: ["core"], fig: "goblet-squat", kind: "free weights", main: true,
          alts: ["Box / Chair Squat|Sit back to touch.|box-squat", "Supported Squat|Hold a rack or TRX.|squat", "Goblet Squat to Box|Controlled, light.|goblet-squat"],
          steps: ["Hold a dumbbell at your chest, elbows pointing down.", "Sit down between your knees, chest tall.", "Drive up through the whole foot.", "Breathe in on the way down."], avoid: "Letting the weight pull you forward." }),
        ex("leg-curl", "Leg Curl (Machine)", 3, "10-12", { targets: ["legs"], fig: "leg-curl-seated", kind: "machine",
          alts: ["Lying Leg Curl (Machine)|Face down on the pad.|leg-curl-lying", "Seated Leg Curl (Machine)|Seated version.|leg-curl-seated", "Band Leg Curl|With a resistance band.|band-leg-curl", "Stability-Ball Leg Curl|Heels on a ball.|slider-curl"],
          steps: ["Adjust the pad just above your heels.", "Curl the weight toward your glutes.", "Squeeze the hamstrings at the top.", "Return slowly, no lifting hips."], avoid: "Lifting the hips off the pad." }),
        ex("step-up", "Step-up (Low Box)", 3, "10", { targets: ["legs", "glutes"], fig: "step-up", perSide: true, bw: true, main: true,
          alts: ["Supported Reverse Lunge|Hold a support.|reverse-lunge", "Low Step-Up (6–12 inch box)|Easier height.|step-up", "Bodyweight Split Squat|Static, no weight.|lunge", "Sit-to-Stand|From a chair or bench.|sit-to-stand"],
          steps: ["Place the whole foot on the box.", "Drive through the heel to stand tall.", "Lower slowly with control.", "Finish all reps on one leg, then switch."], avoid: "Pushing off the back foot." }),
        ex("hip-thrust", "Hip Thrust", 3, "12-15", { targets: ["glutes", "legs"], fig: "hip-thrust-machine", kind: "machine", main: true,
          alts: ["Floor Glute Bridge (Bodyweight)|Easiest version.|glute-bridge", "Banded Glute Bridge|Band above the knees.|banded-bridge", "Hip Thrust (On Bench, Light Weight)|Back on a bench.|hip-thrust-machine", "Cable Pull-Through (Glute Focused)|Hinge and squeeze.|pull-through"],
          steps: ["Upper back against a bench, feet flat.", "Drive the hips up until your body is in a line.", "Squeeze the glutes for 1–2 sec.", "Keep the chin slightly tucked."], avoid: "Over-arching the lower back." }),
        ex("calf-raise-b", "Calf Raise", 3, "15-20", { targets: ["legs"], fig: "calf-step", rest: 60, bw: true,
          alts: ["Seated Calf Raise (Machine)|Knee bent.|calf-machine", "Standing Calf Raise (With Support)|Hold a rail.|calf-step", "Leg Press Calf Raise|On the leg press.|calf-press"],
          steps: ["Heels off the edge of a step.", "Rise high and pause at the top.", "Lower slowly below the step."], avoid: "Bouncing." }),
      ] },
      { id: "core", type: "sets", title: "Core", optional: true, items: [
        ex("knee-raise", "Hanging Knee Raise / Knee Raise", 2, "10-12", { targets: ["core"], fig: "captain-chair", optional: true, rest: 45, bw: true,
          alts: ["Leg Raise (On Bench)|Lying, controlled.|reverse-crunch", "Reverse Crunch (Floor)|Curl the hips up.|reverse-crunch", "Lying Leg Raise|Slow lowering.|reverse-crunch", "Flutter Kicks|Small and quick.|dead-bug"],
          steps: ["Support yourself on a captain's chair or hang from a bar.", "Raise the knees toward the chest.", "Lower slowly without swinging."], avoid: "Swinging the legs." }),
      ] },
      { id: "cool", type: "check", title: "Cool-down", minutes: "5 min", items: [HAM_STRETCH("d5c1"), GLUTE_STRETCH("d5c2"), CALF_STRETCH("d5c3")] },
    ],
  },
  {
    id: "d6", n: 6, dow: 6, short: "Sat", title: "Conditioning + Core", kind: "conditioning", level: "Beginner", minutes: "30–40", kcal: 300,
    focus: "Cardio, Core, Calorie Burn", muscles: ["core", "legs", "cardio"],
    blocks: [
      { id: "warm", type: "check", title: "Warm-up", minutes: "5 min", items: [BRISK("d6w1"), ARM_CIRCLES("d6w2"),
        item("d6w3", "Hip Opener", "10 / side", { alts: ["90/90 Hip Stretch", "Lizard Pose (Gentle)", "Frog Stretch (Gentle)"], steps: ["Open the hip slowly through a comfortable range."] })] },
      { id: "cond", type: "options", title: "Conditioning (choose one)", options: [
        { id: "A", label: "Option A: Low-impact circuit", note: "Repeat 2–3 rounds, rest 45–60 sec between rounds.", items: [
          item("d6a1", "Bodyweight Squat", "× 12", { fig: "tempo-squat", targets: ["legs"], alts: ["Box / Chair Squat", "Goblet Squat (Light)"], steps: ["Sit back, chest up, stand tall."] }),
          item("d6a2", "Incline Push-up", "× 10", { fig: "incline-pushup", targets: ["chest"], alts: UPPER_ALTS.incline.map((s) => s.split("|")[0]), steps: ["Hands on a bench, straight line, controlled."] }),
          item("d6a3", "Glute Bridge", "× 15", { fig: "glute-bridge", targets: ["glutes"], alts: ["Banded Glute Bridge", "Hip Thrust (Bench, Light)"], steps: ["Lift, squeeze, lower."] }),
          item("d6a4", "Mountain Climber", "20 / side", { slot: "core", targets: ["core"], alts: ["Mountain Climber (Slow)", "High Plank Knee Tap", "Dead Bug"], steps: ["High plank, drive one knee in at a time.", "Keep the hips low and steady."] }),
        ] },
        { id: "B", label: "Option B: Cardio", note: "Moderate pace, RPE 5–6 out of 10.", items: [
          item("d6b1", "Treadmill / Cycle / Elliptical", "20–30 min", { alts: ["Stationary Bike", "Elliptical (Cross Trainer)", "Rowing Machine", "Brisk Walking (Outdoors)", "HIIT (Low Impact): 20s work / 40s rest"], steps: ["Hold a steady, moderate pace.", "You can speak in short sentences."] }),
        ] },
      ] },
      { id: "corec", type: "check", title: "Core circuit", minutes: "2 rounds", items: [
        item("d6c1", "Crunch", "× 15", { slot: "core", targets: ["core"], alts: ["Cable Crunch", "Reverse Crunch (Floor)", "Swiss Ball Crunch", "Sit-up (Controlled)"], steps: ["Lie back, feet flat.", "Curl the ribs toward the hips.", "Lower slowly. Don't pull on your neck."] }),
        item("d6c2", "Bicycle Crunch", "15 / side", { slot: "core", targets: ["core"], alts: ["Side Plank", "Standing Cable Twist", "Woodchopper (Cable/Band)"], steps: ["Opposite elbow to opposite knee.", "Slow and controlled."] }),
        item("d6c3", "Plank", "20–30 sec", { fig: "plank", targets: ["core"], alts: ["Elbow-to-Knee Plank", "High Plank Shoulder Tap", "Dead Bug", "Mountain Climber (Slow)"], steps: ["Straight line, brace the abs."] }),
      ] },
      { id: "cool", type: "check", title: "Cool-down", minutes: "5 min", items: [FULL_BODY("d6x1")] },
    ],
  },
  {
    id: "d7", n: 7, dow: 7, short: "Sun", title: "Rest & Reset", kind: "rest", level: "Rest", minutes: "10–20", kcal: 60,
    focus: "Recovery, Mobility, Prepare for Next Week", muscles: ["mobility"],
    blocks: [
      { id: "reset", type: "check", title: "Rest day checklist", items: [
        item("d7a1", "Full rest (physical + mental)", "today", { alts: [], steps: ["Rest is when your body adapts. Doing less today makes the week stronger."] }),
        item("d7a2", "Light walk (optional)", "5–10 min", { alts: [], steps: ["Easy pace, no tracking."] }),
        item("d7a3", "Mobility / stretching", "10 min", { alts: ["Hips, Spine, Shoulders, Ankles flow"], steps: ["Gentle range, no pain."] }),
        item("d7a4", "Foam rolling (if available)", "5–10 min", { alts: [], steps: ["Roll slowly over sore areas. Avoid joints."] }),
      ] },
      { id: "weekly", type: "check", title: "Weekly reset", items: [
        item("d7w1", "Track weight, steps & workouts", "", { alts: [], steps: [] }),
        item("d7w2", "Plan next week's meals", "", { alts: [], steps: [] }),
        item("d7w3", "Aim for 7–9 hrs of sleep", "", { alts: [], steps: [] }),
        item("d7w4", "Prepare gym clothes & meals", "", { alts: [], steps: [] }),
      ] },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------- guide (from the plan sheet)
export const GUIDE = {
  principles: [
    "Focus on form, not heavy weight (especially in the first 4 weeks).",
    "Use controlled, slow movements (2–3 sec per rep).",
    "Rest 60–90 sec between sets.",
    "Be consistent: 4–5 workouts a week.",
    "Get 7–9 hrs of sleep for recovery.",
    "Track your progress (weight, reps or weight used).",
  ],
  nutrition: [
    ["Calories", "~2,000–2,200 kcal"], ["Protein", "140–160 g (1.8–2.0 g/kg)"], ["Carbs", "200–240 g"],
    ["Fat", "55–65 g"], ["Fiber", "25–35 g"], ["Water", "4–5 L / day"],
  ],
  pre: ["Banana + Whey (½–1 scoop)", "Oats (40–50 g) + Greek yogurt (100 g)", "Brown bread (2) + Peanut butter (1 tbsp)"],
  post: ["Whey (1 scoop) + Banana", "Chicken (150 g) + Rice (100–150 g)", "Paneer (100–150 g) + Sweet potato (150 g)"],
  progression: [
    { weeks: "Weeks 1–2", phase: "learn", title: "Learn the form", text: "Light weight, same reps. Focus on technique." },
    { weeks: "Weeks 3–4", phase: "build", title: "Build up", text: "Slightly increase the weight, or add 1–2 reps." },
    { weeks: "Weeks 5–8", phase: "progress", title: "Progress", text: "Build consistency. Add one extra set on the main lifts." },
  ],
  results: [["Week 2", "Better energy, less soreness, improved form"], ["Week 4", "Noticeable strength & endurance increase"], ["Week 8", "Leaner look, better posture, improved fitness"], ["Week 12+", "Visible muscle definition (incl. abs, with lower body fat)"]],
  quick: ["Pick ONE alternative per exercise.", "Keep the same sets and reps as your plan.", "Use a pain-free range of motion.", "Stop immediately if you feel sharp pain."],
};

// ---------------------------------------------------------------------------------------------------------------- lookups
/** Every exercise and item of every day, flat, with its day and block. */
export function allItems() {
  const out = [];
  for (const d of DAYS) for (const b of d.blocks) {
    const list = b.type === "options" ? b.options.flatMap((o) => o.items) : b.items;
    for (const it of list) out.push({ ...it, dayId: d.id, blockId: b.id, blockType: b.type });
  }
  return out;
}

/** What the library shows: each distinct exercise once, with its alternatives. Category = first target (or mobility). */
// Checklist lines on the rest and recovery days (sleep, water, steps...) are habits, not exercises: they stay out of the Library.
const NOT_EXERCISE = /^(d7|d3r)/;
export function libraryList() {
  const seen = new Map();
  for (const it of allItems()) {
    if (NOT_EXERCISE.test(it.id)) continue;
    const cat = it.blockType === "sets" ? (it.targets[0] || "core") : (it.targets && it.targets[0]) || "mobility";
    const key = slug(it.name);
    if (!seen.has(key)) seen.set(key, { ...it, cat, days: [it.dayId] });
    else if (!seen.get(key).days.includes(it.dayId)) seen.get(key).days.push(it.dayId);
  }
  // exercises that are in the sheets but not in the 7-day plan
  for (const e of EXTRAS) { const key = slug(e.name); if (!seen.has(key)) seen.set(key, { ...e }); }
  return sortExercises([...seen.values()], { groupFirst: true }); // muscle group order (chest, back, shoulders, arms, legs...), then A-Z
}
export const dayById = (id) => DAYS.find((d) => d.id === id) || null;
export const dayForDow = (dow) => DAYS.find((d) => d.dow === dow) || DAYS[0];
/** JS getDay() (0 = Sunday) -> plan dow (1 = Mon … 7 = Sun) */
export const dowOf = (date) => { const g = date.getDay(); return g === 0 ? 7 : g; };

/** Find an exercise or alternative by id anywhere in the plan. */
export function findExercise(id) {
  for (const it of allItems()) {
    if (it.id === id) return it;
    const a = (it.alts || []).find((x) => x.id === id);
    if (a) return { ...a, sets: it.sets, reps: it.reps, repsMin: it.repsMin, repsMax: it.repsMax, rest: it.rest, targets: it.targets, helpers: it.helpers, kind: it.kind, slot: it.slot, timed: it.timed, perSide: it.perSide, bw: it.bw, unit: it.unit, steps: it.steps, avoid: it.avoid, main: it.main, dayId: it.dayId };
  }
  return null;
}
